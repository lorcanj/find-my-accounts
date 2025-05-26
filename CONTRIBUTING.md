# Contributing to Find My Accounts

## Prerequisites

### 1. Git

Download and install Git from [git-scm.com](https://git-scm.com/downloads). Accept the defaults during installation.

Verify it works:
```bash
git --version
```

### 2. Node.js and npm

Download and install Node.js (LTS version) from [nodejs.org](https://nodejs.org). npm is included.

Verify:
```bash
node --version
npm --version
```

### 3. VS Code

Download and install VS Code from [code.visualstudio.com](https://code.visualstudio.com). It's free.

Once installed, open the project folder: **File → Open Folder** and select the `find-my-accounts` directory.

The integrated terminal (**Terminal → New Terminal**) is where you'll run all the commands in this guide.

### 4. GitHub account

Create a free account at [github.com](https://github.com) if you don't have one.

---

## Getting the code

Fork the repository on GitHub (click **Fork** in the top right), then clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/find-my-accounts.git
cd find-my-accounts
```

Add the upstream remote so you can pull in future changes:

```bash
git remote add upstream https://github.com/lorcanj/find-my-accounts.git
```

---

## Setup

Install dependencies:

```bash
npm install
```

---

## Development workflow

**Dev build (with source maps):**
```bash
npm run build:dev
```

**Watch mode (rebuilds on file changes):**
```bash
npm run build:watch
```

**Run tests:**
```bash
npm test
```

**Production build:**
```bash
npm run build
```

---

## Making a contribution

1. Create a branch from `main`:
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b your-feature-name
   ```

2. Make your changes, then build and test:
   ```bash
   npm run build:dev
   npm test
   ```

3. Commit and push:
   ```bash
   git add -p          # review changes before staging
   git commit -m "short description of what and why"
   git push origin your-feature-name
   ```

4. Open a pull request on GitHub from your fork's branch to `main`.

---

## Project structure

| Path | Purpose |
|------|---------|
| `src/popup/` | Extension popup UI (HTML, CSS, JS) |
| `src/scanners/` | Email parsing, account detection, key generation |
| `src/data/` | Bundled JustDeleteMe dataset and lookup builder |
| `src/services/` | Orchestration layer (streaming, worker comms) |
| `dist/` | Bundled output — do not edit directly |
| `tests/` | Vitest unit tests |
| `scripts/` | Build and release scripts |

---

## Key constraints

- **No external network requests** — all processing is client-side only. Privacy is a core value.
- **No new browser permissions** unless there is a very strong reason. The zero-permission story is intentional.
- **No UI frameworks** — the extension uses plain JS to stay lean.
- **No main-thread blocking** — heavy work belongs in the Web Worker (`mboxParser.worker.js`).
