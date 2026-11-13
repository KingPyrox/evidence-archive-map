import { loadAll } from '../services/data.js';
import { esc, int } from '../helpers/format.js';
import { $, table, ext } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';

export const title = 'Survey check';

export async function render(root) {
  const [sv, s] = await loadAll('survey', 'summary');
  const answers = sv.rows.filter((r) => r.published_pct != null);
  const skip = sv.rows.find((r) => r.code === '6');
  const notStated = sv.rows.find((r) => r.code === '9');
  const tallyByLabel = sv.tally;
  const tallyOf = (r) => tallyByLabel[r.label];
  const misCase = s.cases.find((c) => c.id === 'case:misinformation');
  const checks = s.checks.filter((c) => c.name.startsWith('Survey'));
  const dictPage = sv.dictionary.page;

  root.innerHTML = `
    <h1>Survey check: “The stats don't add up”</h1>
    <p class="lead">The misinformation case says a Statistics Canada article's numbers do not match the survey behind it. The
      archive includes the article, the raw survey file and StatCan's documentation, so the numbers can be checked directly.</p>

    <div class="callout ok"><b>What the files show.</b> StatCan's published percentages come out exactly when you do what the
      article describes: count only people who used the Internet to find COVID-19 information, and apply the survey weights
      that StatCan's documentation says to use. The archive's spreadsheet counts raw answers from everyone, including the
      ${int(skip.raw)} people who skipped the question, so its percentages are lower.</div>

    <h2>The question</h2>
    <blockquote>${esc(sv.question)}</blockquote>
    <p class="small">Variable FC_25 in Canadian Perspectives Survey Series 4 (CPSS4), collected July 20 to 26, 2020.</p>

    <h2>Three ways to count the same answers</h2>
    <div class="panel"><div id="sv-chart" class="chart"></div></div>
    ${table([
      { label: 'Answer', value: (r) => r.label },
      { label: 'Raw answers (survey file)', num: true, value: (r) => int(r.raw) },
      { label: 'Archive spreadsheet tally', num: true, value: (r) => int(tallyOf(r)) },
      { label: 'Raw as % of all 4,218', num: true, value: (r) => `${r.raw_pct_all}%` },
      { label: 'Weighted % of those asked', num: true, value: (r) => (r.weighted_pct != null ? `${r.weighted_pct}%` : '—') },
      { label: 'StatCan published', num: true, value: (r) => (r.published_pct != null ? `${r.published_pct}%` : '—') },
    ], sv.rows.filter((r) => r.code !== '9').map((r) => (r.code === '6' ? { ...r, label: 'Valid skip', raw: r.raw } : r)))}
    <p class="small muted">${int(notStated.raw)} people gave no answer (“Not stated”). The spreadsheet's last row is labelled
      “(Don't know, Refusal not allowed)” and holds ${int(tallyByLabel["(Don't know, Refusal not allowed)"])}; the survey file
      has ${int(skip.raw)} valid skips plus ${int(notStated.raw)} not stated.</p>

    <h2>Step by step</h2>
    <ol>
      <li><b>Who was asked.</b> The article's figure is about “Canadians who used the Internet to find information”. The
        ${int(skip.raw)} respondents coded <i>Valid skip</i> did not get this question, so they are left out.
        <div class="src">${ext(sv.article.url, 'StatCan article')}<blockquote>${esc(sv.article.quote)}</blockquote></div></li>
      <li><b>Weights.</b> Each respondent stands for a number of Canadians. The file's weight column, <code>${esc(sv.weight_var)}</code>,
        adds up to ${int(sv.population)} people. StatCan's microdata guide shows its own example using <code>weight PERS_WGT</code>.</li>
      <li><b>Result.</b> With weights and without the skips, the shares are
        ${answers.map((r) => `${esc(r.label.toLowerCase())} ${r.weighted_pct}%`).join(', ')}. Rounded, that is
        ${answers.map((r) => `${r.published_pct}%`).join(' / ')}, the same as the article.</li>
      <li><b>StatCan's own data dictionary agrees.</b> Page ${dictPage} of the CPSS4 data dictionary in the same zip prints the
        same raw and weighted counts for FC_25 that this site computed from the survey file.</li>
      <li><b>One real discrepancy.</b> The archive's spreadsheet tally adds up to ${int(sv.tally_total)} answers. The survey
        file and the data dictionary both have ${int(sv.records)}. Four answer counts are each one lower in the spreadsheet.</li>
    </ol>

    <h2>The “$3.38M in federal grants” claim</h2>
    <p>That figure is in the case's video title. The case thumbnail (<code>Tim.jpg</code>) shows three Canadian Institutes of
      Health Research (CIHR) grant cards: “Coronavirus Outbreak: Mapping and Countering Misinformation” $381,708, “Healthy
      Information Ecosystems” $1,500,000 and “Misinformation and Public Health” $1,500,000. Together that is $3,381,708,
      which matches the $3.38M. The grant records themselves are not in the archive, and the cards do not name who received
      them. The text files in the case (the article, the survey zip and the spreadsheet) do not mention Tim Caulfield. The map
      shows the $3.38M as a claim linked to the thumbnail.</p>

    <h2>Checks run on every build</h2>
    ${table([
      { label: 'Check', value: (c) => c.name },
      { label: 'Result', html: (c) => (c.pass ? '<span class="badge ok">matches</span>' : `<span class="badge warn">differs</span> expected ${esc(c.expected)}, found ${esc(c.actual)}`) },
    ], checks)}

    <h2>Files used</h2>
    <ul class="small">
      <li>${ext(sv.zip_url, 'Government Questionaires and Findings.zip')}, which holds the survey file (${esc(sv.csv.split('/').pop())}), the data dictionary and the guides</li>
      <li>${ext(sv.xlsx_url, 'misinformation Statscan.xlsx')} (the archive's tally)</li>
      <li>${ext(`https://github.com/Vesper-Digital/Evidence-Archive/blob/main/${encodeURIComponent(sv.article.file).replace(/%2F/g, '/')}`, 'The StatCan article (PDF copy)')}</li>
      ${misCase ? `<li>${ext(misCase.video_url, 'The case video')}</li>` : ''}
    </ul>`;

  chart($('#sv-chart', root), {
    legend: { top: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${v}%` },
    grid: { left: 10, right: 20, top: 40, bottom: 10, containLabel: true },
    xAxis: { type: 'category', data: answers.map((r) => r.label) },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: [
      { name: 'StatCan published', type: 'bar', data: answers.map((r) => r.published_pct), itemStyle: { color: '#1d4ed8' } },
      { name: 'Weighted, people asked (this site)', type: 'bar', data: answers.map((r) => r.weighted_pct), itemStyle: { color: '#12b76a' } },
      { name: 'Raw count ÷ all 4,218 (spreadsheet method)', type: 'bar', data: answers.map((r) => r.raw_pct_all), itemStyle: { color: '#f79009' } },
    ],
  });
}
