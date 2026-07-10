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

This iteration proves the five-room experience: Home, Library, Station, Review, and Journey. It includes a role-correct Actual Run, timed practice without prompts, sequential Review, guided practice, retained attempt history, and three changed-detail questions without voice scoring, typing, automatic pass/fail, or gamification.

The mastery loop is:

1. Read for two minutes.
2. Perform an eight-minute timed attempt without prompts.
3. Check what was completed and compare the attempt with the Actual Run.
4. Practise the full spoken station and review why each step matters.
5. Apply the safety rule to three changed situations.
6. Select and practise one difficult part.
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

The test command runs 74 contract checks and 7 browser scenarios. They cover learner language, spoken-line length, staged Review integrity, timing, persistence, role correctness, changed situations, mobile, focus, keyboard, and hidden-content boundaries.

## Repository automation

- Pull requests and main-branch updates run the complete validation suite.
- The live site is isolated on the `gh-pages` branch.
- Only `.nojekyll`, `index.html`, `assets/`, and `data/` are published.
- Technical deployment does not change the clinical, source, medication, audio, or release HOLD states.

## Review evidence

Review documents and generated evidence are stored under `docs/review/` and `artifacts/`. A technical acceptance pass does not change any clinical or release HOLD.
