// settings.js
// Validation logic for the Settings screen, plus the "snapshot" helper that
// freezes the settings in effect for a given exam run (spec section 15/44):
// once a quiz starts, its settings must never change mid-exam even if the
// user opens Settings in another tab/window.

import { QUESTION_TIME_MIN, QUESTION_TIME_MAX } from './storage.js';

/**
 * Validates a candidate settings object coming from the Settings form.
 * @returns {{ok:boolean, errors:Object<string,string>}}
 */
export function validateSettingsForm(candidate) {
  const errors = {};

  const time = Number(candidate.questionTimeSeconds);
  if (!Number.isFinite(time) || Number.isNaN(time)) {
    errors.questionTimeSeconds = 'Ο χρόνος ερώτησης πρέπει να είναι αριθμός.';
  } else if (time < QUESTION_TIME_MIN || time > QUESTION_TIME_MAX) {
    errors.questionTimeSeconds = `Ο χρόνος ερώτησης πρέπει να είναι μεταξύ ${QUESTION_TIME_MIN} και ${QUESTION_TIME_MAX} δευτερολέπτων.`;
  }

  if (!['specific_random', 'all_ordered', 'all_random'].includes(candidate.selectionMode)) {
    errors.selectionMode = 'Μη έγκυρος τρόπος επιλογής ερωτήσεων.';
  }

  if (candidate.selectionMode === 'specific_random') {
    const count = Number(candidate.questionCount);
    if (!Number.isInteger(count) || count <= 0) {
      errors.questionCount = 'Ο αριθμός ερωτήσεων πρέπει να είναι θετικός ακέραιος.';
    }
  }

  if (!['white', 'pink', 'yellow', 'beige'].includes(candidate.panelColor)) {
    errors.panelColor = 'Μη έγκυρο χρώμα πλαισίου.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Deep-freezes a plain settings object to use as an immutable exam snapshot. */
export function snapshotSettings(settings) {
  return Object.freeze({ ...settings });
}

/** Maps a panelColor key to its actual CSS color value. */
export const PANEL_COLOR_VALUES = Object.freeze({
  white: '#FFFFFF',
  pink: '#FFD9E8',
  yellow: '#FFF6B0',
  beige: '#F5EBDD',
});
