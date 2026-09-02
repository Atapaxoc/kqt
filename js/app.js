// app.js
// Application controller. Owns the state machine, the current quiz session,
// the active timer, and wires UI events to the central completeQuestion
// mechanism. This is intentionally the only module that mutates "current
// screen" — everything else is either pure data (quiz.js/excel.js) or pure
// view (ui.js).

import { AppState, AppStateMachine } from './state.js';
import { loadSettings, saveSettings, QUESTION_TIME_MIN, QUESTION_TIME_MAX } from './storage.js';
import { validateSettingsForm, snapshotSettings } from './settings.js';
import { loadQuestionDataset, loadAffirmations, DATA_PATHS } from './excel.js';
import { buildQuestionSelection, QuizSession } from './quiz.js';
import { QuestionTimer } from './timer.js';
import { fisherYatesShuffle, devLog, formatTimestampForFilename, downloadTextFile, csvEscape } from './utils.js';
import * as ui from './ui.js';

const root = document.getElementById('app-root');

// ---------------------------------------------------------------------------
// Result message tiers (spec section 39).
// The source spec's percentage bands overlap/contradict each other in a few
// places (e.g. "up to 80%" vs. "75%-80%" both claiming the same range).
// This table resolves that with a single, non-overlapping, monotonic ladder
// that preserves every message and stays faithful to the spec's ordering
// and intent. Boundary numbers are centralized here per spec section 39.
// Classification uses the rounded whole-number percentage.
// ---------------------------------------------------------------------------
const RESULT_CONFIG = {
  boundaries: { perfect: 100, excellentA: 99, excellentB: 98, good: 95, ok: 90, fair: 80 },
  tiers: [
    { min: 100, color: '#0000FF', text: 'Πέτυχες το απόλυτο!!! Είσαι κορυφή!!!' },
    { min: 99, color: '#2E7D32', text: 'Σχεδόν τέλειος! Ευτυχώς, γιατί με το 100% θα έπρεπε να σε αγιοποιήσουμε…' },
    { min: 98, color: '#2E7D32', text: 'Σχεδόν τέλειος! Αν είχες πιάσει 100%, θα έπρεπε να σε ταριχεύσουμε για το μουσείο της επιτυχίας....' },
    { min: 91, color: '#2E7D32', text: 'Ωραία η προσπάθεια, αλλά εδώ σταματάνε οι ερασιτέχνες. Πάμε πάλι για το 100%!' },
    { min: 86, color: '#2E7D32', text: 'Καλά μέχρι εδώ, αλλά επειδή δεν είμαστε του "σχεδόν"... πάμε πάλι να το κάνουμε σωστά!' },
    { min: 81, color: '#2E7D32', text: 'Καλό για αρχή, αλλά όχι αρκετό για να σε πάρω στα σοβαρά... Πάμε πάλι!!!' },
    { min: 80, color: '#E65100', text: 'Μπράβο! Ήταν μια συγκλονιστική προσπάθεια για να πετύχεις το απολύτως μέτριο… Ξανά!!!' },
    { min: 76, color: '#C62828', text: 'Δεν θα γραφτείς στην ιστορία, αλλά τουλάχιστον δεν θα σε γράψουν και στις ειδήσεις… Πάμε πάλι!!!' },
    { min: 71, color: '#C62828', text: 'Συγχαρητήρια! Κατάφερες να είσαι ο καλύτερος από τους χειρότερους!!!' },
    { min: 66, color: '#C62828', text: 'Αν η αποτυχία ήταν άθλημα, θα ήσουν ήδη στους Ολυμπιακούς.' },
    { min: 61, color: '#C62828', text: 'Συγχαρητήρια! Κατάφερες να αποτύχεις με τόσο εντυπωσιακό τρόπο, που σχεδόν θεωρείται επίτευγμα.!!!' },
    { min: 56, color: '#C62828', text: 'Μην απογοητεύεσαι! Χρειάζεται μεγάλο ταλέντο για να κάνει κανείς τόσα λάθη μαζεμένα.' },
    { min: 51, color: '#C62828', text: 'Κοίτα την θετική πλευρά: τουλάχιστον τώρα ξέρεις ακριβώς τι δεν πρέπει να ξανακάνεις.' },
    { min: 46, color: '#C62828', text: 'Αν η αποτυχία έδινε ένσημα, θα είχες ήδη βγει στη σύνταξη.' },
    { min: 41, color: '#C62828', text: 'Συγχαρητήρια! Κατάφερες να μηδενίσεις το κοντέρ. Πιο κάτω υπάρχει μόνο το πετρέλαιο.' },
    { min: 0, color: '#C62828', text: 'Πιο χαμηλά δεν γίνεται. Εκτός αν έχεις φέρει και φτυάρι μαζί σου…' },
  ],
};

function getResultMessage(percentage) {
  const rounded = Math.round(percentage);
  for (const tier of RESULT_CONFIG.tiers) {
    if (rounded >= tier.min) return tier;
  }
  return RESULT_CONFIG.tiers[RESULT_CONFIG.tiers.length - 1];
}

// ---------------------------------------------------------------------------
// Application-lifetime state (module scope; not persisted, per spec section 43:
// only Settings must survive; everything else may be lost on refresh).
// ---------------------------------------------------------------------------
const machine = new AppStateMachine(AppState.LOADING);

let settings = loadSettings();
let datasets = {
  KUMITE: { valid: false, questions: [], errorMessage: 'Φόρτωση...' },
  KATA: { valid: false, questions: [], errorMessage: 'Φόρτωση...' },
};
let affirmationsBag = []; // shuffle-bag, refilled/reshuffled when emptied
let allAffirmations = [];
let homeView = 'welcome'; // 'welcome' | 'menu' (both map to AppState.HOME)

let quizSession = null;
let activeTimer = null;
let questionViewHandle = null;
let reviewIndex = 0;
let lastReviewedFromResults = false;

// ---------------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------------
async function init() {
  ui.renderLoading(root);

  if (window.location.protocol === 'file:') {
    ui.renderProtocolWarning(root);
    return; // Cannot reliably fetch() local files; stop here per spec section 5.
  }

  registerServiceWorker();
  setupOnlineOfflineBanner();
  setupGlobalKeyboardShortcuts();

  const [kumite, kata, affirmations] = await Promise.all([
    loadQuestionDataset(DATA_PATHS.KUMITE),
    loadQuestionDataset(DATA_PATHS.KATA),
    loadAffirmations(),
  ]);

  datasets.KUMITE = kumite;
  datasets.KATA = kata;
  allAffirmations = affirmations;

  machine.transition(AppState.HOME);
  homeView = 'welcome';
  showHomeWelcome();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    devLog('Service worker registration failed; continuing without offline support.', err);
  });
}

function setupOnlineOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  const update = () => {
    banner.hidden = navigator.onLine;
  };
  window.addEventListener('online', () => {
    devLog('Back online');
    update();
  });
  window.addEventListener('offline', () => {
    devLog('Now offline');
    update();
  });
  update();
}

// ---------------------------------------------------------------------------
// Affirmations shuffle-bag (spec section 14): each text shown once before
// any repeats, using an unbiased Fisher-Yates shuffle for the bag order.
// ---------------------------------------------------------------------------
function nextAffirmation() {
  if (affirmationsBag.length === 0) {
    affirmationsBag = fisherYatesShuffle(allAffirmations);
  }
  return affirmationsBag.shift();
}

// ---------------------------------------------------------------------------
// HOME (welcome sub-view)
// ---------------------------------------------------------------------------
function showHomeWelcome() {
  const picIndex = 1 + Math.floor(Math.random() * 20);
  ui.renderHome(root, {
    imageSrc: `assets/pic-${picIndex}.png`,
    affirmationText: nextAffirmation(),
    onStart: () => {
      homeView = 'menu';
      showHomeMenu();
    },
  });
}

// ---------------------------------------------------------------------------
// HOME (menu sub-view: KUMITE / KATA / SETTINGS / EXIT)
// ---------------------------------------------------------------------------
function showHomeMenu() {
  const handle = ui.renderMenu(root, {
    kumiteEnabled: datasets.KUMITE.valid,
    kumiteReason: datasets.KUMITE.errorMessage,
    kataEnabled: datasets.KATA.valid,
    kataReason: datasets.KATA.errorMessage,
    onKumite: () => startQuiz('KUMITE'),
    onKata: () => startQuiz('KATA'),
    onSettings: () => {
      if (machine.transition(AppState.SETTINGS)) showSettings();
    },
    onExit: () => attemptExit(handle),
  });
}

function attemptExit(menuHandle) {
  // Modern browsers generally block window.close() on tabs/windows the
  // script did not itself open (spec section 14). We attempt it, and if
  // the tab is still open shortly after, we show the fallback message.
  try {
    window.close();
  } catch (err) {
    devLog('window.close() threw', err);
  }
  window.setTimeout(() => {
    if (!window.closed) {
      menuHandle.showExitMessage();
    }
  }, 150);
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
function showSettings() {
  ui.renderSettings(root, {
    settings,
    limits: { timeMin: QUESTION_TIME_MIN, timeMax: QUESTION_TIME_MAX },
    onBack: () => {
      if (machine.transition(AppState.HOME)) {
        homeView = 'menu';
        showHomeMenu();
      }
    },
    onSave: (candidate, { showErrors }) => {
      const { ok, errors } = validateSettingsForm(candidate);
      if (!ok) {
        showErrors(errors);
        return;
      }
      settings = { ...candidate };
      saveSettings(settings);
      if (machine.transition(AppState.HOME)) {
        homeView = 'menu';
        showHomeMenu();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// QUIZ START
// ---------------------------------------------------------------------------
function startQuiz(mode) {
  const dataset = datasets[mode];
  if (!dataset.valid) return; // menu button should already be disabled

  const snapshot = snapshotSettings(settings); // frozen for the whole run (spec 15/44)
  const selection = buildQuestionSelection(dataset.questions, snapshot);
  if (!selection.ok) {
    window.alert(selection.errorMessage);
    return;
  }

  if (!machine.transition(AppState.QUIZ_READY)) return;
  quizSession = new QuizSession(mode, selection.questions, snapshot);

  if (!machine.transition(AppState.QUESTION_ACTIVE)) return;
  showCurrentQuestion();
}

// ---------------------------------------------------------------------------
// QUESTION SCREEN
// ---------------------------------------------------------------------------
function showCurrentQuestion() {
  const item = quizSession.currentItem;
  questionViewHandle = ui.renderQuestion(root, {
    mode: quizSession.mode,
    position: quizSession.currentPosition,
    total: quizSession.total,
    panelColor: quizSession.settingsSnapshot.panelColor,
    questionText: item.question,
    onAnswer: (value) => handleQuestionEvent('answer', value),
    onPause: handlePauseToggle,
    onPanelInteract: (reason) => handleQuestionEvent(reason, null),
  });
  questionViewHandle.updateTimerBar(1, false);

  activeTimer = new QuestionTimer(
    quizSession.settingsSnapshot.questionTimeSeconds,
    (fraction) => questionViewHandle.updateTimerBar(fraction, false),
    () => handleQuestionEvent('timeout', null)
  );
  activeTimer.start();
}

/**
 * Single funnel for every event that can end the current question
 * (TRUE/FALSE, timeout, swipe, click) — spec section 28. Guards against
 * race conditions (spec section 36) via two layers:
 *   1. Only acts while the state machine is exactly QUESTION_ACTIVE
 *      (ignored during PAUSED or TRANSITION).
 *   2. Delegates the actual one-shot completion to
 *      QuizSession#completeCurrentQuestion, which is itself idempotent.
 */
function handleQuestionEvent(reason, userAnswer) {
  if (!machine.is(AppState.QUESTION_ACTIVE)) return; // guard: paused/transitioning
  if (!quizSession) return;

  const didComplete = quizSession.completeCurrentQuestion(reason, userAnswer);
  if (!didComplete) return; // guard: already completed by another event

  if (activeTimer) {
    activeTimer.cancel();
    activeTimer = null;
  }
  questionViewHandle.setAnswersDisabled(true);

  if (!machine.transition(AppState.QUESTION_TRANSITION)) return;
  questionViewHandle.startTransitionVisual();

  window.setTimeout(() => {
    advanceAfterTransition();
  }, 1200);
}

function advanceAfterTransition() {
  if (!machine.is(AppState.QUESTION_TRANSITION)) return; // safety guard

  if (quizSession.isLastQuestion) {
    if (machine.transition(AppState.RESULTS)) showResults();
    return;
  }

  quizSession.advance();
  if (machine.transition(AppState.QUESTION_ACTIVE)) {
    showCurrentQuestion();
  }
}

function handlePauseToggle() {
  if (machine.is(AppState.QUESTION_ACTIVE)) {
    if (!machine.transition(AppState.QUESTION_PAUSED)) return;
    if (activeTimer) activeTimer.pause();
    questionViewHandle.setPauseLabel(true);
    questionViewHandle.showPauseOverlay(true);
    questionViewHandle.updateTimerBar(activeTimer ? activeTimer.fractionRemaining : 1, true);
  } else if (machine.is(AppState.QUESTION_PAUSED)) {
    if (!machine.transition(AppState.QUESTION_ACTIVE)) return;
    questionViewHandle.setPauseLabel(false);
    questionViewHandle.showPauseOverlay(false);
    if (activeTimer) activeTimer.resume();
  }
  // No-op during QUESTION_TRANSITION (spec section 35): pause button is not
  // wired to anything meaningful then because the question screen itself is
  // about to be replaced within 1.2s.
}

// ---------------------------------------------------------------------------
// RESULTS
// ---------------------------------------------------------------------------
function showResults() {
  const results = quizSession.getResults();
  const tier = getResultMessage(results.percentage);
  const reviewItems = quizSession.getReviewItems();

  ui.renderResults(root, {
    results,
    message: tier.text,
    reviewEnabled: reviewItems.length > 0,
    onReview: () => {
      if (reviewItems.length === 0) return;
      if (!machine.transition(AppState.REVIEW)) return;
      reviewIndex = 0;
      lastReviewedFromResults = true;
      showReview();
    },
    onHome: () => goHomeFromResults(),
    onExport: () => exportResults(quizSession, results),
  });

  // Apply the message color inline (kept out of ui.js so all business
  // config — including colors — stays centralized in RESULT_CONFIG).
  const box = root.querySelector('.results-message-box');
  if (box) box.style.color = tier.color;
}

function goHomeFromResults() {
  if (!machine.transition(AppState.HOME)) return;
  quizSession = null;
  homeView = 'menu';
  showHomeMenu();
}

// ---------------------------------------------------------------------------
// REVIEW
// ---------------------------------------------------------------------------
function showReview() {
  const items = quizSession.getReviewItems();
  const item = items[reviewIndex];
  ui.renderReview(root, {
    item,
    index: reviewIndex,
    total: items.length,
    onNext: () => {
      reviewIndex = (reviewIndex + 1) % items.length;
      showReview();
    },
    onBack: () => {
      if (!machine.transition(AppState.RESULTS)) return;
      showResults();
    },
  });
}

// ---------------------------------------------------------------------------
// EXPORT RESULTS (spec section 61)
// ---------------------------------------------------------------------------
function exportResults(session, results) {
  const ts = formatTimestampForFilename(new Date());

  const csvLines = ['Number,Question,UserAnswer,CorrectAnswer,Status'];
  for (const item of session.items) {
    csvLines.push(
      [
        item.number,
        csvEscape(item.question),
        item.userAnswer === null ? 'NO ANSWER' : item.userAnswer,
        item.correctAnswer,
        item.status,
      ].join(',')
    );
  }
  downloadTextFile(`exam_results_${ts}.csv`, csvLines.join('\r\n'), 'text/csv', true);

  const tier = getResultMessage(results.percentage);
  const txtLines = [
    `Εξέταση: ${session.mode}`,
    `Ημερομηνία/Ώρα: ${new Date().toLocaleString('el-GR')}`,
    `Σύνολο ερωτήσεων: ${results.total}`,
    `Σωστές: ${results.correct}`,
    `Λάθος: ${results.wrong}`,
    `Αναπάντητες: ${results.unanswered}`,
    `Ποσοστό επιτυχίας: ${results.percentage.toFixed(1)}%`,
    `Μήνυμα: ${tier.text}`,
  ];
  downloadTextFile(`exam_results_${ts}.txt`, txtLines.join('\r\n'), 'text/plain', true);
}

// ---------------------------------------------------------------------------
// KEYBOARD SUPPORT (spec section 48)
// ---------------------------------------------------------------------------
let helpModalOpen = false;

function setupGlobalKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Global help modal toggle — allowed everywhere.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '?') {
      e.preventDefault();
      toggleKeyboardHelp();
      return;
    }

    // Shortcuts below apply ONLY on the question screen (Active/Paused),
    // never in Settings, Review, or Results (spec section 48).
    const onQuestionScreen = machine.is(AppState.QUESTION_ACTIVE, AppState.QUESTION_PAUSED);
    if (!onQuestionScreen) return;

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        if (machine.is(AppState.QUESTION_ACTIVE)) handleQuestionEvent('click', null);
        break;
      case 't':
      case 'T':
        if (machine.is(AppState.QUESTION_ACTIVE)) handleQuestionEvent('answer', 'TRUE');
        break;
      case 'f':
      case 'F':
        if (machine.is(AppState.QUESTION_ACTIVE)) handleQuestionEvent('answer', 'FALSE');
        break;
      case 'p':
      case 'P':
        handlePauseToggle();
        break;
      case 'Escape':
        confirmAbandonExam();
        break;
      default:
        break;
    }
  });
}

function toggleKeyboardHelp() {
  if (helpModalOpen) return;
  helpModalOpen = true;
  ui.renderKeyboardHelp(root, () => {
    helpModalOpen = false;
  });
}

function confirmAbandonExam() {
  if (!machine.is(AppState.QUESTION_ACTIVE, AppState.QUESTION_PAUSED)) return;
  const wasActive = machine.is(AppState.QUESTION_ACTIVE);
  if (wasActive) handlePauseToggle(); // freeze the timer while the dialog is open

  ui.renderConfirmDialog({
    message: 'Are you sure you want to leave this examination? Current results will be lost.',
    onConfirm: () => {
      if (activeTimer) {
        activeTimer.cancel();
        activeTimer = null;
      }
      quizSession = null;
      if (machine.transition(AppState.HOME)) {
        homeView = 'menu';
        showHomeMenu();
      }
    },
    onCancel: () => {
      if (wasActive && machine.is(AppState.QUESTION_PAUSED)) {
        handlePauseToggle(); // resume
      }
    },
  });
}

// ---------------------------------------------------------------------------
init();
