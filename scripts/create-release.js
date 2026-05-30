import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const parentDir = path.resolve(rootDir, '..');

// Read version from manifest.json
const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const version = manifest.version;

const extensionFolderName = `find-my-accounts-${version}`;
const sourceFolderName = `find-my-accounts-${version}-source`;

const extensionFolderPath = path.join(parentDir, extensionFolderName);
const sourceFolderPath = path.join(parentDir, sourceFolderName);

// Helper to copy files/folders
function copyItem(src, dest, required = true) {
  const srcPath = path.join(rootDir, src);
  const destPath = path.join(dest, src);

  if (!fs.existsSync(srcPath)) {
    if (required) {
      console.error(`Error: Required item '${src}' does not exist. Failing release.`);
      process.exit(1);
    } else {
      console.warn(`Warning: Optional item '${src}' does not exist, skipping.`);
      return;
    }
  }

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    const items = fs.readdirSync(srcPath);
    for (const item of items) {
      copyItem(path.join(src, item), dest, required);
    }
  } else {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
  }
}

console.log(`Creating release folders for version ${version}...`);

// 1. Create Extension Folder
console.log(`\nCreating extension folder: ${extensionFolderPath}`);
if (fs.existsSync(extensionFolderPath)) {
  fs.rmSync(extensionFolderPath, { recursive: true, force: true });
}
fs.mkdirSync(extensionFolderPath, { recursive: true });

const extensionItems = [
  'manifest.json',
  'dist',
  'src/popup/popup.html',
  'src/popup/popup.css',
  'src/assets',
  '_locales',
  'LICENCE',
  'LICENCES'
];

for (const item of extensionItems) {
  copyItem(item, extensionFolderPath);
}

// 2. Create Source Folder
console.log(`\nCreating source folder: ${sourceFolderPath}`);
if (fs.existsSync(sourceFolderPath)) {
  fs.rmSync(sourceFolderPath, { recursive: true, force: true });
}
fs.mkdirSync(sourceFolderPath, { recursive: true });

const sourceItems = [
  'package.json',
  'package-lock.json',
  'vitest.config.js',
  'manifest.json',
  'README.md',
  'LICENCE',
  'LICENCES',
  'src',
  '_locales',
  'test'
];

for (const item of sourceItems) {
  copyItem(item, sourceFolderPath);
}

console.log('\nRelease folders created successfully!');
