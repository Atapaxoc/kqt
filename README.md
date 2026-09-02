# Εξέταση TRUE/FALSE — KUMITE &amp; KATA

Πλήρως λειτουργική, client-side web εφαρμογή εξέτασης τύπου TRUE/FALSE για
εκπαιδευτική/προπονητική χρήση σε KUMITE και KATA. Χτισμένη με καθαρό
HTML5/CSS3/JavaScript (ES Modules) και [SheetJS](https://sheetjs.com/) για
ανάγνωση αρχείων Excel. Λειτουργεί πλήρως offline μετά την πρώτη φόρτωση
(Service Worker) και δεν απαιτεί backend.

## 1. Εκκίνηση (υποχρεωτικά μέσω web server)

Οι browsers μπλοκάρουν την πρόσβαση σε τοπικά αρχεία (`fetch()` σε
`file://`), οπότε η εφαρμογή **δεν** λειτουργεί με απλό double-click στο
`index.html`. Αν το ανοίξετε έτσι, η εφαρμογή το ανιχνεύει και εμφανίζει
σχετικό μήνυμα. Επιλέξτε έναν από τους παρακάτω τρόπους:

### Επιλογή A — Python (προτεινόμενο για γρήγορη τοπική δοκιμή)
```bash
cd path/to/project
python3 -m http.server 8000
```
Ανοίξτε: `http://localhost:8000/`

### Επιλογή B — VS Code "Live Server"
1. Εγκαταστήστε την επέκταση **Live Server** στο VS Code.
2. Ανοίξτε τον φάκελο του project.
3. Δεξί κλικ στο `index.html` → **Open with Live Server**.

### Επιλογή C — Node.js `http-server`
```bash
npx http-server . -p 8000
```

### Επιλογή D — GitHub Pages
1. Ανεβάστε το περιεχόμενο του φακέλου σε ένα GitHub repository.
2. Settings → Pages → επιλέξτε το branch/φάκελο.
3. Η εφαρμογή θα είναι διαθέσιμη στο `https://<user>.github.io/<repo>/`.

Οποιοσδήποτε άλλος τοπικός ή online HTTP(S) server λειτουργεί εξίσου καλά.

## 2. Απαιτήσεις συστήματος

- Οποιαδήποτε σύγχρονη έκδοση: Chrome, Edge, Firefox, Safari, Brave.
- Android, iOS/iPadOS, Windows, macOS.
- Δεν απαιτείται εγκατάσταση πρόσθετου λογισμικού ή plugin.
- Δεν χρειάζεται σύνδεση στο internet μετά την πρώτη επιτυχή φόρτωση
  (Service Worker cache) — εξαίρεση: πρώτη φόρτωση, ή αν αλλάξετε τα
  αρχεία Excel και θέλετε η εφαρμογή να τα ξαναφορτώσει.

## 3. Δομή αρχείων

```
/
├── index.html
├── css/style.css
├── js/
│   ├── app.js        # orchestrator: state machine, quiz flow, event wiring
│   ├── state.js       # guarded application state machine
│   ├── ui.js           # view layer (DOM rendering only, no business logic)
│   ├── quiz.js         # quiz session model + central completeQuestion()
│   ├── timer.js        # elapsed-time-accurate countdown (performance.now)
│   ├── excel.js         # fetch + validate KUMITE/KATA/affirmations datasets
│   ├── settings.js      # settings-form validation + snapshot helper
│   ├── storage.js       # localStorage read/write with corruption-safe defaults
│   └── utils.js          # Fisher-Yates shuffle, CSV/DOM helpers, etc.
├── vendor/xlsx.full.min.js   # SheetJS, bundled locally (no CDN dependency)
├── data/
│   ├── qkumite.xlsx            # 31 sample KUMITE questions
│   ├── qkata.xlsx                # 30 sample KATA questions
│   └── mini-affirmations.xlsx     # motivational messages for the home screen
├── assets/pic-1.png … pic-20.png    # rotating home-screen background art
├── sw.js                                # Service Worker (offline caching)
├── questions_template_example.xlsx        # Excel template w/ 8 sample rows + comments
└── test/                                    # optional Node dev tests (see §7)
```

`js/service-worker.js` was intentionally not duplicated as a separate file —
the single `sw.js` at the project root serves that role with root scope, per
the spec's note that the suggested structure may be adapted for a better
technical solution.

## 4. Λειτουργίες

- **Αρχική οθόνη**: εναλλασσόμενη εικόνα φόντου (1 από 20, τυχαία ανά
  φόρτωση), τίτλος, τυχαίο μήνυμα ενθάρρυνσης (unbiased shuffle-bag —
  κάθε μήνυμα εμφανίζεται μία φορά πριν επαναληφθεί κανένα), κουμπί έναρξης.
- **Μενού**: KUMITE / KATA (ενεργά μόνο αν το αντίστοιχο Excel είναι
  έγκυρο), SETTINGS, EXIT.
- **Ρυθμίσεις**: χρόνος ερώτησης (6–60 δευτ.), τρόπος επιλογής ερωτήσεων
  (συγκεκριμένος τυχαίος αριθμός / όλες με τη σειρά / όλες τυχαία),
  αριθμός ερωτήσεων, χρώμα πλαισίου ερώτησης. Αποθηκεύονται σε
  `localStorage` και εφαρμόζονται μόνο στην επόμενη εξέταση.
- **Εξέταση**: progress indicator, timer bar πραγματικού χρόνου
  (`performance.now`, όχι μέτρηση callbacks), TRUE/FALSE buttons, PAUSE/RESUME,
  swipe/click/πληκτρολόγιο για μετάβαση.
- **Αποτελέσματα**: στατιστικά (σύνολο/σωστές/λάθος/αναπάντητες/ποσοστό),
  μήνυμα ανάλογα με το ποσοστό επιτυχίας, REVIEW WRONG ANSWERS, EXPORT
  RESULTS (CSV + TXT, UTF-8 BOM), HOME.
- **Πληκτρολόγιο** (μόνο στην οθόνη ερώτησης): `Space`/`Enter`=NEXT,
  `T`=TRUE, `F`=FALSE, `P`=PAUSE/RESUME, `Esc`=HOME (με επιβεβαίωση).
  `Ctrl+Shift+/` (ή `⌘+/`) ανοίγει βοήθεια συντομεύσεων από οπουδήποτε.
- **Offline**: μετά την πρώτη επιτυχή φόρτωση, η εφαρμογή λειτουργεί
  χωρίς σύνδεση (Service Worker cache του app shell + Excel αρχείων).

## 5. Δεδομένα σας (Excel)

Αντικαταστήστε τα αρχεία στο `/data/` με τα δικά σας, διατηρώντας ακριβώς
τα ίδια filenames (`qkumite.xlsx`, `qkata.xlsx`, `mini-affirmations.xlsx`)
και τη δομή στηλών A/B(/C) όπως περιγράφεται στο `questions_template_example.xlsx`.
Δεν χρειάζεται καμία αλλαγή κώδικα όταν αλλάζετε αριθμό, κείμενο ή σωστές
απαντήσεις ερωτήσεων — μόνο τα ίδια τα αρχεία Excel.

## 6. Σημειώσεις ερμηνείας ασαφών σημείων της προδιαγραφής

Η αρχική προδιαγραφή περιείχε μερικά σημεία με εσωτερικές αντιφάσεις.
Τεκμηριώνονται εδώ οι αποφάσεις που ελήφθησαν, ώστε να είναι εύκολα
τροποποιήσιμες:

- **Χρώμα αρχικής οθόνης**: η τιμή `#8CEFA` στο κείμενο δεν είναι έγκυρο
  hex (5 χαρακτήρες). Χρησιμοποιήθηκε το πλησιέστερο έγκυρο και σημασιολογικά
  συνεπές χρώμα `#87CEFA` (LightSkyBlue), σε συμφωνία με το named χρώμα
  που αναφέρεται στο κείμενο.
- **Μηνύματα αποτελεσμάτων ανά ποσοστό (§39)**: τα named εύρη ("έως 95%",
  "έως 90%" …) επικαλύπτονται εν μέρει με τα ρητά εύρη ("από 75% έως 80%"
  …). Υλοποιήθηκε μη-επικαλυπτόμενη, μονοτονική κλίμακα βαθμίδων (βλ.
  `RESULT_CONFIG` στο `js/app.js`) που διατηρεί όλα τα 16 μηνύματα με τη
  σειρά και το χρωματικό ύφος του πρωτοτύπου, στρογγυλοποιώντας το ποσοστό
  στον πλησιέστερο ακέραιο πριν την ταξινόμηση σε βαθμίδα.
- **`timerBarColor` setting**: το section 20 απαιτεί την αποθήκευσή του σε
  `localStorage` (γίνεται), ενώ το section 25 ορίζει σταθερά χρώματα ανά
  κατάσταση (normal/warning/critical/paused) που έχουν προτεραιότητα οπτικά.
  Το setting αποθηκεύεται πιστά αλλά δεν παρακάμπτει τα σταθερά χρώματα
  του section 25, καθώς αυτά είναι η πιο συγκεκριμένη, ελέγξιμη απαίτηση.

## 7. Testing (Section 57)

Όλα τα σενάρια της §57 καλύπτονται από αυτοματοποιημένα Node-based tests
(δεν απαιτούνται για τη λειτουργία της εφαρμογής — μόνο για ανάπτυξη):

```bash
npm install xlsx jsdom --no-save   # dev-only dependencies for the tests
node test/run_logic_tests.mjs      # unit tests: excel validation, quiz
                                     # session, state machine, settings,
                                     # storage — 41 assertions
node test/smoke_test.mjs           # boots the real app.js in jsdom,
                                     # exercises Home→Menu→Quiz→answer,
                                     # simulated double-click race, pause/resume
node test/smoke_test_full_flow.mjs # full run incl. a REAL 6s timeout,
                                     # Results, Export, Review, Home reset
```

Χειροκίνητα, σε πραγματικό browser, ελέγξτε επιπλέον: touch swipe σε
πραγματική συσκευή αφής, orientation change, πραγματικό service worker
offline behavior (DevTools → Application → Service Workers → Offline).

## 8. Troubleshooting

| Πρόβλημα | Πιθανή αιτία / λύση |
|---|---|
| Εμφανίζεται μήνυμα για web server | Ανοίξατε το `index.html` με double-click (`file://`). Χρησιμοποιήστε έναν από τους servers στην §1. |
| "Το αρχείο δεν βρέθηκε" για KUMITE/KATA | Ελέγξτε ότι τα αρχεία βρίσκονται ακριβώς στο `/data/qkumite.xlsx` και `/data/qkata.xlsx` (case-sensitive σε Linux/GitHub Pages). |
| KUMITE ή KATA κουμπί απενεργοποιημένο | Το αντίστοιχο Excel είναι μη έγκυρο (λάθος αρίθμηση, μη έγκυρες απαντήσεις, κ.λπ.) — δείτε το tooltip/aria-label του κουμπιού για τον λόγο. Το άλλο dataset συνεχίζει να λειτουργεί κανονικά. |
| Δεν φορτώνουν οι εικόνες φόντου | Ελέγξτε ότι υπάρχουν τα `assets/pic-1.png` … `pic-20.png`. |
| Η εφαρμογή δεν λειτουργεί offline | Ελέγξτε ότι ο browser υποστηρίζει Service Workers και ότι έγινε τουλάχιστον μία επιτυχής online φόρτωση πριν δοκιμάσετε offline. |
| Ελληνικοί χαρακτήρες εμφανίζονται αλλοιωμένοι στο εξαγόμενο CSV | Ανοίξτε το CSV με Excel μέσω "Data → From Text/CSV" επιλέγοντας UTF-8, ή με LibreOffice Calc· το αρχείο περιέχει ήδη UTF-8 BOM. |
| Ρυθμίσεις δεν διατηρούνται | Ελέγξτε ότι ο browser επιτρέπει `localStorage` (όχι private/incognito με αποκλεισμένο storage, ή "Clear cookies on exit" ενεργό). |
| Η εξέταση "κολλάει" μετά από refresh | Αναμενόμενο: δεν διατηρείται ενεργή εξέταση μετά από refresh (§43). Μόνο οι ρυθμίσεις διατηρούνται. |

## 9. Ασφάλεια — σημαντικός περιορισμός

Η εφαρμογή είναι αμιγώς client-side: οι σωστές απαντήσεις βρίσκονται στον
browser για να γίνεται client-side validation. **Δεν** είναι κατάλληλη για
επίσημη εξεταστική διαδικασία όπου απαιτείται προστασία των απαντήσεων από
τεχνικά καταρτισμένο χρήστη. Προορίζεται για εκπαίδευση, προπόνηση,
practice και self-assessment.
