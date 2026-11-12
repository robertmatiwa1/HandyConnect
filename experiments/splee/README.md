# Splee prospecting pilot — isolated and outbound-disabled

This is a **local, no-network proof of concept** for HandyConnect business prospect qualification. It is not Splee itself, and does not imply Splee has been deployed.

## Boundaries
- Keep Splee in its own service and database. Never give it HandyConnect's Supabase service-role key, production database access, WhatsApp tokens or payment credentials.
- Do not scrape, enrich or contact real people during this pilot.
- Do not send email, WhatsApp, SMS or other direct marketing from this pilot. No automated outreach.
- Research licence implications of Splee's AGPL-3.0 before modifying or hosting its network-facing software.
- Record the source, lawful basis, contact preferences, consent evidence and suppression decisions before any real lead is processed.
- Have a human review each proposed contact and applicable POPIA section 69 requirements; a public contact address is not consent.
- Only import a qualified prospect into HandyConnect after an explicit, approved integration contract and deduplication rules.

## Run
```sh
node experiments/splee/qualify.mjs experiments/splee/sample-prospects.json
node --test experiments/splee/qualify.test.mjs
```

The sample data is fictional. The program performs only local file reads and console output. It contains **no** network client, messaging code, environment secrets, or connection to production.

## Exit gates
1. Splee service isolated and pinned to reviewed source/version.
2. Licence/security/privacy review signed off.
3. Approved data-source inventory and retention/deletion/suppression controls.
4. Demonstrate qualification with synthetic leads, then consented pilot leads.
5. Human-approved outbound workflow only after legal/privacy review.
6. Controlled HandyConnect integration with audit logs and no direct writes to booking tables.
