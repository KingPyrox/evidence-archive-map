import { loadAll } from '../services/data.js';
import { esc, int } from '../helpers/format.js';
import { ext } from '../helpers/dom.js';
import { EDGE_KINDS } from '../enums/kinds.js';
import { GLOSSARY, GLOSSARY_SOURCE } from '../enums/glossary.js';

export const title = 'About';

const VESPER_YT = 'https://www.youtube.com/@Vesperdigital';

export async function render(root) {
  const [s] = await loadAll('summary');
  const c = s.counts;
  root.innerHTML = `
    <h1>About this site</h1>
    <p class="lead">This site makes Vesper Digital's Evidence-Archive easier to explore. It does not add facts of its own.</p>

    <section class="panel credit-panel">
      <h2>The data comes from Vesper Digital</h2>
      <p>Every document, table and number on this site comes from the work of <b>Vesper Digital</b>. Vesper found,
        recovered and published these records in the ${ext(s.source_repo, 'Evidence-Archive')}, case by case, with a video for
        each case. That includes ${int(c.files)} files across ${s.cases.length} cases, and the federal Estimates tables Vesper
        recovered after they went missing from the government's open data catalogue.</p>
      <p>This site only reads Vesper's files and turns them into charts. Every chart and number links back to the exact file
        in Vesper's archive, so you can check it yourself.</p>
      <div class="btn-row">
        <a class="btn" href="${esc(s.source_repo)}" target="_blank" rel="noopener">Open Vesper's Evidence-Archive ↗</a>
        <a class="btn secondary" href="${VESPER_YT}" target="_blank" rel="noopener">Watch Vesper on YouTube ↗</a>
      </div>
    </section>

    <h2>Words used on this site</h2>
    <p>Government budget records use a lot of special words. Here they are in plain language.</p>
    <dl class="glossary">${Object.values(GLOSSARY).map((g) => `<div><dt>${esc(g.word)}</dt><dd>${esc(g.means)}</dd></div>`).join('')}</dl>
    <p class="small muted">The Estimates words follow the ${ext(GLOSSARY_SOURCE, 'Treasury Board of Canada Secretariat')}.</p>

    <h2>Kinds of evidence</h2>
    <ul>${['data', 'stated', 'computed'].map((k) => `<li><b>${esc(EDGE_KINDS[k].label)}:</b> ${esc(EDGE_KINDS[k].help)}</li>`).join('')}</ul>
    <p>Claims from case titles and video titles appear as <b>claims</b>. They link to the documents that support or test them.
      A line between two names means a document in the archive connects them. It does not mean anyone did anything wrong.</p>

    <h2>How the data is made</h2>
    <ol>
      <li><b>Automatic extraction.</b> A build script reads the spreadsheets, PDFs, 7-Zip and zip files in Vesper's archive:
        the Lobbying Registry tables, the Brookfield ownership table, every Estimates CSV and the survey file.</li>
      <li><b>Hand transcription.</b> Slides and images can't be read automatically. Facts from them are typed in by hand with
        the file and slide number, and quoted word for word.</li>
      <li><b>Checks.</b> The build cross-checks totals, row counts and published figures, and reports any difference it finds
        on the <a href="#/sources">Sources</a> page. The site checks Vesper's archive for changes once a day.</li>
    </ol>

    <h2>Limits</h2>
    <ul>
      <li>This site only covers what is in Vesper's archive. It does not check the archive against outside records unless the
        archive itself links to them.</li>
      <li>In the Estimates transfer tables, when one transfer has several givers and several receivers, the table does not
        say who paid whom. Those amounts are split in proportion and marked ≈.</li>
      <li>Hand-transcribed slide text can contain typing errors. Each fact links to the slide so you can check it.</li>
    </ul>

    <h2>Found a mistake?</h2>
    <p>${ext('https://github.com/KingPyrox/evidence-archive-map/issues', 'Report it on GitHub')}. Include the page, the item, and
      the archive file that shows the correct value.</p>`;
}
