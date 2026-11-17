import { loadAll } from '../services/data.js';
import { esc, money, moneyShort, perPerson, int } from '../helpers/format.js';
import { $, options, table, setParams, ext, figure, caption, term, squares, changeBox } from '../helpers/dom.js';
import { chart, namedBars, BAR, BAR_SOFT } from '../helpers/chart.js';

export const title = 'Public Accounts 2025-26';

const VOL1 = /Vol1/;
const VOL2 = /Vol2/;
const DEBT = 'Cost of servicing government debt';
const ok = (b) => b.amount === b.sum;
const tick = (b) => (ok(b) ? '<span class="badge ok">adds up</span>' : `<span class="badge warn">rows add up to ${esc(money(b.sum))}</span>`);
const wording = (x, b, src) => {
  const w = x.wording || b.wording;
  return w ? ext(x.url || b.url || src, w) : '';
};

// One calculated total: its subtotals in bold, each followed by its own rows, then the rows that sit under the total
// directly. Every subtotal says whether its rows add up to it.
function totalTable(b, src) {
  const rows = b.parts.flatMap((p) => (p.items ? [{ ...p, sub: true }, ...p.items.map((i) => ({ ...i, in: true }))] : [p]));
  return table([
    { label: 'What the money covers', html: (r) => (r.sub ? `<b>${esc(r.name)}</b> ${tick(r)}` : `${r.in ? '<span class="muted">·</span> ' : ''}${esc(r.name)}`) },
    { label: 'Amount', num: true, html: (r) => (r.sub ? `<b>${money(r.amount)}</b>` : money(r.amount)) },
    { label: 'Government wording', html: (r) => wording(r, b, src) },
  ], rows);
}

// Vesper's source groups, with groups of the same name (one money type listed in two places) shown as one list.
function groups(t) {
  const m = new Map();
  t.blocks.filter((b) => b.kind === 'group').forEach((g) => {
    const name = g.name.replace(/^Published source entries · /, '');
    m.set(name, [...(m.get(name) || []), ...g.parts.map((p) => ({ ...p, g }))]);
  });
  return [...m.entries()];
}

export async function render(root, params) {
  const [pa, s] = await loadAll('public_accounts', 'summary');
  const v1 = pa.tables.find((t) => VOL1.test(t.title));
  const v2 = pa.tables.find((t) => VOL2.test(t.title));
  const others = pa.tables.filter((t) => t !== v1 && t !== v2);
  const totalsOf = (t) => (t ? t.blocks.filter((b) => b.kind === 'total') : []);
  const v1Totals = totalsOf(v1);
  const debt = v1Totals.find((b) => b.name === DEBT);
  const income = v1Totals.filter((b) => b !== debt);
  const allTotals = pa.tables.flatMap((t) => totalsOf(t).flatMap((b) => [b, ...b.parts.filter((p) => p.items)]));
  const okCount = allTotals.filter(ok).length;
  const checks = s.checks.filter((c) => c.name.startsWith('Public Accounts'));
  const depts = pa.departments;
  const state = { dept: depts.some((d) => d.name === params.dept) ? params.dept : depts[0].name };
  const v1Src = v1 ? ext(v1.url, v1.file.split('/').pop()) : '';
  const v2Src = v2 ? ext(v2.url, v2.file.split('/').pop()) : '';
  const lists = pa.lists || [];
  const claims = lists.find((t) => /Claims/i.test(t.title));
  const claimsName = claims ? claims.title.replace(/^.*\d{4}-/, '') : '';
  const withheld = claims ? claims.records.filter((r) => /withheld/i.test(r.who)) : [];

  root.innerHTML = `
    <h1>Public Accounts 2025-26: money in, money out</h1>
    <p class="lead">The ${term('public-accounts', 'Public Accounts')} are the government's audited books for the
      ${term('fiscal-year', 'money year')}. Vesper exported ${pa.tables.length} tables from them and added up the rows into
      totals. This page checks every one of those totals against the rows under it.</p>
    <p class="pic-line">${squares(okCount, allTotals.length, 'ok')}
      <span><b>${okCount} of ${allTotals.length} totals and subtotals</b> equal the rows under them.</span></p>

    ${debt ? `
    <h2>The cost of the debt</h2>
    <div class="money-cards">
      <div class="money-card"><span class="amount">${moneyShort(debt.amount)}</span>
        <p class="what">to service the government's debt in 2025-26</p>
        ${perPerson(debt.amount) ? `<p class="per small">That is ${esc(perPerson(debt.amount))}.</p>` : ''}
        <p class="small">${tick(debt)} ${v1Src}</p></div>
      ${debt.related.map((r) => `<div class="money-card"><span class="amount">${moneyShort(r.amount)}</span>
        <p class="what">${esc(r.wording)}: the figure in the ${term('statutory', 'spending set by law')} table</p>
        <p class="small">Vesper lists it beside the total but does not add it in. ${r.matches.length
          ? `It is the ${esc(r.matches[0].name)} row of Volume II, ${money(r.matches[0].amount)}, given to the million.`
          : 'No matching row was found in Volume II.'}</p></div>`).join('')}
    </div>
    ${figure('a-debt', { how: 'Each bar is one part of the cost. The three biggest are themselves made of smaller rows, listed in the table below.', src: v1Src })}
    ${totalTable(debt, v1.source)}
    ${pa.agree.filter((a) => a.name === DEBT && a.a.table !== a.b.table).map((a) => `<p class="small">${a.same ? '<span class="badge ok">same</span>' : '<span class="badge warn">different</span>'}
      The separate “${esc(a.b.table)}” table lists the same ${int(a.rows)} parts and the same total.</p>`).join('')}` : ''}

    ${income.length ? `
    <h2>Money coming in</h2>
    ${figure('a-in', { how: 'Each bar is one part of a total Vesper worked out. Taxes are shown in their two groups: income taxes, and other taxes and duties.', src: v1Src })}
    ${income.map((b) => `<h3>${esc(b.name)}: ${money(b.amount)} ${tick(b)}</h3>${totalTable(b, v1.source)}`).join('')}` : ''}

    ${v2 ? `
    <h2>What each department spent</h2>
    <p>Volume II splits each department's spending into ${pa.kinds_of_cost.length} ${term('kind-of-cost', 'kinds of cost')},
      such as staff pay or equipment. It then takes off money the department earned (${pa.offsets.map((o) => esc(o.toLowerCase())).join(' and ')}).
      Added up over ${int(depts.length)} departments and agencies, that is <b>${money(pa.net_total)}</b>.</p>
    ${figure('a-top', { how: 'Each bar is one department\'s spending after it takes off the money it earned, biggest first. Tap or click a bar to see that department\'s kinds of cost below.', src: v2Src, cls: 'tall' })}
    <h3 id="a-dept-h"></h3>
    ${changeBox(`<label>Department <select id="a-dept">${options(depts.map((d) => [d.name, d.name]), state.dept)}</select></label>`)}
    <div id="a-dept-table"></div>
    <h3>Every department</h3>
    ${table([
      { label: 'Department or agency', value: (d) => d.name },
      { label: 'Kinds of cost added up', num: true, value: (d) => money(d.gross) },
      { label: 'Money earned, taken off', num: true, value: (d) => (d.offsets ? money(-d.offsets) : '—') },
      { label: 'Spending after that', num: true, value: (d) => money(d.net) },
    ], depts, { limit: 20 })}

    <h3>Volume II's other totals</h3>
    <p class="small muted">The same spending, split a different way, and the fees departments collected. Each total is the sum of its department rows.</p>
    ${table([
      { label: 'Total', value: (b) => b.name },
      { label: 'Departments listed', num: true, value: (b) => int(b.parts.length) },
      { label: 'Amount', num: true, value: (b) => money(b.amount) },
      { label: 'Check', html: tick },
    ], totalsOf(v2).filter((b) => !pa.kinds_of_cost.includes(b.name) && !pa.offsets.includes(b.name)))}` : ''}

    ${v1 ? `
    <h2>Other figures in Volume I</h2>
    <p class="small muted">Published rows Vesper listed without a total of its own.</p>
    ${table([
      { label: 'What it is', value: (b) => b.name },
      { label: 'Money type', value: (b) => b.type },
      { label: 'Amount', num: true, value: (b) => money(b.amount) },
      { label: 'Government wording', html: (b) => wording(b, b, v1.source) },
    ], v1.blocks.filter((b) => b.kind === 'figure'))}
    ${groups(v1).map(([name, list]) => `<h3>${esc(name)}</h3>
      ${table([
        { label: 'What the money covers', value: (r) => r.name },
        { label: 'Amount', num: true, value: (r) => money(r.amount) },
        { label: 'Government wording', html: (r) => wording(r, r.g, v1.source) },
      ], list)}`).join('')}` : ''}

    ${claims ? `
    <h2>${esc(claimsName)}</h2>
    <p>${term('claims', 'Claims against the Crown')} are payments the government made to settle lawsuits and other claims.
      Volume III lists ${int(claims.rows)} of them for ${esc(claims.ref.replace(/^.*FY /, 'the year ending March 31, '))}, worth
      <b>${money(claims.total)}</b> in all. ${withheld.length ? `${int(withheld.length)} of them, worth ${money(withheld.reduce((a, r) => a + r.amount, 0))}, list the person paid as “withheld”.` : ''}</p>
    ${figure('a-claims', { how: 'Each bar is one department\'s claim payments added up, biggest first.', src: ext(claims.url, claims.file.split('/').pop()) })}
    <h3>The largest payments</h3>
    ${table([
      { label: 'Paid to', value: (r) => r.who },
      { label: 'Department or agency', value: (r) => r.dept },
      { label: 'Amount', num: true, value: (r) => money(r.amount) },
    ], [...claims.records].sort((a, b) => b.amount - a.amount), { limit: 15 })}
    <p class="small">Source: ${ext(claims.source, 'open.canada.ca')} · ${esc(claims.ref)}</p>` : ''}

    <h2>How these numbers are checked</h2>
    <ul>${checks.map((c) => `<li>${c.pass ? '<span class="badge ok">pass</span>' : '<span class="badge warn">fail</span>'} ${esc(c.name.replace(/^Public Accounts: /, ''))}</li>`).join('')}</ul>

    <h2>Where the tables come from</h2>
    ${table([
      { label: 'Archive file', html: (t) => ext(t.url, t.file.split('/').pop()) },
      { label: 'What Vesper exported', value: (t) => t.about.filter((a) => a.includes('•')).join(' ') },
      { label: 'Rows', num: true, value: (t) => int(t.rows) },
      { label: 'Government source', html: (t) => (t.source ? ext(t.source, 'open.canada.ca') : '') },
    ], [v1, v2, ...others, ...lists].filter(Boolean))}`;

  if (debt) {
    const c = chart($('#a-debt', root), {});
    const list = debt.parts.map((p) => [p.name, p.amount]);
    caption(root, 'a-debt', `${esc(list[0][0])} cost the most: ${moneyShort(list[0][1])} of the ${moneyShort(debt.amount)} total.`);
    const { barWidth, ...frame } = namedBars(c, list.map(([k]) => k), { right: 80 });
    c.setOption({
      ...frame,
      tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b>` },
      series: [{ type: 'bar', barWidth, data: list.map(([, v], i) => ({ value: v, itemStyle: { color: i ? BAR_SOFT : '#b42318' } })),
        label: { show: true, position: 'right', formatter: (p) => moneyShort(p.value) } }],
    });
  }

  if (income.length) {
    const c = chart($('#a-in', root), {});
    const list = income.flatMap((b) => b.parts.map((p) => [p.name, p.amount])).sort((a, b) => b[1] - a[1]);
    caption(root, 'a-in', `${esc(list[0][0])} brought in the most: ${moneyShort(list[0][1])}.`);
    const { barWidth, ...frame } = namedBars(c, list.map(([k]) => k), { right: 80 });
    c.setOption({
      ...frame,
      tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b>` },
      series: [{ type: 'bar', barWidth, data: list.map(([, v], i) => ({ value: v, itemStyle: { color: i ? BAR_SOFT : BAR } })),
        label: { show: true, position: 'right', formatter: (p) => moneyShort(p.value) } }],
    });
  }

  if (claims) {
    const c = chart($('#a-claims', root), {});
    const list = claims.by_dept.slice(0, 15);
    caption(root, 'a-claims', `${esc(list[0].name)} paid the most in claims: ${moneyShort(list[0].amount)} over ${int(list[0].count)} payments. The 15 largest are shown.`);
    const { barWidth, ...frame } = namedBars(c, list.map((d) => d.name), { right: 80 });
    c.setOption({
      ...frame,
      tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b> in ${int(list[p.dataIndex].count)} payments` },
      series: [{ type: 'bar', barWidth, data: list.map((d, i) => ({ value: d.amount, itemStyle: { color: i ? BAR_SOFT : BAR } })),
        label: { show: true, position: 'right', formatter: (p) => moneyShort(p.value) } }],
    });
  }

  if (!v2) return;
  function drawDept() {
    const d = depts.find((x) => x.name === state.dept);
    $('#a-dept-h', root).innerHTML = `${esc(d.name)}: ${money(d.net)} after money earned`;
    const rows = Object.entries(d.costs).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
    if (d.offsets) rows.push({ k: 'Money earned, taken off', v: -d.offsets, off: true });
    $('#a-dept-table', root).innerHTML = table([
      { label: 'Kind of cost', html: (r) => (r.off ? `<i>${esc(r.k)}</i>` : esc(r.k)) },
      { label: 'Amount', num: true, value: (r) => money(r.v) },
    ], rows);
  }
  const top = chart($('#a-top', root), {});
  const list = depts.slice(0, 20);
  caption(root, 'a-top', `${esc(list[0].name)} spent the most: ${moneyShort(list[0].net)}. The 20 largest are shown.`);
  const { barWidth, ...frame } = namedBars(top, list.map((d) => d.name), { right: 80 });
  top.setOption({
    ...frame,
    tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b>` },
    series: [{ type: 'bar', barWidth, data: list.map((d, i) => ({ value: d.net, itemStyle: { color: i ? BAR_SOFT : BAR } })),
      label: { show: true, position: 'right', formatter: (p) => moneyShort(p.value) } }],
  });
  top.on('click', (p) => { state.dept = list[p.dataIndex].name; $('#a-dept', root).value = state.dept; setParams({ dept: state.dept }); drawDept(); $('#a-dept-h', root).scrollIntoView({ behavior: 'smooth' }); });
  $('#a-dept', root).addEventListener('change', (ev) => { state.dept = ev.target.value; setParams({ dept: state.dept }); drawDept(); });
  drawDept();
}
