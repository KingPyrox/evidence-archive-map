import { loadAll } from '../services/data.js';
import { esc, int, money, date, month, countWord, listWords, fileName, monthRange, monthTick } from '../helpers/format.js';
import { $, options, table, setParams, ext, figure, caption, term, changeBox } from '../helpers/dom.js';
import { chart, DECALS } from '../helpers/chart.js';
import { DATASET_COLORS, DATASET_PALETTE } from '../enums/kinds.js';

export const title = 'Lobbying';

// Filled from the data, so a lobbying table added to the archive gets a name and colour on the next build.
const NAMES = {};
const COLORS = {};

// Axis label for an institution: its name when short, else the registry's own abbreviation, e.g. "(ISED)".
// The tooltip always shows the full name.
function instLabel(s) {
  const name = s.replace(/\s*\([^)]*\)$/, '');
  const code = (s.match(/\(([A-Za-z]+)\)$/) || [])[1];
  return name.length <= 32 ? name : code || `${name.slice(0, 31)}…`;
}

const stackTip = (cats) => (ps) => `<b>${esc(cats[ps[0].dataIndex])}</b><br>${ps.filter((p) => p.value).map((p) => `${p.marker}${esc(p.seriesName)}: ${p.value}`).join('<br>')}`;

export async function render(root, params) {
  const [lob] = await loadAll('lobbying');
  let extra = 0;
  lob.datasets.forEach((d) => {
    NAMES[d.id] = d.name || d.id.replace('dataset:lobby-', '');
    COLORS[d.id] = DATASET_COLORS[d.id] || DATASET_PALETTE[extra++ % DATASET_PALETTE.length];
  });
  const recs = lob.records;
  const clients = [...new Set(recs.map((r) => r.client))].sort((a, b) => a.localeCompare(b));
  const insts = [...new Set(recs.flatMap((r) => r.institutions))].sort((a, b) => a.localeCompare(b));
  const state = { ds: params.ds || '', client: params.client || '', inst: params.inst || '', q: params.q || '' };
  if (state.inst && !insts.includes(state.inst)) {
    const near = insts.find((i) => i.toLowerCase().startsWith(state.inst.toLowerCase()));
    state.inst = near || '';
  }
  const src = lob.datasets.map((d) => ext(d.url, fileName(d.file))).join(' · ');
  const multi = lob.datasets.length > 1;

  root.innerHTML = `
    <h1>Lobbying: who talked to the government</h1>
    <p class="lead">${term('lobbying', 'Lobbying')} means being paid to talk to government officials to try to change what
      they decide. The archive has ${countWord(lob.datasets.length, 'list').toLowerCase()} of lobbying records, with ${int(recs.length)} records
      in all. Each record says who lobbied, which part of the government they talked to, and what about.</p>
    <p class="small muted">A record shows that a meeting or contact happened. It does not show what was decided.</p>
    <div class="grid cols-2">
      ${figure('l-inst-chart', {
        how: `Each bar counts the records that name that part of the government. One record can name several.${multi ? ' Colours and patterns show which list a record comes from.' : ''} Click a bar to show only its records.`,
        src, cls: 'tall',
      })}
      <div>
        ${figure('l-month', { how: 'Each bar is one month. Every month has a slot, so gaps are months with no records.', src, cls: 'short' })}
        ${figure('l-clients', { how: 'Each bar is one company or group that paid for lobbying. Click a bar to show only that one.', src, cls: 'short' })}
      </div>
    </div>
    ${changeBox(`
      <label>List <select id="l-ds">${options([['', multi ? `All ${countWord(lob.datasets.length).toLowerCase()} lists` : 'The list'], ...lob.datasets.map((d) => [d.id, NAMES[d.id]])], state.ds)}</select></label>
      <label>Paid for by <select id="l-client">${options([['', 'Anyone'], ...clients.map((c) => [c, c])], state.client)}</select></label>
      <label>Talked to <select id="l-inst">${options([['', 'Any part of the government'], ...insts.map((c) => [c, c])], state.inst)}</select></label>
      <label>Search <input id="l-q" type="search" value="${esc(state.q)}" placeholder="Words in the subject, lobbyist, firm…"></label>`)}
    <h2 id="l-count"></h2>
    <div id="l-table"></div>

    <h2>Where these records come from</h2>
    <p>Vesper searched the federal ${term('registry')} and saved the results as ${countWord(lob.datasets.length, 'list').toLowerCase()}.</p>
    <div class="grid cols-2">${lob.datasets.map((d) => `
      <div class="panel"><h3><span class="dot" style="background:${COLORS[d.id]}"></span>${esc(NAMES[d.id])}</h3>
        <p class="small">Searched for <code>${esc(d.query)}</code> · ${esc(d.date_range)}<br>
        ${int(d.records)} records · ${int(d.distinct_institutions)} parts of the government · ${ext(d.url, 'archive file')}</p></div>`).join('')}
    </div>`;

  const instChart = chart($('#l-inst-chart', root), {});
  const monthChart = chart($('#l-month', root), {});
  const clientChart = chart($('#l-clients', root), {});

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return recs.filter((r) => (!state.ds || r.dataset === state.ds)
      && (!state.client || r.client === state.client)
      && (!state.inst || r.institutions.includes(state.inst))
      && (!q || [r.description, r.registrant, r.firm, r.client, ...r.holders, ...r.institutions].join(' ').toLowerCase().includes(q)));
  }

  function stacked(keyFn, rows, top) {
    const totals = new Map();
    rows.forEach((r) => keyFn(r).forEach((k) => totals.set(k, (totals.get(k) || 0) + 1)));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
    const cats = ranked.map(([k]) => k);
    const series = lob.datasets.map((d) => ({
      name: NAMES[d.id], type: 'bar', stack: 'all', itemStyle: { color: COLORS[d.id] },
      data: cats.map((c) => rows.filter((r) => r.dataset === d.id && keyFn(r).includes(c)).length),
    }));
    return { cats, series, first: ranked[0] };
  }

  function draw() {
    setParams(state);
    const rows = filtered();
    const none = 'No records match these filters.';

    const a = stacked((r) => r.institutions, rows, 20);
    caption(root, 'l-inst-chart', a.first ? `${esc(a.first[0])} is named in the most records: ${a.first[1]} of ${rows.length}.` : none);
    instChart.setOption({
      ...DECALS,
      legend: { top: 0, show: multi }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: stackTip(a.cats) },
      grid: { left: 24, right: 20, top: multi ? 30 : 10, bottom: 10, containLabel: true },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', inverse: true, data: a.cats.map(instLabel) },
      series: a.series,
    }, true);
    instChart.off('click');
    instChart.on('click', (p) => { state.inst = a.cats[p.dataIndex]; $('#l-inst', root).value = state.inst; draw(); });

    const dates = rows.map((r) => r.date.slice(0, 7)).sort();
    const months = dates.length ? monthRange(dates[0], dates[dates.length - 1]) : [];
    const perMonth = months.map((m) => rows.filter((r) => r.date.startsWith(m)).length);
    const peak = perMonth.indexOf(Math.max(...perMonth));
    caption(root, 'l-month', rows.length ? `${month(months[peak])} had the most records: ${perMonth[peak]}.` : none);
    monthChart.setOption({
      ...DECALS,
      legend: { top: 0, show: multi }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 10, right: 20, top: multi ? 30 : 10, bottom: 10, containLabel: true },
      xAxis: { type: 'category', data: months, axisLabel: { interval: 0, formatter: monthTick(months.length) } },
      yAxis: { type: 'value', minInterval: 1 },
      series: lob.datasets.map((d) => ({ name: NAMES[d.id], type: 'bar', stack: 'all', itemStyle: { color: COLORS[d.id] }, data: months.map((m) => rows.filter((r) => r.dataset === d.id && r.date.startsWith(m)).length) })),
    }, true);

    const b = stacked((r) => [r.client], rows, 12);
    caption(root, 'l-clients', b.first ? `${esc(b.first[0])} has the most records: ${b.first[1]} of ${rows.length}.` : none);
    clientChart.setOption({
      ...DECALS,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: stackTip(b.cats) },
      grid: { left: 10, right: 20, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', inverse: true, data: b.cats.map((c) => (c.length > 40 ? `${c.slice(0, 39)}…` : c)) },
      series: b.series,
    }, true);
    clientChart.off('click');
    clientChart.on('click', (p) => { state.client = b.cats[p.dataIndex]; $('#l-client', root).value = state.client; draw(); });

    $('#l-count', root).textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    $('#l-table', root).innerHTML = table([
      { label: 'Date', value: (r) => date(r.date) },
      { label: 'Paid for by', html: (r) => `<b>${esc(r.client)}</b><br><span class="badge" style="background:${COLORS[r.dataset]}22">${esc(NAMES[r.dataset])}</span> <span class="small muted">${esc(r.type)}</span>` },
      { label: 'Talked to', html: (r) => `<span class="small">${r.institutions.map(esc).join('<br>')}</span>` },
      { label: 'Office holders', html: (r) => `<span class="small">${r.holders.map(esc).join('<br>') || '—'}</span>` },
      { label: 'Subject', html: (r) => `<span class="small">${r.description ? esc(r.description) : '<span class="muted">not given in this table</span>'}</span>` },
      { label: 'Lobbyist / firm', html: (r) => `<span class="small">${esc(r.registrant || '')}${r.firm ? `<br><i>${esc(r.firm)}</i>` : ''}</span>` },
      { label: 'Government money reported', num: true, value: (r) => (r.funding ? money(r.funding) : '—') },
      { label: 'Registry', html: (r) => (r.url ? ext(r.url, r.comm_id || r.reg_id || 'open') : esc(r.reg_id || '')) },
    ], rows, { empty: none, limit: 20 });
  }

  $('#l-ds', root).addEventListener('change', (ev) => { state.ds = ev.target.value; draw(); });
  $('#l-client', root).addEventListener('change', (ev) => { state.client = ev.target.value; draw(); });
  $('#l-inst', root).addEventListener('change', (ev) => { state.inst = ev.target.value; draw(); });
  $('#l-q', root).addEventListener('input', (ev) => { state.q = ev.target.value; draw(); });
  draw();
}
