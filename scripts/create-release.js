import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const releasesDir = path.join(rootDir, 'releases');

// ── Version ───────────────────────────────────────────────────────────────────

const manifestPath = path.join(rootDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Error: manifest.json not found.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const version = manifest.version;
if (!version) {
  console.error('Error: manifest.json is missing the "version" field.');
  process.exit(1);
}

console.log(`Creating release for v${version}...\n`);

// ── Validate dist/ ────────────────────────────────────────────────────────────

const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir) || fs.readdirSync(distDir).length === 0) {
  console.error('Error: dist/ is missing or empty. Run `npm run build` first.');
  process.exit(1);
}

// ── releases/ dir ─────────────────────────────────────────────────────────────

fs.mkdirSync(releasesDir, { recursive: true });

// ── Artifact 1: Extension zip ─────────────────────────────────────────────────

const zipName = `find-my-accounts-${version}.zip`;
const zipPath = path.join(releasesDir, zipName);

if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath);
}

const extensionEntries = [
  { src: 'manifest.json' },
  { src: 'dist', isDir: true },
  { src: 'src/popup/popup.html' },
  { src: 'src/popup/popup.css' },
  { src: 'src/assets', isDir: true },
  { src: '_locales', isDir: true },
  { src: 'LICENCE' },
  { src: 'LICENCES', isDir: true },
];

await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);

  for (const { src, isDir } of extensionEntries) {
    const srcPath = path.join(rootDir, src);
    if (!fs.existsSync(srcPath)) {
      archive.abort();
      console.error(`Error: Required item '${src}' not found. Aborting.`);
      process.exit(1);
    }
    if (isDir) {
      archive.directory(srcPath, src);
    } else {
      archive.file(srcPath, { name: src });
    }
  }

  archive.finalize();
});

const zipSize = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`✓ Extension zip:   releases/${zipName} (${zipSize} KB)`);

// ── Artifact 2: Source folder ─────────────────────────────────────────────────

const sourceFolderName = `find-my-accounts-${version}-source`;
const sourceFolderPath = path.join(releasesDir, sourceFolderName);

if (fs.existsSync(sourceFolderPath)) {
  fs.rmSync(sourceFolderPath, { recursive: true, force: true });
}
fs.mkdirSync(sourceFolderPath, { recursive: true });

function copyItem(src, destDir, required = true) {
  const srcPath = path.join(rootDir, src);
  const destPath = path.join(destDir, src);

  if (!fs.existsSync(srcPath)) {
    if (required) {
      console.error(`Error: Required item '${src}' not found. Aborting.`);
      process.exit(1);
    } else {
      console.warn(`  Warning: Optional item '${src}' not found, skipping.`);
      return;
    }
  }

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    for (const item of fs.readdirSync(srcPath)) {
      copyItem(path.join(src, item), destDir, required);
    }
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

const requiredItems = [
  'package.json',
  'package-lock.json',
  'vitest.config.js',
  'manifest.json',
  'README.md',
  'LICENCE',
  'LICENCES',
  'src',
  '_locales',
  'test',
];

for (const item of requiredItems) copyItem(item, sourceFolderPath, true);

console.log(`✓ Source folder:   releases/${sourceFolderName}/`);
console.log('\nDone.');
