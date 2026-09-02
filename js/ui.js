// ui.js
// Pure(ish) view layer: builds DOM for each screen and returns references to
// the interactive elements / imperative update handles the controller
// (app.js) needs. Contains no quiz/timer/state business logic itself.

import { el, clearNode } from './utils.js';
import { PANEL_COLOR_VALUES } from './settings.js';

/** Renders into the given root, replacing all previous content. */
function mount(root, node) {
  clearNode(root);
  root.appendChild(node);
  return node;
}

// ---------------------------------------------------------------------------
// LOADING
// ---------------------------------------------------------------------------
export function renderLoading(root) {
  const node = el('div', { class: 'screen loading-screen', role: 'status', 'aria-live': 'polite' }, [
    el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    el('p', { text: 'Φόρτωση εφαρμογής...' }),
  ]);
  mount(root, node);
}

// ---------------------------------------------------------------------------
// PROTOCOL WARNING (file:// usage, spec section 5)
// ---------------------------------------------------------------------------
export function renderProtocolWarning(root) {
  const node = el('div', { class: 'screen', role: 'alert' }, [
    el('div', { class: 'protocol-warning' }, [
      'Η εφαρμογή πρέπει να εκτελείται μέσω web server (π.χ. Live Server, Python HTTP, GitHub Pages). ',
      'Παρακαλώ χρησιμοποιήστε έναν τοπικό server.',
    ]),
  ]);
  mount(root, node);
}

// ---------------------------------------------------------------------------
// ERROR
// ---------------------------------------------------------------------------
export function renderError(root, { message, onHome }) {
  const node = el('div', { class: 'screen error-screen', role: 'alert' }, [
    el('div', { class: 'error-icon', 'aria-hidden': 'true' }, '⚠️'),
    el('p', { class: 'error-message', text: message }),
    onHome ? el('button', { class: 'btn btn-primary', onClick: onHome }, 'Αρχική οθόνη') : null,
  ]);
  mount(root, node);
}

// ---------------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------------
export function renderHome(root, { imageSrc, affirmationText, onStart }) {
  const node = el('div', { class: 'screen home-screen' }, [
    el('img', {
      class: 'home-bg-image',
      src: imageSrc,
      alt: '',
      'aria-hidden': 'true',
    }),
    el('div', { class: 'home-content' }, [
      el('h1', { class: 'home-title' }, 'Καλώς τους Δημητράδες!'),
      el('div', { class: 'affirmation-panel', role: 'status' }, affirmationText),
      el(
        'button',
        {
          class: 'start-button',
          onClick: onStart,
          'aria-label': 'Καλώς τον! Μπορείς να ξεκινήσεις!',
        },
        'Καλώς τον! Μπορείς να ξεκινήσεις!'
      ),
    ]),
  ]);
  mount(root, node);
}

// ---------------------------------------------------------------------------
// MENU (KUMITE / KATA / SETTINGS / EXIT)
// ---------------------------------------------------------------------------
export function renderMenu(root, { kumiteEnabled, kumiteReason, kataEnabled, kataReason, onKumite, onKata, onSettings, onExit }) {
  const node = el('div', { class: 'screen menu-screen' }, [
    el('div', { class: 'menu-grid', role: 'navigation', 'aria-label': 'Κύριο μενού' }, [
      el(
        'button',
        {
          class: 'menu-button kumite-btn',
          onClick: onKumite,
          disabled: kumiteEnabled ? null : 'disabled',
          'aria-label': kumiteEnabled ? 'KUMITE' : `KUMITE (μη διαθέσιμο: ${kumiteReason || ''})`,
          title: kumiteEnabled ? '' : kumiteReason || 'Μη διαθέσιμα δεδομένα',
        },
        [el('span', { class: 'icon', 'aria-hidden': 'true' }, '🥋'), 'KUMITE']
      ),
      el(
        'button',
        {
          class: 'menu-button kata-btn',
          onClick: onKata,
          disabled: kataEnabled ? null : 'disabled',
          'aria-label': kataEnabled ? 'KATA' : `KATA (μη διαθέσιμο: ${kataReason || ''})`,
          title: kataEnabled ? '' : kataReason || 'Μη διαθέσιμα δεδομένα',
        },
        [el('span', { class: 'icon', 'aria-hidden': 'true' }, '🥷'), 'KATA']
      ),
      el(
        'button',
        { class: 'menu-button settings-btn', onClick: onSettings, 'aria-label': 'Ρυθμίσεις' },
        [el('span', { class: 'icon', 'aria-hidden': 'true' }, '⚙️'), 'SETTINGS']
      ),
      el(
        'button',
        { class: 'menu-button exit-btn', onClick: onExit, 'aria-label': 'Έξοδος' },
        [el('span', { class: 'icon', 'aria-hidden': 'true' }, '🚪'), 'EXIT']
      ),
    ]),
    el('div', { id: 'exit-message-slot' }),
  ]);
  mount(root, node);
  return {
    showExitMessage() {
      const slot = node.querySelector('#exit-message-slot');
      clearNode(slot);
      slot.appendChild(
        el(
          'p',
          { class: 'exit-message' },
          'Ευχαριστώ για τον χρόνο σας! Μπορείτε να κλείσετε αυτό το παράθυρο τώρα. Ανυπομονώ για την επόμενη φορά!'
        )
      );
    },
  };
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
export function renderSettings(root, { settings, limits, onSave, onBack }) {
  const timeInput = el('input', {
    type: 'number',
    id: 'set-time',
    min: String(limits.timeMin),
    max: String(limits.timeMax),
    step: '1',
    value: String(settings.questionTimeSeconds),
  });

  const modeSelect = el('select', { id: 'set-mode' }, [
    el('option', { value: 'specific_random', selected: settings.selectionMode === 'specific_random' ? 'selected' : null }, 'Συγκεκριμένος αριθμός τυχαίων ερωτήσεων'),
    el('option', { value: 'all_ordered', selected: settings.selectionMode === 'all_ordered' ? 'selected' : null }, 'Όλες οι ερωτήσεις με τη σειρά'),
    el('option', { value: 'all_random', selected: settings.selectionMode === 'all_random' ? 'selected' : null }, 'Όλες οι ερωτήσεις σε τυχαία σειρά'),
  ]);

  const countGroup = el('div', { class: 'field-group', id: 'count-group' }, [
    el('label', { for: 'set-count' }, 'Αριθμός ερωτήσεων'),
    el('input', { type: 'number', id: 'set-count', min: '1', step: '1', value: String(settings.questionCount) }),
    el('p', { class: 'field-error', id: 'count-error' }),
  ]);
  countGroup.style.display = settings.selectionMode === 'specific_random' ? '' : 'none';

  const colorKeys = ['white', 'pink', 'yellow', 'beige'];
  const colorLabels = { white: 'Λευκό', pink: 'Ανοιχτό Ροζ', yellow: 'Ανοιχτό κίτρινο', beige: 'Ανοιχτό μπεζ' };
  const swatches = colorKeys.map((key) =>
    el('button', {
      type: 'button',
      class: 'color-swatch',
      style: `background:${PANEL_COLOR_VALUES[key]}; border-color:${PANEL_COLOR_VALUES[key]}`,
      'data-color': key,
      'aria-pressed': settings.panelColor === key ? 'true' : 'false',
      'aria-label': colorLabels[key],
      title: colorLabels[key],
    })
  );
  const swatchGroup = el('div', { class: 'color-swatch-group', role: 'radiogroup', 'aria-label': 'Χρώμα πλαισίου ερώτησης' }, swatches);

  const node = el('div', { class: 'screen settings-screen' }, [
    el('div', { class: 'settings-card' }, [
      el('h2', {}, 'Ρυθμίσεις'),
      el('div', { class: 'field-group' }, [
        el('label', { for: 'set-time' }, `Χρόνος ερώτησης (${limits.timeMin}-${limits.timeMax} δευτ.)`),
        timeInput,
        el('p', { class: 'field-error', id: 'time-error' }),
      ]),
      el('div', { class: 'field-group' }, [
        el('label', { for: 'set-mode' }, 'Τρόπος επιλογής ερωτήσεων'),
        modeSelect,
      ]),
      countGroup,
      el('div', { class: 'field-group' }, [
        el('label', {}, 'Χρώμα πλαισίου ερώτησης'),
        swatchGroup,
      ]),
      el('div', { class: 'settings-actions' }, [
        el('button', { class: 'btn btn-secondary', onClick: onBack }, 'BACK'),
        el('button', { class: 'btn btn-primary', id: 'save-btn' }, 'Αποθήκευση'),
      ]),
    ]),
  ]);

  mount(root, node);

  let selectedColor = settings.panelColor;
  swatchGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    selectedColor = btn.dataset.color;
    swatches.forEach((s) => s.setAttribute('aria-pressed', s === btn ? 'true' : 'false'));
  });

  modeSelect.addEventListener('change', () => {
    countGroup.style.display = modeSelect.value === 'specific_random' ? '' : 'none';
  });

  node.querySelector('#save-btn').addEventListener('click', () => {
    const candidate = {
      questionTimeSeconds: Number(timeInput.value),
      selectionMode: modeSelect.value,
      questionCount: Number(node.querySelector('#set-count').value),
      panelColor: selectedColor,
      timerBarColor: settings.timerBarColor,
    };
    onSave(candidate, {
      showErrors(errors) {
        node.querySelector('#time-error').textContent = errors.questionTimeSeconds || '';
        node.querySelector('#count-error').textContent = errors.questionCount || '';
      },
    });
  });

  return node;
}

// ---------------------------------------------------------------------------
// QUESTION SCREEN
// ---------------------------------------------------------------------------
export function renderQuestion(root, { mode, position, total, panelColor, questionText, onAnswer, onPause, onPanelInteract }) {
  const trueBtn = el('button', { class: 'answer-btn true-btn', 'aria-label': 'TRUE' }, 'TRUE');
  const falseBtn = el('button', { class: 'answer-btn false-btn', 'aria-label': 'FALSE' }, 'FALSE');
  const pauseBtn = el('button', { class: 'pause-button', 'aria-label': 'Παύση' }, 'PAUSE');
  const timerFill = el('div', { class: 'timer-bar-fill normal', style: 'width:100%' });
  const panel = el(
    'div',
    {
      class: `question-panel color-${panelColor}`,
      tabindex: '0',
      role: 'button',
      'aria-label': 'Πατήστε ή σύρετε για επόμενη ερώτηση',
    },
    [
      el('p', { class: 'question-text' }, questionText),
      el('span', { class: 'question-tap-hint', 'aria-hidden': 'true' }, 'πατήστε / σύρετε για επόμενη'),
    ]
  );

  const node = el('div', { class: 'screen question-screen', 'aria-label': `Εξέταση ${mode}` }, [
    el('div', { class: 'question-topbar' }, [
      el('span', { class: 'progress-indicator', 'aria-live': 'polite' }, `Ερώτηση ${position} / ${total}`),
      pauseBtn,
    ]),
    el('div', { class: 'question-panel-wrapper' }, [panel]),
    el('div', { class: 'timer-bar-track', role: 'progressbar', 'aria-label': 'Χρόνος ερώτησης' }, [timerFill]),
    el('div', { class: 'answer-buttons' }, [trueBtn, falseBtn]),
  ]);

  mount(root, node);

  trueBtn.addEventListener('click', () => onAnswer('TRUE'));
  falseBtn.addEventListener('click', () => onAnswer('FALSE'));
  pauseBtn.addEventListener('click', () => onPause());
  panel.addEventListener('click', () => onPanelInteract('click'));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPanelInteract('click');
    }
  });

  // Touch swipe detection (spec section 31)
  let touchStartX = null;
  let touchStartY = null;
  panel.addEventListener(
    'touchstart',
    (e) => {
      const t = e.changedTouches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    },
    { passive: true }
  );
  panel.addEventListener(
    'touchend',
    (e) => {
      if (touchStartX === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      touchStartX = null;
      touchStartY = null;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 30) {
        onPanelInteract('swipe');
      }
    },
    { passive: true }
  );

  return {
    node,
    panel,
    trueBtn,
    falseBtn,
    pauseBtn,
    /** Updates timer bar fill + color class based on remaining fraction (0..1). */
    updateTimerBar(fraction, paused) {
      const pct = Math.max(0, Math.min(1, fraction)) * 100;
      timerFill.style.width = `${pct}%`;
      timerFill.classList.remove('normal', 'warning', 'critical', 'paused');
      if (paused) {
        timerFill.classList.add('paused');
      } else if (pct <= 10) {
        timerFill.classList.add('critical');
      } else if (pct <= 25) {
        timerFill.classList.add('warning');
      } else {
        timerFill.classList.add('normal');
      }
    },
    setAnswersDisabled(disabled) {
      trueBtn.disabled = disabled;
      falseBtn.disabled = disabled;
    },
    setPauseLabel(isPaused) {
      pauseBtn.textContent = isPaused ? 'RESUME' : 'PAUSE';
      pauseBtn.setAttribute('aria-label', isPaused ? 'Συνέχεια' : 'Παύση');
    },
    showPauseOverlay(show) {
      let overlay = node.querySelector('.pause-overlay');
      if (show && !overlay) {
        overlay = el('div', { class: 'pause-overlay' }, 'ΠΑΥΣΗ');
        node.querySelector('.question-panel-wrapper').style.position = 'relative';
        node.querySelector('.question-panel-wrapper').appendChild(overlay);
      } else if (!show && overlay) {
        overlay.remove();
      }
    },
    startTransitionVisual() {
      panel.classList.add('is-transitioning');
    },
  };
}

// ---------------------------------------------------------------------------
// RESULTS SCREEN
// ---------------------------------------------------------------------------
export function renderResults(root, { results, message, onReview, reviewEnabled, onHome, onExport }) {
  const node = el('div', { class: 'screen results-screen' }, [
    el('h2', { style: 'color:var(--color-navy); margin-bottom:0;' }, 'Αποτελέσματα'),
    el('div', { class: 'results-message-box', role: 'status' }, message),
    el('div', { class: 'results-stats' }, [
      statCard(results.total, 'Σύνολο ερωτήσεων'),
      statCard(results.correct, 'Σωστές'),
      statCard(results.wrong, 'Λάθος'),
      statCard(results.unanswered, 'Αναπάντητες'),
    ]),
    el('div', { class: 'results-stats', style: 'grid-template-columns:1fr;' }, [
      statCard(`${results.percentage.toFixed(1)}%`, 'Ποσοστό επιτυχίας'),
    ]),
    el('div', { class: 'results-actions' }, [
      el(
        'button',
        {
          class: 'btn btn-primary',
          onClick: onReview,
          disabled: reviewEnabled ? null : 'disabled',
        },
        reviewEnabled ? 'REVIEW WRONG ANSWERS' : 'Καμία λανθασμένη απάντηση'
      ),
      el('button', { class: 'btn btn-secondary', onClick: onExport }, 'EXPORT RESULTS'),
      el('button', { class: 'btn btn-secondary', onClick: onHome }, 'HOME'),
    ]),
  ]);
  mount(root, node);
}

function statCard(value, label) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: 'stat-value', text: String(value) }),
    el('div', { class: 'stat-label', text: label }),
  ]);
}

// ---------------------------------------------------------------------------
// REVIEW SCREEN
// ---------------------------------------------------------------------------
export function renderReview(root, { item, index, total, onNext, onBack }) {
  const userAnswerText = item.userAnswer === null ? 'NO ANSWER' : item.userAnswer;
  const node = el('div', { class: 'screen review-screen' }, [
    el('h2', { style: 'color:var(--color-navy); margin-bottom:0;' }, 'Ανασκόπηση λανθασμένων'),
    el(
      'div',
      { class: 'review-card', tabindex: '0', role: 'button', 'aria-label': 'Πατήστε ή σύρετε για επόμενη' },
      [
        el('div', { class: 'review-number' }, `Ερώτηση ${index + 1} / ${total}`),
        el('div', { class: 'review-question' }, item.question),
        el('div', { class: 'review-row' }, [
          el('span', { class: 'label' }, 'Απάντηση χρήστη:'),
          el('span', { class: `value ${item.status === 'WRONG' ? 'wrong' : ''}` }, userAnswerText),
        ]),
        el('div', { class: 'review-row' }, [
          el('span', { class: 'label' }, 'Σωστή απάντηση:'),
          el('span', { class: 'value correct' }, item.correctAnswer),
        ]),
      ]
    ),
    el('p', { class: 'review-nav-hint' }, 'Πατήστε ή σύρετε οριζόντια για την επόμενη ερώτηση'),
    el('div', { class: 'results-actions' }, [el('button', { class: 'btn btn-secondary', onClick: onBack }, 'Πίσω στα αποτελέσματα')]),
  ]);
  mount(root, node);

  const card = node.querySelector('.review-card');
  card.addEventListener('click', onNext);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNext();
    }
  });
  let sx = null;
  let sy = null;
  card.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    sx = t.clientX;
    sy = t.clientY;
  }, { passive: true });
  card.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 30) onNext();
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// KEYBOARD SHORTCUTS HELP MODAL
// ---------------------------------------------------------------------------
export function renderKeyboardHelp(root, onClose) {
  const backdrop = el('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Συντομεύσεις πληκτρολογίου' }, [
    el('div', { class: 'modal-box' }, [
      el('h2', {}, 'Συντομεύσεις πληκτρολογίου'),
      el('dl', {}, [
        el('dt', {}, 'Space / Enter'), el('dd', {}, 'Επόμενη ερώτηση (NEXT)'),
        el('dt', {}, 'T'), el('dd', {}, 'TRUE'),
        el('dt', {}, 'F'), el('dd', {}, 'FALSE'),
        el('dt', {}, 'P'), el('dd', {}, 'PAUSE / RESUME'),
        el('dt', {}, 'Esc'), el('dd', {}, 'Αρχική οθόνη (HOME)'),
        el('dt', {}, 'Ctrl+Shift+/'), el('dd', {}, 'Αυτή η βοήθεια'),
      ]),
      el('button', { class: 'btn btn-primary', onClick: onClose }, 'Κλείσιμο'),
    ]),
  ]);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
      onClose();
    }
  });
  backdrop.querySelector('button').focus();
  return backdrop;
}

export function renderConfirmDialog({ message, onConfirm, onCancel }) {
  const backdrop = el('div', { class: 'modal-backdrop', role: 'alertdialog', 'aria-modal': 'true' }, [
    el('div', { class: 'modal-box' }, [
      el('p', { style: 'font-weight:600;' }, message),
      el('div', { class: 'settings-actions' }, [
        el('button', { class: 'btn btn-secondary', id: 'confirm-cancel' }, 'Cancel'),
        el('button', { class: 'btn btn-danger', id: 'confirm-ok' }, 'Confirm'),
      ]),
    ]),
  ]);
  document.body.appendChild(backdrop);
  backdrop.querySelector('#confirm-cancel').addEventListener('click', () => {
    backdrop.remove();
    onCancel && onCancel();
  });
  backdrop.querySelector('#confirm-ok').addEventListener('click', () => {
    backdrop.remove();
    onConfirm && onConfirm();
  });
  return backdrop;
}
