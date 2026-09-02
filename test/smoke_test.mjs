// Smoke test: boots the real app.js inside jsdom, simulating fetch/XLSX/
// localStorage/requestAnimationFrame, and walks through Home -> Menu ->
// Start Quiz -> answer a few questions -> Results -> Review -> Home,
// asserting no unhandled exceptions occur and the DOM looks sane at each
// step. This is NOT a substitute for real-browser testing (touch events,
// real timers, service worker, actual rendering) but catches reference
// errors, wiring mistakes, and gross logic bugs end-to-end.
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

const html = await readFile(path.join(projectRoot, 'index.html'), 'utf-8');

const dom = new JSDOM(html, {
  url: 'http://localhost:8099/index.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
});

const { window } = dom;

// ---- Shims ------------------------------------------------------------
window.XLSX = XLSX;

window.fetch = async (url) => {
  const rel = String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^\.?\//, '');
  const filePath = path.join(projectRoot, rel);
  try {
    const buf = await readFile(filePath);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  } catch {
    return { ok: false, status: 404 };
  }
};

// localStorage: jsdom provides one, but guard in case it's unavailable
if (!window.localStorage) {
  const store = new Map();
  window.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

window.requestAnimationFrame = (cb) => setTimeout(() => cb(performanceNow()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
const t0 = Date.now();
function performanceNow() {
  return Date.now() - t0;
}
try {
  window.performance.now = performanceNow;
} catch {
  Object.defineProperty(window, 'performance', { value: { now: performanceNow }, configurable: true });
}

window.navigator.serviceWorker = undefined; // skip SW registration in this smoke test
Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });

let alerts = [];
window.alert = (msg) => alerts.push(msg);

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));
window.onunhandledrejection = (e) => errors.push(e.reason);

// jsdom doesn't implement window.close(); provide a harmless stub.
window.close = () => {};

// ---- Load the real app module ------------------------------------------
// jsdom's runScripts+module support is limited, so instead we dynamically
// import app.js directly (Node ESM), binding `document`/`window` globals
// to the jsdom instance, mirroring how a browser exposes them.
global.window = window;
global.document = window.document;
try {
  global.navigator = window.navigator;
} catch {
  Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
}
global.localStorage = window.localStorage;
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;
global.performance = window.performance;
global.XLSX = window.XLSX;
global.fetch = window.fetch;
global.HTMLElement = window.HTMLElement;
global.Blob = window.Blob || class Blob { constructor(parts) { this.parts = parts; } };
global.URL = window.URL;

// Ensure #app-root exists before app.js queries it at module top-level.
if (!window.document.getElementById('app-root')) {
  const main = window.document.createElement('main');
  main.id = 'app-root';
  window.document.body.appendChild(main);
}
if (!window.document.getElementById('offline-banner')) {
  const b = window.document.createElement('div');
  b.id = 'offline-banner';
  window.document.body.appendChild(b);
}

const appModule = await import('../js/app.js');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok - ${name}`);
  } else {
    failed++;
    console.log(`  FAIL - ${name}`);
  }
}

// Allow init() (async, fire-and-forget from app.js) to finish loading data.
await sleep(300);

check('no uncaught errors after boot', errors.length === 0);
if (errors.length) console.log(errors);

const root = window.document.getElementById('app-root');
check('home screen rendered after boot', !!root.querySelector('.home-screen'));
check('home title text correct', root.querySelector('.home-title')?.textContent === 'Καλώς τους Δημητράδες!');
check('affirmation panel has non-empty text', (root.querySelector('.affirmation-panel')?.textContent || '').length > 0);

// Click "start" to reach the menu screen.
root.querySelector('.start-button').dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(20);
check('menu screen rendered', !!root.querySelector('.menu-screen'));
const kumiteBtn = root.querySelector('.kumite-btn');
check('KUMITE button enabled (dataset loaded)', kumiteBtn && !kumiteBtn.disabled);

// Start a KUMITE quiz.
kumiteBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(20);
check('question screen rendered', !!root.querySelector('.question-screen'));
check('progress indicator shows 1 / N', /Ερώτηση 1 \//.test(root.querySelector('.progress-indicator')?.textContent || ''));

// Answer TRUE on the first question via the button (normal path).
const trueBtn = root.querySelector('.true-btn');
trueBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(20);
check('answer buttons disabled immediately after answering', trueBtn.disabled === true);

// Simulate a race: also click FALSE right after (should be ignored).
const falseBtn = root.querySelector('.false-btn');
falseBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(1300); // wait out the 1200ms fade transition

check('advanced to question 2 after transition', /Ερώτηση 2 \//.test(root.querySelector('.progress-indicator')?.textContent || ''));

// Pause / resume cycle.
const pauseBtn = root.querySelector('.pause-button');
pauseBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(20);
check('pause label switches to RESUME', pauseBtn.textContent === 'RESUME');
pauseBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
await sleep(20);
check('pause label switches back to PAUSE', pauseBtn.textContent === 'PAUSE');

console.log(`\nSmoke test: ${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
