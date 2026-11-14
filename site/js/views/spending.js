import { loadAll } from '../services/data.js';
import { esc, money, moneyShort } from '../helpers/format.js';
import { $, options, table, setParams, ext, figure, caption, term, squares, changeBox } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';

export const title = 'Federal spending plans';

const IRCC = 'Department of Citizenship and Immigration';
// Stripes on top of the orange, so a plan with no listing stands out without relying on colour.
const STRIPES = { symbol: 'rect', symbolSize: 1, rotation: Math.PI / 4, dashArrayX: [1, 0], dashArrayY: [3, 5], color: 'rgba(255,255,255,0.55)' };

export async function render(root, params) {
  const est = await loadAll('estimates').then(([e]) => e);
  const ri = est.recovery_index;
  const rounds = est.rounds.map((r) => r.key);
  const missing = new Set(ri.catalogue_missing);
  const orgs = Object.keys(est.orgs).sort((a, b) => a.localeCompare(b));
  const state = { org: est.orgs[params.org] ? params.org : IRCC, round: rounds.includes(params.round) ? params.round : rounds[rounds.length - 1] };

  root.innerHTML = `
    <h1>Federal spending plans</h1>
    <p class="lead">Each year, the government writes ${term('estimates', 'spending plans')} that say how much each
      ${term('department', 'department')} may spend. The archive has ${rounds.length} of them, from 2019-20 to 2026-27. Some older ones were
      taken off canada.ca, so Vesper got them back from the Internet Archive.</p>
    <p class="pic-line">${squares(missing.size, rounds.length, 'warn')}
      <span><b>${missing.size} of ${rounds.length} plans</b> have no listing on Canada's ${term('catalogue', 'open data website')},
      the archive's notes say.</span></p>

    <h2>One department across every plan</h2>
    ${figure('s-org-chart', {
      how: 'Each bar is the department\'s total budget after one plan. <b>Striped orange</b> bars are plans with no listing on the open data website. The red line is how much more the department asked for in that plan.',
      src: ext(est.url, est.file.split('/').pop()),
    })}
    ${changeBox(`<label>Department <select id="s-org">${options(orgs.map((o) => [o, o]), state.org)}</select></label>`)}
    <p class="small muted">“Total after this plan” is the <i>Proposed Authorities To Date</i> column (or the Main Estimates
      column for Main plans), added up over every line the table lists for the department. “Asked for in this plan” is that
      total minus the ${term('authorities', 'amount it was already allowed')}.</p>
    <div id="s-org-table"></div>

    <h2>Biggest departments in one plan</h2>
    ${figure('s-top', { how: 'Each bar is one department\'s total after the plan, biggest first. Click a bar to see that department across every plan above.', src: ext(est.url, est.file.split('/').pop()), cls: 'tall' })}
    ${changeBox(`<label>Plan <select id="s-round">${options(rounds.map((r) => [r, r]), state.round)}</select></label>`)}

    <h2>What are Main, A, B and C?</h2>
    <div class="callout info">“Main Estimates is the budget tabled at the start of the fiscal year.
      A, B and C are the top-ups tabled in May, November and February. A full year's picture needs Main plus every
      supplementary round that year.” <span class="small">(${ext(ri.url, 'archive notes, p. 2')})</span></div>

    <h2>Which plans were recovered</h2>
    <p>Plans marked <span class="badge ok">found</span> have a listing on the open data website. Plans marked
      <span class="badge warn">none found</span> have <b>no listing</b>, according to the archive's notes. The notes also say
      the Treasury Board's master list “lists 2022–23 forward only. Everything older was removed.”</p>
    ${table([
      { label: 'Plan', html: (r) => `<b>${esc(r.key)}</b>` },
      { label: 'Open data listing', html: (r) => (ri.catalogue[r.key] ? `<span class="badge ok">found</span> ${ext(ri.catalogue[r.key], 'open.canada.ca')}` : missing.has(r.key) ? '<span class="badge warn">none found</span>' : '<span class="muted">not listed</span>') },
      { label: 'Tables in the recovered file', value: (r) => r.tables.filter((t) => t !== 'pdf').join(', ') },
      { label: 'Files', num: true, value: (r) => r.files.length },
    ], est.rounds)}

    <h2>What each table is for</h2>
    <p class="small muted">In the archive notes' own words.</p>
    ${table([{ label: 'Table', value: (t) => t.table }, { label: 'What it shows', value: (t) => t.what }], ri.table_guide)}

    <h2>COVID-19 spending workbooks</h2>
    <p>The same file also holds ${est.covid_files.length} COVID-19 spending workbooks:</p>
    <ul class="small">${est.covid_files.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    <p class="small">Archive file: ${ext(est.url, est.file.split('/').pop())}</p>`;

  const orgChart = chart($('#s-org-chart', root), {});
  function drawOrg() {
    const d = est.orgs[state.org];
    const rows = rounds.filter((k) => d[k]).map((k) => ({ key: k, ...d[k], asked: d[k].to_date != null ? d[k].proposed - d[k].to_date : null }));
    const last = rows[rows.length - 1];
    caption(root, 's-org-chart', `${esc(state.org)}: ${moneyShort(last.proposed)} after its latest plan, ${esc(last.key)}. It appears in ${rows.length === rounds.length ? `all ${rounds.length}` : `${rows.length} of ${rounds.length}`} plans.`);
    orgChart.setOption({
      grid: { left: 10, right: 20, top: 40, bottom: 10, containLabel: true },
      legend: { top: 0 },
      tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '—' : money(v)) },
      xAxis: { type: 'category', data: rows.map((r) => r.key), axisLabel: { rotate: 40 } },
      yAxis: { type: 'value', axisLabel: { formatter: moneyShort } },
      series: [
        { name: 'Total after this plan', type: 'bar', data: rows.map((r) => ({ value: r.proposed, itemStyle: missing.has(r.key) ? { color: '#f79009', decal: STRIPES } : { color: '#1d4ed8' } })) },
        { name: 'Asked for in this plan', type: 'line', data: rows.map((r) => r.asked), itemStyle: { color: '#b42318' }, connectNulls: false },
      ],
    }, true);
    $('#s-org-table', root).innerHTML = table([
      { label: 'Plan', html: (r) => `${esc(r.key)}${missing.has(r.key) ? ' <span class="badge warn">no open data listing</span>' : ''}` },
      { label: 'Allowed before this plan', num: true, value: (r) => (r.to_date != null ? money(r.to_date) : '—') },
      { label: 'Asked for in this plan', num: true, value: (r) => (r.asked != null ? money(r.asked) : '—') },
      { label: 'Total after this plan', num: true, value: (r) => money(r.proposed) },
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
    topChart.on('click', (p) => { const full = list[p.dataIndex][0]; state.org = full; $('#s-org', root).value = full; setParams({ org: state.org, round: state.round }); drawOrg(); $('#s-org-chart', root).closest('figure').scrollIntoView({ behavior: 'smooth' }); });
  }

  $('#s-org', root).addEventListener('change', (ev) => { state.org = ev.target.value; setParams({ org: state.org, round: state.round }); drawOrg(); });
  $('#s-round', root).addEventListener('change', (ev) => { state.round = ev.target.value; setParams({ org: state.org, round: state.round }); drawTop(); });
  drawOrg();
  drawTop();
}
