import { loadAll } from '../services/data.js';
import { esc, int, money, date } from '../helpers/format.js';
import { $, options, table, setParams, ext } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';
import { DATASET_COLORS } from '../enums/kinds.js';

export const title = 'Lobbying';

const NAMES = {
  'dataset:lobby-drones': 'Drones',
  'dataset:lobby-telesat': 'Telesat',
  'dataset:lobby-roshel': 'Roshel',
  'dataset:lobby-stelco': 'Stelco',
};

export async function render(root, params) {
  const [lob] = await loadAll('lobbying');
  const recs = lob.records;
  const clients = [...new Set(recs.map((r) => r.client))].sort((a, b) => a.localeCompare(b));
  const insts = [...new Set(recs.flatMap((r) => r.institutions))].sort((a, b) => a.localeCompare(b));
  const state = { ds: params.ds || '', client: params.client || '', inst: params.inst || '', q: params.q || '' };
  if (state.inst && !insts.includes(state.inst)) {
    const near = insts.find((i) => i.toLowerCase().startsWith(state.inst.toLowerCase()));
    state.inst = near || '';
  }

  root.innerHTML = `
    <h1>Lobbying records</h1>
    <p class="lead">Four tables in the archive list ${int(recs.length)} federal Lobbying Registry records from 2026, found by
      searching the registry for drones, Telesat, Roshel and Stelco. Each record says who lobbied, which government
      institutions they contacted, and what about. Every row links to the registry.</p>
    <div class="grid cols-2">${lob.datasets.map((d) => `
      <div class="panel"><h3><span class="dot" style="background:${DATASET_COLORS[d.id]}"></span>${esc(NAMES[d.id])}</h3>
        <p class="small">Search term <code>${esc(d.query)}</code> · ${esc(d.date_range)}<br>
        ${int(d.records)} records · ${int(d.distinct_institutions)} institutions · ${ext(d.url, 'archive file')}</p></div>`).join('')}
    </div>
    <div class="controls">
      <label>Table <select id="l-ds">${options([['', 'All four tables'], ...lob.datasets.map((d) => [d.id, NAMES[d.id]])], state.ds)}</select></label>
      <label>Client <select id="l-client">${options([['', 'Any client'], ...clients.map((c) => [c, c])], state.client)}</select></label>
      <label>Institution <select id="l-inst">${options([['', 'Any institution'], ...insts.map((c) => [c, c])], state.inst)}</select></label>
      <label>Search <input id="l-q" type="search" value="${esc(state.q)}" placeholder="Words in the description, lobbyist, firm…"></label>
    </div>
    <div class="grid cols-2">
      <div class="panel"><h3>Institutions contacted most</h3><div id="l-inst-chart" class="chart tall"></div></div>
      <div class="panel"><h3>Records by month</h3><div id="l-month" class="chart" style="height:300px"></div>
        <h3>Clients</h3><div id="l-clients" class="chart" style="height:300px"></div></div>
    </div>
    <h2 id="l-count"></h2>
    <div id="l-table"></div>`;

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
    const cats = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k]) => k);
    const series = lob.datasets.map((d) => ({
      name: NAMES[d.id], type: 'bar', stack: 'all', itemStyle: { color: DATASET_COLORS[d.id] },
      data: cats.map((c) => rows.filter((r) => r.dataset === d.id && keyFn(r).includes(c)).length),
    }));
    return { cats, series };
  }

  function draw() {
    setParams(state);
    const rows = filtered();
    const a = stacked((r) => r.institutions, rows, 20);
    instChart.setOption({
      legend: { top: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
      grid: { left: 10, right: 20, top: 30, bottom: 10, containLabel: true },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', inverse: true, data: a.cats.map((c) => (c.length > 44 ? `${c.slice(0, 43)}…` : c)) },
      series: a.series,
    }, true);
    instChart.off('click');
    instChart.on('click', (p) => { state.inst = a.cats[p.dataIndex]; $('#l-inst', root).value = state.inst; draw(); });

    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
    monthChart.setOption({
      legend: { top: 0 }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 10, right: 20, top: 30, bottom: 10, containLabel: true },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', minInterval: 1 },
      series: lob.datasets.map((d) => ({ name: NAMES[d.id], type: 'bar', stack: 'all', itemStyle: { color: DATASET_COLORS[d.id] }, data: months.map((m) => rows.filter((r) => r.dataset === d.id && r.date.startsWith(m)).length) })),
    }, true);

    const b = stacked((r) => [r.client], rows, 12);
    clientChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
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
      { label: 'Client', html: (r) => `<b>${esc(r.client)}</b><br><span class="badge" style="background:${DATASET_COLORS[r.dataset]}22">${esc(NAMES[r.dataset])}</span> <span class="small muted">${esc(r.type)}</span>` },
      { label: 'Institutions', html: (r) => `<span class="small">${r.institutions.map(esc).join('<br>')}</span>` },
      { label: 'Office holders', html: (r) => `<span class="small">${r.holders.map(esc).join('<br>') || '—'}</span>` },
      { label: 'Subject', html: (r) => `<span class="small">${r.description ? esc(r.description) : '<span class="muted">not given in this table</span>'}</span>` },
      { label: 'Lobbyist / firm', html: (r) => `<span class="small">${esc(r.registrant || '')}${r.firm ? `<br><i>${esc(r.firm)}</i>` : ''}</span>` },
      { label: 'Gov. funding reported', num: true, value: (r) => (r.funding ? money(r.funding) : '—') },
      { label: 'Registry', html: (r) => (r.url ? ext(r.url, r.comm_id || r.reg_id || 'open') : esc(r.reg_id || '')) },
    ], rows, { empty: 'No records match these filters.' });
  }

  $('#l-ds', root).addEventListener('change', (ev) => { state.ds = ev.target.value; draw(); });
  $('#l-client', root).addEventListener('change', (ev) => { state.client = ev.target.value; draw(); });
  $('#l-inst', root).addEventListener('change', (ev) => { state.inst = ev.target.value; draw(); });
  $('#l-q', root).addEventListener('input', (ev) => { state.q = ev.target.value; draw(); });
  draw();
}
