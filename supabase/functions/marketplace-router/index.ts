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
async function handymanJobs(s: any, handymanId: string) {
  const offers = await s.from("job_matches").select(
    "id,job_id,status,offered_at",
  ).eq("handyman_id", handymanId).eq("status", "offered").order("offered_at", {
    ascending: false,
  }).limit(5);
  const assignments = await s.from("job_assignments").select(
    "job_id,assigned_at,started_at,completed_at,cancelled_at",
  ).eq("handyman_id", handymanId).is("cancelled_at", null).order(
    "assigned_at",
    { ascending: false },
  ).limit(5);
  if (offers.error || assignments.error) {
    throw offers.error ?? assignments.error;
  }
  const ids = [
    ...new Set([
      ...(offers.data ?? []).map((x: any) => x.job_id),
      ...(assignments.data ?? []).map((x: any) => x.job_id),
    ]),
  ];
  if (!ids.length) {
    return {
      ok: true,
      reply: "You don't have any active job offers or jobs yet.",
      ui: {
        type: "buttons",
        body: "Handyman dashboard",
        buttons: [{ id: "HANDYMAN_HOME", title: "Dashboard" }],
      },
    };
  }
  const jobs = await s.from("jobs").select("id,description,suburb,city,status")
    .in("id", ids);
  const jm = new Map((jobs.data ?? []).map((j: any) => [j.id, j]));
  const rows: Row[] = [];
  for (const o of offers.data ?? []) {
    const j: any = jm.get(o.job_id);
    if (j) {
      rows.push({
        id: `HJOB_MATCH:${o.id}`,
        title: short(j.description),
        description: `Offer · ${j.suburb}, ${j.city}`,
      });
    }
  }
  for (const a of assignments.data ?? []) {
    const j: any = jm.get(a.job_id);
    if (j && !["completed", "cancelled", "expired"].includes(j.status)) {
      rows.push({
        id: `HJOB_JOB:${j.id}`,
        title: short(j.description),
        description: `${j.status} · ${j.suburb}, ${j.city}`,
      });
    }
  }
  return rows.length
    ? {
      ok: true,
      reply: "Choose an offer or active job.",
      ui: {
        type: "list",
        body: "My jobs",
        button: "Choose job",
        rows: [...rows.slice(0, 9), {
          id: "HANDYMAN_HOME",
          title: "Dashboard",
        }],
      },
    }
    : {
      ok: true,
      reply: "You don't have any active job offers or jobs yet.",
      ui: {
        type: "buttons",
        body: "Handyman dashboard",
        buttons: [{ id: "HANDYMAN_HOME", title: "Dashboard" }],
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
        buttons: [{ id: "H_JOBS", title: "My jobs" }],
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
  rows.push({ id: "H_JOBS", title: "Back to my jobs" }, {
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
  return {
    ok: true,
    reply: x.message ?? "Job updated.",
    ui: {
      type: "buttons",
      body: "What next?",
      buttons: [{ id: "CUSTOMER_JOBS", title: "My jobs" }, {
        id: "H_JOBS",
        title: "Handyman jobs",
      }, { id: "HOME", title: "Home" }],
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
          buttons: [{ id: "H_JOBS", title: "My jobs" }, {
            id: "HANDYMAN_HOME",
            title: "Dashboard",
          }],
        },
      });
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
              id: "H_JOBS",
              title: "My jobs",
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
          buttons: [{ id: "H_JOBS", title: "My jobs" }, {
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
          buttons: [{ id: "H_JOBS", title: "My jobs" }, {
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
    if (h.data && (message === "H_JOBS" || message === "MY_JOBS")) {
      return json(await handymanJobs(s, h.data.id));
    }
    if (h.data && message.startsWith("HJOB_JOB:")) {
      return json(await handymanJob(s, h.data.id, message.slice(9)));
    }
    const explicitHandyman = !!input.media || message === "HANDYMAN_HOME" ||
      message.startsWith("H_") || message === "MY_JOBS" ||
      message.startsWith("HJOB_") || message.startsWith("ACCEPT:") ||
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
