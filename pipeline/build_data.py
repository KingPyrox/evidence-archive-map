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
from urllib.parse import quote

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
        if p.suffix.lower() == ".zip" and "assets/zips" not in rel:
            with zipfile.ZipFile(p) as z:
                item["contents"] = [{"name": i.filename, "size": i.file_size} for i in z.infolist() if not i.is_dir()]
        if p.suffix.lower() == ".7z":
            with py7zr.SevenZipFile(p) as z:
                item["contents"] = [{"name": i.filename, "size": i.uncompressed} for i in z.list() if not i.is_directory]
        files.append(item)
    return files


def pdf_links(src):
    """Every external URL printed in every PDF, with its page."""
    out = []
    for p in sorted(src.rglob("*.pdf")):
        if ".git" in p.parts:
            continue
        rel = p.relative_to(src).as_posix()
        with pymupdf.open(p) as doc:
            for i, page in enumerate(doc, 1):
                for l in page.get_links():
                    uri = l.get("uri") or ""
                    if uri.startswith("http"):
                        out.append({"doc": rel, "page": i, "url": uri})
    seen, uniq = set(), []
    for o in out:
        k = (o["doc"], o["page"], o["url"])
        if k not in seen:
            seen.add(k)
            uniq.append(o)
    return uniq


# ---------------------------------------------------------------- lobbying
LOBBY_FILES = {
    "dataset:lobby-drones": "Tables/Lobbying Registry - Drones - 2026.xlsx",
    "dataset:lobby-telesat": "Tables/Lobbying Registry - Telesat - 2026.xlsx",
    "dataset:lobby-roshel": "Tables/Roshel - 2026- Lobbying Records.xlsx",
    "dataset:lobby-stelco": "Tables/Stelco - 2026 - Lobbying Records.xlsx",
}
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


def lobbying(src):
    datasets, records = [], []
    for ds_id, rel in LOBBY_FILES.items():
        wb = openpyxl.load_workbook(src / rel)
        ws = wb[wb.sheetnames[0]]
        meta = {"id": ds_id, "file": rel, "url": gh(rel), "query": ws["B2"].value,
                "banner": ws["B3"].value, "date_range": ws["B6"].value, "institutions_banner": ws["B7"].value}
        heads = [HEAD_KEYS.get(c.value, c.value) for c in ws[10]]
        n = 0
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
            n += 1
        m = re.search(r"(\d+) matching records", meta["banner"] or "")
        meta["records"] = n
        check(f"{rel}: record count", int(m.group(1)) if m else None, n, "banner vs parsed rows")
        inst = sorted({i for r in records if r["dataset"] == ds_id for i in r.get("institutions", [])})
        mi = re.search(r"(\d+) DISTINCT", meta["institutions_banner"] or "")
        meta["distinct_institutions"] = len(inst)
        check(f"{rel}: distinct institutions", int(mi.group(1)) if mi else None, len(inst), "banner vs parsed lists")
        datasets.append(meta)
    return {"datasets": datasets, "records": records}


# ---------------------------------------------------------------- brookfield
LINK_TYPES = {"Group root", "Published link", "Repeated link", "Not controlled", "Outside investor", "Control / repeated"}


def brookfield(src):
    rel = "Tables/BROOKFIELD_CORPORATION.pdf"
    twin = "Who Runs Canada_Brookfield Corp/Files/BROOKFIELD_CORPORATION_Corp.pdf.pdf"
    texts = {}
    for r in (rel, twin):
        with pymupdf.open(src / r) as doc:
            texts[r] = [pg.get_text() for pg in doc]
    same = hashlib.sha256("".join(texts[rel]).encode()).hexdigest() == hashlib.sha256("".join(texts[twin]).encode()).hexdigest()
    check("Brookfield: Tables/ PDF text identical to case PDF", True, same)
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
    arc = src / "Deleted Federal Records/Files/Federal Estimates Deleted.7z"
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
    rel = "Deleted Federal Records/Files/Canada-Deleted-Spending Estimates-Records list.pdf"
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
    zrel = "Tim Caulfied  Government Funded Misinformation Guru Who Got It Wrong/Files/Government Questionaires and Findings.zip"
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
    xrel = "Tim Caulfied  Government Funded Misinformation Guru Who Got It Wrong/Files/misinformation Statscan.xlsx"
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
    nodes = {n["id"]: dict(n, cases=set()) for n in cur["nodes"]}
    edges = []
    for c in cur["cases"]:
        nodes[c["id"]] = {"id": c["id"], "type": "case", "label": c["title"], "summary": c["summary"], "date": c["date"], "cases": {c["id"]}}
    folder_case = {expand(c["folder"] + "/x", folders).split("/")[0]: c["id"] for c in cur["cases"]}

    def case_of(doc):
        return folder_case.get((doc or "").split("/")[0])

    for e in cur["edges"]:
        e = dict(e, src=dict(e["src"], doc=expand(e["src"]["doc"], folders)))
        e["src"]["github"] = gh(e["src"]["doc"])
        cs = case_of(e["src"]["doc"])
        if cs:
            nodes[e["from"]]["cases"].add(cs)
            nodes[e["to"]]["cases"].add(cs)
        edges.append(e)
    for c in cur["cases"]:
        for d in c.get("datasets", []):
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
                          "src": {"doc": LOBBY_FILES[ds[0]], "github": gh(LOBBY_FILES[ds[0]]), "loc": "Description column"}})
        else:
            edges.append({"from": cid, "to": iid, "label": f"Lobbied: {len(recs)} record{'s' * (len(recs) > 1)}", "kind": "data", "layer": "lobbying", "weight": len(recs),
                          "src": {"doc": LOBBY_FILES[ds[0]], "github": gh(LOBBY_FILES[ds[0]]), "loc": ", ".join(sorted({r['date'] for r in recs}))[:120], "url": recs[0].get("url")}})
    for (ds, iid), n in agg.items():
        edges.append({"from": ds, "to": iid, "label": f"{n} lobbying record{'s' * (n > 1)} name this institution", "kind": "data", "layer": "lobbying-summary", "weight": n,
                      "src": {"doc": LOBBY_FILES[ds], "github": gh(LOBBY_FILES[ds]), "loc": "Government Institutions"}})
    for ds in LOBBY_FILES:
        for cid in [k for k, v in nodes.items() if ds in v.get("datasets", ())]:
            edges.append({"from": ds, "to": cid, "label": "Client in table", "kind": "data", "layer": "lobbying",
                          "src": {"doc": LOBBY_FILES[ds], "github": gh(LOBBY_FILES[ds]), "loc": "Client / Organization"}})
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


def timeline(cur, lob, videos):
    folders = cur["folders"]
    ev = []
    for e in cur["events"]:
        src = dict(e["src"], doc=expand(e["src"]["doc"], folders))
        src["github"] = gh(src["doc"])
        ev.append(dict(e, src=src, layer="evidence"))
    for c in cur["cases"]:
        ev.append({"date": c["date"], "title": f"Case published: {c['title']}", "case": c["id"], "layer": "archive"})
    for v in videos:
        ev.append({"date": v["date"], "title": f"Video: {v['title']}", "layer": "video", "url": f"https://youtu.be/{v['id']}"})
    by_day = defaultdict(list)
    for r in lob["records"]:
        by_day[(r["date"], r["dataset"])].append(r)
    for (d, ds), rs in by_day.items():
        clients = sorted({r["client"] for r in rs})
        ev.append({"date": d, "title": f"{len(rs)} lobbying record{'s' * (len(rs) > 1)}: {', '.join(clients)}", "dataset": ds, "layer": "lobbying",
                   "src": {"doc": LOBBY_FILES[ds], "github": gh(LOBBY_FILES[ds])}})
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
    files = inventory(src, cur["cases"])
    videos = json.loads((src / "assets/videos.json").read_text(encoding="utf-8"))["videos"]
    lob = lobbying(src)
    own = brookfield(src)
    est = estimates(src)
    est["recovery_index"] = recovery_index(src)
    for k in est["recovery_index"]["catalogue_missing"]:
        y, r = k.split()
        check(f"Deleted round {k} (no catalogue record) present in recovered 7z", True, any(x["year"] == y and x["round"] == r for x in est["rounds"]))
    srv = survey(src)
    graph = build_graph(cur, lob, files)
    tl = timeline(cur, lob, videos)
    links = pdf_links(src)
    try:
        sha = subprocess.run(["git", "-C", str(src), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() or None
    except OSError:
        sha = None
    for c in cur["cases"]:
        c["files"] = [f for f in files if f["path"].startswith(c["folder"] + "/")]
        c["video_url"] = f"https://youtu.be/{c['video']}"
    summary = {
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds"), "source_repo": f"https://github.com/{REPO}", "source_commit": sha,
        "cases": cur["cases"], "videos": videos, "checks": CHECKS,
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
