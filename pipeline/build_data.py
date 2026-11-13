# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl>=3.1", "pymupdf>=1.24", "py7zr>=0.21"]
# ///
"""Build site/data/*.json from a local clone of Vesper-Digital/Evidence-Archive.

Usage:  uv run pipeline/build_data.py --src ../Evidence-Archive
Every value in the output either comes straight from an archive file or is a
labelled computation over archive files. Hand transcriptions live in curated.json.
"""
import argparse
import csv
import hashlib
import html
import io
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote

import openpyxl
import py7zr
import pymupdf

REPO = "Vesper-Digital/Evidence-Archive"
BLOB = f"https://github.com/{REPO}/blob/main/"
RAW = f"https://raw.githubusercontent.com/{REPO}/main/"
HERE = Path(__file__).resolve().parent
CHECKS = []


def check(name, expected, actual, note=""):
    ok = expected == actual
    CHECKS.append({"name": name, "expected": expected, "actual": actual, "pass": ok, "note": note})
    return ok


def gh(path):
    return BLOB + quote(path)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def locate(src, rel):
    """rel, or the one archive file with the same name somewhere else (the archive's own tools move files)."""
    if (src / rel).is_file():
        return rel
    hits = [p for p in src.rglob(Path(rel).name) if p.is_file() and ".git" not in p.parts]
    if len(hits) != 1:
        raise FileNotFoundError(f"{rel} is not in the archive")
    new = hits[0].relative_to(src).as_posix()
    check(f"File moved in the archive: {Path(rel).name}", rel, new, "found by file name; update the path in pipeline/build_data.py")
    return new


def section(name, out, build):
    """Build one data file. If the archive changed under it, keep the last good copy and report why."""
    try:
        return build()
    except Exception as e:  # any failure here is an archive change; the rest of the site still updates
        prev = out / f"{name}.json"
        check(f"Build: {name} data rebuilt from the archive", True, False,
              f"{type(e).__name__}: {e}. The site keeps the last published copy of this section.")
        if not prev.is_file():
            raise
        return json.loads(prev.read_text(encoding="utf-8"))


def num(s):
    s = str(s or "").strip().replace(",", "").replace("$", "").replace(" ", "")
    if not s or s in ("-", "—"):
        return 0.0
    neg = s.startswith("(") and s.endswith(")")
    try:
        v = float(s.strip("()"))
    except ValueError:
        return None
    return -v if neg else v


def read_csv(path):
    b = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return list(csv.reader(io.StringIO(b.decode(enc))))
        except UnicodeDecodeError:
            continue
    return list(csv.reader(io.StringIO(b.decode("latin-1"))))


# ---------------------------------------------------------------- inventory
CASE_BY_FOLDER = {}
# The archive's own rule (tools/build_cases.py): every top-level folder except these is a case.
NOT_CASES = {"assets", "tools", "node_modules", "docs", "Tables", "Gallery"}
YOUTUBE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|live/|shorts/|embed/))([A-Za-z0-9_-]{6,})")


def case_date(src, folder):
    """date.txt, else a date at the start of the folder name, else the date the archive's index.html shows,
    else the last commit that touched the folder."""
    d = (src / folder / "date.txt").read_text(encoding="utf-8").split()[:1] if (src / folder / "date.txt").is_file() else []
    m = re.match(r"\d{4}-\d{2}-\d{2}", d[0] if d else folder)
    if m:
        return m.group(0)
    index = src / "index.html"
    if index.is_file():
        page = index.read_text(encoding="utf-8")
        m = re.search(rf'<h3><a href="{re.escape(quote(folder))}/">.*?<div class="date">([^<]+)<', page, re.S)
        if m:
            try:
                return datetime.strptime(m.group(1).strip(), "%B %d, %Y").date().isoformat()
            except ValueError:
                pass
    r = subprocess.run(["git", "-C", str(src), "log", "-1", "--format=%cs", "--", folder], capture_output=True, text=True)
    return r.stdout.strip() or None


def new_cases(src, known):
    """Case folders in the archive that curated.json does not map yet. They get a card, their files and a
    timeline entry. Who-connects-to-whom links for them are still added by hand in curated.json."""
    out = []
    for p in sorted(src.iterdir()):
        if not p.is_dir() or p.name.startswith((".", "_")) or p.name in NOT_CASES or p.name in known:
            continue
        read = lambda n: (p / n).read_text(encoding="utf-8").strip() if (p / n).is_file() else ""
        about = read("about.txt").splitlines()
        video = next((l.strip() for l in about if re.fullmatch(r"\s*https?://\S+\s*", l)), "")
        blurb = " ".join(l.strip() for l in about if l.strip() and l.strip() != video)
        title = read("title.txt") or re.sub(r"\s+", " ", p.name.replace("_", " ").replace("-", " ")).strip()
        m = YOUTUBE.search(video)
        out.append({"id": f"case:{slug(p.name)}", "folder": p.name, "title": title, "headline": title,
                    "date": case_date(src, p.name), "video": m.group(1) if m else None, "video_link": video or None,
                    "summary": blurb or "Not described in the archive yet.", "datasets": [], "auto": True})
    return out


def inventory(src, cases):
    for c in cases:
        CASE_BY_FOLDER[c["folder"]] = c["id"]
    files = []
    for p in sorted(src.rglob("*")):
        if not p.is_file() or ".git" in p.parts:
            continue
        rel = p.relative_to(src).as_posix()
        top = rel.split("/")[0]
        item = {"path": rel, "size": p.stat().st_size, "ext": p.suffix.lower().lstrip("."),
                "case": CASE_BY_FOLDER.get(top), "url": gh(rel), "raw": RAW + quote(rel)}
        try:
            if p.suffix.lower() == ".zip" and "assets/zips" not in rel:
                with zipfile.ZipFile(p) as z:
                    item["contents"] = [{"name": i.filename, "size": i.file_size} for i in z.infolist() if not i.is_dir()]
            if p.suffix.lower() == ".7z":
                with py7zr.SevenZipFile(p) as z:
                    item["contents"] = [{"name": i.filename, "size": i.uncompressed} for i in z.list() if not i.is_directory]
        except Exception as e:  # a damaged archive file is listed without its contents
            check(f"Archive file opens: {rel}", True, False, f"{type(e).__name__}: {e}")
        files.append(item)
    return files


def pdf_links(src):
    """Every external URL printed in every PDF, with its page."""
    out = []
    for p in sorted(src.rglob("*.pdf")):
        if ".git" in p.parts:
            continue
        rel = p.relative_to(src).as_posix()
        try:
            with pymupdf.open(p) as doc:
                for i, page in enumerate(doc, 1):
                    for l in page.get_links():
                        uri = l.get("uri") or ""
                        if uri.startswith("http"):
                            out.append({"doc": rel, "page": i, "url": uri})
        except Exception as e:  # one unreadable PDF must not stop the rest of the site updating
            check(f"PDF opens: {rel}", True, False, f"{type(e).__name__}: {e}")
    seen, uniq = set(), []
    for o in out:
        k = (o["doc"], o["page"], o["url"])
        if k not in seen:
            seen.add(k)
            uniq.append(o)
    return uniq


# ---------------------------------------------------------------- lobbying
# The four tables mapped by hand keep these ids, because curated.json links cases and nodes to them.
LOBBY_FILES = {
    "dataset:lobby-drones": "Tables/Lobbying Registry - Drones - 2026.xlsx",
    "dataset:lobby-telesat": "Tables/Lobbying Registry - Telesat - 2026.xlsx",
    "dataset:lobby-roshel": "Tables/Roshel - 2026- Lobbying Records.xlsx",
    "dataset:lobby-stelco": "Tables/Stelco - 2026 - Lobbying Records.xlsx",
}
LOBBY_NAMES = {"dataset:lobby-drones": "Drones", "dataset:lobby-telesat": "Telesat",
               "dataset:lobby-roshel": "Roshel", "dataset:lobby-stelco": "Stelco"}
HEAD_KEYS = {
    "Date": "date", "Client / Organization": "client", "Record Type": "type",
    "Government Institutions": "institutions", "Public Office Holders": "holders",
    "Description": "description", "Registrant / Lobbyist": "registrant", "Lobbying Firm": "firm",
    "Government Funding Reported": "funding", "Registration ID": "reg_id",
    "Communication ID": "comm_id", "Source URL": "url",
}


def _jump(wb, location):
    m = re.match(r"'?([^'!]+)'?!([A-Z]+)(\d+)", location or "")
    if not m:
        return None, None
    return wb[m.group(1)], int(m.group(3))


def _inst_list(wb, location):
    ws, r = _jump(wb, location)
    if not ws:
        return None
    out, r = [], r + 2  # skip client name and "N government institutions"
    while True:
        v = ws.cell(r, 1).value
        m = re.match(r"^\s*\d+\.\s+(.*)$", str(v or ""))
        if not m:
            return out
        out.append(m.group(1).strip())
        r += 1


def _full_desc(wb, location):
    ws, r = _jump(wb, location)
    if not ws:
        return None
    parts, r = [], r + 2  # skip client name and "DESCRIPTION"
    while ws.cell(r, 1).value not in (None, ""):
        parts.append(str(ws.cell(r, 1).value).strip())
        r += 1
    return " ".join(parts)


def lobby_tables(src):
    """id -> (file, short name, auto). The hand-mapped tables, plus every table the archive's
    assets/tables.json tags LOBBYING REGISTRY, so a new lobbying table is charted on the next build."""
    tables = {}
    for ds, rel in LOBBY_FILES.items():
        try:
            tables[ds] = (locate(src, rel), LOBBY_NAMES[ds], False)
        except FileNotFoundError:
            check(f"Lobbying table still in the archive: {Path(rel).name}", True, False, "renamed or removed; the site leaves it out")
    listed = src / "assets/tables.json"
    meta = json.loads(listed.read_text(encoding="utf-8")).get("tables", []) if listed.is_file() else []
    used = {t[0] for t in tables.values()}
    for t in meta:
        rel = f"Tables/{t.get('file', '')}"
        if "LOBBYING" not in str(t.get("kind", "")).upper() or rel in used or not (src / rel).is_file():
            continue
        name = str(t.get("subject") or Path(rel).stem).strip().title()
        ds = f"dataset:lobby-{slug(name)}"
        while ds in tables:
            ds += "-2"
        tables[ds] = (rel, name, True)
        used.add(rel)
    return tables


def lobby_table(src, ds_id, rel):
    wb = openpyxl.load_workbook(src / rel)
    ws = wb[wb.sheetnames[0]]
    meta = {"id": ds_id, "file": rel, "url": gh(rel), "query": ws["B2"].value,
            "banner": ws["B3"].value, "date_range": ws["B6"].value, "institutions_banner": ws["B7"].value}
    heads = [HEAD_KEYS.get(c.value, c.value) for c in ws[10]]
    records = []
    for row in ws.iter_rows(min_row=11):
        if not re.match(r"\d{4}-\d{2}-\d{2}", str(row[0].value or "")):
            continue
        rec = {"dataset": ds_id, "date": None, "client": None, "type": None, "institutions": [], "holders": [],
               "description": None, "registrant": None, "firm": None, "funding": None, "reg_id": None, "comm_id": None, "url": None}
        for h, c in zip(heads, row):
            if h is None:
                continue
            v = c.value
            link = c.hyperlink
            if h == "institutions":
                lst = _inst_list(wb, link.location) if link and link.location else None
                v = lst if lst is not None else [s.strip() for s in str(v or "").split(";") if s.strip()]
            elif h == "description":
                full = _full_desc(wb, link.location) if link and link.location else None
                v = full or (str(v).replace("▶ VIEW FULL", "").strip() if v else "")
            elif h == "holders":
                v = [s.strip() for s in str(v or "").split(";") if s.strip()]
            elif h == "url":
                v = link.target if link and link.target else v
            elif h == "funding":
                v = float(v) if v not in (None, "") else None
            elif v is not None:
                v = str(v).strip()
            rec[h] = v
        records.append(rec)
    if not records or "client" not in heads:
        raise ValueError("no dated rows under a 'Client / Organization' header, so this is not a Lobbying Registry export")
    n = len(records)
    m = re.search(r"(\d+) matching records", meta["banner"] or "")
    meta["records"] = n
    check(f"{rel}: record count", int(m.group(1)) if m else None, n, "banner vs parsed rows")
    inst = sorted({i for r in records for i in r.get("institutions", [])})
    mi = re.search(r"(\d+) DISTINCT", meta["institutions_banner"] or "")
    meta["distinct_institutions"] = len(inst)
    check(f"{rel}: distinct institutions", int(mi.group(1)) if mi else None, len(inst), "banner vs parsed lists")
    return meta, records


def lobbying(src):
    datasets, records = [], []
    for ds_id, (rel, name, auto) in lobby_tables(src).items():
        try:
            meta, recs = lobby_table(src, ds_id, rel)
        except Exception as e:  # one unreadable table must not hide the others
            check(f"Lobbying table read: {Path(rel).name}", True, False, f"{type(e).__name__}: {e}")
            continue
        datasets.append(dict(meta, name=name, auto=auto))
        records.extend(recs)
    if not datasets:
        raise FileNotFoundError("no lobbying table could be read")
    return {"datasets": datasets, "records": records}


# ---------------------------------------------------------------- brookfield
LINK_TYPES = {"Group root", "Published link", "Repeated link", "Not controlled", "Outside investor", "Control / repeated"}


def brookfield(src):
    rel = locate(src, "Tables/BROOKFIELD_CORPORATION.pdf")
    twin = "Who Runs Canada_Brookfield Corp/Files/BROOKFIELD_CORPORATION_Corp.pdf.pdf"
    texts = {}
    for r in (rel, twin):
        if (src / r).is_file():
            with pymupdf.open(src / r) as doc:
                texts[r] = [pg.get_text() for pg in doc]
    same = twin in texts and hashlib.sha256("".join(texts[rel]).encode()).hexdigest() == hashlib.sha256("".join(texts[twin]).encode()).hexdigest()
    check("Brookfield: Tables/ PDF text identical to case PDF", True, same, "" if twin in texts else f"{twin} is no longer in the archive")
    rows = []
    for pno, text in enumerate(texts[rel], 1):
        raw = [l.strip() for l in text.splitlines() if l.strip()]
        lines = []
        for l in raw:  # a link type can wrap: "Control /" + "repeated"
            if lines and lines[-1].endswith("/"):
                lines[-1] = f"{lines[-1]} {l}"
            else:
                lines.append(l)
        for i, l in enumerate(lines):
            if l in LINK_TYPES and i >= 3:
                name, pct, lvl = lines[i - 3], lines[i - 2], lines[i - 1]
                if not re.fullmatch(r"\d+", lvl):
                    continue
                p = None if pct in ("—", "-") else float(pct.rstrip("%"))
                rows.append({"name": name, "pct": p, "level": int(lvl), "link": l, "page": pno})
    banner = re.search(r"PUBLISHED OWNERSHIP LINKS.*?\n([\d,]+)\n", texts[rel][0], re.S)
    links = [r for r in rows if r["link"] not in ("Group root", "Outside investor")]
    check("Brookfield: 'published ownership links' banner = rows in the table", int(banner.group(1).replace(",", "")) if banner else None, len(rows), "includes the group root and the outside investor row")
    root, stack, outside = None, {}, []
    for r in rows:
        node = {"name": r["name"], "pct": r["pct"], "level": r["level"], "link": r["link"], "page": r["page"], "children": []}
        if r["link"] == "Outside investor":
            outside.append(node)
            continue
        if r["level"] == 1:
            root = node
        else:
            stack[r["level"] - 1]["children"].append(node)
        stack[r["level"]] = node
    if not rows or root is None:
        raise ValueError(f"no ownership rows found in {rel}; the PDF layout changed")
    by_type = Counter(r["link"] for r in links)
    by_level = Counter(r["level"] for r in links)
    names = Counter(r["name"] for r in links)
    return {"file": rel, "url": gh(rel), "twin": twin, "tree": root, "outside_investors": outside,
            "stats": {"links": len(links), "by_type": dict(by_type), "by_level": {str(k): v for k, v in sorted(by_level.items())},
                      "distinct_entities": len(names), "direct_children": len(root["children"]) if root else 0,
                      "pages": len(texts[rel])},
            "flat": [{k: r[k] for k in ("name", "pct", "level", "link", "page")} for r in rows]}


# ---------------------------------------------------------------- estimates
def table_kind(name):
    n = re.sub(r"(__[0-9a-f]+)?\.(csv|pdf|xlsx)$", "", name)
    n = re.sub(r"-?supplementary-estimates-[abc]-\d{4}-\d{2}$", "", n)
    n = re.sub(r"-[abc]-\d{4}-\d{2}$", "", n)
    return n or "pdf"


def org_summary(rows, year):
    hi = next(i for i, r in enumerate(rows) if r and r[0].strip() == "Organization")
    head = [h.strip() for h in rows[hi]]
    if "Proposed Authorities To Date" in head:
        # column 4 is "Authorities To Date" or, in some rounds, "Previous Estimates To Date"
        cols = {"to_date": 3, "proposed": head.index("Proposed Authorities To Date")}
    else:
        y = f"{year} Main Estimates"
        cols = {"proposed": head.index(y)}
    out = defaultdict(lambda: defaultdict(float))
    for r in rows[hi + 1:]:
        if len(r) < len(head) or not r[0].strip() or r[0].startswith("Total"):
            continue
        for k, c in cols.items():
            v = num(r[c])
            if v is not None:
                out[r[0].strip()][k] += v
    return out


def transfers(rows):
    groups, cur = [], None
    for r in rows:
        r = (r + ["", "", ""])[:3]
        org, vote, amt = (x.strip() for x in r)
        if not org or org in ("Transfers between Organizations", "Organization") or org.startswith("Total"):
            continue
        if not vote and not amt:
            cur = {"purpose": org, "members": []}
            groups.append(cur)
        elif cur is not None and num(amt) is not None:
            cur["members"].append({"org": org, "vote": vote, "amount": num(amt)})
    flows = []
    for g in groups:
        give = [m for m in g["members"] if m["amount"] < 0]
        take = [m for m in g["members"] if m["amount"] > 0]
        tot = sum(m["amount"] for m in take)
        for a in give:
            for b in take:
                if a["org"] != b["org"] and tot:
                    flows.append({"from": a["org"], "to": b["org"], "amount": round(-a["amount"] * b["amount"] / tot, 2),
                                  "purpose": g["purpose"], "split": len(give) * len(take) > 1})
    return groups, flows


def estimates(src):
    arc = src / locate(src, "Deleted Federal Records/Files/Federal Estimates Deleted.7z")
    out = {"file": arc.relative_to(src).as_posix(), "url": gh(arc.relative_to(src).as_posix()), "rounds": [], "orgs": {}, "transfers": [], "covid_files": []}
    with tempfile.TemporaryDirectory() as td:
        with py7zr.SevenZipFile(arc) as z:
            z.extractall(td)
        root = Path(td)
        for yd in sorted(p for p in root.iterdir() if p.is_dir()):
            for rd in sorted(p for p in yd.iterdir() if p.is_dir()):
                files = sorted(f.name for f in rd.iterdir() if f.is_file())
                if rd.name == "COVID Expenditures":
                    out["covid_files"] = [f"{yd.name}/{rd.name}/{f}" for f in files]
                    continue
                key = f"{yd.name} {rd.name}"
                out["rounds"].append({"year": yd.name, "round": rd.name, "key": key, "tables": sorted({table_kind(f) for f in files}), "files": files})
                for f in files:
                    kind = table_kind(f)
                    if kind == "organization-summary" and f.endswith(".csv"):
                        for org, vals in org_summary(read_csv(rd / f), yd.name).items():
                            out["orgs"].setdefault(org, {})[key] = {k: round(v, 2) for k, v in vals.items()}
                    if kind == "transfers-between-organizations":
                        groups, flows = transfers(read_csv(rd / f))
                        out["transfers"].append({"key": key, "file": f, "groups": len(groups), "flows": flows,
                                                 "moved": round(sum(fl["amount"] for fl in flows), 2)})
        # cross-checks against figures shown in the immigration slides
        ircc = out["orgs"].get("Department of Citizenship and Immigration", {}).get("2026-27 A", {})
        check("IRCC FY2026-27 total (slide 2) = sum of 2026-27 A 'Authorities To Date'", 4416881617.0, ircc.get("to_date"))
        pp = read_csv(root / "2026-27/A/expenditures-program-purpose-supplementary-estimates-a-2026-27.csv")
        irsi = next((num(r[1]) for r in pp if r and r[0].strip() == "Immigrant and Refugee Selection and Integration"), None)
        check("IRSI program FY2026-27 (slide 3) = 2026-27 A 'Estimates to Date'", 3423546530.0, irsi)
    out["rounds"].sort(key=lambda r: (r["year"], {"Main": "0"}.get(r["round"], r["round"])))
    years = sorted({r["year"] for r in out["rounds"]})
    tr_years = sorted({t["key"].split()[0] for t in out["transfers"]})
    check("Transfers-between-organizations: none after 2021-22 (recovery index p.1)", True, max(tr_years) <= "2021-22", f"rounds with the table: {', '.join(t['key'] for t in out['transfers'])}")
    out["years"] = years
    return out


def recovery_index(src):
    rel = locate(src, "Deleted Federal Records/Files/Canada-Deleted-Spending Estimates-Records list.pdf")
    with pymupdf.open(src / rel) as doc:
        text = "\n".join(p.get_text() for p in doc)
    cat = {}
    for m in re.finditer(r"(\d{4})[–-](\d{2}) ([ABC])\s*\n(https://open\.canada\.ca/\S+)", text):
        cat[f"{m.group(1)}-{m.group(2)} {m.group(3)}"] = m.group(4)
    miss = re.search(r"No catalogue record was found for (.*?)\. The", text, re.S)
    missing = []
    if miss:
        for y1, y2, r in re.findall(r"(\d{4})[–-](\d{2}) ([ABC])", miss.group(1)):
            missing.append(f"{y1}-{y2} {r}")
    tables = re.findall(r"\n([A-Z][A-Za-z ()\"]+(?:Summary|Requirements|Payments|Purpose\"?\)?|Object|Forecasts|Organizations[^\n]*|Votes|Items|Authorities))\n(.+?)(?=\n[A-Z][A-Za-z ()\"]+(?:Summary|Requirements|Payments|Purpose|Object|Forecasts|Organizations|Votes|Items|Authorities)|\nMain Estimates vs)", text, re.S)
    return {"file": rel, "url": gh(rel), "catalogue": cat, "catalogue_missing": missing,
            "table_guide": [{"table": t.strip(), "what": " ".join(w.split())} for t, w in tables]}


# ---------------------------------------------------------------- survey
LABELS = {"1": "Multiple times a day", "2": "Once a day", "3": "At least once a week", "4": "Rarely", "5": "Never",
          "6": "Valid skip", "9": "Not stated"}
PUBLISHED = {"1": 25, "2": 14, "3": 29, "4": 28, "5": 4}


def survey(src):
    zrel = locate(src, "Tim Caulfied  Government Funded Misinformation Guru Who Got It Wrong/Files/Government Questionaires and Findings.zip")
    with zipfile.ZipFile(src / zrel) as z:
        z_names = z.namelist()
        name = next(n for n in z_names if n.lower().endswith(".csv"))
        rows = list(csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig", errors="replace")))
    raw = Counter(r["FC_25"] for r in rows)
    w = defaultdict(float)
    for r in rows:
        w[r["FC_25"]] += float(r["PERS_WGT"])
    base = sum(w[k] for k in PUBLISHED)
    weighted = {k: round(100 * w[k] / base, 1) for k in PUBLISHED}
    xrel = locate(src, "Tim Caulfied  Government Funded Misinformation Guru Who Got It Wrong/Files/misinformation Statscan.xlsx")
    ws = openpyxl.load_workbook(src / xrel, data_only=True)["Sheet1"]
    tally = {str(ws.cell(r, 1).value).strip(): ws.cell(r, 2).value for r in range(6, 12)}
    tally_total = sum(v for v in tally.values() if isinstance(v, (int, float)))
    for k, pub in PUBLISHED.items():
        check(f"Survey FC_25 '{LABELS[k]}': StatCan published % vs weighted microdata %", pub, round(weighted[k]), "rounded to whole %")
    check("Survey: archive tally total vs microdata records", len(rows), tally_total, "the spreadsheet tally counts 5 fewer records than the CSV in the same zip")
    # StatCan's own data dictionary (in the same zip) prints raw and weighted counts for FC_25
    dname = next(n for n in z_names if n.endswith("Canadian Perspectives Survey Series 4, 2020.pdf"))
    with zipfile.ZipFile(src / zrel) as z, pymupdf.open(stream=z.read(dname), filetype="pdf") as d:
        page_no, block = next((i, p.get_text()) for i, p in enumerate(d, 1) if "Variable Name:\nFC_25" in p.get_text().replace("\r", ""))
    block = block.replace("\r", "")
    block = block[block.index("Variable Name:\nFC_25"):block.index("Variable Name:\nFC_30")]
    dict_rows = {}
    for lab, code, freq, wf, pct in re.findall(r"\n([A-Z][^\n]+)\n(\d)\n([\d,]+)\n([\d,]+)\n([\d.]+)", block):
        dict_rows[code] = {"label": lab, "raw": int(freq.replace(",", "")), "weighted": int(wf.replace(",", "")), "pct_all": float(pct)}
    for k in LABELS:
        check(f"Survey FC_25 code {k}: data dictionary count = microdata count", dict_rows.get(k, {}).get("raw"), raw.get(k, 0))
        check(f"Survey FC_25 code {k}: data dictionary weighted count = sum of PERS_WGT", dict_rows.get(k, {}).get("weighted"), round(w[k]))
    return {"question": ws["A1"].value, "zip": zrel, "zip_url": gh(zrel), "csv": name, "xlsx": xrel, "xlsx_url": gh(xrel),
            "dictionary": {"file": dname, "page": page_no, "rows": dict_rows},
            "article": {"title": "Misinformation During the COVID-19 Pandemic", "authors": "Karine Garneau and Clémence Zossou", "date": "2021-02-02",
                        "url": "https://www150.statcan.gc.ca/n1/pub/45-28-0001/2021001/article/00003-eng.htm",
                        "file": "Tim Caulfied  Government Funded Misinformation Guru Who Got It Wrong/Files/Misinformation During the COVID-19 Pandemic- by Karine Garneau and Clémence Zossou.pdf",
                        "quote": "During the first few months of this health crisis, 96% of Canadians who used the Internet to find information saw COVID-19 information that they suspected was misleading, false or inaccurate."},
            "records": len(rows), "weight_var": "PERS_WGT", "population": round(sum(w.values())),
            "rows": [{"code": k, "label": LABELS[k], "raw": raw.get(k, 0), "weighted_pct": weighted.get(k),
                      "published_pct": PUBLISHED.get(k), "raw_pct_all": round(100 * raw.get(k, 0) / len(rows), 1)} for k in LABELS],
            "tally": tally, "tally_total": tally_total}


# ---------------------------------------------------------------- graph
def expand(doc, folders):
    if doc and doc.startswith("@"):
        k, rest = doc[1:].split("/", 1)
        return f"{folders[k]}/{rest}"
    return doc


def build_graph(cur, lob, files):
    folders = cur["folders"]
    paths = {f["path"] for f in files}
    dsfile = {d["id"]: d["file"] for d in lob["datasets"]}
    nodes = {n["id"]: dict(n, cases=set()) for n in cur["nodes"]}
    for d in lob["datasets"]:  # a lobbying table found in the archive but not in curated.json
        nodes.setdefault(d["id"], {"id": d["id"], "type": "dataset", "label": f"Lobbying records: {d.get('name', d['id'])}",
                                   "summary": f"{Path(d['file']).name}: {d['records']} federal Lobbying Registry records.", "auto": True})
        nodes[d["id"]].setdefault("cases", set())
    edges, gone = [], []
    for c in cur["cases"]:
        nodes[c["id"]] = {"id": c["id"], "type": "case", "label": c["title"], "summary": c["summary"], "date": c["date"], "cases": {c["id"]}}
    folder_case = {expand(c["folder"] + "/x", folders).split("/")[0]: c["id"] for c in cur["cases"]}

    def case_of(doc):
        return folder_case.get((doc or "").split("/")[0])

    for e in cur["edges"]:
        e = dict(e, src=dict(e["src"], doc=expand(e["src"]["doc"], folders)))
        if e["src"]["doc"] not in paths:  # the evidence file was renamed or removed in the archive
            gone.append(e["src"]["doc"])
            continue
        e["src"]["github"] = gh(e["src"]["doc"])
        cs = case_of(e["src"]["doc"])
        if cs:
            nodes[e["from"]]["cases"].add(cs)
            nodes[e["to"]]["cases"].add(cs)
        edges.append(e)
    check("Evidence files cited in curated.json are still in the archive", [], sorted(set(gone)),
          f"{len(gone)} link(s) hidden until curated.json points at the new file names" if gone else "")
    for c in cur["cases"]:
        for d in c.get("datasets", []):
            if d in nodes:
                nodes[d]["cases"].add(c["id"])
    # lobbying layer: clients and institutions straight from the registry tables
    alias = {}
    for n in cur["nodes"]:
        for a in n.get("aliases", []):
            alias[a.lower()] = n["id"]
    agg = Counter()
    pair = defaultdict(list)
    for r in lob["records"]:
        cid = "client:" + re.sub(r"[^a-z0-9]+", "-", r["client"].lower()).strip("-")
        if cid not in nodes:
            nodes[cid] = {"id": cid, "type": "lobby-client", "label": r["client"], "cases": set(), "datasets": set()}
        nodes[cid].setdefault("datasets", set()).add(r["dataset"])
        for inst in r.get("institutions", []):
            iid = alias.get(inst.lower()) or "inst:" + re.sub(r"[^a-z0-9]+", "-", inst.lower()).strip("-")
            if iid not in nodes:
                nodes[iid] = {"id": iid, "type": "institution", "label": inst, "cases": set()}
            pair[(cid, iid)].append(r)
            agg[(r["dataset"], iid)] += 1
        if re.search(r"ukrain", r.get("description") or "", re.I):
            pair[(cid, "country:ukraine")].append(r)
    for (cid, iid), recs in pair.items():
        ds = sorted({r["dataset"] for r in recs})
        if iid == "country:ukraine":
            edges.append({"from": cid, "to": iid, "label": f"Description mentions Ukraine ({len(recs)} record{'s' * (len(recs) > 1)})", "kind": "computed", "layer": "lobbying",
                          "src": {"doc": dsfile[ds[0]], "github": gh(dsfile[ds[0]]), "loc": "Description column"}})
        else:
            edges.append({"from": cid, "to": iid, "label": f"Lobbied: {len(recs)} record{'s' * (len(recs) > 1)}", "kind": "data", "layer": "lobbying", "weight": len(recs),
                          "src": {"doc": dsfile[ds[0]], "github": gh(dsfile[ds[0]]), "loc": ", ".join(sorted({r['date'] for r in recs}))[:120], "url": recs[0].get("url")}})
    for (ds, iid), n in agg.items():
        edges.append({"from": ds, "to": iid, "label": f"{n} lobbying record{'s' * (n > 1)} name this institution", "kind": "data", "layer": "lobbying-summary", "weight": n,
                      "src": {"doc": dsfile[ds], "github": gh(dsfile[ds]), "loc": "Government Institutions"}})
    for ds in dsfile:
        for cid in [k for k, v in nodes.items() if ds in v.get("datasets", ())]:
            edges.append({"from": ds, "to": cid, "label": "Client in table", "kind": "data", "layer": "lobbying",
                          "src": {"doc": dsfile[ds], "github": gh(dsfile[ds]), "loc": "Client / Organization"}})
    for c in cur["cases"]:
        for nid, n in nodes.items():
            if c["id"] in n["cases"] and n["type"] != "case":
                edges.append({"from": c["id"], "to": nid, "label": "Appears in case", "kind": "case", "layer": "case"})
    deg = Counter()
    for e in edges:
        deg[e["from"]] += 1
        deg[e["to"]] += 1
    out_nodes = []
    for n in nodes.values():
        n = dict(n, cases=sorted(n["cases"]), degree=deg[n["id"]])
        if "datasets" in n:
            n["datasets"] = sorted(n["datasets"])
        out_nodes.append(n)
    missing = [e for e in edges if e["from"] not in nodes or e["to"] not in nodes]
    check("Graph: every edge endpoint exists", 0, len(missing))
    paths = {f["path"] for f in files}
    bad = sorted({e["src"]["doc"] for e in edges if e.get("src") and e["src"]["doc"] not in paths})
    check("Graph: every evidence file exists in the archive", [], bad)
    return {"nodes": out_nodes, "edges": edges}


def timeline(cur, lob, videos, files):
    folders = cur["folders"]
    paths = {f["path"] for f in files}
    dsfile = {d["id"]: d["file"] for d in lob["datasets"]}
    ev = []
    for e in cur["events"]:
        src = dict(e["src"], doc=expand(e["src"]["doc"], folders))
        if src["doc"] not in paths:  # reported by the graph check above
            continue
        src["github"] = gh(src["doc"])
        ev.append(dict(e, src=src, layer="evidence"))
    for c in cur["cases"]:
        if c.get("date"):
            ev.append({"date": c["date"], "title": f"Case published: {c['title']}", "case": c["id"], "layer": "archive"})
    for v in videos:
        ev.append({"date": v["date"], "title": f"Video: {v['title']}", "layer": "video", "url": f"https://youtu.be/{v['id']}"})
    by_day = defaultdict(list)
    for r in lob["records"]:
        by_day[(r["date"], r["dataset"])].append(r)
    for (d, ds), rs in by_day.items():
        clients = sorted({r["client"] for r in rs})
        ev.append({"date": d, "title": f"{len(rs)} lobbying record{'s' * (len(rs) > 1)}: {', '.join(clients)}", "dataset": ds, "layer": "lobbying",
                   "src": {"doc": dsfile[ds], "github": gh(dsfile[ds])}})
    return sorted(ev, key=lambda e: e["date"])


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="local clone of Vesper-Digital/Evidence-Archive")
    ap.add_argument("--out", default=str(HERE.parent / "site" / "data"))
    a = ap.parse_args()
    src, out = Path(a.src).resolve(), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    cur = json.loads((HERE / "curated.json").read_text(encoding="utf-8"))
    cur_folders = cur["folders"]
    for c in cur["cases"]:
        c["folder"] = expand(c["folder"] + "/x", cur_folders).rsplit("/", 1)[0]
    cur["cases"] += new_cases(src, {c["folder"] for c in cur["cases"]})
    files = inventory(src, cur["cases"])
    paths = {f["path"] for f in files}
    for c in cur["cases"]:
        if not any(p.startswith(c["folder"] + "/") for p in paths):
            check(f"Case folder still in the archive: {c['folder']}", True, False, "renamed or removed; its card shows no files")
    videos = json.loads((src / "assets/videos.json").read_text(encoding="utf-8"))["videos"] if (src / "assets/videos.json").is_file() else []
    lob = section("lobbying", out, lambda: lobbying(src))
    own = section("ownership", out, lambda: brookfield(src))

    def spending():
        est = estimates(src)
        est["recovery_index"] = recovery_index(src)
        for k in est["recovery_index"]["catalogue_missing"]:
            y, r = k.split()
            check(f"Deleted round {k} (no catalogue record) present in recovered 7z", True, any(x["year"] == y and x["round"] == r for x in est["rounds"]))
        return est
    est = section("estimates", out, spending)
    srv = section("survey", out, lambda: survey(src))
    graph = build_graph(cur, lob, files)
    tl = timeline(cur, lob, videos, files)
    links = pdf_links(src)
    try:
        sha = subprocess.run(["git", "-C", str(src), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() or None
    except OSError:
        sha = None
    for c in cur["cases"]:
        c["files"] = [f for f in files if f["path"].startswith(c["folder"] + "/")]
        c["video_url"] = f"https://youtu.be/{c['video']}" if c.get("video") else c.get("video_link")
    summary = {
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds"), "source_repo": f"https://github.com/{REPO}", "source_commit": sha,
        "cases": cur["cases"], "videos": videos, "checks": CHECKS,
        "new_in_archive": {"cases": [c["id"] for c in cur["cases"] if c.get("auto")],
                           "lobbying_tables": [d["id"] for d in lob["datasets"] if d.get("auto")]},
        "counts": {"files": len(files), "nodes": len(graph["nodes"]), "edges": len(graph["edges"]), "events": len(tl),
                   "lobbying_records": len(lob["records"]), "ownership_links": own["stats"]["links"], "estimate_rounds": len(est["rounds"]),
                   "external_links": len({l["url"] for l in links}), "survey_records": srv["records"]},
    }
    payload = {"summary": summary, "graph": graph, "timeline": tl, "lobbying": lob, "ownership": own, "estimates": est, "survey": srv,
               "sources": {"files": files, "pdf_links": links}}
    for name, data in payload.items():
        (out / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=sorted), encoding="utf-8")
    failed = [c for c in CHECKS if not c["pass"]]
    for c in CHECKS:
        print(("PASS " if c["pass"] else "FAIL ") + c["name"] + ("" if c["pass"] else f"  expected={c['expected']} actual={c['actual']}"))
    print(json.dumps(summary["counts"]))
    # A failed check is a finding about the archive, not a build error; it is shown on the site.
    return 0 if not [c for c in failed if c["name"].startswith("Graph:")] else 1


if __name__ == "__main__":
    sys.exit(main())
