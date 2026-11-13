import { loadAll } from '../services/data.js';
import { esc, int, fileName } from '../helpers/format.js';
import { $, table, ext, setParams, figure, inShort } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';

export const title = 'Who owns what';

const TYPE_COLORS = {
  'Group root': '#be123c',
  'Published link': '#1d4ed8',
  'Repeated link': '#60a5fa',
  'Not controlled': '#f79009',
  'Control / repeated': '#7c3aed',
  'Outside investor': '#047857',
};
const MAX_HITS = 40;
const COL_W = 370; // px per level of the diagram; names longer than NAME_MAX are shortened to fit
const NAME_MAX = 34;
const ROW_H = 17; // px per company row
const ROOT_W = 190; // room for "BROOKFIELD CORPORATION" left of the first dot
const TOP = 12;

export async function render(root, params) {
  const [o, s] = await loadAll('ownership', 'summary');
  const st = o.stats;
  const parent = new Map();
  const all = [];
  (function walk(n, p) { parent.set(n, p); all.push(n); n.children.forEach((c) => walk(c, n)); })(o.tree, null);
  const ids = new Map(all.map((n, i) => [n, i]));
  const pathOf = (n) => { const out = []; for (let x = n; x; x = parent.get(x)) out.unshift(x); return out; };
  const pct = (n) => (n.pct == null ? '' : ` (${n.pct}%)`);
  const below = (n) => (n.level === 1 ? 'Top of the group' : `${n.level - 1} level${n.level === 2 ? '' : 's'} below Brookfield`);
  const size = new Map();
  const sizeOf = (n) => { if (!size.has(n)) size.set(n, n.children.reduce((a, c) => a + 1 + sizeOf(c), 0)); return size.get(n); };
  const kids = (n) => [...n.children].sort((a, b) => sizeOf(b) - sizeOf(a) || a.name.localeCompare(b.name));
  const brkCase = s.cases.find((c) => c.id === 'case:brookfield');
  const levels = Object.keys(st.by_level).map(Number).sort((a, b) => a - b);
  const deepest = levels[levels.length - 1] - 1;
  const widest = levels.reduce((a, l) => (st.by_level[l] > st.by_level[a] ? l : a), levels[0]);
  const biggest = kids(o.tree)[0];
  const state = { q: params.q || '', view: params.view === 'list' ? 'list' : 'diagram', open: [o.tree], target: null };
  const src = ext(o.url, fileName(o.file));
  const save = () => setParams({ q: state.q, view: state.view === 'list' ? 'list' : '' });

  root.innerHTML = `
    <h1>Who owns what: Brookfield Corporation</h1>
    <p class="lead">The “Who Runs Canada” case has a 43-page table of Brookfield Corporation's published ownership structure
      (reference year 2025). It lists every company in the group and the share its parent company holds.</p>
    ${inShort([
      `<b>${int(st.distinct_entities)} companies</b> sit under Brookfield Corporation, joined by ${int(st.links)} ownership links.`,
      `Brookfield holds <b>${int(st.direct_children)}</b> of them directly. The rest are held through those, up to <b>${deepest} levels</b> down.`,
      `The biggest branch is <b>${esc(biggest.name)}</b>, with ${int(sizeOf(biggest))} companies below it.`,
    ])}
    <div class="controls">
      <label>Find a company <input id="o-q" type="search" value="${esc(state.q)}" placeholder="e.g. Enercare, Brookfield Renewable"></label>
      <div class="seg" role="group" aria-label="Show the ownership tree as">
        <button type="button" data-view="diagram" aria-pressed="${state.view === 'diagram'}">Diagram</button>
        <button type="button" data-view="list" aria-pressed="${state.view === 'list'}">List</button>
      </div>
      <button type="button" class="btn small secondary" id="o-reset">Close all branches</button>
    </div>
    <div id="o-results"></div>
    <figure class="panel fig">
      <h3 class="fig-title">Brookfield Corporation holds ${int(st.direct_children)} companies directly. Click any company with a filled dot to see what it owns.</h3>
      <p class="fig-how">Each line joins a company to a company it holds, with the share it holds. A <b>filled dot</b> owns more
        companies: click it to open that branch, and click it again to close it. A <b>hollow dot</b> owns nothing further.
        “120 below” counts every company further down that branch, at every level. The biggest branches are listed first. The colour is the
        link type as labelled in the source table.</p>
      <div class="legend-list">${Object.entries(TYPE_COLORS).filter(([k]) => k === 'Group root' || st.by_type[k]).map(([k, c]) => `<span><span class="dot" style="background:${c}"></span>${esc(k)}${st.by_type[k] ? ` (${int(st.by_type[k])})` : ''}</span>`).join('')}</div>
      <div id="o-scroll" class="o-scroll"><div id="o-tree" role="img" aria-label="Ownership diagram. The List button shows the same tree as a list you can use with the keyboard."></div></div>
      <div id="o-list" class="o-tree" hidden></div>
      <p class="fig-src">Source: ${src}</p>
    </figure>
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

  // ---- Diagram: one branch open per level, so the lines always lead from Brookfield to what the reader opened.
  const box = $('#o-scroll', root);
  const el = $('#o-tree', root);
  const tree = chart(el, {});
  const short = (t) => (t.length > NAME_MAX ? `${t.slice(0, NAME_MAX - 1)}…` : t);
  const isOpen = (n) => state.open.includes(n);
  const rows = (n) => (isOpen(n) && n.children.length ? n.children.reduce((a, c) => a + rows(c), 0) : 1);

  function toData(n) {
    const open = isOpen(n);
    const hit = n === state.target;
    const color = TYPE_COLORS[n.link] || '#667085';
    const more = n.children.length && !open ? `  · ${int(sizeOf(n))} below` : '';
    return {
      name: n === o.tree ? n.name : `${short(n.name)}${n.pct == null ? '' : ` ${n.pct}%`}${more}`,
      i: ids.get(n),
      // filled dot: owns more companies; hollow dot: owns nothing further
      symbol: n.children.length ? 'circle' : 'emptyCircle',
      symbolSize: n.children.length ? 10 : 7,
      itemStyle: { color, borderColor: hit ? '#b42318' : color, borderWidth: hit ? 3 : 1.5 },
      lineStyle: open || hit ? { color: '#1d4ed8', width: 2 } : undefined,
      label: {
        position: n === o.tree ? 'left' : 'right',
        fontWeight: open || hit ? 'bold' : 'normal',
        color: hit ? '#b42318' : '#1c1f24',
        // lines from an open company run past the names beside it, so names sit on a white backing
        backgroundColor: n === o.tree ? 'transparent' : open ? '#fff' : 'rgba(255,255,255,0.88)',
        padding: [1, 3],
      },
      children: open ? kids(n).map(toData) : [],
    };
  }

  function tip(p) {
    const n = all[p.data?.i];
    if (!n) return '';
    const up = parent.get(n);
    return `<b>${esc(n.name)}</b><br>${up && n.pct != null ? `${n.pct}% held by ${esc(up.name)}<br>` : ''}${esc(below(n))} · ${esc(n.link || '')} · page ${n.page}${n.children.length
      ? `<br>Owns ${int(n.children.length)} directly, ${int(sizeOf(n))} in total. Click to ${isOpen(n) ? 'close' : 'open'} this branch.` : ''}`;
  }

  function draw() {
    el.style.width = `${Math.max(box.clientWidth, ROOT_W + (state.open.length + 1) * COL_W)}px`;
    el.style.height = `${Math.max(320, rows(o.tree) * ROW_H + 30)}px`;
    tree.resize();
    tree.setOption({
      tooltip: { trigger: 'item', confine: true, formatter: tip },
      series: [{
        type: 'tree', orient: 'LR', data: [toData(o.tree)],
        left: ROOT_W, right: COL_W - 20, top: TOP, bottom: TOP,
        expandAndCollapse: false, roam: false, animationDurationUpdate: 250,
        lineStyle: { color: '#c4c9d2', width: 1, curveness: 0.5 },
        label: { fontSize: 11, verticalAlign: 'middle' },
      }],
    }, true);
  }

  // Where a company's dot is now, in pixels inside the chart. The layout is measured from the series' top-left corner.
  function spot(n) {
    const data = tree.getModel().getSeriesByIndex(0).getData();
    for (let i = 0; i < data.count(); i++) {
      if (data.getItemModel(i).option?.i === ids.get(n)) {
        const l = data.getItemLayout(i);
        return l && { x: l.x + ROOT_W, y: l.y + TOP };
      }
    }
    return null;
  }

  // Slide sideways only as far as needed to show the company and the column of what it owns.
  const reveal = (at) => { box.scrollLeft = Math.max(0, at.x + 2 * COL_W - box.clientWidth); };

  // Keep the clicked company under the pointer after the tree lays itself out again.
  function redrawAround(n) {
    const before = spot(n);
    draw();
    const after = spot(n);
    if (before && after) window.scrollBy(0, after.y - before.y);
    if (after) reveal(after);
  }

  function showInDiagram(n) {
    state.target = n;
    state.open = n.children.length ? pathOf(n) : pathOf(n).slice(0, -1);
    draw();
    const at = spot(n);
    if (!at) return;
    reveal(at);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + at.y - window.innerHeight / 2, behavior: 'smooth' });
  }

  tree.on('click', (p) => {
    const n = all[p.data?.i];
    if (!n || !n.children.length) return;
    const at = state.open.indexOf(n);
    state.open = at >= 0 ? state.open.slice(0, Math.max(1, at)) : pathOf(n);
    redrawAround(n);
  });

  // ---- List: the same tree as native <details>, which opens with the keyboard and is read out by screen readers.
  const row = (n) => `<span id="o-${ids.get(n)}"><span class="dot" style="background:${TYPE_COLORS[n.link] || '#667085'}" title="${esc(n.link || '')}"></span>${esc(n.name)}${n.pct == null ? '' : ` <span class="o-pct">${n.pct}%</span>`} <span class="muted small">p. ${n.page}${n.children.length ? ` · owns ${n.children.length}` : ''}</span></span>`;
  const item = (n) => (n.children.length
    ? `<li><details data-i="${ids.get(n)}"><summary>${row(n)}</summary><ul>${kids(n).map(item).join('')}</ul></details></li>`
    : `<li class="leaf">${row(n)}</li>`);
  let listBuilt = false;
  function buildList() {
    if (listBuilt) return;
    $('#o-list', root).innerHTML = `<ul>${item(o.tree)}</ul>`;
    root.querySelector('#o-list details').open = true;
    listBuilt = true;
  }
  function showInList(n) {
    buildList();
    root.querySelectorAll('#o-list .hit').forEach((x) => x.classList.remove('hit'));
    pathOf(n).forEach((x) => { const d = root.querySelector(`#o-list details[data-i="${ids.get(x)}"]`); if (d && x !== n) d.open = true; });
    const at = $(`#o-${ids.get(n)}`, root);
    at.classList.add('hit');
    at.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setView(v) {
    state.view = v;
    root.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    box.hidden = v !== 'diagram';
    $('#o-list', root).hidden = v !== 'list';
    if (v === 'list') buildList(); else draw();
    save();
  }

  function search() {
    save();
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
      const n = hits[Number(a.dataset.hit)];
      if (state.view === 'list') showInList(n); else showInDiagram(n);
    };
  }

  chart($('#o-levels', root), {
    grid: { left: 10, right: 20, top: 24, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', formatter: (ps) => `${ps[0].name} level${ps[0].name === '1' ? '' : 's'} below Brookfield: <b>${int(ps[0].value)}</b> companies` },
    xAxis: { type: 'category', name: 'levels below Brookfield', nameLocation: 'middle', nameGap: 26, data: levels.map((l) => l - 1) },
    yAxis: { type: 'value', name: 'companies' },
    series: [{ type: 'bar', data: levels.map((l) => st.by_level[l]), itemStyle: { color: '#1d4ed8' }, label: { show: true, position: 'top' } }],
  });

  root.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#o-q', root).addEventListener('input', (ev) => { state.q = ev.target.value; search(); });
  $('#o-reset', root).addEventListener('click', () => {
    state.open = [o.tree];
    state.target = null;
    draw();
    root.querySelectorAll('#o-list details').forEach((d, i) => { d.open = i === 0; });
    root.querySelectorAll('#o-list .hit').forEach((x) => x.classList.remove('hit'));
  });
  setView(state.view);
  search();
}
