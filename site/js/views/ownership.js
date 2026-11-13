import { loadAll } from '../services/data.js';
import { esc, int } from '../helpers/format.js';
import { $, table, ext, setParams } from '../helpers/dom.js';
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

export async function render(root, params) {
  const [o, s] = await loadAll('ownership', 'summary');
  const st = o.stats;
  const parent = new Map();
  const all = [];
  (function walk(n, p) { parent.set(n, p); all.push(n); n.children.forEach((c) => walk(c, n)); })(o.tree, null);
  const pathOf = (n) => { const out = []; for (let x = n; x; x = parent.get(x)) out.unshift(x); return out; };
  const pct = (n) => (n.pct == null ? '' : ` (${n.pct}%)`);
  const brkCase = s.cases.find((c) => c.id === 'case:brookfield');
  const state = { q: params.q || '', target: null, expanded: new Set([o.tree]) };

  root.innerHTML = `
    <h1>Who owns what: Brookfield Corporation</h1>
    <p class="lead">The “Who Runs Canada” case contains a 43-page table of Brookfield Corporation's published inter-corporate
      ownership structure (reference year 2025). It lists every company in the group, the share its parent holds, how many
      levels down it sits, and the type of link.</p>
    <div class="stats">
      <div class="stat"><b>${int(st.links)}</b><span>ownership links below the root</span></div>
      <div class="stat"><b>${int(st.distinct_entities)}</b><span>distinct company names</span></div>
      <div class="stat"><b>${int(st.direct_children)}</b><span>companies held directly</span></div>
      <div class="stat"><b>${Math.max(...Object.keys(st.by_level).map(Number)) - 1}</b><span>levels below Brookfield, at the deepest</span></div>
    </div>
    <div class="controls">
      <label>Find a company <input id="o-q" type="search" value="${esc(state.q)}" placeholder="e.g. Enercare, Brookfield Renewable"></label>
      <button class="btn small secondary" id="o-reset">Collapse all</button>
    </div>
    <div id="o-results"></div>
    <div class="panel">
      <p class="small muted">Click a company to open or close its branch. Drag to move, scroll to zoom. Colours show the link type
        as labelled in the source table.</p>
      <div class="legend-list">${Object.entries(TYPE_COLORS).map(([k, c]) => `<span><span class="dot" style="background:${c}"></span>${esc(k)}${st.by_type[k] ? ` (${int(st.by_type[k])})` : ''}</span>`).join('')}</div>
      <div id="o-tree" class="chart" style="height:1000px"></div>
    </div>
    <div class="grid cols-2">
      <div class="panel"><h3>Links at each level</h3><div id="o-levels" class="chart" style="height:320px"></div></div>
      <div class="panel"><h3>Outside investors</h3>
        ${table([{ label: 'Investor', value: (n) => n.name }, { label: 'Share', num: true, value: (n) => `${n.pct}%` }, { label: 'Page', num: true, value: (n) => n.page }], o.outside_investors)}
        <h3 style="margin-top:1rem">About the source</h3>
        <p class="small">The same table appears twice in the archive: ${ext(o.url, 'Tables/BROOKFIELD_CORPORATION.pdf')} and in the
          case folder (${esc(o.twin.split('/').pop())}). The build confirmed their text is identical. The table is marked
          “GOVERNMENT OF CANADA RECORD · CORP &amp; FINANCE · INTER-CORPORATE OWNERSHIP”.
          ${brkCase ? ext(brkCase.video_url, 'Case video') : ''}</p>
      </div>
    </div>`;

  const tree = chart($('#o-tree', root), {});
  function toData(n) {
    const hit = n === state.target;
    return {
      name: n.name + pct(n),
      collapsed: !state.expanded.has(n),
      itemStyle: { color: TYPE_COLORS[n.link] || '#667085', borderColor: hit ? '#b42318' : TYPE_COLORS[n.link] || '#667085', borderWidth: hit ? 4 : 1 },
      label: hit ? { fontWeight: 'bold', color: '#b42318', backgroundColor: '#fff3' } : undefined,
      tip: `${n.name}${pct(n)}<br>${n.level - 1} level${n.level === 2 ? '' : 's'} below Brookfield · ${n.link} · page ${n.page}`,
      children: n.children.map(toData),
    };
  }
  function drawTree() {
    tree.setOption({
      tooltip: { trigger: 'item', confine: true, formatter: (p) => p.data.tip.replace(/&/g, '&amp;').replace(/<(?!br>)/g, '&lt;') },
      series: [{
        type: 'tree', data: [toData(o.tree)], top: 10, left: 180, bottom: 10, right: 280,
        symbolSize: 8, roam: true, expandAndCollapse: true, initialTreeDepth: -1, animationDuration: 300,
        label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 10 },
        leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
      }],
    }, true);
  }
  // keep our expanded set in sync when the reader clicks nodes
  tree.on('click', (p) => {
    const path = p.treeAncestors ? p.treeAncestors.slice(1).map((a) => a.name) : null;
    if (!path) return;
    let n = o.tree;
    for (const name of path.slice(1)) { n = n.children.find((c) => c.name + pct(c) === name) || n; }
    if (state.expanded.has(n)) state.expanded.delete(n); else state.expanded.add(n);
  });

  function search() {
    setParams({ q: state.q });
    const q = state.q.trim().toLowerCase();
    if (q.length < 2) { $('#o-results', root).innerHTML = ''; return; }
    const hits = all.filter((n) => n.name.toLowerCase().includes(q));
    $('#o-results', root).innerHTML = `<div class="panel"><p><b>${hits.length}</b> match${hits.length === 1 ? '' : 'es'}${hits.length > 40 ? ' (first 40 shown)' : ''}. Click one to open its branch.</p>
      ${hits.slice(0, 40).map((n, i) => `<div class="conn"><a href="#" data-hit="${i}"><b>${esc(n.name)}</b></a> <span class="badge">${n.level - 1} level${n.level === 2 ? '' : 's'} below Brookfield</span><span class="badge">${esc(n.link)}</span><span class="badge">page ${n.page}</span>
        <div class="path muted">${pathOf(n).map((x) => `<span>${esc(x.name)}${esc(pct(x))}</span>`).join('')}</div></div>`).join('')}</div>`;
    $('#o-results', root).onclick = (ev) => {
      const a = ev.target.closest('a[data-hit]');
      if (!a) return;
      ev.preventDefault();
      state.target = hits[Number(a.dataset.hit)];
      pathOf(state.target).forEach((x) => state.expanded.add(x));
      drawTree();
      $('#o-tree', root).scrollIntoView({ behavior: 'smooth' });
    };
  }

  const levels = Object.keys(st.by_level).map(Number).sort((a, b) => a - b);
  chart($('#o-levels', root), {
    grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', name: 'levels below', data: levels.map((l) => l - 1) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: levels.map((l) => st.by_level[l]), itemStyle: { color: '#1d4ed8' } }],
  });

  $('#o-q', root).addEventListener('input', (ev) => { state.q = ev.target.value; search(); });
  $('#o-reset', root).addEventListener('click', () => { state.expanded = new Set([o.tree]); state.target = null; drawTree(); });
  drawTree();
  search();
}
