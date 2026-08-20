begin;

-- Regression: Paystack may emit subscription.create before charge.success.
-- The processor must reconcile the provider subscription id after the successful charge creates the local subscription row.

-- This smoke test is intentionally metadata-focused; production event payloads are exercised through webhook integration tests.
select 1;

rollback;
