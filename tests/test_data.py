"""Contract tests: the JSON the pipeline writes has what the site's views read.

Run after a build:  uv run --no-project python -m unittest discover tests
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
KINDS_JS = (ROOT / "site" / "js" / "enums" / "kinds.js").read_text(encoding="utf-8")


def load(name):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def enum_keys(block):
    body = re.search(rf"export const {block} = \{{(.*?)\n\}};", KINDS_JS, re.S).group(1)
    return set(re.findall(r"^\s+'?([\w-]+)'?:", body, re.M))


class DataContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s, cls.g, cls.src = load("summary"), load("graph"), load("sources")

    def test_all_files_present(self):
        for n in ["summary", "graph", "timeline", "lobbying", "ownership", "estimates", "survey", "sources"]:
            self.assertTrue((DATA / f"{n}.json").is_file(), n)

    def test_graph_endpoints_and_enums(self):
        ids = {n["id"] for n in self.g["nodes"]}
        self.assertEqual(len(ids), len(self.g["nodes"]), "duplicate node ids")
        node_types, edge_kinds, layers = enum_keys("NODE_TYPES"), enum_keys("EDGE_KINDS"), enum_keys("LAYERS")
        for n in self.g["nodes"]:
            self.assertIn(n["type"], node_types, n["id"])
        for e in self.g["edges"]:
            self.assertIn(e["from"], ids)
            self.assertIn(e["to"], ids)
            self.assertIn(e["kind"], edge_kinds)
            self.assertIn(e.get("layer") or "evidence", layers)

    def test_every_evidence_edge_cites_an_archive_file(self):
        paths = {f["path"] for f in self.src["files"]}
        for e in self.g["edges"]:
            if e.get("layer") in (None, "lobbying"):
                self.assertIn("src", e, e["label"])
                self.assertIn(e["src"]["doc"], paths, e["label"])
                self.assertTrue(e["src"]["github"].startswith("https://github.com/Vesper-Digital/Evidence-Archive/blob/main/"))

    def test_money_edges_have_a_plain_description(self):
        for e in self.g["edges"]:
            if e.get("amount") and not e.get("layer"):
                self.assertTrue(e.get("money"), e["label"])

    def test_lobbying_records_have_every_field(self):
        lob = load("lobbying")
        keys = {"dataset", "date", "client", "type", "institutions", "holders", "description", "registrant", "firm", "funding", "reg_id", "comm_id", "url"}
        for r in lob["records"]:
            self.assertEqual(keys, set(r), r.get("url"))
            self.assertIsInstance(r["institutions"], list)
            self.assertIsInstance(r["holders"], list)
        self.assertEqual(sum(d["records"] for d in lob["datasets"]), len(lob["records"]))
        for d in lob["datasets"]:
            self.assertTrue(d.get("name"), d["id"])

    def test_new_in_archive_points_at_real_items(self):
        new = self.s["new_in_archive"]
        self.assertTrue(set(new["cases"]) <= {c["id"] for c in self.s["cases"]})
        self.assertTrue(set(new["lobbying_tables"]) <= {d["id"] for d in load("lobbying")["datasets"]})

    def test_survey_matches_statcan(self):
        sv = load("survey")
        for r in sv["rows"]:
            if r["published_pct"] is not None:
                self.assertEqual(round(r["weighted_pct"]), r["published_pct"], r["label"])

    def test_ownership_tree_counts(self):
        o = load("ownership")
        n = -1  # the root is not a link

        def walk(x):
            nonlocal n
            n += 1
            for c in x["children"]:
                walk(c)
        walk(o["tree"])
        self.assertEqual(n, o["stats"]["links"])

    def test_timeline_layers(self):
        layers = enum_keys("TIMELINE_LAYERS")
        for e in load("timeline"):
            self.assertIn(e["layer"], layers)
            self.assertRegex(e["date"], r"^\d{4}-\d{2}-\d{2}")

    def test_build_checks_reported(self):
        failed = [c["name"] for c in self.s["checks"] if not c["pass"]]
        self.assertFalse([f for f in failed if f.startswith("Graph:")], failed)
        if failed:
            print("\nArchive discrepancies shown on the site:", *failed, sep="\n  ")


if __name__ == "__main__":
    unittest.main()
