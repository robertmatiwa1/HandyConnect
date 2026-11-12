/**
 * Revalidate an offered job at send time. Identity verification is disclosed
 * to the customer on assignment; it is not a beta eligibility requirement
 * (see 20260823082000_beta_allow_unverified_providers_with_disclosure.sql).
 * Availability and registration remain mandatory.
 */
export function eligibleProviderForOffer(provider, serviceMode, now = Date.now()) {
  if (!provider || provider.status !== "active" ||
      provider.registration_status !== "active" ||
      !provider.terms_accepted_at || !provider.profile_completed_at) {
    return { ok: false, reason: "provider_ineligible" };
  }
  if (provider.availability_status !== "available" ||
      (provider.available_until && Date.parse(provider.available_until) <= now) ||
      (provider.reliability_restricted_until && Date.parse(provider.reliability_restricted_until) > now)) {
    return { ok: false, reason: "provider_unavailable" };
  }
  if (serviceMode === "immediate" && provider.active_job_id) {
    return { ok: false, reason: "provider_busy" };
  }
  return { ok: true };
}
