import { loadAll } from '../services/data.js';
import { esc } from '../helpers/format.js';
import { ext } from '../helpers/dom.js';
import { EDGE_KINDS } from '../enums/kinds.js';

export const title = 'About';

export async function render(root) {
  const [s] = await loadAll('summary');
  root.innerHTML = `
    <h1>About this site</h1>
    <p class="lead">This site is an independent map of the public
      ${ext(s.source_repo, 'Vesper-Digital/Evidence-Archive')} repository. It does not add facts. It reads the archive's files,
      draws the connections they describe, and links every one back to its file.</p>

    <h2>How the data is made</h2>
    <ol>
      <li><b>Automatic extraction.</b> <code>pipeline/build_data.py</code> reads the spreadsheets, PDFs, 7-Zip and zip files in
        the archive. That covers the Lobbying Registry tables, the Brookfield ownership table, every Estimates CSV and the
        survey microdata.</li>
      <li><b>Hand transcription.</b> Slides and images can't be read automatically. Facts from them are typed into
        <code>pipeline/curated.json</code> with the file and slide number, and quoted word for word.</li>
      <li><b>Checks.</b> The build cross-checks totals, row counts and published figures, and reports any difference it finds.</li>
    </ol>

    <h2>Kinds of evidence</h2>
    <ul>${['data', 'stated', 'computed'].map((k) => `<li><b>${esc(EDGE_KINDS[k].label)}:</b> ${esc(EDGE_KINDS[k].help)}</li>`).join('')}</ul>
    <p>Claims from case titles and video titles appear as <b>claims</b>. They link to the documents that support or test them.
      A link between two items means a document connects them. It does not mean anyone did anything wrong.</p>

    <h2>Limits</h2>
    <ul>
      <li>This site only covers what is in the archive. It does not check the archive against outside records unless the
        archive itself links to them.</li>
      <li>In the Estimates transfer tables, when one transfer has several givers and several receivers, the table does not
        say who paid whom. Those amounts are split in proportion and marked ≈.</li>
      <li>Hand-transcribed slide text can contain typing errors. Each fact links to the slide so you can check it.</li>
    </ul>

    <h2>Found a mistake?</h2>
    <p>Open an issue in this site's repository. Include the page, the item, and the archive file that shows the correct value.</p>`;
}
