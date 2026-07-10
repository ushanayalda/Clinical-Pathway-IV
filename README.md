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

This iteration proves the five-room experience: Home, Library, Station, Review, and Journey. It includes a role-correct Actual Run, a four-turn reasoning map, timed practice without prompts, compact sequential Review, direct guided practice, retained attempt history, and rotating changed-detail questions without voice scoring, typing, automatic pass/fail, or gamification.

The mastery loop is:

1. Read for two minutes.
2. Perform an eight-minute timed attempt without prompts.
3. Check the recorded attempt and make one safety judgement.
4. Review three clinical turning points. See the Actual Run only if it was not already studied.
5. Apply the safety rule to two changed situations, rotated across attempts.
6. Select one difficult part and practise it immediately.
7. Use Journey for one next action and optional past-attempt details.

## Run locally

```bash
npm run serve
```

Open `http://127.0.0.1:4173`.

## Validate

```bash
npm test
```

The test command runs 78 contract checks and 7 browser scenarios. They cover learner language, spoken-line length, staged Review integrity, de-duplication, timing, persistence, role correctness, changed situations, mobile, focus, keyboard, and hidden-content boundaries.

## Repository automation

- Pull requests and main-branch updates run the complete validation suite.
- The live site is isolated on the `gh-pages` branch.
- Only `.nojekyll`, `index.html`, `assets/`, and `data/` are published.
- Technical deployment does not change the clinical, source, medication, audio, or release HOLD states.

## Review evidence

Review documents and generated evidence are stored under `docs/review/` and `artifacts/`. A technical acceptance pass does not change any clinical or release HOLD.
