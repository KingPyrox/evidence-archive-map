import { loadAll } from '../services/data.js';
import { esc, money, moneyShort } from '../helpers/format.js';
import { $, options, table, setParams, ext, figure, caption } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';

export const title = 'Federal spending';

const IRCC = 'Department of Citizenship and Immigration';

export async function render(root, params) {
  const est = await loadAll('estimates').then(([e]) => e);
  const ri = est.recovery_index;
  const rounds = est.rounds.map((r) => r.key);
  const missing = new Set(ri.catalogue_missing);
  const orgs = Object.keys(est.orgs).sort((a, b) => a.localeCompare(b));
  const state = { org: est.orgs[params.org] ? params.org : IRCC, round: rounds.includes(params.round) ? params.round : rounds[rounds.length - 1] };

  root.innerHTML = `
    <h1>Federal spending: the recovered Estimates</h1>
    <p class="lead">The Deleted Records case holds ${rounds.length} rounds of federal Estimates tables (2019-20 to 2026-27)
      in one 7-Zip file. Its recovery index says the older files were removed from canada.ca and had to be pulled from the
      Internet Archive. This page reads every table in that file.</p>
    <div class="callout info"><b>What are Estimates?</b> “Main Estimates is the budget tabled at the start of the fiscal year.
      A, B and C are the top-ups tabled in May, November and February. A full year's picture needs Main plus every
      supplementary round that year.” <span class="small">(${ext(ri.url, 'recovery index, p. 2')})</span></div>

    <h2>One department across every round</h2>
    <div class="controls">
      <label>Department <select id="s-org">${options(orgs.map((o) => [o, o]), state.org)}</select></label>
    </div>
    ${figure('s-org-chart', {
      how: 'Each bar is the department\'s total budget after one round. <b>Blue</b> bars are rounds with an open.canada.ca catalogue record; <b>orange</b> bars are rounds the recovery index says had none. The red line is how much more the department asked for in that round.',
      src: ext(est.url, est.file.split('/').pop()),
    })}
    <p class="small muted">“Total after this round” is the <i>Proposed Authorities To Date</i> column (or the Main Estimates
      column for Main rounds), summed over every line the table lists for the department. “Asked for in this round” is that total minus
      the authorities the department already had.</p>
    <div id="s-org-table"></div>

    <h2>Biggest departments in one round</h2>
    <div class="controls"><label>Round <select id="s-round">${options(rounds.map((r) => [r, r]), state.round)}</select></label></div>
    ${figure('s-top', { how: 'Each bar is one department\'s total after the round, largest first. Click a bar to see that department across every round above.', src: ext(est.url, est.file.split('/').pop()), cls: 'tall' })}

    <h2>Which rounds and tables were recovered</h2>
    <p>Green rounds have an Open Government catalogue record. Amber rounds had <b>no catalogue record</b>, according to the
      recovery index. The index also says the Treasury Board's master index “lists 2022–23 forward only. Everything older was removed.”</p>
    ${table([
      { label: 'Round', html: (r) => `<b>${esc(r.key)}</b>` },
      { label: 'Catalogue record', html: (r) => (ri.catalogue[r.key] ? `<span class="badge ok">found</span> ${ext(ri.catalogue[r.key], 'open.canada.ca')}` : missing.has(r.key) ? '<span class="badge warn">none found</span>' : '<span class="muted">not listed</span>') },
      { label: 'Tables in the recovered file', value: (r) => r.tables.filter((t) => t !== 'pdf').join(', ') },
      { label: 'Files', num: true, value: (r) => r.files.length },
    ], est.rounds)}

    <h2>What each table is for</h2>
    <p class="small muted">In the recovery index's own words.</p>
    ${table([{ label: 'Table', value: (t) => t.table }, { label: 'What it shows', value: (t) => t.what }], ri.table_guide)}

    <h2>COVID-19 expenditure workbooks</h2>
    <p>The same file also holds ${est.covid_files.length} COVID-19 expenditure workbooks:</p>
    <ul class="small">${est.covid_files.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    <p class="small">Archive file: ${ext(est.url, est.file.split('/').pop())}</p>`;

  const orgChart = chart($('#s-org-chart', root), {});
  function drawOrg() {
    const d = est.orgs[state.org];
    const rows = rounds.filter((k) => d[k]).map((k) => ({ key: k, ...d[k], asked: d[k].to_date != null ? d[k].proposed - d[k].to_date : null }));
    const last = rows[rows.length - 1];
    caption(root, 's-org-chart', `${esc(state.org)}: ${moneyShort(last.proposed)} after its latest round, ${esc(last.key)}. It appears in ${rows.length === rounds.length ? `all ${rounds.length}` : `${rows.length} of ${rounds.length}`} rounds.`);
    orgChart.setOption({
      grid: { left: 10, right: 20, top: 40, bottom: 10, containLabel: true },
      legend: { top: 0 },
      tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '—' : money(v)) },
      xAxis: { type: 'category', data: rows.map((r) => r.key), axisLabel: { rotate: 40 } },
      yAxis: { type: 'value', axisLabel: { formatter: moneyShort } },
      series: [
        { name: 'Total after this round', type: 'bar', data: rows.map((r) => ({ value: r.proposed, itemStyle: { color: missing.has(r.key) ? '#f79009' : '#1d4ed8' } })) },
        { name: 'Asked for in this round', type: 'line', data: rows.map((r) => r.asked), itemStyle: { color: '#b42318' }, connectNulls: false },
      ],
    }, true);
    $('#s-org-table', root).innerHTML = table([
      { label: 'Round', html: (r) => `${esc(r.key)}${missing.has(r.key) ? ' <span class="badge warn">no catalogue record</span>' : ''}` },
      { label: 'Authorities before this round', num: true, value: (r) => (r.to_date != null ? money(r.to_date) : '—') },
      { label: 'Asked for in this round', num: true, value: (r) => (r.asked != null ? money(r.asked) : '—') },
      { label: 'Total after this round', num: true, value: (r) => money(r.proposed) },
    ], rows);
  }

  const topChart = chart($('#s-top', root), {});
  function drawTop() {
    const list = Object.entries(est.orgs).filter(([, v]) => v[state.round]).map(([k, v]) => [k, v[state.round].proposed]).sort((a, b) => b[1] - a[1]).slice(0, 20);
    caption(root, 's-top', `In ${esc(state.round)}, ${esc(list[0][0])} had the largest total: ${moneyShort(list[0][1])}. The 20 largest are shown.`);
    topChart.setOption({
      grid: { left: 10, right: 80, top: 10, bottom: 10, containLabel: true },
      tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b>` },
      xAxis: { type: 'value', axisLabel: { formatter: moneyShort } },
      yAxis: { type: 'category', inverse: true, data: list.map(([k]) => (k.length > 48 ? `${k.slice(0, 47)}…` : k)) },
      series: [{ type: 'bar', data: list.map(([, v]) => v), itemStyle: { color: '#1d4ed8' }, label: { show: true, position: 'right', formatter: (p) => moneyShort(p.value) } }],
    }, true);
    topChart.off('click');
    topChart.on('click', (p) => { const full = list[p.dataIndex][0]; state.org = full; $('#s-org', root).value = full; setParams({ org: state.org, round: state.round }); drawOrg(); $('#s-org', root).scrollIntoView({ behavior: 'smooth' }); });
  }

  $('#s-org', root).addEventListener('change', (ev) => { state.org = ev.target.value; setParams({ org: state.org, round: state.round }); drawOrg(); });
  $('#s-round', root).addEventListener('change', (ev) => { state.round = ev.target.value; setParams({ org: state.org, round: state.round }); drawTop(); });
  drawOrg();
  drawTop();
}
