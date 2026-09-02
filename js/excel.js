// excel.js
// Loading and strict validation of the Excel question/affirmation datasets.
// Centralizes all file paths (spec section 4) and never mutates the
// original parsed rows once a dataset has been validated (spec section 54).

import { safeTrim, normalizeBoolAnswer, isPositiveInteger, devLog } from './utils.js';

/** Central location for all data file paths. Change here only. */
export const DATA_PATHS = Object.freeze({
  KUMITE: 'data/qkumite.xlsx',
  KATA: 'data/qkata.xlsx',
  AFFIRMATIONS: 'data/mini-affirmations.xlsx',
});

const DEFAULT_AFFIRMATION = 'Καλή επιτυχία στην προσπάθειά σου Αγάπη μου!';

/**
 * @typedef {Object} DatasetResult
 * @property {boolean} valid
 * @property {Array<{number:number, question:string, answer:'TRUE'|'FALSE'}>} questions
 * @property {string} [errorMessage] - user-friendly Greek message when invalid
 * @property {string} [errorCode]
 */

/**
 * Fetches an xlsx file as an ArrayBuffer via fetch() (never FileReader, per
 * spec section 4, so it works identically under any HTTP(S) deployment).
 */
async function fetchWorkbook(path) {
  let response;
  try {
    response = await fetch(path, { cache: 'no-cache' });
  } catch (err) {
    // Network failure / CORS / offline with nothing cached.
    throw { code: 'FETCH_FAILED', message: `Δεν ήταν δυνατή η πρόσβαση στο αρχείο: ${path}`, cause: err };
  }
  if (!response.ok) {
    throw { code: 'MISSING_FILE', message: `Το αρχείο δεν βρέθηκε (${response.status}): ${path}` };
  }
  let buffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (err) {
    throw { code: 'READ_FAILED', message: `Σφάλμα ανάγνωσης του αρχείου: ${path}`, cause: err };
  }
  if (!buffer || buffer.byteLength === 0) {
    throw { code: 'EMPTY_FILE', message: `Το αρχείο είναι κενό: ${path}` };
  }
  let workbook;
  try {
    // eslint-disable-next-line no-undef
    workbook = XLSX.read(buffer, { type: 'array', codepage: 65001 });
  } catch (err) {
    throw { code: 'CORRUPT_FILE', message: `Το αρχείο δεν μπορεί να διαβαστεί (κατεστραμμένο ή μη έγκυρο Excel): ${path}`, cause: err };
  }
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw { code: 'INVALID_STRUCTURE', message: `Το αρχείο δεν περιέχει φύλλο εργασίας: ${path}` };
  }
  return workbook;
}

/** Converts the first sheet of a workbook into an array-of-arrays. */
function sheetToRows(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  // eslint-disable-next-line no-undef
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

/**
 * Validates and normalizes TRUE/FALSE question rows per spec sections 7-11.
 * @param {Array<Array>} rows - raw rows including the header row
 * @returns {DatasetResult}
 */
function validateQuestionRows(rows) {
  if (!rows || rows.length <= 1) {
    return { valid: false, questions: [], errorMessage: 'Το αρχείο δεν περιέχει ερωτήσεις.', errorCode: 'EMPTY_FILE' };
  }

  const dataRows = rows.slice(1); // skip header row
  const candidates = [];

  for (const row of dataRows) {
    const [rawNumber, rawQuestion, rawAnswer] = row;
    // A fully blank row is ignored silently (spec section 10).
    const isBlankRow =
      safeTrim(rawNumber) === '' && safeTrim(rawQuestion) === '' && safeTrim(rawAnswer) === '';
    if (isBlankRow) continue;

    const questionText = safeTrim(rawQuestion);
    const answer = normalizeBoolAnswer(rawAnswer);
    const validNumber = isPositiveInteger(rawNumber);

    if (!validNumber || questionText === '' || answer === null) {
      // Invalid row: drop it (spec section 10). Re-validated as a whole below.
      continue;
    }

    candidates.push({ number: Number(rawNumber), question: questionText, answer });
  }

  if (candidates.length === 0) {
    return {
      valid: false,
      questions: [],
      errorMessage: 'Δεν βρέθηκαν έγκυρες ερωτήσεις στο αρχείο.',
      errorCode: 'NO_VALID_ROWS',
    };
  }

  // Re-validate numbering AFTER filtering: must be exactly 1..N, unique, sorted.
  const numbers = candidates.map((c) => c.number).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) {
      return {
        valid: false,
        questions: [],
        errorMessage:
          'Η αρίθμηση των ερωτήσεων δεν είναι έγκυρη (πρέπει να είναι συνεχόμενη, χωρίς κενά ή διπλότυπα, ξεκινώντας από το 1).',
        errorCode: 'INVALID_NUMBERING',
      };
    }
  }

  const sorted = candidates.slice().sort((a, b) => a.number - b.number);
  return { valid: true, questions: sorted };
}

/**
 * Loads and validates the KUMITE or KATA dataset. Never throws for
 * business-logic (validation) errors — always resolves with a DatasetResult
 * so callers can render clean, isolated error states per dataset
 * (spec section 12 / 50: KUMITE and KATA failures are independent).
 * @param {string} path
 */
export async function loadQuestionDataset(path) {
  try {
    const workbook = await fetchWorkbook(path);
    const rows = sheetToRows(workbook);
    const result = validateQuestionRows(rows);
    devLog(`Loaded dataset ${path}:`, result.valid ? `${result.questions.length} valid questions` : result.errorMessage);
    return result;
  } catch (err) {
    const message = err && err.message ? err.message : `Άγνωστο σφάλμα κατά τη φόρτωση: ${path}`;
    console.error(`[excel] ${path}`, err);
    return { valid: false, questions: [], errorMessage: message, errorCode: (err && err.code) || 'UNKNOWN' };
  }
}

/**
 * Loads the mini-affirmations dataset. Falls back to the default message
 * (spec section 7.1) if the file is missing/empty/invalid rather than
 * failing the whole application.
 */
export async function loadAffirmations() {
  try {
    const workbook = await fetchWorkbook(DATA_PATHS.AFFIRMATIONS);
    const rows = sheetToRows(workbook);
    if (!rows || rows.length <= 1) {
      return [DEFAULT_AFFIRMATION];
    }
    const texts = rows
      .slice(1)
      .map((r) => safeTrim(r[1]))
      .filter((t) => t !== '');
    return texts.length > 0 ? texts : [DEFAULT_AFFIRMATION];
  } catch (err) {
    console.error('[excel] affirmations', err);
    return [DEFAULT_AFFIRMATION];
  }
}

export { DEFAULT_AFFIRMATION };
