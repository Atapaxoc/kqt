// Full-flow smoke test: seeds localStorage with a short 3-question,
// ordered exam using the minimum allowed question time (6s) so we can
// exercise a REAL timeout completion (not just answer/click), then walks
// through Results -> Export -> Review -> Home, asserting invariants along
// the way (correct+wrong+unanswered=total, export triggers a download,
// HOME resets the session).
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const html = await readFile(path.join(projectRoot, 'index.html'), 'utf-8');

const dom = new JSDOM(html, { url: 'http://localhost:8099/index.html', pretendToBeVisual: true });
const { window } = dom;

window.XLSX = XLSX;
window.fetch = async (url) => {
  const rel = String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^\.?\//, '');
  const filePath = path.join(projectRoot, rel);
  try {
    const buf = await readFile(filePath);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } catch {
    return { ok: false, status: 404 };
  }
};

// Seed settings BEFORE app.js loads them at module init: 3 questions,
// ordered (deterministic), 6-second timer (the spec minimum).
window.localStorage.setItem(
  'ttf_exam_app_settings_v1',
  JSON.stringify({
    questionTimeSeconds: 6,
    selectionMode: 'specific_random',
    questionCount: 3,
    panelColor: 'white',
    timerBarColor: '#007FFF',
  })
);

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
window.navigator.serviceWorker = undefined;
Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
window.close = () => {};

let downloadTriggered = 0;
let createdObjectUrls = 0;
window.URL.createObjectURL = () => {
  createdObjectUrls++;
  return 'blob:mock';
};
window.URL.revokeObjectURL = () => {};

const errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));

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
global.URL = window.URL;
global.Blob = window.Blob;

// Patch document.createElement to detect the anchor-click download pattern
// used by utils.downloadTextFile without actually touching a filesystem.
const origCreateElement = window.document.createElement.bind(window.document);
window.document.createElement = (tag) => {
  const node = origCreateElement(tag);
  if (tag === 'a') {
    const origClick = node.click ? node.click.bind(node) : () => {};
    node.click = () => {
      downloadTriggered++;
      try {
        origClick();
      } catch {
        /* jsdom anchor.click() with a blob: href is a no-op; ignore */
      }
    };
  }
  return node;
};

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

await import('../js/app.js');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function click(el) {
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok - ${name}`);
  else {
    failed++;
    console.log(`  FAIL - ${name}`);
  }
}

await sleep(300); // let datasets load
const root = window.document.getElementById('app-root');

click(root.querySelector('.start-button'));
await sleep(20);
click(root.querySelector('.kumite-btn'));
await sleep(20);
check('Q1 active', /Ερώτηση 1 \/ 3/.test(root.querySelector('.progress-indicator').textContent));

// Q1: answer TRUE via button (normal path)
click(root.querySelector('.true-btn'));
await sleep(1300);
check('advanced to Q2', /Ερώτηση 2 \/ 3/.test(root.querySelector('.progress-indicator').textContent));

// Q2: let it time out for real (6s timer + 1.2s transition + buffer)
await sleep(7600);
check('advanced to Q3 after real timeout', /Ερώτηση 3 \/ 3/.test(root.querySelector('.progress-indicator').textContent));

// Q3: answer FALSE
click(root.querySelector('.false-btn'));
await sleep(1300);

check('reached results screen', !!root.querySelector('.results-screen'));
if (root.querySelector('.results-screen')) {
  const statValues = [...root.querySelectorAll('.stat-value')].map((n) => n.textContent);
  check('stats present (total/correct/wrong/unanswered/percentage)', statValues.length === 5);
  const [total, correct, wrong, unanswered] = statValues.map(Number);
  check('total is 3', total === 3);
  check('correct+wrong+unanswered = total', correct + wrong + unanswered === total);
  check('exactly one unanswered (the timeout)', unanswered === 1);
  check('results message box has color styling applied', !!root.querySelector('.results-message-box').style.color);
}

// Export results
const exportBtn = [...root.querySelectorAll('.results-actions button')].find((b) => b.textContent.includes('EXPORT'));
check('export button present', !!exportBtn);
click(exportBtn);
await sleep(50);
check('export created object URLs for both files', createdObjectUrls >= 2);
check('export triggered anchor click(s)', downloadTriggered >= 2);

// Review flow
const reviewBtn = [...root.querySelectorAll('.results-actions button')].find((b) => b.textContent.includes('REVIEW'));
check('review button enabled (there is a wrong/unanswered item)', reviewBtn && !reviewBtn.disabled);
click(reviewBtn);
await sleep(20);
check('review screen shown', !!root.querySelector('.review-screen'));
const reviewCard = root.querySelector('.review-card');
const firstReviewText = reviewCard ? reviewCard.textContent : '';
click(reviewCard);
await sleep(20);
const secondReviewText = root.querySelector('.review-card')?.textContent || '';
check('review advances to a different item on click', firstReviewText !== secondReviewText);

// Back to results, then Home
const backBtn = [...root.querySelectorAll('.results-actions button')].find((b) => b.textContent.includes('Πίσω'));
click(backBtn);
await sleep(20);
check('back to results screen', !!root.querySelector('.results-screen'));

const homeBtn = [...root.querySelectorAll('.results-actions button')].find((b) => b.textContent === 'HOME');
click(homeBtn);
await sleep(20);
check('HOME returns to menu screen', !!root.querySelector('.menu-screen'));

check('no uncaught errors during full flow', errors.length === 0);
if (errors.length) console.log(errors);

console.log(`\nFull-flow smoke test: ${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
