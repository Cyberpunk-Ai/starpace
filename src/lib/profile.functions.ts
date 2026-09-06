import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function handleFrom(email: string | undefined, fallback: string) {
  const base = (email?.split("@")[0] || fallback).replace(/[^a-z0-9_]/gi, "").toLowerCase();
  return base.slice(0, 18) || "member";
}

/**
 * Guarantees the signed-in auth user has a `profiles` row. Runs with admin
 * rights because a brand-new user has no profile yet, so RLS policies that key
 * off `current_profile_id()` cannot let them insert one themselves.
 */
export const ensureMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { displayName?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;

    const { data: existing } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (existing) return { id: existing.id as string, created: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = (claims as { email?: string } | null)?.email;
    const handle = handleFrom(email, "member");

    for (let attempt = 0; attempt < 5; attempt++) {
      const username = attempt === 0 ? handle : `${handle}${Math.floor(Math.random() * 9000 + 1000)}`;
      const { data: row, error } = await supabaseAdmin
        .from("profiles")
        .insert({
          auth_user_id: userId,
          username,
          display_name: data.displayName?.trim() || handle,
        })
        .select("id")
        .maybeSingle();

      if (!error && row) return { id: row.id as string, created: true };
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    }

    throw new Error("Could not create your profile. Please try again.");
  });
