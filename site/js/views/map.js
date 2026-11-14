import { loadAll } from '../services/data.js';
import { esc } from '../helpers/format.js';
import { $, sourceHtml, options, setParams, table, figure, caption, changeBox } from '../helpers/dom.js';
import { chart, textWidth } from '../helpers/chart.js';
import { caseIndex, nodeCases } from '../helpers/cases.js';
import { NODE_TYPES, EDGE_KINDS, LAYERS } from '../enums/kinds.js';

export const title = 'Connection map';

const TABLES = 'tables';
const ALL = 'all';
// The map opens on one case with lobbying off: the full graph has about 500 lines and reads as a hairball.
const DEFAULT_LAYERS = ['evidence', 'case'];
const LOBBY_LAYERS = ['lobbying', 'lobbying-summary'];
const LABELS = 10; // only the most connected names are labelled; hover or click a dot for the rest
const TYPES = Object.keys(NODE_TYPES);
const PAGES = {
  'org:brookfield': ['#/ownership', 'Explore the ownership tree'],
  'dataset:brookfield-ownership': ['#/ownership', 'Explore the ownership tree'],
  'dataset:estimates': ['#/spending', 'Explore the recovered Estimates'],
  'claim:deleted': ['#/spending', 'Explore the recovered Estimates'],
  'claim:ircc-billions': ['#/spending?org=Department%20of%20Citizenship%20and%20Immigration', 'IRCC across every Estimates round'],
  'org:ircc': ['#/money', 'IRCC grants on the money page'],
  'dataset:pumf': ['#/survey', 'Open the survey check'],
  'dataset:statcan-tally': ['#/survey', 'Open the survey check'],
  'claim:stats-dont-add-up': ['#/survey', 'Open the survey check'],
  'program:cpss4': ['#/survey', 'Open the survey check'],
};

const edgeLayer = (e) => e.layer || 'evidence';

export async function render(root, params) {
  const [s, g] = await loadAll('summary', 'graph');
  const idx = caseIndex(s.cases);
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const state = {
    case: params.case || s.cases[0].id,
    layers: new Set(params.layers ? params.layers.split(',') : DEFAULT_LAYERS),
    node: params.node || '',
  };

  root.innerHTML = `
    <h1>Connection map</h1>
    <p class="lead">Each shape is a person, group, program, data table or claim. Each line joins two of them because a file in
      the archive connects them. <b>A line does not mean anyone did something wrong.</b></p>
    <div class="controls">
      <label>Case <select id="m-case">${options([...s.cases.map((c) => [c.id, c.title]), [ALL, 'All cases'], [TABLES, 'The lobbying lists']], state.case)}</select></label>
      <label>Find <input id="m-find" type="search" list="m-names" placeholder="A person, group, company…" autocomplete="off"></label>
      <datalist id="m-names">${g.nodes.map((n) => `<option value="${esc(n.label)}">`).join('')}</datalist>
    </div>
    <div class="map-layout">
      <div>
        ${figure('m-chart', { how: `Shapes and colours show the kind of item (key below the map). Bigger shapes have more connections. Only the ${LABELS} most connected have names: point at a shape for its name, and tap or click it for its sources. Drag to move, scroll or pinch to zoom.` })}
        <div class="legend-list">${['data', 'stated', 'computed'].map((k) => `<span title="${esc(EDGE_KINDS[k].help)}"><span class="line-sample ${EDGE_KINDS[k].style}"></span>${esc(EDGE_KINDS[k].label)}</span>`).join('')}
          <span><span class="line-sample" style="border-color:#c26a05"></span>Lobbying record</span>
          <span><span class="line-sample" style="border-color:#7d879a"></span>Appears in case</span></div>
        <div id="m-table" hidden></div>
      </div>
      <aside class="side" id="m-side" aria-live="polite"></aside>
    </div>
    ${changeBox(`<span class="controls" id="m-layers">${Object.entries(LAYERS).map(([k, v]) => `<label><input type="checkbox" value="${k}" ${state.layers.has(k) ? 'checked' : ''}> ${esc(v)}</label>`).join('')}</span>
      <button class="btn small secondary" id="m-list" aria-pressed="false">Show as a list</button>`)}`;

  const c = chart($('#m-chart', root), {});
  let view = { nodes: [], edges: [], ids: new Set() };

  function inScope(id) {
    const n = byId[id];
    if (state.case === TABLES) return id.startsWith('dataset:lobby') || (n.datasets || []).length > 0;
    return nodeCases(n, idx).has(state.case);
  }

  function compute() {
    let edges = g.edges.filter((e) => state.layers.has(edgeLayer(e)));
    if (state.case !== ALL) edges = edges.filter((e) => (edgeLayer(e).startsWith('lobbying') ? inScope(e.from) : inScope(e.from) && inScope(e.to)));
    const ids = new Set(edges.flatMap((e) => [e.from, e.to]));
    return { edges, ids, nodes: [...ids].map((i) => byId[i]) };
  }

  function draw() {
    view = compute();
    const deg = {};
    view.edges.forEach((e) => { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; });
    const pairSeen = {};
    const present = new Set(view.nodes.map((n) => n.type));
    const named = new Set(Object.entries(deg).sort((a, b) => b[1] - a[1]).slice(0, LABELS).map(([id]) => id));
    const scope = state.case === ALL ? 'All cases' : state.case === TABLES ? 'The lobbying tables' : idx.byId[state.case].title;
    caption(root, 'm-chart', `${esc(scope)}: ${view.nodes.length} items and ${view.edges.length} connections${state.layers.size ? '' : '. Tick a layer under the map to draw connections'}.`);
    // the key wraps onto as many rows as it needs, so no entry is cut off on a phone
    const keyTypes = TYPES.filter((t) => present.has(t));
    const room = c.getDom().clientWidth - 16;
    let keyRows = 1;
    let x = 0;
    keyTypes.forEach((t) => { const w = 42 + textWidth(NODE_TYPES[t].label); if (x && x + w > room) { keyRows += 1; x = 0; } x += w; });
    c.setOption({
      tooltip: { confine: true, formatter: (p) => (p.dataType === 'edge' ? esc(p.data.tip) : `<b>${esc(p.data.name)}</b><br>${esc(NODE_TYPES[p.data.type].label)}`) },
      legend: [{ type: 'plain', bottom: 4, left: 8, right: 8, itemGap: 10, data: keyTypes.map((t) => ({ name: NODE_TYPES[t].label, icon: NODE_TYPES[t].symbol })), textStyle: { fontSize: 12 } }],
      animationDurationUpdate: 400,
      series: [{
        type: 'graph',
        layout: 'force',
        top: 20,
        bottom: 16 + keyRows * 22,
        roam: true,
        draggable: true,
        categories: TYPES.map((t) => ({ name: NODE_TYPES[t].label, itemStyle: { color: NODE_TYPES[t].color }, symbol: NODE_TYPES[t].symbol })),
        data: view.nodes.map((n) => ({
          id: n.id,
          name: n.label,
          type: n.type,
          category: TYPES.indexOf(n.type),
          symbolSize: 7 + 3.2 * Math.sqrt(deg[n.id] || 1),
          label: { show: named.has(n.id) },
        })),
        links: view.edges.map((e) => {
          const key = [e.from, e.to].sort().join('|');
          const i = (pairSeen[key] = (pairSeen[key] ?? -1) + 1);
          const lob = edgeLayer(e).startsWith('lobbying');
          const cs = edgeLayer(e) === 'case';
          return {
            source: e.from,
            target: e.to,
            tip: e.label,
            lineStyle: {
              type: EDGE_KINDS[e.kind].style,
              // every line passes 3:1 against the background, after opacity (WCAG 1.4.11)
              color: cs ? '#7d879a' : lob ? '#c26a05' : '#475467',
              width: cs ? 0.6 : lob ? 0.8 + Math.min(e.weight || 1, 6) * 0.3 : 1.3,
              opacity: cs ? 0.9 : 0.85,
              curveness: 0.06 + i * 0.12,
            },
          };
        }),
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 5,
        // small views get more room, so the few labels shown do not sit on top of each other
        force: view.nodes.length < 40 ? { repulsion: 700, edgeLength: [90, 180], gravity: 0.1, friction: 0.25 } : { repulsion: 150, edgeLength: [30, 120], gravity: 0.07, friction: 0.25 },
        label: { position: 'right', color: '#1c1f24', width: Math.min(150, Math.round(room / 2.5)), overflow: 'break', lineHeight: 15 },
        // a name that would run off an edge moves back inside: to the left of its shape if there is room, else along the edge
        labelLayout: (p) => {
          const r = p.labelRect;
          const W = c.getWidth();
          const H = c.getHeight();
          const out = { hideOverlap: true };
          if (r.x + r.width > W - 4) Object.assign(out, p.rect.x - 4 - r.width >= 4 ? { x: p.rect.x - 4, align: 'right' } : { x: Math.max(4, W - 4 - r.width), align: 'left' });
          if (r.y < 4) out.dy = 4 - r.y;
          else if (r.y + r.height > H - 4) out.dy = H - 4 - r.y - r.height;
          return out;
        },
        emphasis: { focus: 'adjacency', lineStyle: { width: 2.5 }, label: { show: true } },
      }],
    }, true);
    $('#m-table', root).innerHTML = table([
      { label: 'From', value: (e) => byId[e.from].label },
      { label: 'Connection', value: (e) => e.label },
      { label: 'To', value: (e) => byId[e.to].label },
      { label: 'Evidence', value: (e) => EDGE_KINDS[e.kind].label },
      { label: 'Source', html: (e) => sourceHtml(e.src) },
    ], view.edges.filter((e) => edgeLayer(e) !== 'case'));
    if (state.node && view.ids.has(state.node)) select(state.node, false); else side();
  }

  function side() {
    const deg = {};
    view.edges.filter((e) => edgeLayer(e) !== 'case').forEach((e) => { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; });
    const top = Object.entries(deg).sort((a, b) => b[1] - a[1]).slice(0, 12);
    $('#m-side', root).innerHTML = `
      <h2 style="margin-top:0">How to use the map</h2>
      <p>Click any shape to list its connections. Each connection shows the archive file it comes from, the page or slide, and a
        link to the original government or news source where there is one.</p>
      <p class="small muted">Showing ${view.nodes.length} items and ${view.edges.length} lines. Use the boxes above to switch
        layers on or off. The lobbying layer comes straight from the Lobbying Registry tables.</p>
      <h3>Most connected in this view</h3>
      <ol class="small">${top.map(([id, n]) => `<li><a href="#" class="node-link" data-id="${esc(id)}">${esc(byId[id].label)}</a> <span class="muted">(${n})</span></li>`).join('')}</ol>`;
  }

  function select(id, push = true) {
    state.node = id;
    if (push) setParams({ case: state.case, node: id, layers: [...state.layers].join(',') });
    const n = byId[id];
    const di = view.nodes.findIndex((x) => x.id === id);
    c.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    if (di >= 0) c.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: di });
    const mine = g.edges.filter((e) => e.from === id || e.to === id);
    const groups = [
      ['Evidence', mine.filter((e) => edgeLayer(e) === 'evidence')],
      ['Lobbying records', mine.filter((e) => edgeLayer(e).startsWith('lobbying'))],
      ['Cases', mine.filter((e) => edgeLayer(e) === 'case')],
    ];
    const cases = [...nodeCases(n, idx)];
    const lobbied = mine.some((e) => edgeLayer(e).startsWith('lobbying'));
    const page = PAGES[id] || (n.type === 'lobby-client' ? [`#/lobbying?client=${encodeURIComponent(n.label)}`, 'See all lobbying records']
      : lobbied && (n.type === 'institution' || n.type === 'government') ? [`#/lobbying?inst=${encodeURIComponent((n.aliases || [])[0] || n.label)}`, 'Lobbying records naming this body'] : null);
    $('#m-side', root).innerHTML = `
      <p class="small" style="margin:0"><a href="#" id="m-clear">← Back to overview</a></p>
      <h2 style="margin-top:.4rem">${esc(n.label)}</h2>
      <p class="small"><span class="dot" style="background:${NODE_TYPES[n.type].color}"></span>${esc(NODE_TYPES[n.type].label)}</p>
      ${n.full && n.full !== n.label ? `<p>${esc(n.full)}</p>` : ''}
      ${n.summary ? `<p>${esc(n.summary)}</p>` : ''}
      ${cases.length ? `<p>${cases.map((cid) => `<a class="badge case" href="#/map?case=${encodeURIComponent(cid)}">${esc(idx.byId[cid].title)}</a>`).join('')}</p>` : ''}
      ${page ? `<p><a href="${page[0]}">${esc(page[1])} →</a></p>` : ''}
      ${groups.filter(([, es]) => es.length).map(([name, es]) => `<h3>${esc(name)} (${es.length})</h3>${es.map((e) => conn(e, id)).join('')}`).join('')}`;
  }

  function conn(e, id) {
    const out = e.from === id;
    const other = byId[out ? e.to : e.from];
    const compact = edgeLayer(e) === 'case';
    return `<div class="conn">
      <div>${out ? '→' : '←'} <a href="#" class="node-link who" data-id="${esc(other.id)}">${esc(other.label)}</a></div>
      ${compact ? '' : `<div>${esc(e.label)} <span class="badge">${esc(EDGE_KINDS[e.kind].label)}</span></div>${sourceHtml(e.src)}`}
    </div>`;
  }

  function find(label) {
    const q = label.trim().toLowerCase();
    if (!q) return;
    const n = g.nodes.find((x) => x.label.toLowerCase() === q) || g.nodes.find((x) => x.label.toLowerCase().includes(q));
    if (!n) return;
    if (!view.ids.has(n.id)) {
      state.case = ALL;
      $('#m-case', root).value = ALL;
      g.edges.filter((e) => e.from === n.id || e.to === n.id).forEach((e) => state.layers.add(edgeLayer(e)));
      $$layers().forEach((b) => { b.checked = state.layers.has(b.value); });
      state.node = n.id;
      draw();
    }
    select(n.id);
  }

  const $$layers = () => [...root.querySelectorAll('#m-layers input')];

  c.on('click', (p) => { if (p.dataType === 'node') select(p.data.id); });
  root.addEventListener('click', (ev) => {
    const a = ev.target.closest('a.node-link');
    if (a) { ev.preventDefault(); find(byId[a.dataset.id].label); }
    if (ev.target.id === 'm-clear') { ev.preventDefault(); state.node = ''; setParams({ case: state.case, layers: [...state.layers].join(',') }); c.dispatchAction({ type: 'downplay', seriesIndex: 0 }); side(); }
  });
  $('#m-case', root).addEventListener('change', (ev) => {
    state.case = ev.target.value;
    if (state.case === TABLES) { LOBBY_LAYERS.forEach((k) => state.layers.add(k)); $$layers().forEach((b) => { b.checked = state.layers.has(b.value); }); }
    setParams({ case: state.case, node: state.node, layers: [...state.layers].join(',') }); draw(); });
  $('#m-layers', root).addEventListener('change', () => { state.layers = new Set($$layers().filter((b) => b.checked).map((b) => b.value)); setParams({ case: state.case, node: state.node, layers: [...state.layers].join(',') }); draw(); });
  $('#m-find', root).addEventListener('change', (ev) => find(ev.target.value));
  $('#m-list', root).addEventListener('click', (ev) => {
    const on = ev.target.getAttribute('aria-pressed') !== 'true';
    ev.target.setAttribute('aria-pressed', String(on));
    ev.target.textContent = on ? 'Show as a map' : 'Show as a list';
    $('#m-chart', root).hidden = on;
    $('#m-table', root).hidden = !on;
    if (!on) c.resize();
  });

  draw();
}
