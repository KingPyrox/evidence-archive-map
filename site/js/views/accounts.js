import { loadAll } from '../services/data.js';
import { esc, money, moneyShort, perPerson, int, listWords } from '../helpers/format.js';
import { $, options, table, setParams, ext, figure, caption, term, squares, changeBox, fold } from '../helpers/dom.js';
import { chart, namedBars, lines, BAR, BAR_SOFT } from '../helpers/chart.js';

export const title = 'Public Accounts 2025-26';

const VOL1 = /Vol1/;
const VOL2 = /Vol2/;
const DEBT = 'Cost of servicing government debt';
const RED = '#b42318';
const ok = (b) => b.amount === b.sum;
const rowCount = (b) => b.parts.reduce((n, p) => n + 1 + (p.items ? p.items.length : 0), 0);
const seeRows = (b) => `See the ${int(rowCount(b))} rows behind the ${esc(moneyShort(b.amount))}`;
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
    { label: 'What the money covers', html: (r) => (r.sub ? `<b>${esc(r.name)}</b> ${tick(r)}` : `${r.in ? '<span class="muted">·</span>&nbsp;' : ''}${esc(r.name)}`) },
    { label: 'Amount', num: true, html: (r) => (r.sub ? `<b>${money(r.amount)}</b>` : money(r.amount)) },
    { label: 'Government wording', html: (r) => wording(r, b, src) },
  ], rows, { cls: 'money-rows' });
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
  const v2Others = totalsOf(v2).filter((b) => !pa.kinds_of_cost.includes(b.name) && !pa.offsets.includes(b.name));
  const v1Figures = v1 ? v1.blocks.filter((b) => b.kind === 'figure') : [];
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
  const bl = pa.bottom_line;
  const hist = pa.debt_history;
  const years = hist ? hist.years.map((y) => ({ ...y, v: y.published ?? y.amount })) : [];
  const slips = years.filter((y) => y.sign_slip);
  // The money picture. A row below zero is money going the other way, so it is drawn on the other side.
  const gap = bl ? -bl.result : 0;
  const gapName = gap > 0 ? 'Spent beyond what came in (the deficit)' : 'Left over (a surplus)';
  const flipped = bl ? [...bl.in, ...bl.out].filter((r) => r.amount < 0) : [];
  const flowHow = !bl ? '' : `Money comes in on the left and goes out on the right. The wider a band, the more money.${gap > 0
    ? ` The red band is the ${term('deficit', 'deficit')}: how much more the government spent than it took in.`
    : gap < 0 ? ' The last band on the right is what was left over (a surplus).' : ''}${flipped.length
    ? ` ${listWords(flipped.map((r) => `${esc(r.name)} (${esc(money(r.amount))})`))} ${flipped.length > 1 ? 'are' : 'is'} below zero, so ${flipped.length > 1 ? 'they are' : 'it is'} drawn on the other side.` : ''}`;

  root.innerHTML = `
    <h1>Public Accounts 2025-26: money in, money out</h1>
    <p class="lead">The ${term('public-accounts', 'Public Accounts')} are the government's audited books for the
      ${term('fiscal-year', 'money year')}. Vesper exported ${pa.tables.length} tables from them and added up the rows into
      totals. This page checks every one of those totals against the rows under it.</p>
    ${bl ? `
    ${figure('a-flow', { how: flowHow, src: v1Src })}
    <p class="small">Before this year, the yearly gaps added up to ${esc(moneyShort(bl.start_deficit))}
      (“${esc(bl.start_wording.toLowerCase())}”).</p>
    ${fold('Money in and out, as a table', table([
      { label: 'In or out', value: (r) => r.side },
      { label: 'What', value: (r) => r.name },
      { label: 'Amount', num: true, value: (r) => money(r.amount) },
      { label: 'Government wording', value: (r) => r.wording || '' },
    ], [...bl.in.map((r) => ({ ...r, side: 'In' })), ...bl.out.map((r) => ({ ...r, side: 'Out' })),
      ...(gap ? [{ side: 'Gap', name: gapName, amount: Math.abs(gap) }] : [])]))}` : ''}
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
    ${years.length > 1 ? `
    ${figure('a-years', { how: 'Each bar is one year, oldest on the left. Amounts are in each year’s dollars, not adjusted for inflation. Tap or hover a bar for its amount.', cls: 'short',
      src: `${ext(hist.url, hist.file.split('/').pop())} · ${ext(years[years.length - 1].source, 'open.canada.ca')}` })}
    ${slips.length ? `<p class="small muted">For ${listWords(slips.map((y) => esc(y.year)))}, the rows in the government’s open-data file add up to a little more
      than its own published total. Flipping the sign of one adjustment row gives the published total exactly, so the chart uses the published total.</p>` : ''}
    ${fold('The cost of the debt each year, as a table', table([
      { label: 'Year', value: (y) => y.year },
      { label: 'Cost of the debt', num: true, value: (y) => money(y.v) },
      { label: 'Its rows add up to', num: true, value: (y) => (y.amount !== y.v ? money(y.amount) : 'the same') },
    ], [...years].reverse(), { cls: 'narrow' }))}` : ''}
    ${figure('a-debt', { how: 'Each bar is one part of this year’s cost. The three biggest are themselves made of smaller rows.', src: v1Src })}
    ${fold(seeRows(debt), totalTable(debt, v1.source))}
    ${pa.agree.filter((a) => a.name === DEBT && a.a.table !== a.b.table).map((a) => `<p class="small">${a.same ? '<span class="badge ok">same</span>' : '<span class="badge warn">different</span>'}
      The separate “${esc(a.b.table)}” table lists the same ${int(a.rows)} parts and the same total.</p>`).join('')}` : ''}

    ${income.length ? `
    <h2>Money coming in</h2>
    ${figure('a-in', { how: 'Each bar is one part of a total Vesper worked out. Taxes are shown in their two groups: income taxes, and other taxes and duties.', src: v1Src })}
    ${income.map((b) => `<h3>${esc(b.name)}: ${money(b.amount)} ${tick(b)}</h3>${fold(seeRows(b), totalTable(b, v1.source))}`).join('')}` : ''}

    ${v2 ? `
    <h2>What each department spent</h2>
    <p>Volume II splits each department's spending into ${pa.kinds_of_cost.length} ${term('kind-of-cost', 'kinds of cost')},
      such as staff pay or equipment. It then takes off money the department earned (${pa.offsets.map((o) => esc(o.toLowerCase())).join(' and ')}).
      Added up over ${int(depts.length)} departments and agencies, that is <b>${money(pa.net_total)}</b>.</p>
    ${figure('a-top', { how: 'Each bar is one department\'s spending after it takes off the money it earned, biggest first. Tap or click a bar to see that department\'s kinds of cost below.', src: v2Src, cls: 'tall' })}
    ${figure('a-kinds', { how: 'Each bar is one kind of cost, biggest first.', src: v2Src, cls: 'short' })}
    ${changeBox(`<label>Department <select id="a-dept">${options(depts.map((d) => [d.name, d.name]), state.dept)}</select></label>`)}
    <div id="a-dept-table"></div>
    ${fold(`Every department and agency (${int(depts.length)}), as a table`, table([
      { label: 'Department or agency', value: (d) => d.name },
      { label: 'Kinds of cost added up', num: true, value: (d) => money(d.gross) },
      { label: 'Money earned, taken off', num: true, value: (d) => (d.offsets ? money(-d.offsets) : '—') },
      { label: 'Spending after that', num: true, value: (d) => money(d.net) },
    ], depts, { limit: 20, cls: 'named' }))}
    ${fold(`Volume II’s other totals (${int(v2Others.length)})`, `<p class="small muted">The same spending, split a different way, and the fees departments collected. Each total is the sum of its department rows.</p>
    ${table([
      { label: 'Total', value: (b) => b.name },
      { label: 'Departments listed', num: true, value: (b) => int(b.parts.length) },
      { label: 'Amount', num: true, value: (b) => money(b.amount) },
      { label: 'Check', html: tick },
    ], v2Others, { cls: 'named' })}`)}` : ''}

    ${v1 ? `
    <h2>Other figures in Volume I</h2>
    <p class="small muted">Published rows Vesper listed without a total of its own.</p>
    ${fold(`Figures listed on their own (${int(v1Figures.length)})`, table([
      { label: 'What it is', value: (b) => b.name },
      { label: 'Money type', value: (b) => b.type },
      { label: 'Amount', num: true, value: (b) => money(b.amount) },
      { label: 'Government wording', html: (b) => wording(b, b, v1.source) },
    ], v1Figures, { cls: 'named' }))}
    ${groups(v1).map(([name, list]) => fold(`${esc(name)} (${int(list.length)} rows)`, table([
        { label: 'What the money covers', value: (r) => r.name },
        { label: 'Amount', num: true, value: (r) => money(r.amount) },
        { label: 'Government wording', html: (r) => wording(r, r.g, v1.source) },
      ], list, { cls: 'money-rows' }))).join('')}` : ''}

    ${claims ? `
    <h2>${esc(claimsName)}</h2>
    <p>${term('claims', 'Claims against the Crown')} are payments the government made to settle lawsuits and other claims.
      Volume III lists ${int(claims.rows)} of them for ${esc(claims.ref.replace(/^.*FY /, 'the year ending March 31, '))}, worth
      <b>${money(claims.total)}</b> in all. ${withheld.length ? `${int(withheld.length)} of them, worth ${money(withheld.reduce((a, r) => a + r.amount, 0))}, list the person paid as “withheld”.` : ''}
      ${claims.no_payee ? `${int(claims.no_payee)} entries name no one: in the government’s file, most of these are one department’s payments under $1,000 added together.` : ''}</p>
    ${figure('a-claims', { how: 'Each bar is one department\'s claim payments added up, biggest first.', src: ext(claims.url, claims.file.split('/').pop()) })}
    <h3>The largest payments</h3>
    ${table([
      { label: 'Paid to', html: (r) => (r.who ? esc(r.who) : '<i class="muted">No payee named</i>') },
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

  if (bl) {
    const c = chart($('#a-flow', root), {});
    const MID = 'The government';
    const label = (r) => (r.amount < 0 ? `${r.name} (below zero)` : r.name);
    const rows = new Map([...bl.in, ...bl.out].map((r) => [label(r), r]));
    // in: money in, costs below zero and a deficit; out: costs, money in below zero and a surplus. Each balances the other.
    const ins = [...bl.in.filter((r) => r.amount > 0), ...bl.out.filter((r) => r.amount < 0)].map((r) => [label(r), Math.abs(r.amount)]);
    const outs = [...bl.out.filter((r) => r.amount > 0), ...bl.in.filter((r) => r.amount < 0)].map((r) => [label(r), Math.abs(r.amount)]);
    if (gap > 0) ins.push([gapName, gap]);
    if (gap < 0) outs.push([gapName, -gap]);
    const links = [
      ...ins.map(([name, value]) => ({ source: name, target: MID, value, lineStyle: name === gapName ? { color: RED, opacity: 0.45 } : { color: BAR } })),
      ...outs.map(([name, value]) => ({ source: MID, target: name, value, lineStyle: { color: BAR_SOFT } })),
    ];
    const left = ins.map(([name]) => name);
    const right = outs.map(([name]) => name);
    const pp = perPerson(Math.abs(gap));
    caption(root, 'a-flow', gap > 0
      ? `In 2025-26 the government spent ${moneyShort(gap)} more than it took in${pp ? `: ${esc(pp)}` : ''}.`
      : gap < 0 ? `In 2025-26 the government took in ${moneyShort(-gap)} more than it spent.` : 'In 2025-26 the government took in exactly what it spent.');
    // names wrap beside their bands; the gap between boxes fits the longest wrapped name, so labels never overlap
    const labelWidth = Math.max(110, Math.floor((c.getDom().clientWidth - 70) / 2) - 10);
    const gapPx = Math.max(...[...left, ...right].map((n) => (lines(n, labelWidth) + 1) * 15)) + 6;
    c.getDom().style.height = `${Math.max(380, Math.max(left.length, right.length) * gapPx + 240)}px`;
    c.resize();
    const tip = (p) => {
      const name = p.dataType === 'edge' ? (p.data.source === MID ? p.data.target : p.data.source) : p.name;
      const r = rows.get(name);
      const each = perPerson(p.value);
      return `${esc(p.dataType === 'edge' ? `${p.data.source} → ${p.data.target}` : p.name)}<br><b>${money(p.value)}</b>${each ? `<br>${esc(each)}` : ''}${r && r.wording ? `<br>In the books: ${esc(r.wording)}` : ''}`;
    };
    c.setOption({
      tooltip: { confine: true, formatter: tip },
      series: [{
        // a thin last box still has a full-height name centred on it, so leave half a name of room at the bottom
        type: 'sankey', left: 10, right: 10, top: 30, bottom: Math.ceil(gapPx / 2) + 4, nodeWidth: 16, nodeGap: gapPx, layoutIterations: 0, emphasis: { focus: 'adjacency' },
        // a light box behind each name keeps the bands from running through the text
        label: { width: labelWidth, overflow: 'break', lineHeight: 15, color: '#1c1f24', backgroundColor: 'rgba(255,255,255,.8)', padding: [1, 3], borderRadius: 3, formatter: (p) => `${p.name === MID ? `${MID}: ` : `${p.name}\n`}${moneyShort(p.value)}` },
        data: [
          ...left.map((name) => ({ name, depth: 0, itemStyle: { color: name === gapName ? RED : BAR }, label: { position: 'right' } })),
          { name: MID, depth: 1, itemStyle: { color: '#475467' }, label: { position: 'top', width: 260, fontWeight: 600 } },
          ...right.map((name) => ({ name, depth: 2, itemStyle: { color: BAR_SOFT }, label: { position: 'left' } })),
        ],
        links,
        lineStyle: { opacity: 0.3 },
      }],
    });
  }

  if (years.length > 1) {
    const c = chart($('#a-years', root), {});
    const last = years[years.length - 1];
    const low = years.reduce((a, y) => (y.v < a.v ? y : a));
    const named = (y) => y === last || y === low;
    caption(root, 'a-years', low === last
      ? `The yearly cost of the debt was ${moneyShort(last.v)} in ${esc(last.year)}, the lowest of the ${years.length} years shown.`
      : `The yearly cost of the debt was ${moneyShort(last.v)} in ${esc(last.year)}: ${(last.v / low.v).toFixed(1)} times the ${moneyShort(low.v)} of ${esc(low.year)}.`);
    c.setOption({
      grid: { left: 8, right: 28, top: 28, bottom: 8, containLabel: true }, // right: room for the last bar's label on phones
      tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b>${years[p.dataIndex].sign_slip ? '<br>The government’s published total' : ''}` },
      xAxis: { type: 'category', data: years.map((y) => y.year), axisTick: { show: false }, axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { formatter: (v) => (v ? `$${v / 1e9}B` : '0') }, splitLine: { lineStyle: { color: '#eaecf0' } } },
      series: [{ type: 'bar', barMaxWidth: 40, data: years.map((y) => ({ value: y.v, itemStyle: { color: named(y) ? BAR : BAR_SOFT } })),
        label: { show: true, position: 'top', formatter: (p) => (named(years[p.dataIndex]) ? moneyShort(p.value) : '') } }],
    });
  }

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
  const kinds = chart($('#a-kinds', root), {});
  function drawDept() {
    const d = depts.find((x) => x.name === state.dept);
    const rows = Object.entries(d.costs).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
    const bars = rows.filter((r) => r.v > 0);
    const below = rows.length - bars.length;
    caption(root, 'a-kinds', `${esc(d.name)}: ${moneyShort(d.net)} after money earned. ${bars.length ? `${esc(bars[0].k)} cost the most: ${moneyShort(bars[0].v)}.` : ''}`,
      `Each bar is one kind of cost, biggest first.${d.offsets ? ` Then the department took off ${moneyShort(d.offsets)} it earned.` : ''}${below ? ` ${int(below)} ${below > 1 ? 'kinds are' : 'kind is'} zero or below zero, so ${below > 1 ? 'they are' : 'it is'} only in the table.` : ''}`);
    const { barWidth, ...frame } = namedBars(kinds, bars.map((r) => r.k), { right: 80 });
    kinds.setOption({
      ...frame,
      tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b>` },
      series: [{ type: 'bar', barWidth, data: bars.map((r, i) => ({ value: r.v, itemStyle: { color: i ? BAR_SOFT : BAR } })),
        label: { show: true, position: 'right', formatter: (p) => moneyShort(p.value) } }],
    }, true);
    if (d.offsets) rows.push({ k: 'Money earned, taken off', v: -d.offsets, off: true });
    $('#a-dept-table', root).innerHTML = fold(`${esc(d.name)}: kinds of cost, as a table`, table([
      { label: 'Kind of cost', html: (r) => (r.off ? `<i>${esc(r.k)}</i>` : esc(r.k)) },
      { label: 'Amount', num: true, value: (r) => money(r.v) },
    ], rows, { cls: 'narrow' }));
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
  top.on('click', (p) => { state.dept = list[p.dataIndex].name; $('#a-dept', root).value = state.dept; setParams({ dept: state.dept }); drawDept(); $('#a-kinds', root).closest('figure').scrollIntoView({ behavior: 'smooth' }); });
  $('#a-dept', root).addEventListener('change', (ev) => { state.dept = ev.target.value; setParams({ dept: state.dept }); drawDept(); });
  drawDept();
}
