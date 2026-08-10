# Conversation Flows

WhatsApp is HandyConnect's primary interface. The Meta webhook verifies inbound
signatures, resolves the WhatsApp identity, deduplicates the message ID and then
routes each action to a state-aware domain router.

## Entry

`choose_role`

- 1 / handyman / work -> `handyman_onboarding`
- 2 / customer / need help -> `customer_job`
- `RESET` from any state starts again

## Handyman onboarding

`capture_name` -> `capture_business` -> `capture_skills` -> `capture_location` -> `ready`

On completion the engine calls `onboard_handyman(...)`, which upserts the handyman, adds valid skills, adds a service area, and creates exactly one Free registration entitlement.

## Customer job intake

`problem` -> `service area` -> `timing` -> `request live`

The street address and materials questions are not part of pre-match intake.
Customers can add an optional photo after the request goes live. Exact addresses
remain private until a handyman accepts.

## Provider navigation

The handyman dashboard has five isolated destinations:

1. `H_CURRENT` — the accepted immediate job, or the next accepted scheduled job.
2. `H_NEW` — matching opportunities. Busy providers may browse but cannot accept
   another immediate job.
3. `H_HISTORY` — read-only completed and cancelled assignments.
4. `H_AVAIL` — available/offline while free; database-locked to busy while an
   immediate job is active.
5. `H_PROFILE` — verification, skills, service areas and plan.

Acceptance calls `accept_job_transaction(...)`. The database atomically assigns
the job, consumes immediate capacity and sets the provider to busy. The response
then offers `Manage job`, `View new jobs` and `Dashboard`.

Provider cancellation requires a reason. It rematches the customer, records the
reason and starts a 30-minute acceptance cool-down. A scheduled database task
restores availability after the cool-down unless the provider explicitly chose
to remain offline.

## Message idempotency

Inbound `external_message_id` values are unique. A repeated provider webhook does not advance the state twice.
