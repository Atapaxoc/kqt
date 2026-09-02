// utils.js
// Generic, dependency-free helper functions used across the application.

/**
 * Unbiased Fisher-Yates (Knuth) shuffle. Returns a NEW array; does not
 * mutate the input. Required by the spec instead of `array.sort(random)`,
 * which is a biased shuffle.
 * @param {Array} array
 * @returns {Array}
 */
export function fisherYatesShuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Picks exactly `n` unbiased-random, non-repeating items from `array`.
 * @param {Array} array
 * @param {number} n
 * @returns {Array}
 */
export function pickRandomN(array, n) {
  return fisherYatesShuffle(array).slice(0, n);
}

/** Clamp a number between min and max. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Trims a value to a string and collapses surrounding whitespace. */
export function safeTrim(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Normalizes a TRUE/FALSE cell value per spec section 11.
 * Accepts case-insensitive TRUE/FALSE with surrounding whitespace.
 * @returns {'TRUE'|'FALSE'|null} null when invalid
 */
export function normalizeBoolAnswer(value) {
  const trimmed = safeTrim(value).toUpperCase();
  if (trimmed === 'TRUE') return 'TRUE';
  if (trimmed === 'FALSE') return 'FALSE';
  return null;
}

/** Returns true if value is a positive integer (number or numeric string). */
export function isPositiveInteger(value) {
  if (value === null || value === undefined || value === '') return false;
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

/** Simple environment check: are we running on localhost/127.0.0.1? */
export function isDevelopmentMode() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '';
}

/** Logs only in development mode, per spec section 49/62. */
export function devLog(...args) {
  if (isDevelopmentMode()) {
    // eslint-disable-next-line no-console
    console.log('[DEV]', ...args);
  }
}

/** Formats a Date as YYYYMMDD_HHMMSS for export filenames. */
export function formatTimestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Triggers a browser download of the given text content as a file.
 * @param {string} filename
 * @param {string} content
 * @param {string} mimeType
 * @param {boolean} withBom - prepend UTF-8 BOM (for CSV/Excel compatibility)
 */
export function downloadTextFile(filename, content, mimeType, withBom = false) {
  const parts = withBom ? ['\uFEFF', content] : [content];
  const blob = new Blob(parts, { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Escapes a CSV field (quotes, commas, newlines). */
export function csvEscape(field) {
  const str = String(field ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Small helper to create a DOM element with attributes/children. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const child of kids) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Removes all children from a DOM node. */
export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
