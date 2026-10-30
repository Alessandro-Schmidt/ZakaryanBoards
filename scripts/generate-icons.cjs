// Renders the app icons in public/icons from src/lib/logo.ts (Aurora theme).
// Needs Playwright with Chromium: `node scripts/generate-icons.cjs`
const { chromium } = require('playwright');
const { createServer } = require('vite');
const fs = require('fs');
const path = require('path');

const ICONS = [
  ['icon-192.png', 192, 'rounded'],
  ['icon-512.png', 512, 'rounded'],
  ['icon-1024.png', 1024, 'rounded'],
  ['maskable-192.png', 192, 'maskable'],
  ['maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'square'],
  ['favicon-32.png', 32, 'rounded'],
];

(async () => {
  const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5199/');
  const out = path.join(__dirname, '..', 'public', 'icons');
  fs.mkdirSync(out, { recursive: true });
  for (const [file, size, shape] of ICONS) {
    const url = await page.evaluate(async ([size, shape]) => {
      const { drawLogo } = await import('/src/lib/logo.ts');
      const { themeById } = await import('/src/theme.ts');
      await document.fonts.load(`italic 500 ${size}px "Bodoni Moda"`);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      drawLogo(c.getContext('2d'), size, themeById('aurora'), shape);
      return c.toDataURL('image/png');
    }, [size, shape]);
    fs.writeFileSync(path.join(out, file), Buffer.from(url.split(',')[1], 'base64'));
    console.log(file);
  }
  await browser.close();
  await server.close();
})();
