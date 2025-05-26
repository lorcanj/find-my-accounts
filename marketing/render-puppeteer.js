import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const SVG_FILE = path.resolve('marketing/promo-small.svg');
const OUT_PNG = path.resolve('marketing/promo-small-puppeteer.png');

async function run() {
  const svg = fs.readFileSync(SVG_FILE, 'utf8');

  // Ensure the SVG scales to the desired export size by replacing width/height
  const svgFixed = svg
    .replace(/width="[^"]+"/, 'width="1280"')
    .replace(/height="[^"]+"/, 'height="800"');

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
    await page.setViewport({width:1280, height:800, deviceScaleFactor:1});
    await page.setContent(html, {waitUntil: 'networkidle0'});

    // Wait a short time for foreignObject rendering
    await new Promise(r => setTimeout(r, 150));

    await page.screenshot({path: OUT_PNG, clip: {x:0,y:0,width:1280,height:800}});
    console.log('Screenshot written:', OUT_PNG);

    // Basic file info
    const stat = fs.statSync(OUT_PNG);
    console.log('Wrote bytes:', stat.size);
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
