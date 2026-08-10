# HandyConnect test personas

HandyConnect uses separate personas instead of testing production journeys through an owner or administrator account.

## Automated personas

Every integration run creates unique, short-lived identities on the internal `test` channel:

| Persona | Identifier pattern | Purpose |
|---|---|---|
| Customer | `test:customer:<run-id>` | Registration, request, quote, completion and rating |
| Provider | `test:provider:<run-id>` | Registration, verification gate, availability, offer and job lifecycle |

Rules:

- A run ID must be unpredictable and unique.
- Synthetic identities must never use the `whatsapp` channel.
- Synthetic providers remain offline and unverified unless the test explicitly changes those states.
- Every run records the rows it created and deletes them in dependency order after assertions.
- Cleanup is verified by querying customers, handymen, sessions, jobs, matches, assignments and notifications for the run identifiers.
- Failed cleanup is a failed test and must alert the operator.

## Live WhatsApp pilot personas

Full delivery testing requires two real WhatsApp numbers controlled by HandyConnect:

| Persona | Display name | Required use |
|---|---|---|
| Pilot Customer | HandyConnect Test Customer | Sends requests and confirms customer-side actions |
| Pilot Provider | HandyConnect Test Handyman | Receives offers and completes provider-side actions |

These numbers are configured only after both are available. They must be tagged as test identities, excluded from marketplace analytics, restricted to test jobs and prevented from matching real users. One phone switching roles is useful for menu testing but is not a valid end-to-end marketplace test because it cannot prove delivery between two participants.

## Minimum identity assertions

1. `Hi` alone creates no customer or provider profile.
2. Selecting a role starts onboarding but grants no marketplace capability.
3. `Not now` leaves the identity unregistered.
4. Terms acceptance is timestamped and versioned.
5. Customer registration becomes active only after a valid name is saved.
6. Provider registration becomes active only after the onboarding transaction completes.
7. An active but unverified provider cannot receive or accept real offers.
8. A registered person may hold both roles while each role keeps its own registration and verification state.
9. Stale or forged registration buttons cannot bypass the lifecycle checks.
10. Test identities never appear in production matching or business metrics.
