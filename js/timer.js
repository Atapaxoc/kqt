// timer.js
// A countdown timer based on real elapsed time (performance.now()), not on
// counting setInterval callbacks, so it stays accurate regardless of tab
// throttling jitter (spec section 17). Supports pause/resume by tracking
// accumulated paused time, and guarantees `onComplete` fires at most once.

export class QuestionTimer {
  /**
   * @param {number} durationSeconds - total countdown duration
   * @param {(fractionRemaining:number, elapsedMs:number)=>void} onTick
   * @param {()=>void} onComplete - called exactly once when time runs out
   */
  constructor(durationSeconds, onTick, onComplete) {
    this.durationMs = durationSeconds * 1000;
    this.onTick = onTick;
    this.onComplete = onComplete;

    this._startTime = null; // performance.now() at (re)start of current run
    this._accumulatedMs = 0; // time already consumed before the current run
    this._rafId = null;
    this._paused = true;
    this._completed = false;
    this._cancelled = false;
  }

  /** Starts the timer for the first time. */
  start() {
    if (this._completed || this._cancelled) return;
    this._paused = false;
    this._startTime = performance.now();
    this._tick();
  }

  /** Pauses the timer, freezing elapsed time (spec section 34). */
  pause() {
    if (this._paused || this._completed || this._cancelled) return;
    this._paused = true;
    this._accumulatedMs += performance.now() - this._startTime;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Resumes from exactly where it was paused (spec section 34). */
  resume() {
    if (!this._paused || this._completed || this._cancelled) return;
    this._paused = false;
    this._startTime = performance.now();
    this._tick();
  }

  /** Permanently stops the timer; no further callbacks will fire. */
  cancel() {
    this._cancelled = true;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  get isPaused() {
    return this._paused;
  }

  get isCompleted() {
    return this._completed;
  }

  /** Current fraction of time remaining (0..1), safe to call while paused. */
  get fractionRemaining() {
    const elapsed = this._elapsedMs();
    const remainingMs = Math.max(0, this.durationMs - elapsed);
    return this.durationMs > 0 ? remainingMs / this.durationMs : 0;
  }

  _elapsedMs() {
    if (this._paused) return this._accumulatedMs;
    return this._accumulatedMs + (performance.now() - this._startTime);
  }

  _tick() {
    if (this._cancelled || this._completed || this._paused) return;

    const elapsed = this._elapsedMs();
    const remainingMs = Math.max(0, this.durationMs - elapsed);
    const fractionRemaining = this.durationMs > 0 ? remainingMs / this.durationMs : 0;

    if (this.onTick) this.onTick(fractionRemaining, elapsed);

    if (elapsed >= this.durationMs) {
      this._completeOnce();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._tick());
  }

  /** Idempotent completion guard (spec section 28/36). */
  _completeOnce() {
    if (this._completed) return;
    this._completed = true;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this.onComplete) this.onComplete();
  }
}
