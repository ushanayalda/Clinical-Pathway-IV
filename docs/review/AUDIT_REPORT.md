# Case 001 language and learning-flow audit

Date: 10 July 2026  
Status: IMPLEMENTATION QA PASS, CLINICAL RELEASE HOLD

## Verdict

Case 001 now works as a low cognitive-load learning and execution loop rather than a passive case viewer. The learner-facing language is direct, natural, and easy to say aloud. Confidence alone cannot complete Review or trigger a long delay before the next practice.

This result is a technical and educational-flow pass for the prototype. It is not clinical approval or publication authority.

## Audit results

| Audit target | Result | Final evidence |
|---|---|---|
| Learner language | Pass | Home, Library, Station, Actual Run, all eight Review stages, Journey, feedback and error states use everyday English. Audited robotic phrases are blocked by tests. |
| Spoken grammar | Pass | All nine doctor-spoken turns were checked for natural grammar and read-aloud flow. Pain and risk questions use parallel wording. The handover is visually split and stays within its practice target. |
| Honest completion | Pass | Review completes only after the self-check, safety check, plan-change review, full Actual Run practice, three changed-detail questions, one selected practice area and final confidence. |
| Timed-station checklist | Pass | Finish requires pain questions, warning symptoms, requested examiner findings, management discussion and David's response. Time and opened topics are retained. |
| Attempt persistence | Pass | New retries preserve prior attempt and Review records. Journey displays attempt history and does not overwrite earlier evidence. |
| Role-correct learning | Pass | Every Actual Run turn is labelled You say, David says, You ask the examiner, Examiner says, Action to take or You hand over. David's and examiner's words are never presented as learner dialogue. |
| Actual Run | Pass for prototype | The whole 17-turn encounter appears before the step-by-step view. Full spoken practice and one-part explanations are both available. |
| Clinical sequence | Pass for prototype scope | An ambulance is called as soon as several warning signs are clear. Heart risk questions continue while help is coming. Examiner findings are requested directly. |
| Clinical boundary | Pass | The interface says that this example is not a full treatment guide. Medication remains outside this station example. |
| Changed details | Pass | Three short situations test a changed patient label, one missing classic feature and pressure to wait for an early ECG. |
| Strict timing | Pass | A separate 2-minute reading countdown is followed by an 8-minute Station timer. At zero, the station finishes and Review opens. |
| Cognitive load | Pass | Review is sequential, future stages stay unavailable, one main Continue action is shown, and focus remains on the current stage. |
| Mobile | Pass | There is no horizontal overflow. Controls remain at least 44 pixels high. Updated responses stay visible, and phone feedback appears inline without covering content or controls. |
| Hidden content | Pass | Review data and the Actual Run remain unavailable during timed practice. Available-test information does not reveal the management answer. |
| Journey routing | Pass | The main action matches what remains. A selected practice area comes before another timed station. Short or incomplete attempts do not receive a one-week delay. |

## Final QA

- Static contract, language and authority checks: 74 passed
- Browser acceptance scenarios: 7 passed
- Desktop, mobile, keyboard, focus, timing and persistence checks: passed
- Console and runtime errors: none detected
- Case 002 artifacts: none
- Audio generated: none
- Long dash character in learner files: none
- Visual evidence: desktop plus Station and Review mobile screenshots regenerated

## Remaining release gates

- Source status: HOLD
- Schema status: HOLD
- Clinical status: HOLD
- Medication management: HOLD
- Human accessibility release review: HOLD
- Renderer release review: HOLD
- Audio generation and listen testing: HOLD
- Overall release: HOLD
- Case 002: BLOCKED

The next authorised operation is human clinical and source review of Case 001. Expansion to Case 002 remains blocked.
