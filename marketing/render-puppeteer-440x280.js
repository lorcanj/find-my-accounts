import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const SVG_FILE = path.resolve('marketing/promo-small.svg');
const OUT_PNG = path.resolve('marketing/promo-small-440x280.png');
const OUT_JPG = path.resolve('marketing/promo-small-440x280.jpg');

async function run() {
  const svg = fs.readFileSync(SVG_FILE, 'utf8');

  // Force the SVG to the exact canvas size we want
  const svgFixed = svg
    .replace(/width="[^"]+"/, 'width="440"')
    .replace(/height="[^"]+"/, 'height="280"');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <style>html,body{margin:0;height:100%;background:#ffffff}</style>
    </head>
    <body>
      ${svgFixed}
    </body>
  </html>`;

  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
  try {
    const page = await browser.newPage();
    await page.setViewport({width:440, height:280, deviceScaleFactor:1});
    await page.setContent(html, {waitUntil: 'networkidle0'});

    // small wait for foreignObject to render in some engines
    await new Promise(r => setTimeout(r, 150));

    await page.screenshot({path: OUT_PNG, clip: {x:0,y:0,width:440,height:280}});
    console.log('Wrote PNG:', OUT_PNG);

    await page.screenshot({path: OUT_JPG, type: 'jpeg', quality: 92, clip: {x:0,y:0,width:440,height:280}});
    console.log('Wrote JPEG:', OUT_JPG);

    const statP = fs.statSync(OUT_PNG);
    const statJ = fs.statSync(OUT_JPG);
    console.log('Sizes (bytes):', statP.size, statJ.size);
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
