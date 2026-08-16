# HandyConnect Conversation Transcript Regression Suite

This suite preserves the real beta failure patterns that must never regress.

## Purpose

A conversation change is not considered safe merely because helper/unit tests pass. The product must continue to satisfy journey-level invariants:

- preserve progress;
- resume instead of restart;
- tolerate ordinary WhatsApp phrasing;
- never infer consent;
- never create duplicate jobs/assignments/events on replay;
- never publish unsupported or ambiguous requests;
- resolve stale actions against live state;
- make verification the next step for registered-but-unverified providers.

## Canonical scenarios

`scenarios.json` contains the minimum regression set based on real HandyConnect beta incidents and critical transactional paths. Every production conversation change should be checked against these scenarios.

## Required invariants

1. Reuben-style location input (`Claremont Capetown`) is accepted.
2. Provider Terms interruption never destroys name/business/skill/location progress.
3. Registered-but-unverified providers resume into verification.
4. Customers resume unfinished drafts without duplicate job creation.
5. Unsupported requests never become matchable jobs.
6. Multi-trade descriptions require clarification instead of first-match guessing.
7. Stale buttons are safe and route to current state.
8. Duplicate Accept/Arrived/Confirm Start/Complete/Confirm Complete actions are replay-safe.
9. A provider with an active job resumes into Current Job.
10. All publication and assignment boundaries remain database-enforced even if a router regresses.

## Execution model

The transcript cases are intentionally data-driven so they can be executed against a disposable Supabase branch/test harness. Tests must not run destructive scenarios against production user records.

For each scenario the runner should:

1. create isolated test identities and fixtures;
2. replay messages in order through the production routing entrypoint used by WhatsApp;
3. inspect response text/UI and database state after each turn;
4. replay any designated duplicate actions;
5. assert the scenario invariants;
6. delete or rollback the fixture state.

A future defect found from a real user must be added here before the defect is considered closed.
