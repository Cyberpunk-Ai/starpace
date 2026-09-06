import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PlanTier = "plus" | "pro";
type BillingCycle = "monthly" | "annual";

const PRICES: Record<PlanTier, Record<BillingCycle, number>> = {
  plus: { monthly: 9, annual: 84 },
  pro: { monthly: 29, annual: 276 },
};

function money(plan: PlanTier, cycle: BillingCycle) {
  return PRICES[plan][cycle];
}

function paystackKey() {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Payments are not configured yet.");
  return key;
}

async function paystack(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paystackKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || body?.status === false) {
    throw new Error(body?.message || `Payment provider error (${res.status})`);
  }
  return body;
}

export const startPaystackCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { plan: PlanTier; cycle: BillingCycle; origin: string }) => {
    if (input.plan !== "plus" && input.plan !== "pro") throw new Error("Unknown plan");
    if (input.cycle !== "monthly" && input.cycle !== "annual") throw new Error("Unknown cycle");
    if (!/^https?:\/\//.test(input.origin)) throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Complete your profile before upgrading.");

    const email = claims?.email ?? `${profile.id}@users.noreply.app`;
    const currency = process.env["PAYSTACK_CURRENCY"] || "USD";
    const amount = money(data.plan, data.cycle) * 100;
    const reference = `sub_${crypto.randomUUID().replace(/-/g, "")}`;

    const init = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount,
        currency,
        reference,
        callback_url: `${data.origin}/billing/callback`,
        metadata: {
          profile_id: profile.id,
          plan: data.plan,
          billing_cycle: data.cycle,
        },
      }),
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("payments").insert({
      user_id: profile.id,
      reference,
      plan: data.plan,
      billing_cycle: data.cycle,
      amount,
      currency,
      email,
      status: "pending",
      authorization_url: init.data?.authorization_url ?? null,
    });

    return {
      authorizationUrl: init.data?.authorization_url as string,
      reference,
    };
  });

/** Confirms a Paystack reference and activates the plan. Safe to call twice. */
export const confirmPaystackPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reference: string }) => {
    if (!input.reference || input.reference.length > 128) throw new Error("Invalid reference");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");

    const verified = await paystack(`/transaction/verify/${encodeURIComponent(data.reference)}`);
    const tx = verified.data ?? {};
    const meta = tx.metadata ?? {};

    if (meta.profile_id && meta.profile_id !== profile.id) {
      throw new Error("This payment belongs to another account.");
    }

    const success = tx.status === "success";
    const plan = (meta.plan as PlanTier) ?? "plus";
    const cycle = (meta.billing_cycle as BillingCycle) ?? "monthly";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await (supabaseAdmin as any)
      .from("payments")
      .update({
        status: success ? "success" : (tx.status ?? "failed"),
        raw: tx,
        paid_at: success ? (tx.paid_at ?? new Date().toISOString()) : null,
      })
      .eq("reference", data.reference);

    if (!success) return { status: tx.status ?? "failed", plan, cycle };

    await (supabaseAdmin as any).from("profiles").update({ plan }).eq("id", profile.id);
    await (supabaseAdmin as any).from("subscriptions").upsert(
      {
        user_id: profile.id,
        plan,
        billing_cycle: cycle,
        status: "active",
        provider: "paystack",
        provider_customer_id: tx.customer?.customer_code ?? null,
        renews_at: new Date(
          Date.now() + (cycle === "annual" ? 365 : 30) * 86400000,
        ).toISOString(),
        payment_method: tx.authorization
          ? {
              brand: tx.authorization.card_type ?? tx.authorization.channel ?? "card",
              last4: tx.authorization.last4 ?? "",
              exp: `${tx.authorization.exp_month ?? ""}/${tx.authorization.exp_year ?? ""}`,
            }
          : {},
      },
      { onConflict: "user_id" },
    );

    return { status: "success" as const, plan, cycle };
  });

export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as any;
    const { data } = await supabase
      .from("payments")
      .select("id, reference, plan, billing_cycle, amount, currency, status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    return data ?? [];
  });
