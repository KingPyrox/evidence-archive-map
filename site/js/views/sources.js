import { loadAll } from '../services/data.js';
import { esc, int, bytes, fileName } from '../helpers/format.js';
import { $, table, options, setParams, ext } from '../helpers/dom.js';

export const title = 'Sources & checks';

export async function render(root, params) {
  const [s, g, src] = await loadAll('summary', 'graph', 'sources');
  const state = { case: params.case || '', q: params.q || '' };
  const cited = new Map();
  g.edges.forEach((e) => { if (e.src?.doc) cited.set(e.src.doc, (cited.get(e.src.doc) || 0) + 1); });
  const caseTitle = Object.fromEntries(s.cases.map((c) => [c.id, c.title]));
  const allFiles = src.files.map((f) => ({ ...f, case: f.case || 'shared', caseTitle: caseTitle[f.case] || 'Shared tables and site files' }));
  const links = [...new Map(src.pdf_links.map((l) => [l.url, l])).values()];

  root.innerHTML = `
    <h1>Sources &amp; checks</h1>
    <p class="lead">Every file in the archive, how many lines on the map use it, and the original sources the archive links
      to. Everything on this site comes from these files. The one exception is Canada's population, used to show big
      amounts as dollars for every person.</p>

    <h2>Archive files</h2>
    <div class="controls">
      <label>Case <select id="f-case">${options([['', 'All'], ...s.cases.map((c) => [c.id, c.title]), ['shared', 'Shared tables and site files']], state.case)}</select></label>
      <label>Search <input id="f-q" type="search" value="${esc(state.q)}" placeholder="File name"></label>
    </div>
    <div id="f-table"></div>

    <h2>Original sources linked from the archive</h2>
    <p>${int(links.length)} different links found inside the archive's PDFs, grouped by website.</p>
    <div id="x-table"></div>

    <h2>All automatic checks</h2>
    <p>These run every time the site updates (<code>pipeline/build_data.py</code>). “Differs” means two files in the archive
      disagree with each other. It is not a mistake on this site.</p>
    ${table([
      { label: 'Check', value: (c) => c.name },
      { label: 'Expected', num: true, value: (c) => (typeof c.expected === 'number' ? int(c.expected) : c.expected) },
      { label: 'Found', num: true, value: (c) => (typeof c.actual === 'number' ? int(c.actual) : c.actual) },
      { label: 'Result', html: (c) => (c.pass ? '<span class="badge ok">matches</span>' : '<span class="badge warn">differs</span>') },
      { label: 'Note', value: (c) => c.note || '' },
    ], s.checks)}`;

  function drawFiles() {
    setParams(state);
    const q = state.q.trim().toLowerCase();
    const rows = allFiles.filter((f) => (!state.case || f.case === state.case) && (!q || f.path.toLowerCase().includes(q)));
    $('#f-table', root).innerHTML = table([
      { label: 'File', html: (f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(fileName(f.path))}</a><div class="small muted">${esc(f.path)}</div>` },
      { label: 'Case', value: (f) => f.caseTitle },
      { label: 'Size', num: true, value: (f) => bytes(f.size) },
      { label: 'Cited on the map', num: true, value: (f) => cited.get(f.path) || '' },
    ], rows, { empty: 'No files match.', limit: 20 });
  }

  const byHost = new Map();
  links.forEach((l) => { const h = new URL(l.url).hostname.replace(/^www\./, ''); if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(l); });
  $('#x-table', root).innerHTML = table([
    { label: 'Website', value: ([h]) => h },
    { label: 'Links', num: true, value: ([, ls]) => ls.length },
    { label: 'Links (and which archive file they are in)', html: ([, ls]) => `<details><summary>Show ${ls.length}</summary>${ls.map((l) => `<div class="small">${ext(l.url, l.url.length > 90 ? `${l.url.slice(0, 89)}…` : l.url)} <span class="muted">in ${esc(fileName(l.doc))}, p. ${l.page}</span></div>`).join('')}</details>` },
  ], [...byHost.entries()].sort((a, b) => b[1].length - a[1].length));

  $('#f-case', root).addEventListener('change', (ev) => { state.case = ev.target.value; drawFiles(); });
  $('#f-q', root).addEventListener('input', (ev) => { state.q = ev.target.value; drawFiles(); });
  drawFiles();
}
