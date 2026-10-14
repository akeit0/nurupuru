import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDevServer } from './dev-server.mjs';

// Regenerate the committed card when its copy or the sample character changes.
// Use a system Japanese font; normal builds copy the JPEG without launching a browser.
const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = [process.env.NURUPURU_BROWSER, chromium.executablePath()];
if (process.platform === 'win32') candidates.push(path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'));
const executablePath = candidates.find(candidate => candidate && existsSync(candidate));
if (!executablePath) throw Error('Install Chromium with npx playwright install chromium, or set NURUPURU_BROWSER');
const server = createDevServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const jpeg = await page.evaluate(async () => {
    const { createDemo } = await import('/src/demo.js');
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;canvas.height = 630;
    const ctx = canvas.getContext('2d');
    const background = ctx.createLinearGradient(0, 0, 1200, 630);
    background.addColorStop(0, '#fcf9ff');
    background.addColorStop(.6, '#f2eaff');
    background.addColorStop(1, '#e5e4fc');
    ctx.fillStyle = background;ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = '#ffffff66';
    ctx.beginPath();ctx.ellipse(964, 280, 276, 280, .35, 0, Math.PI * 2);ctx.fill();
    ctx.fillStyle = '#ffffff50';
    ctx.beginPath();ctx.ellipse(95, 620, 300, 145, -.15, 0, Math.PI * 2);ctx.fill();

    const font = '"Yu Gothic", "Noto Sans CJK JP", "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#35264f';ctx.font = `700 96px ${font}`;
    ctx.fillText('ぬるぷる', 76, 219);
    ctx.fillStyle = '#7c659e';ctx.font = `600 27px ${font}`;
    ctx.fillText('Nurupuru', 83, 265);
    ctx.fillStyle = '#493956';ctx.font = `700 43px ${font}`;
    ctx.fillText('画像を、', 80, 367);
    ctx.fillText('ぷるぷる動かそう。', 80, 431);
    ctx.fillStyle = '#766784';ctx.font = `500 25px ${font}`;
    ctx.fillText('無料  ·  PC / スマホ', 83, 548);

    ctx.save();ctx.translate(925, 537);ctx.scale(1, .12);
    const shadow = ctx.createRadialGradient(0, 0, 5, 0, 0, 190);
    shadow.addColorStop(0, '#7861b430');shadow.addColorStop(1, '#7861b400');
    ctx.fillStyle = shadow;ctx.fillRect(-190, -190, 380, 380);ctx.restore();
    ctx.drawImage(createDemo(false), 255, 175, 460, 450, 704, 114, 440, 430);
    return canvas.toDataURL('image/jpeg', .9).split(',')[1];
  });
  const output = path.join(root, 'assets/social-card.jpg');
  await mkdir(path.dirname(output), { recursive: true });
  const bytes = Buffer.from(jpeg, 'base64');
  await writeFile(output, bytes);
  console.log(`Built assets/social-card.jpg (1200 × 630, ${bytes.length.toLocaleString()} bytes)`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
