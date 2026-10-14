import { build, transform } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildLegalPages } from './build-legal.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = process.argv.includes('--pages');
const destination = path.join(root, pages ? 'dist/pages' : 'dist');
const name = pages ? 'index.html' : 'nurupuru.html';
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
  legalComments: 'none',
  minify: true,
});
const [template, css, theme] = await Promise.all([
  readFile(path.join(root, 'index.html'), 'utf8'),
  readFile(path.join(root, 'src/styles.css'), 'utf8'),
  readFile(path.join(root, 'src/theme-init.js'), 'utf8'),
]);
const [styles, themeScript] = await Promise.all([
  transform(css, { loader: 'css', minify: true }),
  transform(theme, { loader: 'js', minify: true, target: 'es2022', charset: 'utf8', legalComments: 'none' }),
]);
const replacements = [
  ['<link rel="stylesheet" href="./src/styles.css">', `<style>\n${styles.code}\n</style>`],
  ['<script src="./src/theme-init.js"></script>', `<script>\n${themeScript.code}\n</script>`],
  ['<script type="module" src="./src/main.js"></script>', `<script>\n${result.outputFiles[0].text}\n</script>`],
];
let html = template;
for (const [marker, inline] of replacements) {
  if (html.split(marker).length !== 2) throw Error(`Missing or repeated build marker: ${marker}`);
  html = html.replace(marker, () => inline);
}
const [license, notices] = await Promise.all(['LICENSE', 'THIRD_PARTY_NOTICES.txt'].map(name => readFile(path.join(root, name), 'utf8')));
html = html.replace('<head>', `<head>\n<!-- Nurupuru — Unlicense\n${license.trim()}\n\n${notices.trim()}\n-->`);
await mkdir(destination, { recursive: true });
const output = path.join(destination, name);
await writeFile(output, html, 'utf8');
await buildLegalPages(root, { destination, appHref: name });
console.log(`Built ${path.relative(root, output)} (${Buffer.byteLength(html).toLocaleString()} bytes)`);
