---
name: Recruitment intent detector ordering
description: Why recruitment_dashboard/candidate_search need negative guards on earlier matchers
---
The intent detector (server/ai/intents/detector.ts) iterates matchers in ARRAY
ORDER and returns the first hit. recruitment_status and quick_summary are defined
BEFORE recruitment_dashboard, so a phrase like "recruitment dashboard" or
"hiring funnel" would be swallowed by recruitment_status (matches "recruitment"/
"hiring") or quick_summary (matches "dashboard summary").

**Rule:** earlier broad matchers must add a negative guard excluding the
dashboard/funnel/metrics terms so the dedicated recruitment_dashboard matcher is
reachable. "pipeline" is also a candidate-stage word, so recruitment_dashboard
only treats it as a dashboard signal when NO explicit search verb (find/search/
list/...) is present — otherwise "find candidates in pipeline" must route to
candidate_search.

**Why:** comment in code claimed dashboard was "checked before" status/summary,
but array position made that false; tests caught it.
**How to apply:** when adding any new recruitment intent, check it isn't shadowed
by an earlier broad matcher; add tests in server/__tests__/ai-recruitment.test.ts.
