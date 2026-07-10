# Provisional implementation decisions

Status: DRAFT FOR HUMAN REVIEW

These decisions make the Case 001 vertical slice testable. They are not final product decisions and do not resolve Authority Pack v2 release gates.

## Decisions used in this prototype

1. Learning mode opens with the complete role-correct Actual Run, then presents one turn beside one short road-map explanation. Teaching remains unavailable inside Blind Station.
2. Blind Station remains self-driven: speak aloud, then reveal a broad clinical area. There is no typing, voice analysis, or automatic result. Observable timing and interaction evidence are retained without being called a score.
3. The source Station Card preserves the authority heading. The learner renderer displays “Your information and tasks” to follow the later first-person wording decision.
4. Review uses eight fixed, sequential stages with only one stage active at a time. Confidence cannot complete Review by itself.
5. A 1 to 5 confidence description is collected before and after Review for comparison. Journey prioritises missing execution evidence over self-confidence.
6. Guided retry exposes one selected Hint, then an optional model line. The learner records that the weak turn was practised before opening a new Blind Station. Blind Station contains no Hints.
7. Visual tokens are provisional: calm navy, teal, warm neutral surfaces, adult typography, and no colour-only meaning.
8. The four-way prototype split remains library, station, review, and governance. It is not declared the final production split.
9. David's response to the no-driving explanation must be opened before manual Finish. The site records that the pushback was explored but does not claim to assess the learner's speech quality.
10. No medication content was added. Audio was not generated.
11. Three short transfer drills test the same safety rule under changed wording, one absent classic clue, and early-test pressure. They do not create Case 002.
12. A separate two-minute reading clock precedes the strict eight-minute Station clock. Time expiry locks the attempt and opens Review.

## Decisions still requiring human approval

- Final Home layout
- Final Station mockup
- Final Review button wording
- Final Journey design
- Final Library hierarchy
- Final design tokens
- Final production data split
- Clinical wording and full Gold Run
- Confidence scale and retry cadence

All items remain reviewable. None is release authority.
