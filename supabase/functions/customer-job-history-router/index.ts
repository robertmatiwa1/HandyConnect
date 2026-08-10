import { createClient } from "@supabase/supabase-js";

type Incoming = {
  channel?: string;
  external_user_id?: string;
  message?: string;
};
type Action = { id: string; title: string; description?: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function key() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.default === "string") return parsed.default;
    } catch {
      // Fall back to the legacy service-role key below.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function stage(job: any) {
  if (["matching", "open"].includes(job.status)) return "Finding a handyman";
  if (job.status === "assigned" && !job.arrived_at) {
    return job.scheduled_arrival_at
      ? "Handyman on the way"
      : "Handyman assigned";
  }
  if (job.arrived_at && !job.started_at) return "Handyman arrived";
  if (job.started_at && !job.completion_requested_at) return "Work in progress";
  if (job.completion_requested_at && !job.customer_completed_at) {
    return "Work finished · confirm completion";
  }
  if (job.status === "completed" || job.customer_completed_at) {
    return "Completed";
  }
  if (job.status === "cancelled") return "Cancelled";
  return String(job.status || "Updated").replaceAll("_", " ");
}

function icon(job: any) {
  if (["matching", "open"].includes(job.status)) return "🔎";
  if (job.status === "cancelled") return "❌";
  if (job.status === "completed" || job.customer_completed_at) return "✅";
  if (job.status === "in_progress") return "🛠️";
  return "🔧";
}

function eta(value: any) {
  return value
    ? new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
    : null;
}

function timing(job: any) {
  if (job.urgency === "urgent") return "As soon as possible";
  if (job.urgency === "today") {
    const window = String(job.appointment_window || "any time").replaceAll(
      "_",
      " ",
    );
    return `Today · ${window}`;
  }
  if (job.urgency === "flexible") return "Flexible";
  return null;
}

function card(job: any) {
  const lines = [
    `${icon(job)} ${stage(job)}`,
    job.description,
    `📍 ${[job.suburb, job.city].filter(Boolean).join(", ")}`,
  ];
  const when = timing(job);
  if (when) lines.push(`🕒 ${when}`);
  if (job.handyman_name) {
    lines.push(
      `👤 ${job.handyman_name}${
        job.handyman_verification === "verified" ? " ✓" : ""
      }${job.handyman_rating != null ? ` · ${job.handyman_rating}/5` : ""}`,
    );
  }
  if (job.agreed_quote != null) {
    lines.push(`💰 R${Number(job.agreed_quote).toFixed(2)} agreed`);
  }
  const expected = eta(job.scheduled_arrival_at);
  if (job.assignment_id && job.arrived_at) lines.push("🚗 Arrived");
  else if (expected) lines.push(`🕒 ${expected}`);
  if (["matching", "open"].includes(job.status)) {
    lines.push(
      "",
      "Your request is active. You don’t need to keep checking—we’ll message you as soon as a verified handyman accepts.",
    );
  }
  return lines.join("\n");
}

function row(job: any) {
  return {
    id: `CJOB:${job.job_id}`,
    title: short(String(job.description)),
    description: `${stage(job)} · ${job.suburb || job.city || ""}`.slice(0, 72),
  };
}

function short(value: string) {
  if (value.length <= 24) return value;
  const prefix = value.slice(0, 23);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > 12 ? boundary : 22)}…`;
}

function actionsUi(actions: Action[]) {
  return {
    type: "list",
    body: "What would you like to do?",
    button: "Choose action",
    rows: actions.slice(0, 10),
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const secret = key();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !url || request.headers.get("apikey") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let input: Incoming;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const phone = input.external_user_id?.trim();
  const message = input.message?.trim() ?? "";
  if (
    !phone ||
    !(message === "MY_JOBS" || message === "CUSTOMER_JOBS" ||
      message.startsWith("CJOB:") || message.startsWith("CSTALE:"))
  ) return json({ handled: false });

  const supabase = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const customer = await supabase.from("customers").select("id").eq(
    "phone",
    phone,
  ).maybeSingle();
  if (customer.error) throw customer.error;
  if (!customer.data) {
    return json({ handled: true, reply: "You don’t have any jobs yet." });
  }

  if (message.startsWith("CSTALE:")) {
    const jobId = message.slice(7);
    const result = await supabase.rpc("close_stale_customer_job", {
      p_job_id: jobId,
      p_customer_phone: phone,
    });
    if (!result.data?.ok) {
      return json({
        handled: true,
        reply: result.data?.reason === "cannot_close_after_assignment"
          ? "A handyman is already assigned. Use the job cancellation option instead."
          : "I couldn’t close that request.",
        ui: {
          type: "buttons",
          body: "What next?",
          buttons: [
            { id: "MY_JOBS", title: "Back to jobs" },
            { id: "HOME", title: "Home" },
          ],
        },
      });
    }
    return json({
      handled: true,
      reply: "Request closed.",
      ui: {
        type: "buttons",
        body: "What next?",
        buttons: [
          { id: "MY_JOBS", title: "My jobs" },
          { id: "REQUEST_HELP", title: "New request" },
          { id: "HOME", title: "Home" },
        ],
      },
    });
  }

  if (message === "MY_JOBS" || message === "CUSTOMER_JOBS") {
    const query = await supabase
      .from("customer_job_status")
      .select("*")
      .eq("customer_id", customer.data.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (query.error) throw query.error;
    const jobs = query.data ?? [];
    if (!jobs.length) {
      return json({
        handled: true,
        reply: "You don’t have any jobs yet.",
        ui: {
          type: "buttons",
          body: "Need something fixed?",
          buttons: [
            { id: "REQUEST_HELP", title: "Request handyman" },
            { id: "HOME", title: "Home" },
          ],
        },
      });
    }
    const body = "Which job would you like to check?";
    return json({
      handled: true,
      reply: body,
      ui: {
        type: "list",
        body,
        button: "Choose a job",
        rows: jobs.slice(0, 8).map(row),
      },
    });
  }

  const jobId = message.slice(5);
  const query = await supabase
    .from("customer_job_status")
    .select("*")
    .eq("job_id", jobId)
    .eq("customer_id", customer.data.id)
    .maybeSingle();
  if (query.error) throw query.error;
  if (!query.data) {
    return json({
      handled: true,
      reply: "That job is not linked to your account.",
      ui: {
        type: "buttons",
        body: "My jobs",
        buttons: [{ id: "MY_JOBS", title: "Back to jobs" }],
      },
    });
  }

  const job = query.data;
  const actions: Action[] = [];
  if (["open", "matching"].includes(job.status)) {
    actions.push(
      { id: `ADD_PHOTO:${job.job_id}`, title: "Add a photo" },
      { id: `EDIT_JOB:${job.job_id}`, title: "Edit request" },
      { id: `CANCEL:${job.job_id}`, title: "Cancel request" },
      { id: "MY_JOBS", title: "Back to jobs" },
    );
  } else if (["assigned", "in_progress"].includes(job.status)) {
    const quote = await supabase
      .from("job_quotes")
      .select("id,status,amount")
      .eq("job_id", job.job_id)
      .order("proposed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (quote.error) throw quote.error;
    if (job.status === "assigned" && quote.data?.status === "proposed") {
      actions.push(
        {
          id: `QUOTE_ACCEPT:${quote.data.id}`,
          title: `Accept R${Number(quote.data.amount).toFixed(0)}`,
        },
        { id: `QUOTE_REJECT:${quote.data.id}`, title: "Reject quote" },
      );
    }
    if (
      job.status === "assigned" && job.arrived_at &&
      quote.data?.status === "accepted"
    ) {
      actions.push({
        id: `CONFIRM_START:${job.job_id}`,
        title: "Confirm start",
      });
    }
    if (job.status === "in_progress" && job.completion_requested_at) {
      actions.push({
        id: `CONFIRM_COMPLETE:${job.job_id}`,
        title: "Confirm complete",
      });
    }
    if (job.handyman_name) {
      actions.push({
        id: `PROVIDER_PROFILE:${job.job_id}`,
        title: "View provider",
      });
    }
    actions.push(
      { id: `REPORT_JOB:${job.job_id}`, title: "Report a problem" },
      { id: "MY_JOBS", title: "Back to jobs" },
    );
  } else if (job.status === "completed") {
    actions.push(
      { id: `RATE_MENU:${job.job_id}`, title: "Rate handyman" },
      { id: `REPORT_JOB:${job.job_id}`, title: "Report a problem" },
      { id: "MY_JOBS", title: "Back to jobs" },
    );
  } else {
    actions.push(
      { id: "MY_JOBS", title: "Back to jobs" },
      { id: "HOME", title: "Home" },
    );
  }

  return json({ handled: true, reply: card(job), ui: actionsUi(actions) });
});
