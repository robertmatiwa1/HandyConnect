# Conversation Flows

The conversation engine is channel-neutral. WhatsApp will be an adapter; the same engine can be tested through an internal caller.

## Entry

`choose_role`

- 1 / handyman / work -> `handyman_onboarding`
- 2 / customer / need help -> `customer_job`
- `RESET` from any state starts again

## Handyman onboarding

`capture_name` -> `capture_business` -> `capture_skills` -> `capture_location` -> `ready`

On completion the engine calls `onboard_handyman(...)`, which upserts the handyman, adds valid skills, adds a service area, and creates exactly one Free registration entitlement.

## Customer job intake

`capture_job_description` -> `capture_job_skill` -> `capture_job_location` -> `ready`

On completion the engine upserts a customer by phone, creates the job, calls `find_job_candidates`, and creates offers for up to five eligible candidates.

Actual outbound WhatsApp delivery is intentionally not implemented until Meta credentials and templates are connected. The engine currently returns the message that the adapter should send.

## Message idempotency

Inbound `external_message_id` values are unique. A repeated provider webhook does not advance the state twice.
