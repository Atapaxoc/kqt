// quiz.js
// Encapsulates a single exam session as an isolated object (spec section 54):
// selected questions, current index, answers/statuses, settings snapshot.
// The original dataset passed in is never mutated.

import { fisherYatesShuffle, pickRandomN } from './utils.js';

export const QuestionStatus = Object.freeze({
  CORRECT: 'CORRECT',
  WRONG: 'WRONG',
  UNANSWERED: 'UNANSWERED',
});

/**
 * Builds the ordered list of questions to use for a session, based on the
 * settings snapshot's selectionMode (spec section 18).
 * @param {Array} datasetQuestions - validated dataset (not mutated)
 * @param {Object} settingsSnapshot
 * @returns {{ok:boolean, questions?:Array, errorMessage?:string}}
 */
export function buildQuestionSelection(datasetQuestions, settingsSnapshot) {
  const { selectionMode, questionCount } = settingsSnapshot;

  if (selectionMode === 'specific_random') {
    if (questionCount > datasetQuestions.length) {
      return {
        ok: false,
        errorMessage: `Ζητήθηκαν ${questionCount} ερωτήσεις, αλλά είναι διαθέσιμες μόνο ${datasetQuestions.length}. Μειώστε τον αριθμό ερωτήσεων στις Ρυθμίσεις.`,
      };
    }
    return { ok: true, questions: pickRandomN(datasetQuestions, questionCount) };
  }

  if (selectionMode === 'all_ordered') {
    // Already sorted 1..N by the excel validator; copy defensively.
    return { ok: true, questions: datasetQuestions.slice().sort((a, b) => a.number - b.number) };
  }

  if (selectionMode === 'all_random') {
    return { ok: true, questions: fisherYatesShuffle(datasetQuestions) };
  }

  return { ok: false, errorMessage: 'Μη έγκυρος τρόπος επιλογής ερωτήσεων.' };
}

/**
 * Represents one active exam attempt. Isolated from the source dataset.
 */
export class QuizSession {
  /**
   * @param {'KUMITE'|'KATA'} mode
   * @param {Array} questions - already-selected, ordered questions for this run
   * @param {Object} settingsSnapshot - frozen copy of settings at start time
   */
  constructor(mode, questions, settingsSnapshot) {
    this.mode = mode;
    this.settingsSnapshot = { ...settingsSnapshot };
    this.items = questions.map((q) => ({
      number: q.number,
      question: q.question,
      correctAnswer: q.answer,
      userAnswer: null,
      status: QuestionStatus.UNANSWERED,
      completed: false,
      completionReason: null,
    }));
    this.currentIndex = 0;
    this.startedAt = new Date();
  }

  get total() {
    return this.items.length;
  }

  get currentItem() {
    return this.items[this.currentIndex];
  }

  get currentPosition() {
    return this.currentIndex + 1;
  }

  get isLastQuestion() {
    return this.currentIndex >= this.items.length - 1;
  }

  /**
   * THE central, idempotent question-completion mechanism (spec section 28).
   * Every event path (TRUE/FALSE tap, timeout, swipe, click) must call this.
   * Only the FIRST call for a given question has any effect; every
   * subsequent call for the same question is a no-op — this is what
   * prevents all the race conditions described in spec section 36.
   *
   * @param {'answer'|'timeout'|'swipe'|'click'} reason
   * @param {'TRUE'|'FALSE'|null} userAnswer
   * @returns {boolean} true if this call actually completed the question
   */
  completeCurrentQuestion(reason, userAnswer = null) {
    const item = this.currentItem;
    if (!item || item.completed) return false; // guard: already completed
    item.completed = true;
    item.userAnswer = userAnswer;
    item.completionReason = reason;
    if (userAnswer === null) {
      item.status = QuestionStatus.UNANSWERED;
    } else {
      item.status = userAnswer === item.correctAnswer ? QuestionStatus.CORRECT : QuestionStatus.WRONG;
    }
    return true;
  }

  /** True once the current question has reached a final status. */
  get isCurrentQuestionCompleted() {
    return !!(this.currentItem && this.currentItem.completed);
  }

  /** Advances to the next question. Returns false if already at the end. */
  advance() {
    if (this.currentIndex < this.items.length - 1) {
      this.currentIndex += 1;
      return true;
    }
    return false;
  }

  /**
   * Computes results strictly from recorded item statuses (spec section 55),
   * never from separate UI counters, guaranteeing correct+wrong+unanswered=total.
   */
  getResults() {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    for (const item of this.items) {
      if (item.status === QuestionStatus.CORRECT) correct++;
      else if (item.status === QuestionStatus.WRONG) wrong++;
      else unanswered++;
    }
    const total = this.items.length;
    const percentage = total > 0 ? (correct / total) * 100 : 0;
    return { total, correct, wrong, unanswered, percentage };
  }

  /** Wrong + unanswered items, in original session order, for the review flow. */
  getReviewItems() {
    return this.items.filter(
      (item) => item.status === QuestionStatus.WRONG || item.status === QuestionStatus.UNANSWERED
    );
  }
}
