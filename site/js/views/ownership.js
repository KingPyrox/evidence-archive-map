import { loadAll } from '../services/data.js';
import { esc, int, fileName } from '../helpers/format.js';
import { $, table, ext, setParams, figure } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';

export const title = 'Corporate ownership';

const TYPE_COLORS = {
  'Group root': '#be123c',
  'Published link': '#1d4ed8',
  'Repeated link': '#93c5fd',
  'Not controlled': '#f79009',
  'Control / repeated': '#7c3aed',
  'Outside investor': '#047857',
};
const MAX_HITS = 40;

export async function render(root, params) {
  const [o, s] = await loadAll('ownership', 'summary');
  const st = o.stats;
  const parent = new Map();
  const all = [];
  (function walk(n, p) { parent.set(n, p); all.push(n); n.children.forEach((c) => walk(c, n)); })(o.tree, null);
  const pathOf = (n) => { const out = []; for (let x = n; x; x = parent.get(x)) out.unshift(x); return out; };
  const pct = (n) => (n.pct == null ? '' : ` (${n.pct}%)`);
  const below = (n) => `${n.level - 1} level${n.level === 2 ? '' : 's'} below Brookfield`;
  const brkCase = s.cases.find((c) => c.id === 'case:brookfield');
  const levels = Object.keys(st.by_level).map(Number).sort((a, b) => a - b);
  const deepest = levels[levels.length - 1] - 1;
  const widest = levels.reduce((a, l) => (st.by_level[l] > st.by_level[a] ? l : a), levels[0]);
  const sizeOf = (n) => n.children.reduce((a, c) => a + 1 + sizeOf(c), 0);
  const biggest = o.tree.children.reduce((a, c) => (sizeOf(c) > sizeOf(a) ? c : a));
  const state = { q: params.q || '' };
  const src = ext(o.url, fileName(o.file));

  root.innerHTML = `
    <h1>Who owns what: Brookfield Corporation</h1>
    <p class="lead">The “Who Runs Canada” case contains a 43-page table of Brookfield Corporation's published inter-corporate
      ownership structure (reference year 2025). It lists every company in the group, the share its parent holds, how many
      levels down it sits, and the type of link.</p>
    <div class="stats">
      <div class="stat"><b>${int(st.links)}</b><span>ownership links below the root</span></div>
      <div class="stat"><b>${int(st.distinct_entities)}</b><span>distinct company names</span></div>
      <div class="stat"><b>${int(st.direct_children)}</b><span>companies held directly</span></div>
      <div class="stat"><b>${deepest}</b><span>levels below Brookfield, at the deepest</span></div>
    </div>
    <div class="controls">
      <label>Find a company <input id="o-q" type="search" value="${esc(state.q)}" placeholder="e.g. Enercare, Brookfield Renewable"></label>
      <button class="btn small secondary" id="o-reset">Close all branches</button>
    </div>
    <div id="o-results"></div>
    <div class="panel">
      <h3 class="fig-title">The largest branch is ${esc(biggest.name)}, with ${int(sizeOf(biggest))} companies below it.</h3>
      <p class="fig-how">Each line is one company and the share its parent holds. Click ▸ (or press Enter) to open a company and see
        what it owns. The coloured dot is the link type as labelled in the source table.</p>
      <div class="legend-list">${Object.entries(TYPE_COLORS).map(([k, c]) => `<span><span class="dot" style="background:${c}"></span>${esc(k)}${st.by_type[k] ? ` (${int(st.by_type[k])})` : ''}</span>`).join('')}</div>
      <div id="o-tree" class="o-tree"></div>
      <p class="fig-src">Source: ${src}</p>
    </div>
    <div class="grid cols-2">
      ${figure('o-levels', {
        title: `Most links sit ${widest - 1} level${widest === 2 ? '' : 's'} below Brookfield: ${int(st.by_level[widest])} of ${int(st.links)}.`,
        how: 'Each bar counts the companies at one depth. 1 is held directly by Brookfield, 2 is held by one of those, and so on.',
        src, cls: 'short',
      })}
      <div class="panel"><h3>Outside investors</h3>
        ${table([{ label: 'Investor', value: (n) => n.name }, { label: 'Share', num: true, value: (n) => `${n.pct}%` }, { label: 'Page', num: true, value: (n) => n.page }], o.outside_investors)}
        <h3 style="margin-top:1rem">About the source</h3>
        <p class="small">The same table appears twice in the archive: ${ext(o.url, 'Tables/BROOKFIELD_CORPORATION.pdf')} and in the
          case folder (${esc(o.twin.split('/').pop())}). The build confirmed their text is identical. The table is marked
          “GOVERNMENT OF CANADA RECORD · CORP &amp; FINANCE · INTER-CORPORATE OWNERSHIP”.
          ${brkCase ? ext(brkCase.video_url, 'Case video') : ''}</p>
      </div>
    </div>`;

  // Native <details>, so every branch opens with a click or the keyboard and screen readers announce it.
  const ids = new Map(all.map((n, i) => [n, i]));
  const row = (n) => `<span id="o-${ids.get(n)}"><span class="dot" style="background:${TYPE_COLORS[n.link] || '#667085'}" title="${esc(n.link || '')}"></span>${esc(n.name)}${n.pct == null ? '' : ` <span class="o-pct">${n.pct}%</span>`} <span class="muted small">p. ${n.page}${n.children.length ? ` · owns ${n.children.length}` : ''}</span></span>`;
  const item = (n) => (n.children.length
    ? `<li><details data-i="${ids.get(n)}"><summary>${row(n)}</summary><ul>${n.children.map(item).join('')}</ul></details></li>`
    : `<li class="leaf">${row(n)}</li>`);
  $('#o-tree', root).innerHTML = `<ul>${item(o.tree)}</ul>`;
  const closeAll = () => root.querySelectorAll('#o-tree details').forEach((d, i) => { d.open = i === 0; });
  closeAll();

  function show(n) {
    root.querySelectorAll('#o-tree .hit').forEach((x) => x.classList.remove('hit'));
    pathOf(n).forEach((x) => { const d = root.querySelector(`#o-tree details[data-i="${ids.get(x)}"]`); if (d && x !== n) d.open = true; });
    const el = $(`#o-${ids.get(n)}`, root);
    el.classList.add('hit');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function search() {
    setParams({ q: state.q });
    const q = state.q.trim().toLowerCase();
    if (q.length < 2) { $('#o-results', root).innerHTML = ''; return; }
    const hits = all.filter((n) => n.name.toLowerCase().includes(q));
    $('#o-results', root).innerHTML = `<div class="panel"><p><b>${hits.length}</b> match${hits.length === 1 ? '' : 'es'}${hits.length > MAX_HITS ? ` (first ${MAX_HITS} shown)` : ''}. Click one to find it in the tree.</p>
      ${hits.slice(0, MAX_HITS).map((n, i) => `<div class="conn"><a href="#" data-hit="${i}"><b>${esc(n.name)}</b></a> <span class="badge">${below(n)}</span><span class="badge">${esc(n.link)}</span><span class="badge">page ${n.page}</span>
        <div class="path muted">${pathOf(n).map((x) => `<span>${esc(x.name)}${esc(pct(x))}</span>`).join('')}</div></div>`).join('')}</div>`;
    $('#o-results', root).onclick = (ev) => {
      const a = ev.target.closest('a[data-hit]');
      if (!a) return;
      ev.preventDefault();
      show(hits[Number(a.dataset.hit)]);
    };
  }

  chart($('#o-levels', root), {
    grid: { left: 10, right: 20, top: 24, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', formatter: (ps) => `${ps[0].name} level${ps[0].name === '1' ? '' : 's'} below Brookfield: <b>${int(ps[0].value)}</b> companies` },
    xAxis: { type: 'category', name: 'levels below Brookfield', nameLocation: 'middle', nameGap: 26, data: levels.map((l) => l - 1) },
    yAxis: { type: 'value', name: 'companies' },
    series: [{ type: 'bar', data: levels.map((l) => st.by_level[l]), itemStyle: { color: '#1d4ed8' }, label: { show: true, position: 'top' } }],
  });

  $('#o-q', root).addEventListener('input', (ev) => { state.q = ev.target.value; search(); });
  $('#o-reset', root).addEventListener('click', () => { closeAll(); root.querySelectorAll('#o-tree .hit').forEach((x) => x.classList.remove('hit')); });
  search();
}
