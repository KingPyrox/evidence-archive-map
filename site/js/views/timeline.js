import { loadAll } from '../services/data.js';
import { esc, date, month, monthRange, monthTick } from '../helpers/format.js';
import { $, sourceHtml, options, setParams, ext, figure, caption, changeBox, more, showAll } from '../helpers/dom.js';
import { chart, DECALS } from '../helpers/chart.js';
import { caseIndex } from '../helpers/cases.js';
import { TIMELINE_LAYERS } from '../enums/kinds.js';

export const title = 'Timeline';

const SHOW = 20; // entries listed before "Show all"

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
  const years = [...new Set(tl.map((e) => e.date.slice(0, 4)))].sort();

  root.innerHTML = `
    <h1>Timeline</h1>
    <p class="lead">Everything in the archive that has a date: events in the files, lobbying records, the videos, and the day
      each case came out. Each entry links to where it came from.</p>
    ${figure('t-chart', {
      how: 'Each bar is one month. Every month has a slot, so empty stretches are months with nothing dated. Colours and patterns show the kind of entry. Click a bar to jump to that month in the list below.',
      src: 'the dated files, tables and video list in the Evidence-Archive.', cls: 'short',
    })}
    ${changeBox(`
      <label>Case <select id="t-case">${options([['', 'All cases'], ...s.cases.map((c) => [c.id, c.title])], state.case)}</select></label>
      <label>From <select id="t-from">${options([['', 'The beginning'], ...years.map((y) => [`${y}-01-01`, y])], state.from)}</select></label>
      <span class="controls" id="t-layers">${Object.entries(TIMELINE_LAYERS).map(([k, v]) => `<button class="chip" aria-pressed="${state.layers.has(k)}" data-layer="${k}"><span class="dot" style="background:${v.color}"></span>${esc(v.label)}</button>`).join('')}</span>`)}
    <div id="t-list"></div>`;

  const c = chart($('#t-chart', root), {});
  function draw() {
    setParams({ case: state.case, from: state.from, layers: state.layers.size === Object.keys(TIMELINE_LAYERS).length ? '' : [...state.layers].join(',') });
    const rows = tl.filter((e) => state.layers.has(e.layer) && (!state.case || casesOf(e).includes(state.case)) && (!state.from || e.date >= state.from));
    const dated = rows.map((e) => e.date).sort();
    const months = dated.length ? monthRange(dated[0].slice(0, 7), dated[dated.length - 1].slice(0, 7)) : [];
    const perYear = new Map();
    dated.forEach((d) => perYear.set(d.slice(0, 4), (perYear.get(d.slice(0, 4)) || 0) + 1));
    const [busy, busyN] = [...perYear.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    caption(root, 't-chart', !rows.length ? 'No entries match these filters.'
      : perYear.size > 1 && busyN / rows.length >= 0.75
        ? `Most dated entries are from ${busy}: ${busyN} of ${rows.length}. The earliest is from ${esc(month(dated[0].slice(0, 7)))}.`
        : `${rows.length} dated entries, from ${esc(month(dated[0].slice(0, 7)))} to ${esc(month(dated[dated.length - 1].slice(0, 7)))}.`);
    c.setOption({
      ...DECALS,
      legend: { top: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `<b>${esc(month(months[ps[0].dataIndex]))}</b><br>${ps.filter((p) => p.value).map((p) => `${p.marker}${esc(p.seriesName)}: ${p.value}`).join('<br>') || 'Nothing dated'}` },
      grid: { left: 10, right: 20, top: 30, bottom: 10, containLabel: true },
      xAxis: { type: 'category', data: months, axisLabel: { interval: 0, formatter: monthTick(months.length) }, axisTick: { alignWithLabel: true } },
      yAxis: { type: 'value', minInterval: 1, name: 'entries' },
      series: Object.entries(TIMELINE_LAYERS).filter(([k]) => state.layers.has(k)).map(([k, v]) => ({
        name: v.label, type: 'bar', stack: 'all', itemStyle: { color: v.color }, barMinHeight: 0,
        data: months.map((m) => rows.filter((e) => e.layer === k && e.date.startsWith(m)).length),
      })),
    }, true);
    c.off('click');
    c.on('click', (p) => {
      $('#t-list [data-show-all]', root)?.click(); // the month may be past the first entries
      document.getElementById(`m-${months[p.dataIndex]}`)?.scrollIntoView({ behavior: 'smooth' });
    });

    const byMonth = new Map();
    rows.forEach((e) => { const m = e.date.slice(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(e); });
    let before = 0; // entries in the months above, so whole months past the first SHOW entries start hidden
    $('#t-list', root).innerHTML = rows.length ? `<div>${[...byMonth.entries()].map(([m, es]) => `
      <section class="tl-month" id="m-${m}"${more((before += es.length) - es.length, SHOW)}><h3>${esc(month(m))}</h3>
        ${es.map((e) => `<div class="tl-item">
          <time datetime="${esc(e.date)}">${esc(date(e.date))}</time>
          <div>
            <div><span class="dot" style="background:${TIMELINE_LAYERS[e.layer].color}"></span><span class="title">${esc(e.title)}</span></div>
            ${e.text ? `<div>${esc(e.text)}</div>` : ''}
            ${e.src ? sourceHtml(e.src) : ''}
            ${e.url ? `<div class="src">${ext(e.url, 'Watch')}</div>` : ''}
            <div>${casesOf(e).map((cid) => `<a class="badge case" href="#/timeline?case=${encodeURIComponent(cid)}">${esc(idx.byId[cid].title)}</a>`).join('')}</div>
          </div></div>`).join('')}
      </section>`).join('')}</div>${showAll(rows.length, before > SHOW ? SHOW : 0, 'entries')}` : '<p class="muted">No entries match these filters.</p>';
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
