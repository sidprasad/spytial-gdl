import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSpytialGdl, solveSpytialGdl, sourceDiagnostics } from 'spytial-gdl';
import * as core from 'spytial-core';

const require = createRequire(import.meta.url);

function reportDiagnostics(input, diagnostics) {
  for (const { severity, line, message } of diagnostics) {
    const location = line == null ? input : `${input}:${line}`;
    console.error(`${location}: ${severity}: ${message}`);
  }
  if (diagnostics.some(({ severity }) => severity === 'error')) {
    throw new Error('The diagram has errors.');
  }
}

function checkSource(input, source) {
  const compiled = compileSpytialGdl(source);
  reportDiagnostics(input, sourceDiagnostics(compiled.annotationErrors, compiled.parseErrors));
  if (!compiled.ok) throw new Error(compiled.reason);

  const solved = solveSpytialGdl(core, compiled);
  reportDiagnostics(input, solved.diagnostics);
  if (solved.error) {
    const message = solved.error.message.replace(/<span\b[^>]*>|<\/span>/g, '');
    throw new Error(message);
  }
  if (!solved.layout) throw new Error('Spytial returned no layout.');
  console.log(`Checked ${input} (${compiled.parsed.nodes.size} nodes, ${compiled.parsed.edges.length} edges)`);
}

// Script data URLs keep the page independent of a server or CDN. Encode the
// graph as JSON separately so a display label cannot end a script element.
async function previewHtml(source) {
  const { build } = await import('esbuild');
  const [engine, app] = await Promise.all([
    readFile(require.resolve('spytial-core/global')),
    build({
      entryPoints: [fileURLToPath(new URL('preview.js', import.meta.url))],
      bundle: true,
      format: 'iife',
      minify: true,
      write: false,
    }),
  ]);
  const asScript = (script) => `<script src="data:text/javascript;base64,${Buffer.from(script).toString('base64')}"></script>`;
  const sourceJson = JSON.stringify(source).replaceAll('<', '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spytial diagram</title>
  <style>
    body { margin: 16px; font: 16px system-ui, sans-serif; }
    #diagram { max-width: 960px; }
  </style>
</head>
<body>
  <main>
    <div id="diagram"></div>
    <p id="status" role="status">Rendering diagram…</p>
    <button id="download" hidden>Download PNG</button>
  </main>
  <script type="application/json" id="source">${sourceJson}</script>
  ${asScript(engine)}
  ${asScript(app.outputFiles[0].contents)}
</body>
</html>
`;
}

async function exportPng(html, output) {
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new Error(`Could not start Chromium. Install it with Playwright or export HTML and open it in a browser.\n${error.message}`);
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
    await page.setContent(html);
    const status = await page.waitForFunction(() => document.querySelector('#status').dataset.state);
    if (await status.jsonValue() !== 'ready') {
      throw new Error(await page.locator('#status').textContent());
    }
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.getByRole('button', { name: 'Download PNG' }).click(),
    ]);
    await download.saveAs(output);
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node render.mjs diagram.gdl [diagram.png | diagram.html]');
    return;
  }
  const [input, output] = args;
  const format = extname(output ?? '').toLowerCase();
  if (args.length < 1 || args.length > 2 || (output && !['.png', '.html'].includes(format))) {
    throw new Error('Usage: node render.mjs diagram.gdl [diagram.png | diagram.html]');
  }
  const source = await readFile(input, 'utf8');
  checkSource(input, source);
  if (!output) return;

  const html = await previewHtml(source);
  if (format === '.png') await exportPng(html, output);
  else await writeFile(output, html);
  console.log(`Wrote ${output}`);
}

try {
  await main();
} catch (error) {
  console.error(`spytial-gdl: ${error.message}`);
  process.exitCode = 1;
}
