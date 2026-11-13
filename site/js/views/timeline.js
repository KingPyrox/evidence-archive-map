import { loadAll } from '../services/data.js';
import { esc, date, month } from '../helpers/format.js';
import { $, sourceHtml, options, setParams, ext } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';
import { caseIndex } from '../helpers/cases.js';
import { TIMELINE_LAYERS } from '../enums/kinds.js';

export const title = 'Timeline';

export async function render(root, params) {
  const [s, tl] = await loadAll('summary', 'timeline');
  const idx = caseIndex(s.cases);
  const casesOf = (e) => {
    if (e.case) return [e.case];
    if (e.dataset) return idx.ofDataset[e.dataset] || [];
    if (e.layer === 'video') return idx.ofVideo[(e.url || '').split('/').pop()] || [];
    return [];
  };
  const on = params.layers ? params.layers.split(',') : Object.keys(TIMELINE_LAYERS);
  const state = { case: params.case || '', layers: new Set(on), from: params.from || '' };

  root.innerHTML = `
    <h1>Timeline</h1>
    <p class="lead">Everything in the archive that has a date: events in the documents, lobbying records, the videos and the
      dates each case was published. Each entry links to its source.</p>
    <div class="controls">
      <label>Case <select id="t-case">${options([['', 'All cases'], ...s.cases.map((c) => [c.id, c.title])], state.case)}</select></label>
      <label>From <select id="t-from">${options([['', 'The beginning'], ['2026-01-01', '2026'], ['2026-07-01', 'July 2026'], ['2026-10-01', 'October 2026']], state.from)}</select></label>
    </div>
    <div class="controls" id="t-layers">${Object.entries(TIMELINE_LAYERS).map(([k, v]) => `<button class="chip" aria-pressed="${state.layers.has(k)}" data-layer="${k}"><span class="dot" style="background:${v.color}"></span>${esc(v.label)}</button>`).join('')}</div>
    <div class="panel"><div id="t-chart" class="chart" style="height:260px"></div></div>
    <div id="t-list"></div>`;

  const c = chart($('#t-chart', root), {});
  function draw() {
    setParams({ case: state.case, from: state.from, layers: state.layers.size === Object.keys(TIMELINE_LAYERS).length ? '' : [...state.layers].join(',') });
    const rows = tl.filter((e) => state.layers.has(e.layer) && (!state.case || casesOf(e).includes(state.case)) && (!state.from || e.date >= state.from));
    const months = [...new Set(rows.map((e) => e.date.slice(0, 7)))].sort();
    c.setOption({
      legend: { top: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 10, right: 20, top: 30, bottom: 10, containLabel: true },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', minInterval: 1 },
      series: Object.entries(TIMELINE_LAYERS).filter(([k]) => state.layers.has(k)).map(([k, v]) => ({
        name: v.label, type: 'bar', stack: 'all', itemStyle: { color: v.color },
        data: months.map((m) => rows.filter((e) => e.layer === k && e.date.startsWith(m)).length),
      })),
    }, true);
    c.off('click');
    c.on('click', (p) => document.getElementById(`m-${months[p.dataIndex]}`)?.scrollIntoView({ behavior: 'smooth' }));

    const byMonth = new Map();
    rows.forEach((e) => { const m = e.date.slice(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(e); });
    $('#t-list', root).innerHTML = rows.length ? [...byMonth.entries()].map(([m, es]) => `
      <section class="tl-month" id="m-${m}"><h3>${esc(month(m))}</h3>
        ${es.map((e) => `<div class="tl-item">
          <time datetime="${esc(e.date)}">${esc(date(e.date))}</time>
          <div>
            <div><span class="dot" style="background:${TIMELINE_LAYERS[e.layer].color}"></span><span class="title">${esc(e.title)}</span></div>
            ${e.text ? `<div>${esc(e.text)}</div>` : ''}
            ${e.src ? sourceHtml(e.src) : ''}
            ${e.url ? `<div class="src">${ext(e.url, 'Watch')}</div>` : ''}
            <div>${casesOf(e).map((cid) => `<a class="badge case" href="#/timeline?case=${encodeURIComponent(cid)}">${esc(idx.byId[cid].title)}</a>`).join('')}</div>
          </div></div>`).join('')}
      </section>`).join('') : '<p class="muted">No entries match these filters.</p>';
  }

  $('#t-case', root).addEventListener('change', (ev) => { state.case = ev.target.value; draw(); });
  $('#t-from', root).addEventListener('change', (ev) => { state.from = ev.target.value; draw(); });
  $('#t-layers', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-layer]');
    if (!b) return;
    const k = b.dataset.layer;
    if (state.layers.has(k)) state.layers.delete(k); else state.layers.add(k);
    b.setAttribute('aria-pressed', String(state.layers.has(k)));
    draw();
  });
  draw();
}
