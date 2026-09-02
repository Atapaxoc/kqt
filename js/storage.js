// storage.js
// Thin, defensive wrapper around localStorage. All settings defaults are
// centralized here per spec section 20.

const STORAGE_KEY = 'ttf_exam_app_settings_v1';

/** Central default settings object (spec section 20). */
export const DEFAULT_SETTINGS = Object.freeze({
  questionTimeSeconds: 15,
  selectionMode: 'specific_random', // 'specific_random' | 'all_ordered' | 'all_random'
  questionCount: 20,
  panelColor: 'white', // 'white' | 'pink' | 'yellow' | 'beige'
  timerBarColor: '#007FFF',
});

export const QUESTION_TIME_MIN = 6;
export const QUESTION_TIME_MAX = 60;

const PANEL_COLORS = new Set(['white', 'pink', 'yellow', 'beige']);
const SELECTION_MODES = new Set(['specific_random', 'all_ordered', 'all_random']);

/**
 * Validates a settings object field-by-field. Any invalid/missing field
 * falls back to the corresponding default (spec section 20: corrupt
 * localStorage must never crash the app).
 */
function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const t = Number(raw.questionTimeSeconds);
    if (Number.isFinite(t) && t >= QUESTION_TIME_MIN && t <= QUESTION_TIME_MAX) {
      out.questionTimeSeconds = Math.round(t);
    }
    if (SELECTION_MODES.has(raw.selectionMode)) {
      out.selectionMode = raw.selectionMode;
    }
    const c = Number(raw.questionCount);
    if (Number.isInteger(c) && c > 0) {
      out.questionCount = c;
    }
    if (PANEL_COLORS.has(raw.panelColor)) {
      out.panelColor = raw.panelColor;
    }
    if (typeof raw.timerBarColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.timerBarColor)) {
      out.timerBarColor = raw.timerBarColor;
    }
  }
  return out;
}

/** Reads settings from localStorage, safely falling back to defaults. */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch (err) {
    // Corrupt JSON or unavailable storage: ignore and use defaults.
    console.error('Settings could not be read, using defaults.', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persists settings to localStorage. Returns true on success. */
export function saveSettings(settings) {
  try {
    const clean = sanitizeSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch (err) {
    console.error('Settings could not be saved.', err);
    return false;
  }
}
