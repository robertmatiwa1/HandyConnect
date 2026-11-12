import test from "node:test";
import assert from "node:assert/strict";
import { eligibleProviderForOffer } from "../supabase/functions/notification-dispatcher/offer-eligibility.mjs";

const now = Date.parse("2026-11-12T10:00:00Z");
const ready = { status:"active", registration_status:"active",
  terms_accepted_at:"2026-08-01T10:00:00Z", profile_completed_at:"2026-08-02T10:00:00Z",
  availability_status:"available", available_until:"2026-11-12T12:00:00Z",
  reliability_restricted_until:null, active_job_id:null, verification_status:"unverified" };

test("unverified but disclosed beta provider is eligible", () => {
  assert.deepEqual(eligibleProviderForOffer(ready,"immediate",now),{ok:true});
});
test("suspended or incomplete provider cannot receive offers", () => {
  assert.equal(eligibleProviderForOffer({...ready,status:"suspended"},"immediate",now).ok,false);
  assert.equal(eligibleProviderForOffer({...ready,profile_completed_at:null},"immediate",now).ok,false);
});
test("unavailable, expired or restricted provider cannot receive offers", () => {
  assert.equal(eligibleProviderForOffer({...ready,availability_status:"unavailable"},"immediate",now).ok,false);
  assert.equal(eligibleProviderForOffer({...ready,available_until:"2026-11-12T09:59:59Z"},"immediate",now).ok,false);
  assert.equal(eligibleProviderForOffer({...ready,reliability_restricted_until:"2026-11-12T12:00:00Z"},"immediate",now).ok,false);
});
test("immediate capacity is respected while scheduled jobs are permitted", () => {
  const busy={...ready,active_job_id:"an-existing-job"};
  assert.equal(eligibleProviderForOffer(busy,"immediate",now).reason,"provider_busy");
  assert.deepEqual(eligibleProviderForOffer(busy,"scheduled",now),{ok:true});
});
test("verified provider remains eligible when otherwise ready", () => {
  assert.deepEqual(eligibleProviderForOffer({...ready,verification_status:"verified"},"immediate",now),{ok:true});
});
