# Evidence Archive Map

An interactive map of the public [Vesper-Digital/Evidence-Archive](https://github.com/Vesper-Digital/Evidence-Archive)
repository. It shows who connects to whom, where the money goes, and the exact archive file behind every fact.

The site adds no facts of its own. Every number, name and date comes from an archive file, or from a calculation over archive
files that is labelled as one. Every connection links back to its file on GitHub.

## Pages

| Page | What it shows |
|---|---|
| Overview | The five cases, headline counts, results of the automatic checks |
| Connection map | Network of people, bodies, companies, programs, datasets and claims. Click a dot to see its sourced connections. Filter by case or layer. A list view is also available. |
| Money flows | Every dollar figure in the evidence, IRCC grants to IOM and UNHCR, and Sankey charts of money moved between federal departments (Estimates, 2019-20 to 2021-22) |
| Federal spending | Any department across all 22 recovered Estimates rounds, the top 20 departments per round, and which rounds had no Open Government catalogue record |
| Lobbying | 105 Lobbying Registry records (Drones, Telesat, Roshel, Stelco tables), filterable by client, institution and text |
| Corporate ownership | Brookfield Corporation's 1,100-link ownership tree, searchable, with the path to any company |
| Timeline | Every dated item: events in the evidence, lobbying records, videos and case publication dates |
| Survey check | Recomputes StatCan's COVID-19 misinformation figures from the survey microdata in the archive |
| Sources & checks | Every archive file, how often the map cites it, every outside link the archive contains, and all build checks |

## How the data is built

```
Evidence-Archive (git clone)
        │
        ▼
pipeline/build_data.py  ──reads──►  pipeline/curated.json   (hand transcriptions of slides and images, with file + slide refs)
        │
        ▼
site/data/*.json  ──►  static site (site/)  ──►  GitHub Pages
```

- **Automatic extraction:** Lobbying Registry spreadsheets, the Brookfield ownership PDF, every CSV inside
  `Federal Estimates Deleted.7z`, the CPSS4 survey microdata and data dictionary, and the links inside every PDF.
- **Hand transcription:** slide images and graphics can't be parsed. Facts from them live in `pipeline/curated.json`
  with the file, the slide or page, and a word-for-word quote.
- **Checks:** the build cross-checks banner counts against parsed rows, Estimates totals, survey figures against StatCan's
  published percentages and data dictionary, and that every cited file exists. A failed check is a finding about the archive.
  It does not fail the build, and the site shows it. Only a broken graph (a missing node or file) fails the build.

## Run it locally

Requires [uv](https://docs.astral.sh/uv/) and Python 3.11+.

```bash
git clone https://github.com/Vesper-Digital/Evidence-Archive ../Evidence-Archive
uv run pipeline/build_data.py --src ../Evidence-Archive
uv run --no-project python -m unittest discover tests -v
cd site && python -m http.server 8000      # open http://localhost:8000
```

No build step and no npm. The site is plain HTML, CSS and ES modules. The only library is ECharts (`site/vendor/`).

## Deploy

`.github/workflows/deploy.yml` builds the data from the latest Evidence-Archive, runs the tests and publishes `site/` to
GitHub Pages. It runs on every push to `main`, daily, and on demand. To turn it on, go to **Settings → Pages → Source**
and choose **GitHub Actions**.

The site is static, so any static host works (Vercel, Netlify, Cloudflare Pages). Point it at `site/` with no build command.

## Project layout

```
pipeline/
  build_data.py      extraction + checks → site/data/*.json
  curated.json       hand-transcribed facts, cases, nodes, edges, events
site/
  index.html
  css/style.css
  data/              generated JSON (committed so the site works without a build)
  vendor/            echarts.min.js
  js/
    app.js           hash router
    services/        data loading
    helpers/         formatting, DOM, chart and case helpers
    enums/           node types, evidence kinds, layers, colours
    views/           one module per page
tests/
  test_data.py       contract tests between the pipeline output and the views
```

## Adding to it

- **A new case folder** in the archive: add it to `folders` and `cases` in `curated.json`, then add its nodes, edges and
  events. Every edge needs a `kind` (`data`, `stated` or `computed`) and a `src` with `doc` (archive path, with `@alias/`
  folder shortcuts), `loc` (page or slide) and `quote` where possible.
- **A new spreadsheet type:** add a reader to `build_data.py`, write its output to a new `site/data/<name>.json`, and add a
  view in `site/js/views/` plus a route in `app.js`.
- **A new kind of node:** add it to `NODE_TYPES` in `site/js/enums/kinds.js`. The tests check the pipeline only uses known types.

## Limits

- The site covers only what is in the archive. It does not check the archive against outside records unless the archive
  links to them.
- When one Estimates transfer has several givers and several receivers, the table does not say who paid whom. Those
  amounts are split in proportion and marked ≈.
- A connection means a document links two items. It is not a finding that anyone did anything wrong.
- The Evidence-Archive has no licence file. This site links to its files rather than copying them, and quotes only short
  passages.
