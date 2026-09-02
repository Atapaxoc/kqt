// Node-based test harness for the framework-agnostic core modules.
// Not part of the shipped app; run with: node test/run_logic_tests.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import XLSX from 'xlsx';

// ---- global shims so excel.js (browser code) can run under Node ----------
global.XLSX = XLSX;
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

global.fetch = async (p) => {
  const filePath = path.resolve(projectRoot, p);
  try {
    const buf = await readFile(filePath);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  } catch (err) {
    return { ok: false, status: 404 };
  }
};
global.window = { location: { hostname: 'localhost' } };
global.console.error = () => {}; // silence expected error logging during negative tests

const { loadQuestionDataset, loadAffirmations } = await import('../js/excel.js');
const { QuizSession, buildQuestionSelection, QuestionStatus } = await import('../js/quiz.js');
const { AppState, AppStateMachine } = await import('../js/state.js');
const { fisherYatesShuffle, pickRandomN, normalizeBoolAnswer, isPositiveInteger, csvEscape } = await import('../js/utils.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL - ${name}`);
    console.log('    ', err.message);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL - ${name}`);
    console.log('    ', err.message);
  }
}

console.log('== excel.js: real sample dataset loading ==');
await testAsync('qkumite.xlsx loads and validates', async () => {
  const result = await loadQuestionDataset('data/qkumite.xlsx');
  assert.equal(result.valid, true, result.errorMessage);
  assert.ok(result.questions.length >= 30);
  assert.equal(result.questions[0].number, 1);
  assert.ok(['TRUE', 'FALSE'].includes(result.questions[0].answer));
});

await testAsync('qkata.xlsx loads and validates', async () => {
  const result = await loadQuestionDataset('data/qkata.xlsx');
  assert.equal(result.valid, true, result.errorMessage);
  assert.ok(result.questions.length >= 30);
});

await testAsync('mini-affirmations.xlsx loads texts', async () => {
  const texts = await loadAffirmations();
  assert.ok(texts.length >= 10);
  assert.ok(texts.every((t) => typeof t === 'string' && t.length > 0));
});

await testAsync('missing file returns invalid, not a throw', async () => {
  const result = await loadQuestionDataset('data/does-not-exist.xlsx');
  assert.equal(result.valid, false);
  assert.ok(result.errorMessage.length > 0);
});

await testAsync('missing affirmations file falls back to default message', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });
  const texts = await loadAffirmations();
  assert.deepEqual(texts, ['Καλή επιτυχία στην προσπάθειά σου Αγάπη μου!']);
  global.fetch = origFetch;
});

console.log('== excel.js: validation edge cases (synthetic workbooks) ==');
function makeWorkbook(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return wb;
}
function mockFetchWorkbook(rows) {
  const wb = makeWorkbook(rows);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  global.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => buf });
}

await testAsync('rejects dataset with a numbering gap', async () => {
  mockFetchWorkbook([
    ['Number', 'Question', 'Answer'],
    [1, 'Q1', 'TRUE'],
    [2, 'Q2', 'FALSE'],
    [4, 'Q4', 'TRUE'],
  ]);
  const result = await loadQuestionDataset('data/x.xlsx');
  assert.equal(result.valid, false);
  assert.equal(result.errorCode, 'INVALID_NUMBERING');
});

await testAsync('rejects dataset with duplicate numbers', async () => {
  mockFetchWorkbook([
    ['Number', 'Question', 'Answer'],
    [1, 'Q1', 'TRUE'],
    [2, 'Q2', 'FALSE'],
    [2, 'Q2b', 'TRUE'],
  ]);
  const result = await loadQuestionDataset('data/x.xlsx');
  assert.equal(result.valid, false);
  assert.equal(result.errorCode, 'INVALID_NUMBERING');
});

await testAsync('accepts unsorted-but-complete numbering (re-sorts)', async () => {
  mockFetchWorkbook([
    ['Number', 'Question', 'Answer'],
    [3, 'Q3', 'TRUE'],
    [1, 'Q1', 'FALSE'],
    [2, 'Q2', 'TRUE'],
  ]);
  const result = await loadQuestionDataset('data/x.xlsx');
  assert.equal(result.valid, true, result.errorMessage);
  assert.deepEqual(result.questions.map((q) => q.number), [1, 2, 3]);
});

await testAsync('drops row with invalid TRUE/FALSE, re-validates numbering', async () => {
  mockFetchWorkbook([
    ['Number', 'Question', 'Answer'],
    [1, 'Q1', 'TRUE'],
    [2, 'Q2', 'MAYBE'], // invalid answer -> dropped
    [3, 'Q3', 'TRUE'],
  ]);
  const result = await loadQuestionDataset('data/x.xlsx');
  // After dropping row 2, remaining numbers are 1,3 -> gap -> invalid dataset
  assert.equal(result.valid, false);
  assert.equal(result.errorCode, 'INVALID_NUMBERING');
});

await testAsync('normalizes TRUE/FALSE case and whitespace', async () => {
  mockFetchWorkbook([
    ['Number', 'Question', 'Answer'],
    [1, 'Q1', ' true '],
    [2, 'Q2', 'False'],
  ]);
  const result = await loadQuestionDataset('data/x.xlsx');
  assert.equal(result.valid, true, result.errorMessage);
  assert.equal(result.questions[0].answer, 'TRUE');
  assert.equal(result.questions[1].answer, 'FALSE');
});

await testAsync('ignores fully blank rows', async () => {
  mockFetchWorkbook([
    ['Number', 'Question', 'Answer'],
    [1, 'Q1', 'TRUE'],
    ['', '', ''],
    [2, 'Q2', 'FALSE'],
  ]);
  const result = await loadQuestionDataset('data/x.xlsx');
  assert.equal(result.valid, true, result.errorMessage);
  assert.equal(result.questions.length, 2);
});

await testAsync('empty workbook (header only) is invalid', async () => {
  mockFetchWorkbook([['Number', 'Question', 'Answer']]);
  const result = await loadQuestionDataset('data/x.xlsx');
  assert.equal(result.valid, false);
});

await testAsync('preserves Greek UTF-8 text exactly', async () => {
  mockFetchWorkbook([
    ['Number', 'Question', 'Answer'],
    [1, 'Η Αθήνα είναι η πρωτεύουσα της Ελλάδας.', 'TRUE'],
  ]);
  const result = await loadQuestionDataset('data/x.xlsx');
  assert.equal(result.valid, true, result.errorMessage);
  assert.equal(result.questions[0].question, 'Η Αθήνα είναι η πρωτεύουσα της Ελλάδας.');
});

console.log('== utils.js ==');
test('fisherYatesShuffle preserves all elements, does not mutate input', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = input.slice();
  const shuffled = fisherYatesShuffle(input);
  assert.deepEqual(input, copy); // not mutated
  assert.deepEqual(shuffled.slice().sort((a, b) => a - b), copy);
});

test('pickRandomN returns exactly N unique items', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const picked = pickRandomN(input, 10);
  assert.equal(picked.length, 10);
  assert.equal(new Set(picked).size, 10);
});

test('normalizeBoolAnswer handles valid/invalid', () => {
  assert.equal(normalizeBoolAnswer(' TRUE '), 'TRUE');
  assert.equal(normalizeBoolAnswer('false'), 'FALSE');
  assert.equal(normalizeBoolAnswer('yes'), null);
  assert.equal(normalizeBoolAnswer('1'), null);
});

test('isPositiveInteger', () => {
  assert.equal(isPositiveInteger(5), true);
  assert.equal(isPositiveInteger('5'), true);
  assert.equal(isPositiveInteger(0), false);
  assert.equal(isPositiveInteger(-1), false);
  assert.equal(isPositiveInteger(1.5), false);
  assert.equal(isPositiveInteger(''), false);
});

test('csvEscape quotes fields containing commas/quotes/newlines', () => {
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('a"b'), '"a""b"');
});

console.log('== quiz.js: selection modes ==');
const sampleDataset = Array.from({ length: 30 }, (_, i) => ({
  number: i + 1,
  question: `Q${i + 1}`,
  answer: i % 2 === 0 ? 'TRUE' : 'FALSE',
}));

test('specific_random: exact N, no duplicates', () => {
  const sel = buildQuestionSelection(sampleDataset, { selectionMode: 'specific_random', questionCount: 12 });
  assert.equal(sel.ok, true);
  assert.equal(sel.questions.length, 12);
  assert.equal(new Set(sel.questions.map((q) => q.number)).size, 12);
});

test('specific_random: N > available -> error, does not throw', () => {
  const sel = buildQuestionSelection(sampleDataset, { selectionMode: 'specific_random', questionCount: 999 });
  assert.equal(sel.ok, false);
  assert.ok(sel.errorMessage.length > 0);
});

test('all_ordered: exactly 1..N in order', () => {
  const sel = buildQuestionSelection(sampleDataset, { selectionMode: 'all_ordered', questionCount: 0 });
  assert.equal(sel.ok, true);
  assert.deepEqual(sel.questions.map((q) => q.number), sampleDataset.map((q) => q.number));
});

test('all_random: all present exactly once, order may differ', () => {
  const sel = buildQuestionSelection(sampleDataset, { selectionMode: 'all_random', questionCount: 0 });
  assert.equal(sel.ok, true);
  assert.equal(sel.questions.length, sampleDataset.length);
  assert.equal(new Set(sel.questions.map((q) => q.number)).size, sampleDataset.length);
});

console.log('== quiz.js: QuizSession core mechanics ==');
test('completeCurrentQuestion is idempotent (only first call wins)', () => {
  const session = new QuizSession('KUMITE', sampleDataset.slice(0, 3), { questionTimeSeconds: 15 });
  const first = session.completeCurrentQuestion('answer', 'TRUE');
  const second = session.completeCurrentQuestion('timeout', null); // race: should be ignored
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(session.currentItem.completionReason, 'answer');
  assert.equal(session.currentItem.userAnswer, 'TRUE');
});

test('correct/wrong/unanswered classification', () => {
  const session = new QuizSession('KUMITE', sampleDataset.slice(0, 3), { questionTimeSeconds: 15 });
  // Q1 correctAnswer = TRUE
  session.completeCurrentQuestion('answer', 'TRUE'); // correct
  session.advance();
  session.completeCurrentQuestion('answer', 'TRUE'); // Q2 correctAnswer FALSE -> wrong
  session.advance();
  session.completeCurrentQuestion('timeout', null); // unanswered
  const results = session.getResults();
  assert.equal(results.correct, 1);
  assert.equal(results.wrong, 1);
  assert.equal(results.unanswered, 1);
  assert.equal(results.total, 3);
  assert.equal(results.correct + results.wrong + results.unanswered, results.total);
});

test('getReviewItems returns only WRONG/UNANSWERED, preserves order', () => {
  const session = new QuizSession('KATA', sampleDataset.slice(0, 4), { questionTimeSeconds: 15 });
  // sampleDataset correct answers: Q1=TRUE, Q2=FALSE, Q3=TRUE, Q4=FALSE
  session.completeCurrentQuestion('answer', 'TRUE'); // Q1 TRUE == TRUE -> correct
  session.advance();
  session.completeCurrentQuestion('answer', 'TRUE'); // Q2 TRUE != FALSE -> wrong
  session.advance();
  session.completeCurrentQuestion('timeout', null); // Q3 -> unanswered
  session.advance();
  session.completeCurrentQuestion('answer', 'FALSE'); // Q4 FALSE == FALSE -> correct
  const review = session.getReviewItems();
  assert.equal(review.length, 2);
  assert.deepEqual(review.map((r) => r.number), [2, 3]);
});

test('does not mutate original dataset array', () => {
  const original = sampleDataset.map((q) => ({ ...q }));
  const session = new QuizSession('KUMITE', sampleDataset, { questionTimeSeconds: 15 });
  session.completeCurrentQuestion('answer', 'TRUE');
  assert.deepEqual(sampleDataset, original);
});

console.log('== state.js: transition guards ==');
test('QUESTION_PAUSED can only go back to QUESTION_ACTIVE', () => {
  const m = new AppStateMachine(AppState.QUESTION_PAUSED);
  assert.equal(m.transition(AppState.RESULTS), false);
  assert.equal(m.transition(AppState.HOME), false);
  assert.equal(m.transition(AppState.QUESTION_ACTIVE), true);
  assert.equal(m.state, AppState.QUESTION_ACTIVE);
});

test('illegal transitions are rejected and state is unchanged', () => {
  const m = new AppStateMachine(AppState.HOME);
  const ok = m.transition(AppState.RESULTS); // HOME -> RESULTS not allowed
  assert.equal(ok, false);
  assert.equal(m.state, AppState.HOME);
});

test('QUESTION_TRANSITION only allows ACTIVE or RESULTS', () => {
  const m = new AppStateMachine(AppState.QUESTION_TRANSITION);
  assert.equal(m.transition(AppState.QUESTION_PAUSED), false);
  assert.equal(m.transition(AppState.RESULTS), true);
});

test('full happy-path traversal succeeds', () => {
  const m = new AppStateMachine(AppState.LOADING);
  const path = [
    AppState.HOME,
    AppState.QUIZ_READY,
    AppState.QUESTION_ACTIVE,
    AppState.QUESTION_PAUSED,
    AppState.QUESTION_ACTIVE,
    AppState.QUESTION_TRANSITION,
    AppState.QUESTION_ACTIVE,
    AppState.QUESTION_TRANSITION,
    AppState.RESULTS,
    AppState.REVIEW,
    AppState.RESULTS,
    AppState.HOME,
  ];
  for (const next of path) {
    assert.equal(m.transition(next), true, `failed transitioning to ${next} from ${m.state}`);
  }
});

console.log('== race-condition simulation (spec section 36/57 Test 20) ==');
test('simultaneous answer + click only completes once', () => {
  const session = new QuizSession('KUMITE', sampleDataset.slice(0, 1), { questionTimeSeconds: 15 });
  const results = [];
  results.push(session.completeCurrentQuestion('answer', 'TRUE'));
  results.push(session.completeCurrentQuestion('click', null)); // race
  results.push(session.completeCurrentQuestion('timeout', null)); // race
  assert.deepEqual(results, [true, false, false]);
  assert.equal(session.currentItem.status, QuestionStatus.CORRECT);
});

console.log('== settings.js: form validation ==');
const { validateSettingsForm } = await import('../js/settings.js');

test('valid settings pass', () => {
  const { ok } = validateSettingsForm({
    questionTimeSeconds: 15,
    selectionMode: 'specific_random',
    questionCount: 20,
    panelColor: 'white',
  });
  assert.equal(ok, true);
});

test('rejects time below minimum (5s)', () => {
  const { ok, errors } = validateSettingsForm({
    questionTimeSeconds: 5,
    selectionMode: 'all_ordered',
    questionCount: 0,
    panelColor: 'white',
  });
  assert.equal(ok, false);
  assert.ok(errors.questionTimeSeconds);
});

test('rejects time above maximum (61s)', () => {
  const { ok } = validateSettingsForm({
    questionTimeSeconds: 61,
    selectionMode: 'all_random',
    questionCount: 0,
    panelColor: 'pink',
  });
  assert.equal(ok, false);
});

test('rejects zero/negative question count in specific_random mode', () => {
  const { ok, errors } = validateSettingsForm({
    questionTimeSeconds: 15,
    selectionMode: 'specific_random',
    questionCount: 0,
    panelColor: 'white',
  });
  assert.equal(ok, false);
  assert.ok(errors.questionCount);
});

test('question count is not required/validated for all_ordered', () => {
  const { ok } = validateSettingsForm({
    questionTimeSeconds: 15,
    selectionMode: 'all_ordered',
    questionCount: -5, // irrelevant in this mode
    panelColor: 'beige',
  });
  assert.equal(ok, true);
});

test('rejects NaN time', () => {
  const { ok } = validateSettingsForm({
    questionTimeSeconds: NaN,
    selectionMode: 'all_ordered',
    questionCount: 0,
    panelColor: 'white',
  });
  assert.equal(ok, false);
});

console.log('== storage.js: corrupt/partial localStorage resilience ==');
const storageMod = await import('../js/storage.js');
const memStore = new Map();
global.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
};

test('loadSettings returns defaults when nothing stored', () => {
  memStore.clear();
  const s = storageMod.loadSettings();
  assert.deepEqual(s, storageMod.DEFAULT_SETTINGS);
});

test('loadSettings falls back to defaults on corrupt JSON', () => {
  memStore.set('ttf_exam_app_settings_v1', '{not valid json');
  const s = storageMod.loadSettings();
  assert.deepEqual(s, storageMod.DEFAULT_SETTINGS);
});

test('loadSettings sanitizes out-of-range values field by field', () => {
  memStore.set(
    'ttf_exam_app_settings_v1',
    JSON.stringify({
      questionTimeSeconds: 9999, // invalid -> default
      selectionMode: 'all_random', // valid -> kept
      questionCount: 45, // valid -> kept
      panelColor: 'purple', // invalid -> default
      timerBarColor: 'not-a-color', // invalid -> default
    })
  );
  const s = storageMod.loadSettings();
  assert.equal(s.questionTimeSeconds, storageMod.DEFAULT_SETTINGS.questionTimeSeconds);
  assert.equal(s.selectionMode, 'all_random');
  assert.equal(s.questionCount, 45);
  assert.equal(s.panelColor, storageMod.DEFAULT_SETTINGS.panelColor);
  assert.equal(s.timerBarColor, storageMod.DEFAULT_SETTINGS.timerBarColor);
});

test('saveSettings + loadSettings round-trip', () => {
  memStore.clear();
  storageMod.saveSettings({
    questionTimeSeconds: 30,
    selectionMode: 'all_ordered',
    questionCount: 1,
    panelColor: 'yellow',
    timerBarColor: '#123ABC',
  });
  const s = storageMod.loadSettings();
  assert.equal(s.questionTimeSeconds, 30);
  assert.equal(s.panelColor, 'yellow');
  assert.equal(s.timerBarColor, '#123ABC');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
