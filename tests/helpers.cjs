const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const standalone = path.resolve(__dirname, '../dist/nurupuru.html');
function appUrl() { return process.env.NURUPURU_TEST_URL || pathToFileURL(standalone).href; }
function readStandalone() { return fs.readFileSync(standalone, 'utf8'); }

function collectBrowserErrors(page, errors) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}

async function launchBrowser() {
  const candidates = [process.env.NURUPURU_BROWSER, chromium.executablePath()];
  if (process.platform === 'win32') {
    candidates.push(path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'));
  }
  const executablePath = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!executablePath) throw Error('Install a browser with: npx playwright install chromium (or set NURUPURU_BROWSER)');
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
}

module.exports = { appUrl, readStandalone, launchBrowser, collectBrowserErrors };
