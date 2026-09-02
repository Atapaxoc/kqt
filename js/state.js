// state.js
// Central, explicit state machine for the whole application. This is the
// single source of truth for "what screen / mode are we in" so that no
// part of the app relies on loose, independent boolean flags that could
// create conflicting states (spec section 3).

export const AppState = Object.freeze({
  LOADING: 'LOADING',
  HOME: 'HOME',
  SETTINGS: 'SETTINGS',
  QUIZ_READY: 'QUIZ_READY',
  QUESTION_ACTIVE: 'QUESTION_ACTIVE',
  QUESTION_PAUSED: 'QUESTION_PAUSED',
  QUESTION_TRANSITION: 'QUESTION_TRANSITION',
  RESULTS: 'RESULTS',
  REVIEW: 'REVIEW',
  ERROR: 'ERROR',
  EXIT: 'EXIT',
});

// Explicit allow-list of transitions. Anything not listed here is rejected.
// QUESTION_PAUSED may ONLY go back to QUESTION_ACTIVE (spec section 3).
const ALLOWED_TRANSITIONS = {
  [AppState.LOADING]: [AppState.HOME, AppState.ERROR],
  [AppState.HOME]: [AppState.SETTINGS, AppState.QUIZ_READY, AppState.EXIT, AppState.ERROR],
  [AppState.SETTINGS]: [AppState.HOME],
  [AppState.QUIZ_READY]: [AppState.QUESTION_ACTIVE, AppState.HOME, AppState.ERROR],
  [AppState.QUESTION_ACTIVE]: [
    AppState.QUESTION_PAUSED,
    AppState.QUESTION_TRANSITION,
    AppState.HOME, // abandon with confirmation
  ],
  [AppState.QUESTION_PAUSED]: [AppState.QUESTION_ACTIVE], // ONLY allowed exit
  [AppState.QUESTION_TRANSITION]: [AppState.QUESTION_ACTIVE, AppState.RESULTS],
  [AppState.RESULTS]: [AppState.REVIEW, AppState.HOME],
  [AppState.REVIEW]: [AppState.RESULTS, AppState.HOME],
  [AppState.ERROR]: [AppState.HOME],
  [AppState.EXIT]: [],
};

/**
 * A minimal, dependency-free finite state machine with a subscriber list.
 * Rejects any transition not present in ALLOWED_TRANSITIONS and logs a
 * warning in development mode instead of silently corrupting state.
 */
export class AppStateMachine {
  constructor(initial = AppState.LOADING) {
    this._state = initial;
    this._listeners = new Set();
  }

  get state() {
    return this._state;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Attempts to transition to `next`. Returns true if the transition was
   * allowed and applied, false otherwise (call site must handle failure).
   */
  transition(next) {
    const allowed = ALLOWED_TRANSITIONS[this._state] || [];
    if (!allowed.includes(next)) {
      console.warn(`[state] Rejected illegal transition: ${this._state} -> ${next}`);
      return false;
    }
    const prev = this._state;
    this._state = next;
    for (const listener of this._listeners) {
      try {
        listener(next, prev);
      } catch (err) {
        console.error('[state] listener error', err);
      }
    }
    return true;
  }

  is(...states) {
    return states.includes(this._state);
  }
}
