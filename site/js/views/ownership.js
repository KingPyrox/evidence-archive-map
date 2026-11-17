import { loadAll } from '../services/data.js';
import { esc, int, fileName, nameCase } from '../helpers/format.js';
import { $, table, ext, setParams, figure, term } from '../helpers/dom.js';
import { chart, BAR, BAR_SOFT } from '../helpers/chart.js';

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
const ROOT_W = 190; // room for "Brookfield Corporation" left of the first dot
const TOP = 12;
// Groups view: a block is one line tall plus extra height for each company in its group, so taller means more companies.
const BIG_H = 200; // the biggest block on screen gets this much extra height
const UNIT_MAX = 12; // px per company at most, so small branches don't balloon
const MIN_H = 22; // every block is at least one line of text tall
const IN_GAP = 4; // between siblings
const GROUP_GAP = 14; // between one owner's group and the next
const BUCKET_MIN = 4; // this many companies that own nothing are gathered into one grey block

export async function render(root, params) {
  const [o, s] = await loadAll('ownership', 'summary');
  const st = o.stats;
  const parent = new Map();
  const all = [];
  // The source table prints names in capitals; show them in normal case, which is quicker to read.
  (function walk(n, p) { n.name = nameCase(n.name); parent.set(n, p); all.push(n); n.children.forEach((c) => walk(c, n)); })(o.tree, null);
  o.outside_investors.forEach((n) => { n.name = nameCase(n.name); });
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
  const VIEWS = ['groups', 'drill', 'list'];
  const state = { q: params.q || '', view: VIEWS.includes(params.view) ? params.view : params.view === 'diagram' ? 'drill' : 'groups', open: [o.tree], target: null, focus: o.tree, pick: null };
  const src = ext(o.url, fileName(o.file));
  const save = () => setParams({ q: state.q, view: state.view === 'groups' ? '' : state.view });

  root.innerHTML = `
    <h1>Who owns what: Brookfield Corporation</h1>
    <p class="lead">Brookfield is a big company. It owns other companies, and they own more. A 43-page table in the archive
      lists them all. It has ${int(st.distinct_entities)} company names and ${int(st.links)} ${term('subsidiary', 'ownership links')}, up to
      ${deepest} levels down. Brookfield owns ${int(st.direct_children)} of them itself.</p>
    <div class="controls">
      <label>Find a company <input id="o-q" type="search" value="${esc(state.q)}" placeholder="e.g. Enercare, Brookfield Renewable"></label>
      <div class="seg" role="group" aria-label="Show the ownership tree as">
        <button type="button" data-view="groups">Groups</button>
        <button type="button" data-view="drill">Drill down</button>
        <button type="button" data-view="list">List</button>
      </div>
      <button type="button" class="btn small secondary" id="o-reset">Back to the top</button>
    </div>
    <div id="o-results"></div>
    <figure class="panel fig" id="o-fig">
      <h3 class="fig-title" id="o-title"></h3>
      <p class="fig-how" id="o-how"></p>
      <div class="legend-list">${Object.entries(TYPE_COLORS).filter(([k]) => k === 'Group root' || st.by_type[k]).map(([k, c]) => `<span><span class="dot" style="background:${c}"></span>${esc(k)}${st.by_type[k] ? ` (${int(st.by_type[k])})` : ''}</span>`).join('')}</div>
      <div id="o-groups-box">
        <p class="og-trail" id="o-trail"></p>
        <div id="o-gscroll" class="o-scroll og-scroll"><div class="og-cols" id="o-cols"></div><div class="og" id="o-groups"></div></div>
        <div id="o-pick" aria-live="polite"></div>
      </div>
      <div id="o-scroll" class="o-scroll"><div id="o-tree" role="img" aria-label="Ownership diagram. The List button shows the same tree as a list you can use with the keyboard."></div></div>
      <div id="o-list" class="o-tree" hidden></div>
      <p class="fig-src">Source: ${src}</p>
    </figure>
    <div class="stats quiet">
      <div class="stat"><b>${int(st.links)}</b><span>ownership links under Brookfield</span></div>
      <div class="stat"><b>${int(st.distinct_entities)}</b><span>different company names</span></div>
      <div class="stat"><b>${int(st.direct_children)}</b><span>companies Brookfield owns directly</span></div>
      <div class="stat"><b>${deepest}</b><span>levels down, at the deepest</span></div>
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
        <p class="small">The same table appears twice in the archive: ${ext(o.url, o.file)} and in the
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

  // ---- Groups: a parent, its children and its grandchildren at once. Each block's height is the number of companies in
  // its group (itself plus everything below it), with a floor so every name stays readable.
  const gbox = $('#o-gscroll', root);
  const gel = $('#o-groups', root);
  let cur = [];
  const gsize = (x) => (x.bucket ? x.items.length : 1 + sizeOf(x));
  const colorOf = (x) => (x.bucket ? '#98a2b3' : x === o.tree ? TYPE_COLORS['Group root'] : TYPE_COLORS[x.link] || '#667085');

  // What a company owns, biggest first. Companies that own nothing are gathered into one grey block when there are many.
  function shown(n) {
    const ks = kids(n);
    const own = ks.filter((c) => c.children.length || c === state.target);
    const rest = ks.filter((c) => !own.includes(c));
    return rest.length >= BUCKET_MIN ? [...own, { bucket: true, items: rest, parent: n }] : [...own, ...rest];
  }

  function block(b, i, X, W) {
    const x = b.x;
    let name;
    let meta;
    let cls = 'og-b';
    if (x.bucket) {
      name = `${int(x.items.length)} companies that own no others`;
      meta = 'click to list them';
      cls += ' bucket';
    } else {
      name = x.name;
      const share = x.pct == null ? '' : `${x.pct}% · `;
      if (b.focus) meta = `owns ${int(sizeOf(x))} below${x === o.tree ? '' : ' · click to go back up'}`;
      else meta = `${share}${x.children.length ? `${int(sizeOf(x))} below ›` : 'owns no others'}`;
      if (b.focus) cls += ' focus';
      if (x === state.target) cls += ' hit';
    }
    if (b.h < 38 && !b.focus) cls += ' short';
    if (state.pick === x) cls += ' picked';
    return `<button type="button" class="${cls}" data-b="${i}" style="left:${X[b.col]}px;top:${b.top}px;width:${W[b.col]}px;height:${b.h}px;--c:${colorOf(x)}" title="${esc(`${name}\n${meta}`)}"><span class="n">${esc(name)}</span><span class="m">${esc(meta)}</span></button>`;
  }

  const band = ({ from: [x0, a0, a1], to: [x1, b0, b1], x }) => {
    const m = (x0 + x1) / 2;
    return `<path d="M${x0} ${a0}C${m} ${a0} ${m} ${b0} ${x1} ${b0}L${x1} ${b1}C${m} ${b1} ${m} ${a1} ${x0} ${a1}Z" fill="${colorOf(x)}" fill-opacity=".2"/>`;
  };

  function groupsTitle(f) {
    const top = kids(f)[0];
    const big = f.children.length > 1 && sizeOf(top) ? ` The biggest group is ${top.name}, with ${int(sizeOf(top))} companies below it.` : '';
    return `${f === o.tree ? 'Brookfield Corporation' : f.name} owns ${int(f.children.length)} compan${f.children.length === 1 ? 'y' : 'ies'} directly and ${int(sizeOf(f))} in total.${big}`;
  }

  function drawGroups() {
    const f = state.focus;
    // fill the panel: a narrow parent column, then two equal columns for children and grandchildren
    const avail = gbox.clientWidth - 24;
    const narrow = avail < 760;
    const GAP = narrow ? 40 : 80;
    const W0 = narrow ? 120 : 180;
    const W1 = Math.max(220, Math.floor((avail - W0 - 2 * GAP) / 2));
    const W = [W0, W1, W1];
    const X = [0, W[0] + GAP, W[0] + W[1] + 2 * GAP];
    const firstCols = shown(f).flatMap((p) => [p, ...(!p.bucket && p.children.length ? shown(p) : [])]);
    const k = Math.min(UNIT_MAX, BIG_H / Math.max(1, ...firstCols.map((x) => gsize(x) - 1)));
    const h = (x) => MIN_H + k * (gsize(x) - 1);
    const blocks = [];
    const bands = [];
    const firsts = [];
    let y = 0;
    for (const p of shown(f)) {
      const under = !p.bucket && p.children.length ? shown(p) : [];
      if (!under.length) {
        const pb = { x: p, col: 1, top: y, h: h(p) };
        blocks.push(pb); firsts.push(pb);
        y += pb.h + GROUP_GAP;
        continue;
      }
      const hs = under.map(h);
      const sum = hs.reduce((a, v) => a + v, 0);
      const span = sum + IN_GAP * (hs.length - 1);
      const ph = Math.min(span, h(p));
      const pb = { x: p, col: 1, top: y + (span - ph) / 2, h: ph };
      blocks.push(pb); firsts.push(pb);
      let cy = y;
      let sy = pb.top;
      under.forEach((c, i) => {
        const sh = (ph * hs[i]) / sum;
        blocks.push({ x: c, col: 2, top: cy, h: hs[i] });
        bands.push({ from: [X[1] + W[1], sy, sy + sh], to: [X[2], cy, cy + hs[i]], x: c });
        sy += sh;
        cy += hs[i] + IN_GAP;
      });
      y += span + GROUP_GAP;
    }
    const total = Math.max(MIN_H, y - GROUP_GAP);
    // the parent runs the full height, so its name sits at the top beside its first child
    const rh = total;
    const rb = { x: f, col: 0, top: 0, h: rh, focus: true };
    const fsum = firsts.reduce((a, b) => a + b.h, 0);
    let sy = rb.top;
    firsts.forEach((b) => {
      const sh = (rh * b.h) / fsum;
      bands.push({ from: [W[0], sy, sy + sh], to: [X[1], b.top, b.top + b.h], x: b.x });
      sy += sh;
    });
    blocks.push(rb);
    cur = blocks;
    const width = X[2] + W[2];
    const deep = blocks.some((b) => b.col === 2);
    $('#o-cols', root).style.width = `${width}px`;
    $('#o-cols', root).innerHTML = ['Parent', 'Children: owned directly', 'Grandchildren: owned by the children']
      .slice(0, deep ? 3 : 2).map((txt, i) => `<span style="left:${X[i]}px;width:${W[i]}px">${txt}</span>`).join('');
    gel.style.width = `${width}px`;
    gel.style.height = `${total}px`;
    gel.innerHTML = `<svg width="${width}" height="${total}" aria-hidden="true">${bands.map(band).join('')}</svg>${blocks.map((b, i) => block(b, i, X, W)).join('')}`;
    $('#o-title', root).textContent = groupsTitle(f);
    const path = pathOf(f);
    $('#o-trail', root).innerHTML = path.length > 1
      ? `Showing: ${path.map((n, i) => (i === path.length - 1 ? `<b>${esc(n.name)}</b>` : `<a href="#" data-up="${i}">${esc(n.name)}</a>`)).join(' › ')}`
      : '';
  }

  function zoom(n) {
    state.focus = n;
    state.pick = null;
    $('#o-pick', root).innerHTML = '';
    drawGroups();
    gbox.scrollLeft = 0;
    const fig = $('#o-fig', root);
    if (fig.getBoundingClientRect().top < 0) fig.scrollIntoView({ behavior: 'smooth', block: 'start' });
    gel.querySelector('.og-b.focus')?.focus({ preventScroll: true });
  }

  function pick(x) {
    state.pick = x;
    drawGroups();
    const out = $('#o-pick', root);
    if (x.bucket) {
      out.innerHTML = `<div class="og-pick"><h4>${int(x.items.length)} companies owned by ${esc(x.parent.name)} that own no other companies</h4>
        ${table([{ label: 'Company', value: (n) => n.name }, { label: 'Share held', num: true, value: (n) => (n.pct == null ? '' : `${n.pct}%`) }, { label: 'Page', num: true, value: (n) => n.page }], x.items)}</div>`;
    } else {
      const up = parent.get(x);
      out.innerHTML = `<div class="og-pick"><h4>${esc(x.name)}</h4>
        <p>${x.pct == null ? '' : `${x.pct}% held by ${esc(up.name)}. `}Owns no other companies. ${esc(below(x))} · ${esc(x.link || '')} · page ${x.page} of the source table.</p></div>`;
    }
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showInGroups(n) {
    state.target = n;
    const path = pathOf(n);
    state.focus = path.length > 2 ? path[path.length - 3] : o.tree;
    state.pick = null;
    $('#o-pick', root).innerHTML = '';
    drawGroups();
    gel.querySelector('.og-b.hit')?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  gel.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.og-b');
    if (!btn) return;
    const b = cur[Number(btn.dataset.b)];
    if (b.focus) { if (b.x !== o.tree) zoom(parent.get(b.x)); return; }
    if (!b.x.bucket && b.x.children.length) zoom(b.x);
    else pick(b.x);
  });
  $('#o-trail', root).addEventListener('click', (ev) => {
    const a = ev.target.closest('a[data-up]');
    if (!a) return;
    ev.preventDefault();
    zoom(pathOf(state.focus)[Number(a.dataset.up)]);
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

  const HOW = {
    groups: `Read left to right: the parent company, the companies it owns directly (its <b>children</b>), and the companies those
      own (its <b>grandchildren</b>). A ribbon joins each owner to what it owns. A taller block has more companies in its group.
      <b>Click a company</b> to make it the parent and see the two levels below it. Click the parent block on the left, or a name
      after “Showing”, to go back up. A <b>grey block</b> gathers companies that own no others: click it to list them. The colour is
      the link type as labelled in the source table.`,
    drill: `Each line joins a company to a company it holds, with the share it holds. A <b>filled dot</b> owns more
      companies: click it to open that branch, and click it again to close it. A <b>hollow dot</b> owns nothing further.
      “120 below” counts every company further down that branch, at every level. The biggest branches are listed first. The colour is the
      link type as labelled in the source table.`,
    list: 'The same tree as a list. Click a company to open what it owns. This view works with the keyboard and screen readers.',
  };
  const TITLE = {
    drill: `Brookfield Corporation holds ${int(st.direct_children)} companies directly. Click any company with a filled dot to see what it owns.`,
    list: `Every company in the group, under the company that owns it (${int(st.links)} links).`,
  };

  function setView(v) {
    state.view = v;
    root.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    $('#o-groups-box', root).hidden = v !== 'groups';
    box.hidden = v !== 'drill';
    $('#o-list', root).hidden = v !== 'list';
    $('#o-how', root).innerHTML = HOW[v];
    if (v !== 'groups') $('#o-title', root).textContent = TITLE[v];
    if (v === 'list') buildList(); else if (v === 'drill') draw(); else drawGroups();
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
      if (state.view === 'list') showInList(n); else if (state.view === 'drill') showInDiagram(n); else showInGroups(n);
    };
  }

  chart($('#o-levels', root), {
    grid: { left: 10, right: 20, top: 28, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', formatter: (ps) => `${ps[0].name} level${ps[0].name === '1' ? '' : 's'} below Brookfield: <b>${int(ps[0].value)}</b> companies` },
    xAxis: { type: 'category', name: 'levels below Brookfield', nameLocation: 'middle', nameGap: 26, data: levels.map((l) => l - 1) },
    yAxis: { type: 'value' },
    // the level the title names is dark and says so
    series: [{
      type: 'bar',
      data: levels.map((l) => (l === widest ? { value: st.by_level[l], itemStyle: { color: BAR }, label: { fontWeight: 'bold', formatter: `${int(st.by_level[l])}, the most` } } : { value: st.by_level[l], itemStyle: { color: BAR_SOFT } })),
      label: { show: true, position: 'top', formatter: (p) => int(p.value) },
    }],
  });

  root.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#o-q', root).addEventListener('input', (ev) => { state.q = ev.target.value; search(); });
  $('#o-reset', root).addEventListener('click', () => {
    state.open = [o.tree];
    state.target = null;
    state.focus = o.tree;
    state.pick = null;
    $('#o-pick', root).innerHTML = '';
    if (state.view === 'drill') draw(); else if (state.view === 'groups') drawGroups();
    root.querySelectorAll('#o-list details').forEach((d, i) => { d.open = i === 0; });
    root.querySelectorAll('#o-list .hit').forEach((x) => x.classList.remove('hit'));
  });
  setView(state.view);
  search();
}
