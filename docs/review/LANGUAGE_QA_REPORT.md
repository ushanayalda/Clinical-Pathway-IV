# Learner language QA

Date: 10 July 2026

Status: IMPLEMENTATION PASS, CLINICAL RELEASE HOLD

## Scope

The audit covered every learner-facing string in:

- Home
- Library
- reading time
- timed Station
- Actual Run
- all eight Review stages
- guided practice and Hints
- Journey
- completion, error and time-limit messages
- desktop and phone layouts

## Language standard

- Everyday English around necessary medical terms
- One clear idea or action at a time
- Natural questions that can be spoken aloud
- Calm senior-doctor coaching voice
- No learner labels
- No academic learning-science terms in the interface
- No system or database language when plain wording is available
- No shame language or gamification

## Changes completed

- Rewrote the site sentence by sentence instead of replacing isolated words.
- Rewrote six doctor-spoken turns and checked all nine aloud-facing turns.
- Rewrote all step explanations and every Review stage.
- Replaced robotic status and Journey wording.
- Added a separate You hand over role.
- Split examiner findings and the handover into readable sections.
- Corrected the pain-description and heart-risk question grammar.
- Added David's diabetes answer so his reply matches the question.
- Made the urgent-plan control available before the full history list without revealing the answer.
- Replaced hidden phone feedback with an inline message that does not cover content.

## Automated safeguards

- Lowercase and uppercase candidate labels are rejected in rendered learner screens.
- Audited robotic and academic phrases are rejected in data and rendered states.
- Learner-spoken turns have length limits for rehearsal.
- Dense examiner and handover blocks must remain split into sections.
- All eight Review stages are checked in the browser.
- Phone feedback must be visible, readable and non-obstructing.

## QA result

- Static contract, language and authority checks: 74 passed
- Browser scenarios: 7 passed
- Desktop visual review: passed
- Phone visual review: passed
- Keyboard and focus review: passed
- Runtime and console errors: none

This is a learner-language and technical implementation pass. Clinical content, sources, medication, audio, accessibility release review and overall clinical release remain on HOLD.
