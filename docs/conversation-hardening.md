# HandyConnect 360° Conversation Hardening Contract

## Product principle

The user expresses intent; HandyConnect owns the journey. Human input may be imperfect. Transactional decisions may not be inferred.

## Non-negotiable invariants

1. **Never lose legitimate progress.** Every meaningful answer is persisted before the next prompt. Greetings, stale buttons, retries, timeouts and recoverable errors must not erase a draft.
2. **Resume before restart.** Returning users continue at the minimum missing step. `RESET` is an explicit destructive action and must warn before clearing a meaningful draft.
3. **Natural language tolerant, transactions strict.** Location, service, timing and navigation accept ordinary wording and common spelling variation. Terms acceptance, verification approval, job acceptance, cancellation, completion and payment require explicit actions.
4. **One obvious next action.** Every successful state transition ends with a clear next step. Provider registration hands directly to verification; verification approval hands to availability; customer registration returns to the preserved job draft.
5. **Repeated failure changes behaviour.** Never repeat the same validation message indefinitely. After two failed attempts, show examples/options. After three, preserve state, flag the session for Ops and offer a recovery route.
6. **No silent dead ends.** Internal failures preserve state and return a recoverable message. Stale interactive actions explain what is current and route the user to it.
7. **Idempotent consequences.** Duplicate webhooks/buttons cannot create duplicate jobs, assignments, verification submissions, ratings, payments or entitlements.
8. **Consent is never inferred.** Terms/privacy acceptance is versioned and explicit. Verification documents are requested clearly and never accepted by an admin/bot on the user's behalf.
9. **Privacy by state.** Exact address/contact information is disclosed only when the marketplace state permits it.
10. **Every abandonment is observable.** Ops must know flow, state, last valid context, validation-failure count, last inbound/outbound message, age, recovery attempts and outcome.

## Canonical provider journey

`entry -> terms -> name -> business(optional) -> skill -> base area -> registration complete -> verification required -> document submitted -> pending review -> verified -> availability -> job offer -> accept/decline -> assigned -> start -> complete -> rating/history`

Registration completion must not present availability as the primary next step while verification is incomplete. Primary CTA: **Verify now**. Secondary CTA: **Do this later**.

## Canonical customer journey

`entry/browse -> describe problem -> confirm service -> area -> urgency/time -> optional photo -> review -> terms/name only if required -> submit -> matching -> assigned -> work -> complete -> rating/history`

A customer may browse and build a draft before registration. Registration/Terms must return to the preserved draft and submit it, never restart intake.

## Input tolerance contract

### Location
Accept at least:
- `Claremont`
- `Claremont Cape Town`
- `Claremont, Cape Town`
- `Claremont, Cape Town, Western Cape`
- common Cape Town spelling variants such as `Capetown`

If only a suburb is supplied and the city cannot be safely inferred, ask only for the city; do not reject the suburb. Store normalized location separately from the raw user text.

### Names/business names
Do not treat navigation/button payloads as names. Preserve punctuation and spacing within safe limits. `skip`, `none`, `no business` should all skip an optional business name.

### Services
Prefer natural-language classification and confirmation. Menus are a fallback, not a prerequisite.

### Timing
Accept buttons and common natural phrases (`asap`, `today`, `this afternoon`, `any time`). Ask only for the missing dimension.

## Recovery contract

For every active flow maintain:
- `last_completed_step`
- durable draft context
- `validation_failures` keyed by state
- `last_failure_reason`
- `last_recovery_at`
- `recovery_count`

Recovery messages must be state-specific and must mention preserved progress where useful. Never send a generic restart instruction when the system still has valid data.

## Verification contract

Provider registration completion message:

> Registration complete ✓\nOne final step before you can receive jobs: verify your identity. Send a clear JPG, PNG or PDF of your SA ID, passport or valid permit. Do not type the document number into chat.

Actions: `Verify now`, `Do this later`.

Pending:

> Document received ✓ Your verification is pending review. You do not need to send anything else. We will message you when it is reviewed.

Approved:

> You're verified ✓ Your profile can now receive jobs.

Primary action: `I'm available`.

Rejected: show the review reason in plain language and a `Submit another document` action.

## Regression scenarios required before production conversation changes

- Reuben: provider enters `Claremont Capetown`; registration must continue without restart.
- Provider accepts Terms, leaves after skill, returns with `Hi`; progress must resume or offer Resume vs Home without deletion.
- Provider completes registration; next primary CTA is verification, not availability.
- Provider sends an email while verification document is expected; bot explains accepted document types and keeps state.
- Customer: `broken fridge` -> Appliance Repair -> `Langa Cape Town`; draft continues.
- Customer reaches Terms/name from a completed draft; after registration the original request is submitted/presented, not discarded.
- Customer sends an old button from an earlier request; current request is shown and no duplicate job is created.
- Duplicate inbound webhook and double-tapped Accept create one assignment only.
- Photo upload fails; job/draft remains intact and user can retry/skip.
- User returns after 24h/7d; state is recoverable and stale buttons do not corrupt it.
- Dual-role user switches customer/provider during a draft; draft remains recoverable.
- Three invalid inputs at one state trigger adaptive help + Ops flag, not a fourth identical rejection.

## Operational SLOs for beta

- 0 known flow-induced data-loss events.
- 0 duplicate assignments/payments/consent events.
- >= 95% of supported natural location inputs accepted or resolved with one follow-up.
- >= 90% of provider registrations reaching base area are handed directly to verification.
- 100% of stalled sessions visible in Ops with exact state and last activity.
- Recovery/nudge status observable as queued/sent/failed without full-page refresh.

## Release rule

No new marketplace feature outranks a P0/P1 conversation defect. Every real-user failure becomes a regression scenario before the corresponding fix is considered complete.
