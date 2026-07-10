# Clinical Pathway IV

Case 001 end-to-end mastery-loop site built from Clinical Pathway Authority Pack v2.

Live technical site: `https://ushanayalda.github.io/Clinical-Pathway-IV/`

## Current boundary

- Module: `CP-C001`, Chest discomfort after lunch
- Product status: draft prototype for human review
- Clinical status: HOLD
- Audio status: HOLD, no audio generated
- Release status: HOLD
- Case 002: blocked

This iteration proves the five-room experience: Home, Library, Station, Review, and Journey. It includes a role-correct Actual Run, Blind Station, sequential Review, Guided Retry, retained attempt evidence, and three transfer drills without voice scoring, typing, automatic pass/fail, or gamification.

The mastery loop is:

1. Read for two minutes.
2. Perform an eight-minute blind attempt.
3. Compare objective interaction evidence and self-check the run.
4. Rehearse the prototype sequence and reasoning map.
5. Apply the safety rule to three altered scenarios.
6. Select and practise one weak turn.
7. Repeat the full station and retain both attempts in Journey.

## Run locally

```bash
npm run serve
```

Open `http://127.0.0.1:4173`.

## Validate

```bash
npm test
```

The test command runs 65 contract checks and 7 browser scenarios covering staged mastery integrity, timing, persistence, role correctness, transfer, mobile, focus, keyboard, and hidden-content boundaries.

## Repository automation

- Pull requests and main-branch updates run the complete validation suite.
- The live site is isolated on the `gh-pages` branch.
- Only `.nojekyll`, `index.html`, `assets/`, and `data/` are published.
- Technical deployment does not change the clinical, source, medication, audio, or release HOLD states.

## Review evidence

Review documents and generated evidence are stored under `docs/review/` and `artifacts/`. A technical acceptance pass does not change any clinical or release HOLD.
