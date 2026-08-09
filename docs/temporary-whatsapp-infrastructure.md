# Temporary WhatsApp Infrastructure Decision

Date: 2026-08-09

HandyConnect is temporarily using the existing Meta WhatsApp Business Account and registered phone number already available to the business while Meta account/number limits prevent adding a dedicated HandyConnect number.

Current temporary resources:

- WhatsApp Business Account display/account name: `Stokvel-bot-ledger`
- WhatsApp Business Account ID: `2038147740918393`
- Registered number: `+27 67 325 5217`
- Phone Number ID: `1088447464359897`

This is an operational bridge, not the intended long-term identity architecture.

## Follow-up required

When Meta permits it, move HandyConnect to a dedicated WhatsApp Business Account and/or dedicated HandyConnect phone number, then update Supabase Edge Function secrets and Meta webhook subscriptions accordingly.

## Principle

Do not block marketplace validation or payment integration on branding/account cleanup that does not affect the core customer-to-handyman transaction flow.
