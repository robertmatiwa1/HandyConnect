import { createClient } from "@supabase/supabase-js";
type Incoming = {
  channel?: "whatsapp" | "test" | "admin";
  external_user_id?: string;
  external_message_id?: string;
  message?: string;
  media?: { id: string; type: string; mime_type?: string; filename?: string };
};
type Row = { id: string; title: string; description?: string };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
function key() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (typeof p.default === "string" && p.default) return p.default;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const norm = (s: string) => s.trim().toLowerCase();
const short = (s: string, n = 22) => s.length > n ? `${s.slice(0, n - 1)}…` : s;
async function call(url: string, k: string, target: string, input: Incoming) {
  const r = await fetch(`${url}/functions/v1/${target}`, {
    method: "POST",
    headers: { apikey: k, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return {
    status: r.status,
    body: await r.json().catch(() => ({ error: "invalid_router_response" })),
  };
}
function customerRows(
  job: any,
  reviewed = false,
  arrived = false,
  completionRequested = false,
  quote: any = null,
): Row[] {
  const rows: Row[] = [];
  if (["open", "matching"].includes(job.status)) {
    rows.push({ id: `JOB_STATUS:${job.id}`, title: "Check status" }, {
      id: `EDIT_JOB:${job.id}`,
      title: "Edit request",
    }, { id: `CANCEL:${job.id}`, title: "Cancel request" });
  } else if (["assigned", "in_progress"].includes(job.status)) {
    rows.push({ id: `JOB_STATUS:${job.id}`, title: "Check status" });
    if (job.status === "assigned" && quote?.status === "proposed") {
      rows.push({
        id: `QUOTE_ACCEPT:${quote.id}`,
        title: `Accept R${Number(quote.amount).toFixed(2)}`,
      }, { id: `QUOTE_REJECT:${quote.id}`, title: "Reject quote" });
    }
    if (job.status === "assigned" && arrived && quote?.status === "accepted") {
      rows.push({ id: `CONFIRM_START:${job.id}`, title: "Confirm & start" });
    }
    if (job.status === "in_progress" && completionRequested) {
      rows.push({
        id: `CONFIRM_COMPLETE:${job.id}`,
        title: "Confirm complete",
      });
    }
    rows.push({ id: `ISSUE:customer_cancel:${job.id}`, title: "Cancel job" }, {
      id: `ISSUE:handyman_no_show:${job.id}`,
      title: "Handyman no-show",
    });
  } else if (job.status === "completed" && !reviewed) {
    rows.push({ id: `RATE_MENU:${job.id}`, title: "Rate handyman" });
  }
  if (["assigned", "in_progress", "completed"].includes(job.status)) {
    rows.push({ id: `REPORT_JOB:${job.id}`, title: "Report a problem" });
  }
  rows.push({ id: "NEW_REQUEST", title: "New request" }, {
    id: "CUSTOMER_JOBS",
    title: "My jobs",
  }, { id: "HOME", title: "Home" });
  return rows.slice(0, 10);
}
async function latestQuote(s: any, jobId: string) {
  const q = await s.from("job_quotes").select(
    "id,amount,note,status,proposed_at,responded_at",
  ).eq("job_id", jobId).order("proposed_at", { ascending: false }).limit(1)
    .maybeSingle();
  if (q.error) throw q.error;
  return q.data;
}
async function decorateCustomerJob(s: any, body: any, customerId: string) {
  const id =
    body?.ui?.rows?.find((r: any) => String(r.id).startsWith("JOB_STATUS:"))?.id
      ?.split(":")[1] ?? body?.job_id;
  if (!id) return body;
  const q = await s.from("jobs").select("id,status").eq("id", id).eq(
    "customer_id",
    customerId,
  ).maybeSingle();
  if (!q.data) return body;
  const rev = await s.from("reviews").select("id").eq("job_id", id)
    .maybeSingle();
  const a = await s.from("job_assignments").select(
    "arrived_at,completion_requested_at",
  ).eq("job_id", id).is("cancelled_at", null).maybeSingle();
  const quote = await latestQuote(s, id);
  const qtxt = quote
    ? ` · quote R${Number(quote.amount).toFixed(2)} ${quote.status}`
    : " · no quote agreed";
  body.ui = {
    type: "list",
    body: `Job options · ${q.data.status}${qtxt}`,
    button: "Manage job",
    rows: customerRows(
      q.data,
      !!rev.data,
      !!a.data?.arrived_at,
      !!a.data?.completion_requested_at,
      quote,
    ),
  };
  return body;
}
async function customerJobs(s: any, customerId: string) {
  const q = await s.from("jobs").select(
    "id,description,suburb,city,status,created_at",
  ).eq("customer_id", customerId).order("created_at", { ascending: false })
    .limit(8);
  if (q.error) throw q.error;
  if (!q.data?.length) {
    return {
      ok: true,
      reply: "You haven't requested any jobs yet.",
      ui: {
        type: "buttons",
        body: "What would you like to do?",
        buttons: [{ id: "REQUEST_HELP", title: "Request help" }],
      },
    };
  }
  return {
    ok: true,
    reply: "Choose a job to view its current status and actions.",
    ui: {
      type: "list",
      body: "Your jobs",
      button: "Choose job",
      rows: q.data.map((j: any) => ({
        id: `CJOB:${j.id}`,
        title: short(j.description),
        description: `${j.status} · ${
          [j.suburb, j.city].filter(Boolean).join(", ")
        }`,
      })),
    },
  };
}
async function providerCapacity(s: any, handymanId: string) {
  const q = await s.from("handymen").select(
    "id,active_job_id,availability_status,availability_cooldown_until",
  ).eq("id", handymanId).single();
  if (q.error) throw q.error;
  return q.data;
}

type OfferJob = {
  match_id: string;
  job_id: string;
  description: string;
  suburb: string;
  city: string;
  province: string;
  service_mode: string;
  scheduled_start_at: string | null;
};

const locationKey = (value: string) => value.trim().toLocaleLowerCase("en-ZA");
const locationId = (value: string) => encodeURIComponent(value.trim());
const locationValue = (value: string) => decodeURIComponent(value);

async function openOfferJobs(s: any, handymanId: string): Promise<OfferJob[]> {
  const offers = await s.from("job_matches").select(
    "id,job_id,offered_at,offer_expires_at",
  ).eq("handyman_id", handymanId).eq("status", "offered").or(
    `offer_expires_at.is.null,offer_expires_at.gt.${new Date().toISOString()}`,
  ).order("offered_at", { ascending: false }).limit(1000);
  if (offers.error) throw offers.error;
  const ids = (offers.data ?? []).map((x: any) => x.job_id);
  const jobs = ids.length
    ? await s.from("jobs").select(
      "id,description,suburb,city,province,status,service_mode,scheduled_start_at",
    ).in("id", ids).in("status", ["open", "matching"])
    : { data: [], error: null };
  if (jobs.error) throw jobs.error;
  const byId = new Map((jobs.data ?? []).map((j: any) => [j.id, j]));
  return (offers.data ?? []).flatMap((offer: any) => {
    const job: any = byId.get(offer.job_id);
    if (!job) return [];
    return [{
      match_id: offer.id,
      job_id: job.id,
      description: job.description,
      suburb: job.suburb?.trim() || "Area not specified",
      city: job.city?.trim() || "Town not specified",
      province: job.province?.trim() || "Province not specified",
      service_mode: job.service_mode,
      scheduled_start_at: job.scheduled_start_at,
    }];
  });
}

function locationGroups(
  jobs: OfferJob[],
  field: "province" | "city" | "suburb",
) {
  const groups = new Map<string, { label: string; count: number }>();
  for (const job of jobs) {
    const label = job[field];
    const key = locationKey(label);
    const current = groups.get(key);
    groups.set(key, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function pagedLocationMenu(
  groups: { label: string; count: number }[],
  page: number,
  prefix: string,
  body: string,
  backId?: string,
  pagePrefix = `${prefix}_PAGE`,
) {
  const pageSize = 6;
  const lastPage = Math.max(0, Math.ceil(groups.length / pageSize) - 1);
  const safePage = Math.max(0, Math.min(page, lastPage));
  const rows: Row[] = groups.slice(safePage * pageSize, (safePage + 1) * pageSize)
    .map((group) => ({
      id: `${prefix}:${locationId(group.label)}`,
      title: short(group.label, 24),
      description: `${group.count} open job${group.count === 1 ? "" : "s"}`,
    }));
  if (safePage > 0) rows.push({ id: `${pagePrefix}:${safePage - 1}`, title: "Previous" });
  if (safePage < lastPage) rows.push({ id: `${pagePrefix}:${safePage + 1}`, title: "Next" });
  if (backId) rows.push({ id: backId, title: "Back" });
  rows.push({ id: "HANDYMAN_HOME", title: "Dashboard" });
  return {
    type: "list",
    body: `${body} · Page ${safePage + 1} of ${lastPage + 1}`,
    button: "Choose",
    rows: rows.slice(0, 10),
  };
}
async function handymanCurrentJob(s: any, handymanId: string) {
  const h = await providerCapacity(s, handymanId);
  if (!h.active_job_id) {
    const scheduled = await s.from("job_assignments").select(
      "job_id,assigned_at",
    ).eq("handyman_id", handymanId).eq("assignment_kind", "scheduled").is(
      "cancelled_at",
      null,
    ).is("completed_at", null).order("assigned_at", { ascending: true }).limit(
      1,
    ).maybeSingle();
    if (scheduled.error) throw scheduled.error;
    if (scheduled.data?.job_id) {
      return handymanJob(s, handymanId, scheduled.data.job_id);
    }
    return {
      ok: true,
      reply: "You do not have an immediate job in progress.",
      ui: {
        type: "buttons",
        body: "What would you like to do?",
        buttons: [{ id: "H_NEW", title: "New jobs" }, {
          id: "H_HISTORY",
          title: "Job history",
        }, { id: "HANDYMAN_HOME", title: "Dashboard" }],
      },
    };
  }
  return handymanJob(s, handymanId, h.active_job_id);
}
async function handymanNewJobs(s: any, handymanId: string, page = 0) {
  const h = await providerCapacity(s, handymanId);
  const jobs = await openOfferJobs(s, handymanId);
  const busyText = h.active_job_id
    ? " You may browse, but another immediate job cannot be accepted until Current job is released."
    : "";
  if (!jobs.length) {
    return {
      ok: true,
      reply: `There are no open matching offers for you right now.${busyText}`,
      ui: {
        type: "buttons",
        body: "New jobs",
        buttons: h.active_job_id
          ? [{ id: "H_CURRENT", title: "Current job" }, {
            id: "HANDYMAN_HOME",
            title: "Dashboard",
          }]
          : [{ id: "H_AVAIL", title: "Availability" }, {
            id: "HANDYMAN_HOME",
            title: "Dashboard",
          }],
      },
    };
  }
  return {
    ok: true,
    reply: `${jobs.length} matching job${jobs.length === 1 ? "" : "s"}. Choose a province first.${busyText}`,
    ui: pagedLocationMenu(locationGroups(jobs, "province"), page, "HLOC_PROVINCE", "New jobs · Provinces"),
  };
}

async function handymanJobsByCity(s: any, handymanId: string, province: string, page = 0) {
  const jobs = (await openOfferJobs(s, handymanId)).filter((job) => locationKey(job.province) === locationKey(province));
  return {
    ok: true,
    reply: `${jobs.length} open job${jobs.length === 1 ? "" : "s"} in ${province}. Choose a town or city.`,
    ui: pagedLocationMenu(locationGroups(jobs, "city"), page, `HLOC_CITY:${locationId(province)}`, `${province} · Towns`, "H_NEW", `HLOC_CITIES:${locationId(province)}`),
  };
}

async function handymanJobsByArea(s: any, handymanId: string, province: string, city: string, page = 0) {
  const jobs = (await openOfferJobs(s, handymanId)).filter((job) =>
    locationKey(job.province) === locationKey(province) && locationKey(job.city) === locationKey(city)
  );
  return {
    ok: true,
    reply: `${jobs.length} open job${jobs.length === 1 ? "" : "s"} in ${city}, ${province}. Choose an area.`,
    ui: pagedLocationMenu(locationGroups(jobs, "suburb"), page, `HLOC_AREA:${locationId(province)}:${locationId(city)}`, `${city} · Areas`, `HLOC_PROVINCE:${locationId(province)}`, `HLOC_AREAS:${locationId(province)}:${locationId(city)}`),
  };
}

async function handymanJobsInArea(s: any, handymanId: string, province: string, city: string, suburb: string, page = 0) {
  const jobs = (await openOfferJobs(s, handymanId)).filter((job) =>
    locationKey(job.province) === locationKey(province) && locationKey(job.city) === locationKey(city) && locationKey(job.suburb) === locationKey(suburb)
  );
  const pageSize = 6;
  const lastPage = Math.max(0, Math.ceil(jobs.length / pageSize) - 1);
  const safePage = Math.max(0, Math.min(page, lastPage));
  const base = `HLOC_JOBS:${locationId(province)}:${locationId(city)}:${locationId(suburb)}`;
  const rows: Row[] = jobs.slice(safePage * pageSize, (safePage + 1) * pageSize).map((job) => ({
    id: `HJOB_MATCH:${job.match_id}`,
    title: short(job.description),
    description: `${job.service_mode === "scheduled" ? "Scheduled" : "New"} · ${job.suburb}, ${job.city}`,
  }));
  if (safePage > 0) rows.push({ id: `${base}:${safePage - 1}`, title: "Previous" });
  if (safePage < lastPage) rows.push({ id: `${base}:${safePage + 1}`, title: "Next" });
  rows.push({ id: `HLOC_CITY:${locationId(province)}:${locationId(city)}`, title: "Back to areas" });
  rows.push({ id: "HANDYMAN_HOME", title: "Dashboard" });
  return {
    ok: true,
    reply: `${jobs.length} open job${jobs.length === 1 ? "" : "s"} in ${suburb}, ${city}, ${province}.`,
    ui: { type: "list", body: `${suburb} jobs · Page ${safePage + 1} of ${lastPage + 1}`, button: "View job", rows: rows.slice(0, 10) },
  };
}
async function handymanOffer(s: any, handymanId: string, matchId: string) {
  const h = await providerCapacity(s, handymanId);
  const offer = await s.from("job_matches").select(
    "id,job_id,status,offer_expires_at",
  ).eq("id", matchId).eq("handyman_id", handymanId).maybeSingle();
  if (offer.error) throw offer.error;
  if (
    !offer.data || offer.data.status !== "offered" ||
    (offer.data.offer_expires_at &&
      new Date(offer.data.offer_expires_at) <= new Date())
  ) {
    return {
      ok: true,
      reply: "That job is no longer available.",
      ui: {
        type: "buttons",
        body: "New jobs",
        buttons: [{ id: "H_NEW", title: "Next job" }, {
          id: "HANDYMAN_HOME",
          title: "Dashboard",
        }],
      },
    };
  }
  const job = await s.from("jobs").select(
    "id,description,suburb,city,province,urgency,appointment_window,service_mode,scheduled_start_at,status",
  ).eq("id", offer.data.job_id).maybeSingle();
  if (job.error) throw job.error;
  if (!job.data || !["open", "matching"].includes(job.data.status)) {
    return handymanNewJobs(s, handymanId);
  }
  const when = job.data.service_mode === "scheduled" &&
      job.data.scheduled_start_at
    ? new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(job.data.scheduled_start_at))
    : job.data.urgency === "urgent"
    ? "As soon as possible"
    : job.data.urgency === "today"
    ? `Today · ${
      String(job.data.appointment_window ?? "any time").replaceAll("_", " ")
    }`
    : "Flexible";
  return {
    ok: true,
    reply: `${job.data.description}\n📍 ${
      [job.data.suburb, job.data.city, job.data.province].filter(Boolean).join(", ")
    }\nWhen: ${when}${
      h.active_job_id && job.data.service_mode === "immediate"
        ? "\n\nAcceptance is locked while Current job is active."
        : ""
    }`,
    ui: {
      type: "buttons",
      body: "Job options",
      buttons: h.active_job_id && job.data.service_mode === "immediate"
        ? [{ id: "H_CURRENT", title: "Current job" }, {
          id: "H_NEW",
          title: "Next job",
        }, { id: "HANDYMAN_HOME", title: "Dashboard" }]
        : [{ id: `ACCEPT:${matchId}`, title: "Accept" }, {
          id: `DECLINE:${matchId}`,
          title: "Skip",
        }, { id: "H_NEW", title: "Next job" }],
    },
  };
}
async function handymanHistory(s: any, handymanId: string) {
  const assignments = await s.from("job_assignments").select(
    "id,job_id,assigned_at,completed_at,cancelled_at,cancellation_reason",
  ).eq("handyman_id", handymanId).order("assigned_at", { ascending: false })
    .limit(20);
  if (assignments.error) throw assignments.error;
  const closed = (assignments.data ?? []).filter((a: any) =>
    a.completed_at || a.cancelled_at
  ).slice(0, 9);
  const ids = closed.map((a: any) => a.job_id);
  const jobs = ids.length
    ? await s.from("jobs").select("id,description,suburb,city").in("id", ids)
    : { data: [], error: null };
  if (jobs.error) throw jobs.error;
  const byId = new Map((jobs.data ?? []).map((j: any) => [j.id, j]));
  const rows = closed.flatMap((a: any) => {
    const j: any = byId.get(a.job_id);
    return j
      ? [{
        id: `HHIST_JOB:${a.id}`,
        title: short(j.description),
        description: `${a.completed_at ? "Completed" : "Cancelled"} · ${
          j.suburb ?? j.city
        }`,
      }]
      : [];
  });
  if (!rows.length) {
    return {
      ok: true,
      reply: "You do not have completed or cancelled jobs yet.",
      ui: {
        type: "buttons",
        body: "Job history",
        buttons: [{ id: "HANDYMAN_HOME", title: "Dashboard" }],
      },
    };
  }
  return {
    ok: true,
    reply: "Completed and cancelled work is kept here as a read-only record.",
    ui: {
      type: "list",
      body: "Job history",
      button: "View record",
      rows: [...rows, { id: "HANDYMAN_HOME", title: "Dashboard" }].slice(0, 10),
    },
  };
}
async function handymanHistoryDetail(
  s: any,
  handymanId: string,
  assignmentId: string,
) {
  const a = await s.from("job_assignments").select(
    "id,job_id,assigned_at,started_at,completed_at,cancelled_at,cancellation_reason,cancellation_notes",
  ).eq("id", assignmentId).eq("handyman_id", handymanId).maybeSingle();
  if (a.error) throw a.error;
  if (!a.data || (!a.data.completed_at && !a.data.cancelled_at)) {
    return handymanHistory(s, handymanId);
  }
  const j = await s.from("jobs").select("description,suburb,city").eq(
    "id",
    a.data.job_id,
  ).single();
  if (j.error) throw j.error;
  const result = a.data.completed_at ? "Completed" : "Cancelled";
  const reason = a.data.cancellation_reason
    ? `\nReason: ${String(a.data.cancellation_reason).replaceAll("_", " ")}`
    : "";
  return {
    ok: true,
    reply: `${j.data.description}\n📍 ${
      [j.data.suburb, j.data.city].filter(Boolean).join(", ")
    }\nResult: ${result}${reason}`,
    ui: {
      type: "buttons",
      body: "History record · read only",
      buttons: [{ id: "H_HISTORY", title: "Back to history" }, {
        id: "HANDYMAN_HOME",
        title: "Dashboard",
      }],
    },
  };
}
async function handymanJob(s: any, handymanId: string, jobId: string) {
  const a = await s.from("job_assignments").select(
    "job_id,arrived_at,started_at,completion_requested_at",
  ).eq("job_id", jobId).eq("handyman_id", handymanId).is("cancelled_at", null)
    .maybeSingle();
  if (!a.data) {
    return {
      ok: true,
      reply: "That job is no longer assigned to you.",
      ui: {
        type: "buttons",
        body: "What next?",
        buttons: [{ id: "H_CURRENT", title: "Current job" }],
      },
    };
  }
  const j = await s.from("jobs").select("id,description,suburb,city,status").eq(
    "id",
    jobId,
  ).single();
  const quote = await latestQuote(s, jobId);
  const rows: Row[] = [];
  if (j.data.status === "assigned" && quote?.status !== "accepted") {
    rows.push({
      id: `QUOTE_NEW:${jobId}`,
      title: quote?.status === "proposed" ? "Change quote" : "Send quote",
    });
  }
  if (
    j.data.status === "assigned" && quote?.status === "accepted" &&
    !a.data.arrived_at
  ) rows.push({ id: `ARRIVED:${jobId}`, title: "I've arrived" });
  if (
    j.data.status === "assigned" && quote?.status === "accepted" &&
    a.data.arrived_at
  ) rows.push({ id: `JOB_STATUS:${jobId}`, title: "Awaiting customer" });
  if (j.data.status === "in_progress" && !a.data.completion_requested_at) {
    rows.push({ id: `COMPLETE:${jobId}`, title: "Work finished" });
  }
  if (j.data.status === "in_progress" && a.data.completion_requested_at) {
    rows.push({ id: `JOB_STATUS:${jobId}`, title: "Awaiting completion" });
  }
  if (["assigned", "in_progress"].includes(j.data.status)) {
    rows.push({ id: `ISSUE:handyman_cancel:${jobId}`, title: "Can't attend" }, {
      id: `ISSUE:customer_no_show:${jobId}`,
      title: "Customer no-show",
    }, { id: `REPORT_JOB:${jobId}`, title: "Report a problem" });
  }
  rows.push({ id: "H_CURRENT", title: "Current job" }, {
    id: "HANDYMAN_HOME",
    title: "Dashboard",
  });
  const qtxt = quote
    ? `\nQuote: R${Number(quote.amount).toFixed(2)} · ${quote.status}`
    : "\nQuote: not yet sent";
  return {
    ok: true,
    reply:
      `${j.data.description}\n📍 ${j.data.suburb}, ${j.data.city}\nStatus: ${j.data.status}${qtxt}${
        a.data.arrived_at && j.data.status === "assigned"
          ? " · arrival awaiting customer confirmation"
          : ""
      }${
        a.data.completion_requested_at && j.data.status === "in_progress"
          ? " · awaiting customer completion confirmation"
          : ""
      }`,
    ui: {
      type: "list",
      body: "Job actions",
      button: "Choose action",
      rows: rows.slice(0, 10),
    },
  };
}
async function resolveIssue(s: any, phone: string, message: string) {
  const p = message.split(":");
  if (p.length < 3) return { ok: false, error: "invalid_action" };
  const action = p[1], jobId = p[2];
  const r = await s.rpc("resolve_assigned_job_issue", {
    p_job_id: jobId,
    p_actor_phone: phone,
    p_action: action,
  });
  if (r.error) throw r.error;
  const x = r.data;
  if (!x?.ok) {
    return {
      ok: true,
      reply: "That action is no longer available for this job.",
    };
  }
  if (x.reopened) await s.rpc("dispatch_marketplace_tick", { p_job_limit: 5 });
  const handymanAction = action === "customer_no_show";
  return {
    ok: true,
    reply: x.message ?? "Job updated.",
    ui: {
      type: "buttons",
      body: "What next?",
      buttons: handymanAction
        ? [{ id: "H_CURRENT", title: "Current job" }, {
          id: "H_NEW",
          title: "New jobs",
        }, { id: "HANDYMAN_HOME", title: "Dashboard" }]
        : [{ id: "CUSTOMER_JOBS", title: "My jobs" }, {
          id: "HOME",
          title: "Home",
        }],
    },
  };
}
async function cancelProviderJob(
  s: any,
  phone: string,
  jobId: string,
  reason: string,
  notes: string | null,
) {
  const r = await s.rpc("cancel_handyman_assignment", {
    p_job_id: jobId,
    p_handyman_phone: phone,
    p_reason: reason,
    p_notes: notes,
  });
  if (r.error) throw r.error;
  if (!r.data?.ok) {
    return {
      ok: true,
      reply: r.data?.code === "active_assignment_not_found"
        ? "That job is no longer your Current job."
        : "I could not release that job. Open Current job and try again.",
      ui: {
        type: "buttons",
        body: "Current job",
        buttons: [{ id: "H_CURRENT", title: "Current job" }, {
          id: "HANDYMAN_HOME",
          title: "Dashboard",
        }],
      },
    };
  }
  await s.rpc("dispatch_marketplace_tick", { p_job_limit: 5 });
  return {
    ok: true,
    reply: r.data.message,
    ui: {
      type: "buttons",
      body: "What next?",
      buttons: [{ id: "H_NEW", title: "View new jobs" }, {
        id: "H_HISTORY",
        title: "Job history",
      }, { id: "HANDYMAN_HOME", title: "Dashboard" }],
    },
  };
}
function parseAmount(v: string) {
  const n = Number(v.replace(/[Rr,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const k = key(), url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!k || !url || req.headers.get("apikey") !== k) {
    return json({ error: "unauthorized" }, 401);
  }
  let input: Incoming;
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const phone = input.external_user_id?.trim(), message = input.message?.trim();
  if (!phone || !message) return json({ error: "missing_input" }, 400);
  const s = createClient(url, k, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  try {
    const session = await s.from("conversation_sessions").select(
      "id,state,context",
    ).eq("channel", input.channel ?? "whatsapp").eq("external_user_id", phone)
      .maybeSingle();
    const h = await s.from("handymen").select("id").eq("phone", phone)
      .maybeSingle();
    const c = await s.from("customers").select("id").eq("phone", phone)
      .maybeSingle();
    if (h.error || c.error) throw h.error ?? c.error;
    if (h.data && session.data?.state === "handyman_cancel_other_reason") {
      if (message === "HANDYMAN_HOME") {
        await s.from("conversation_sessions").update({
          state: "ready",
          context: {},
        }).eq("id", session.data.id);
      } else {
        const jobId = String(session.data.context?.job_id ?? "");
        if (message.length < 3) {
          return json({
            ok: true,
            reply: "Please briefly explain why you cannot attend this job.",
          });
        }
        const result = await cancelProviderJob(
          s,
          phone,
          jobId,
          "other",
          message,
        );
        await s.from("conversation_sessions").update({
          state: "ready",
          context: {},
        }).eq("id", session.data.id);
        return json(result);
      }
    }
    if (h.data && session.data?.state === "quote_capture") {
      const amount = parseAmount(message);
      if (!amount) {
        return json({
          ok: true,
          reply:
            "Please enter the total quoted amount in rand. Example: 850 or R850.",
        });
      }
      const jobId = String(session.data.context?.job_id ?? "");
      const r = await s.rpc("propose_job_quote", {
        p_job_id: jobId,
        p_handyman_phone: phone,
        p_amount: amount,
        p_note: null,
      });
      if (r.error) throw r.error;
      await s.from("conversation_sessions").update({
        state: "ready",
        context: {},
      }).eq("id", session.data.id);
      return json({
        ok: true,
        reply: r.data?.message ?? "Quote sent.",
        ui: {
          type: "buttons",
          body: "What next?",
          buttons: [{ id: "H_CURRENT", title: "Current job" }, {
            id: "HANDYMAN_HOME",
            title: "Dashboard",
          }],
        },
      });
    }
    if (h.data && message.startsWith("ACCEPT:")) {
      const r = await s.rpc("accept_job_transaction", {
        p_match_id: message.slice(7),
        p_handyman_phone: phone,
      });
      if (r.error) throw r.error;
      if (!r.data?.ok) {
        const code = r.data?.code;
        if (code === "provider_busy") {
          return json({
            ok: true,
            reply:
              "You already have an immediate Current job. You may browse New jobs, but cannot accept another immediate job until Current job is completed or cancelled.",
            ui: {
              type: "buttons",
              body: "Acceptance locked",
              buttons: [{ id: "H_CURRENT", title: "Current job" }, {
                id: "H_NEW",
                title: "New jobs",
              }, { id: "HANDYMAN_HOME", title: "Dashboard" }],
            },
          });
        }
        if (code === "provider_cooldown") {
          return json({
            ok: true,
            reply:
              "New job acceptance is temporarily paused after your cancellation. Availability unlocks automatically when the cool-down ends.",
            ui: {
              type: "buttons",
              body: "Acceptance paused",
              buttons: [{ id: "H_AVAIL", title: "Availability" }, {
                id: "H_NEW",
                title: "New jobs",
              }, { id: "HANDYMAN_HOME", title: "Dashboard" }],
            },
          });
        }
        return json({
          ok: true,
          reply: code === "provider_not_verified"
            ? "Identity verification is required before accepting jobs."
            : "That job is no longer available. Here are your remaining offers.",
          ui: {
            type: "buttons",
            body: "New jobs",
            buttons: [{ id: "H_NEW", title: "Next job" }, {
              id: "HANDYMAN_HOME",
              title: "Dashboard",
            }],
          },
        });
      }
      return json({
        ok: true,
        reply: r.data.replayed
          ? "This job is already saved under Current job."
          : "Job accepted and saved under Current job.",
        ui: {
          type: "buttons",
          body: "What would you like to do?",
          buttons: [{ id: "H_CURRENT", title: "Manage job" }, {
            id: "H_NEW",
            title: "View new jobs",
          }, { id: "HANDYMAN_HOME", title: "Dashboard" }],
        },
        assignment_id: r.data.assignment_id,
        job_id: r.data.job_id,
      });
    }
    if (h.data && message.startsWith("DECLINE:")) {
      const id = message.slice(8);
      const d = await s.from("job_matches").update({
        status: "declined",
        responded_at: new Date().toISOString(),
      }).eq("id", id).eq("handyman_id", h.data.id).eq("status", "offered");
      if (d.error) throw d.error;
      return json(await handymanNewJobs(s, h.data.id));
    }
    if (h.data && message.startsWith("ISSUE:handyman_cancel:")) {
      const jobId = message.slice("ISSUE:handyman_cancel:".length);
      return json({
        ok: true,
        reply:
          "Why can you no longer attend? The customer will be rematched. A provider cancellation starts a 30-minute acceptance cool-down.",
        ui: {
          type: "list",
          body: "Choose the main reason",
          button: "Choose reason",
          rows: [{
            id: `H_CANCEL_REASON:${jobId}:schedule_conflict`,
            title: "Schedule conflict",
          }, {
            id: `H_CANCEL_REASON:${jobId}:personal_emergency`,
            title: "Personal emergency",
          }, {
            id: `H_CANCEL_REASON:${jobId}:outside_skill`,
            title: "Cannot do this job",
          }, {
            id: `H_CANCEL_REASON:${jobId}:other`,
            title: "Other reason",
          }, { id: "H_CURRENT", title: "Keep job" }],
        },
      });
    }
    if (h.data && message.startsWith("H_CANCEL_REASON:")) {
      const [, jobId, reason] = message.split(":");
      if (reason === "other") {
        if (session.data?.id) {
          await s.from("conversation_sessions").update({
            state: "handyman_cancel_other_reason",
            context: { job_id: jobId },
          }).eq("id", session.data.id);
        }
        return json({
          ok: true,
          reply: "Briefly explain why you cannot attend this job.",
        });
      }
      return json(await cancelProviderJob(s, phone, jobId, reason, null));
    }
    if (message.startsWith("ISSUE:")) {
      return json(await resolveIssue(s, phone, message));
    }
    if (h.data && message.startsWith("QUOTE_NEW:")) {
      if (session.data?.id) {
        await s.from("conversation_sessions").update({
          state: "quote_capture",
          context: { job_id: message.slice(10) },
        }).eq("id", session.data.id);
      }
      return json({
        ok: true,
        reply:
          "What is your total quote for this job? Enter the amount in rand. Example: R850. The customer must accept it before work can start.",
      });
    }
    if (
      c.data &&
      (message.startsWith("QUOTE_ACCEPT:") ||
        message.startsWith("QUOTE_REJECT:"))
    ) {
      const accept = message.startsWith("QUOTE_ACCEPT:");
      const id = message.slice(accept ? 13 : 13);
      const r = await s.rpc("respond_job_quote", {
        p_quote_id: id,
        p_customer_phone: phone,
        p_accept: accept,
      });
      if (r.error) throw r.error;
      if (!r.data?.ok) {
        return json({
          ok: true,
          reply: "That quote is no longer awaiting your response.",
          ui: {
            type: "buttons",
            body: "Job status",
            buttons: [{ id: "CUSTOMER_JOBS", title: "My jobs" }],
          },
        });
      }
      return json({
        ok: true,
        reply: accept
          ? `Quote accepted: R${
            Number(r.data.amount).toFixed(2)
          }. The agreed price is now recorded. Work can start once the handyman arrives and you confirm the start.`
          : "Quote rejected. The handyman can send a revised quote.",
        ui: {
          type: "buttons",
          body: "Job options",
          buttons: [{ id: "CUSTOMER_JOBS", title: "My jobs" }, {
            id: "HOME",
            title: "Home",
          }],
        },
      });
    }
    if (h.data && message.startsWith("ARRIVED:")) {
      const jobId = message.slice(8);
      const quote = await latestQuote(s, jobId);
      if (quote?.status !== "accepted") {
        return json({
          ok: true,
          reply:
            "An accepted quote is required before arrival/start. Send a quote first.",
          ui: {
            type: "buttons",
            body: "Price agreement",
            buttons: [{ id: `QUOTE_NEW:${jobId}`, title: "Send quote" }, {
              id: "H_CURRENT",
              title: "Current job",
            }],
          },
        });
      }
      const r = await s.rpc("mark_handyman_arrived", {
        p_job_id: jobId,
        p_handyman_phone: phone,
      });
      if (r.error) throw r.error;
      return json({
        ok: true,
        reply: r.data?.message ?? "Arrival recorded.",
        ui: {
          type: "buttons",
          body: "Waiting for customer confirmation",
          buttons: [{ id: "H_CURRENT", title: "Current job" }, {
            id: "HANDYMAN_HOME",
            title: "Dashboard",
          }],
        },
      });
    }
    if (c.data && message.startsWith("CONFIRM_START:")) {
      const r = await s.rpc("confirm_job_start", {
        p_job_id: message.slice(14),
        p_customer_phone: phone,
      });
      if (r.error) throw r.error;
      const reason = r.data?.reason;
      return json({
        ok: true,
        reply: r.data?.ok
          ? r.data.message
          : (reason === "arrival_not_recorded"
            ? "The handyman has not marked themselves as arrived yet."
            : reason === "quote_not_accepted"
            ? "You must first accept a quote before the job can start."
            : "That start confirmation is no longer available."),
        ui: {
          type: "buttons",
          body: "Job status",
          buttons: [{ id: "CUSTOMER_JOBS", title: "My jobs" }, {
            id: "HOME",
            title: "Home",
          }],
        },
      });
    }
    if (h.data && message.startsWith("COMPLETE:")) {
      const r = await s.rpc("complete_job_assignment", {
        p_job_id: message.slice(9),
        p_handyman_phone: phone,
      });
      if (r.error) throw r.error;
      return json({
        ok: true,
        reply:
          "Work marked as finished. The customer has been asked to confirm completion. The job stays in progress until they confirm.",
        ui: {
          type: "buttons",
          body: "Waiting for customer confirmation",
          buttons: [{ id: "H_CURRENT", title: "Current job" }, {
            id: "HANDYMAN_HOME",
            title: "Dashboard",
          }],
        },
      });
    }
    if (c.data && message.startsWith("CONFIRM_COMPLETE:")) {
      const id = message.slice(17);
      const r = await s.rpc("confirm_job_completion", {
        p_job_id: id,
        p_customer_phone: phone,
      });
      if (r.error) throw r.error;
      if (!r.data?.ok) {
        return json({
          ok: true,
          reply: "That completion confirmation is no longer available.",
          ui: {
            type: "buttons",
            body: "Job status",
            buttons: [{ id: "CUSTOMER_JOBS", title: "My jobs" }],
          },
        });
      }
      return json({
        ok: true,
        reply: r.data.message,
        ui: {
          type: "buttons",
          body: "How was the service?",
          buttons: [{ id: `RATE_MENU:${id}`, title: "Rate handyman" }, {
            id: "CUSTOMER_JOBS",
            title: "My jobs",
          }],
        },
      });
    }
    if (
      c.data && message.startsWith("CANCEL:") &&
      !message.startsWith("CANCEL_CONFIRM:")
    ) {
      const id = message.slice(7);
      return json({
        ok: true,
        reply: "Cancel this request? Matching will stop immediately.",
        ui: {
          type: "buttons",
          body: "Please confirm",
          buttons: [{ id: `CANCEL_CONFIRM:${id}`, title: "Yes, cancel" }, {
            id: `CJOB:${id}`,
            title: "Keep request",
          }],
        },
      });
    }
    if (c.data && message.startsWith("CANCEL_CONFIRM:")) {
      const id = message.slice(15);
      const r = await call(url, k, "customer-job-router", {
        ...input,
        message: `CANCEL:${id}`,
      });
      return json(r.body, r.status);
    }
    const reportFlow = session.data?.state === "report_router_details" ||
      norm(message) === "report" || message.startsWith("REPORT_JOB:") ||
      message.startsWith("REPORT_REASON:");
    if (reportFlow) {
      const r = await call(url, k, "report-router", input);
      return json(r.body, r.status);
    }
    if (c.data && message === "CUSTOMER_JOBS") {
      return json(await customerJobs(s, c.data.id));
    }
    if (c.data && message.startsWith("CJOB:")) {
      const r = await call(url, k, "customer-job-router", {
        ...input,
        message: `JOB_STATUS:${message.slice(5)}`,
      });
      return json(await decorateCustomerJob(s, r.body, c.data.id), r.status);
    }
    if (c.data && message.startsWith("RATE_MENU:")) {
      const id = message.slice(10);
      return json({
        ok: true,
        reply: "How was the service?",
        ui: {
          type: "list",
          body: "Rate handyman",
          button: "Choose rating",
          rows: [1, 2, 3, 4, 5].map((n) => ({
            id: `RATE:${id}:${n}`,
            title: `${n} star${n === 1 ? "" : "s"}`,
          })),
        },
      });
    }
    if (
      h.data &&
      (message === "H_CURRENT" || message === "H_JOBS" ||
        message === "MY_JOBS")
    ) {
      return json(await handymanCurrentJob(s, h.data.id));
    }
    if (h.data && message === "H_NEW") {
      return json(await handymanNewJobs(s, h.data.id));
    }
    if (h.data && message.startsWith("HLOC_PROVINCE_PAGE:")) {
      return json(await handymanNewJobs(s, h.data.id, Number(message.split(":")[1]) || 0));
    }
    if (h.data && message.startsWith("HLOC_PROVINCE:")) {
      const province = locationValue(message.slice("HLOC_PROVINCE:".length));
      return json(await handymanJobsByCity(s, h.data.id, province));
    }
    if (h.data && message.startsWith("HLOC_CITIES:")) {
      const parts = message.split(":");
      return json(await handymanJobsByCity(s, h.data.id, locationValue(parts[1]), Number(parts[2]) || 0));
    }
    if (h.data && message.startsWith("HLOC_CITY:")) {
      const parts = message.split(":");
      const province = locationValue(parts[1]);
      const city = parts[2] ? locationValue(parts[2]) : "";
      if (city) return json(await handymanJobsByArea(s, h.data.id, province, city));
      return json(await handymanJobsByCity(s, h.data.id, province));
    }
    if (h.data && message.startsWith("HLOC_AREA:")) {
      const parts = message.split(":");
      return json(await handymanJobsInArea(s, h.data.id, locationValue(parts[1]), locationValue(parts[2]), locationValue(parts[3])));
    }
    if (h.data && message.startsWith("HLOC_AREAS:")) {
      const parts = message.split(":");
      return json(await handymanJobsByArea(s, h.data.id, locationValue(parts[1]), locationValue(parts[2]), Number(parts[3]) || 0));
    }
    if (h.data && message.startsWith("HLOC_JOBS:")) {
      const parts = message.split(":");
      return json(await handymanJobsInArea(s, h.data.id, locationValue(parts[1]), locationValue(parts[2]), locationValue(parts[3]), Number(parts[4]) || 0));
    }
    if (h.data && message === "H_HISTORY") {
      return json(await handymanHistory(s, h.data.id));
    }
    if (h.data && message.startsWith("HJOB_MATCH:")) {
      return json(
        await handymanOffer(s, h.data.id, message.slice("HJOB_MATCH:".length)),
      );
    }
    if (h.data && message.startsWith("HJOB_JOB:")) {
      return json(await handymanJob(s, h.data.id, message.slice(9)));
    }
    if (h.data && message.startsWith("HHIST_JOB:")) {
      return json(
        await handymanHistoryDetail(
          s,
          h.data.id,
          message.slice("HHIST_JOB:".length),
        ),
      );
    }
    if (h.data && message.startsWith("START:")) {
      return json({
        ok: true,
        reply:
          "For safety, work starts only after the quote is accepted, you mark arrival, and the customer confirms the start.",
        ui: {
          type: "buttons",
          body: "Current job",
          buttons: [{ id: "H_CURRENT", title: "Manage job" }, {
            id: "HANDYMAN_HOME",
            title: "Dashboard",
          }],
        },
      });
    }
    const explicitHandyman = !!input.media || message === "HANDYMAN_HOME" ||
      message.startsWith("H_") || message === "MY_JOBS" ||
      message.startsWith("HJOB_") || message.startsWith("HHIST_") ||
      message.startsWith("ACCEPT:") ||
      message.startsWith("DECLINE:") || message.startsWith("START:") ||
      message.startsWith("COMPLETE:") || message.startsWith("QUOTE_");
    const target = h.data && (explicitHandyman || !c.data)
      ? "handyman-router"
      : "customer-job-router";
    const r = await call(url, k, target, input);
    if (c.data && target === "customer-job-router") {
      return json(await decorateCustomerJob(s, r.body, c.data.id), r.status);
    }
    return json(r.body, r.status);
  } catch (e) {
    console.error(e);
    return json({ error: "router_failed" }, 500);
  }
});
