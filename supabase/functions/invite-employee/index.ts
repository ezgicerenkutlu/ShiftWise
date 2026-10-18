import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set(
  [Deno.env.get("APP_URL"), Deno.env.get("PREVIEW_APP_URL")]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);

const baseHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Vary": "Origin",
};

function response(body: Record<string, unknown>, status: number, origin?: string) {
  const headers: Record<string, string> = {
    ...baseHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

interface InviteBody {
  email?: unknown;
  role?: unknown;
  full_name?: unknown;
}

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("origin") ?? undefined;

  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return response({ error: "Origin not allowed" }, 403);
  }

  if (req.method === "OPTIONS") {
    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
      return new Response(null, { status: 403, headers: baseHeaders });
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...baseHeaders,
        "Access-Control-Allow-Origin": requestOrigin,
        "Access-Control-Max-Age": "600",
      },
    });
  }

  if (req.method !== "POST") {
    return response({ error: "Method not allowed" }, 405, requestOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("APP_URL");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
    console.error("Invite function configuration is incomplete.");
    return response({ error: "Invitation service is not configured" }, 500, requestOrigin);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return response({ error: "Unauthorized" }, 401, requestOrigin);

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return response({ error: "Unauthorized" }, 401, requestOrigin);

    const { data: managerProfile, error: profileError } = await userClient
      .from("profiles")
      .select("id, role, restaurant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !managerProfile) {
      return response({ error: "Manager profile not found" }, 403, requestOrigin);
    }
    if (managerProfile.role !== "manager" || !managerProfile.restaurant_id) {
      return response({ error: "Only a restaurant manager can invite team members" }, 403, requestOrigin);
    }

    let body: InviteBody;
    try {
      body = await req.json();
    } catch {
      return response({ error: "Request body must be valid JSON" }, 400, requestOrigin);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ error: "Invalid request body" }, 400, requestOrigin);
    }

    if (typeof body.email !== "string") {
      return response({ error: "A valid email is required" }, 400, requestOrigin);
    }
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response({ error: "A valid email is required" }, 400, requestOrigin);
    }

    // Managers may invite employees only. Privileged manager accounts must be
    // provisioned through a trusted owner/admin workflow, not a client payload.
    if (body.role !== undefined && body.role !== "employee") {
      return response({ error: "Only employee invitations are supported" }, 400, requestOrigin);
    }

    let fullName = "";
    if (body.full_name !== undefined) {
      if (typeof body.full_name !== "string" || body.full_name.length > 100) {
        return response({ error: "full_name must be a string of at most 100 characters" }, 400, requestOrigin);
      }
      fullName = body.full_name.trim().replace(/[\u0000-\u001F\u007F]/g, "");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingProfile, error: existingProfileError } = await userClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .eq("restaurant_id", managerProfile.restaurant_id)
      .maybeSingle();

    if (existingProfileError) {
      console.error("Failed to check existing profile:", existingProfileError.message);
      return response({ error: "Could not validate team membership" }, 500, requestOrigin);
    }
    if (existingProfile) return response({ error: "This person is already on your team" }, 409, requestOrigin);

    const { data: existingInvite, error: existingInviteError } = await userClient
      .from("invitations")
      .select("id")
      .eq("email", email)
      .eq("restaurant_id", managerProfile.restaurant_id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existingInviteError) {
      console.error("Failed to check pending invitation:", existingInviteError.message);
      return response({ error: "Could not validate pending invitations" }, 500, requestOrigin);
    }
    if (existingInvite) {
      return response({ error: "An invitation is already pending for this email" }, 409, requestOrigin);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: invitation, error: inviteError } = await adminClient
      .from("invitations")
      .insert({
        restaurant_id: managerProfile.restaurant_id,
        email,
        role: "employee",
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id, email, role, status, expires_at, created_at")
      .single();

    if (inviteError || !invitation) {
      console.error("Failed to create invitation:", inviteError?.message);
      return response({ error: "Failed to create invitation" }, 500, requestOrigin);
    }

    let redirectTo: string;
    try {
      const configuredAppUrl = new URL(appUrl);
      if (configuredAppUrl.protocol !== "https:" && configuredAppUrl.hostname !== "localhost") {
        throw new Error("APP_URL must use HTTPS outside localhost");
      }
      redirectTo = new URL("/accept-invite", configuredAppUrl).toString();
    } catch {
      await adminClient.from("invitations").delete().eq("id", invitation.id);
      console.error("APP_URL is invalid; invitation was rolled back.");
      return response({ error: "Invitation service is not configured correctly" }, 500, requestOrigin);
    }

    const { error: sendError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        // Metadata is not authoritative for authorization. The DB trigger must
        // derive role and restaurant membership from the pending invitation.
        full_name: fullName,
      },
    });

    if (sendError) {
      console.error("Failed to send invitation email:", sendError.message);
      const { error: rollbackError } = await adminClient
        .from("invitations")
        .delete()
        .eq("id", invitation.id);
      if (rollbackError) {
        console.error("Failed to roll back invitation after email failure:", rollbackError.message);
      }
      return response({ error: "Invitation email could not be sent; please try again" }, 502, requestOrigin);
    }

    return response({ message: "Invitation sent successfully", invitation }, 201, requestOrigin);
  } catch (error) {
    console.error("Invite error:", error instanceof Error ? error.message : "Unknown error");
    return response({ error: "An unexpected error occurred" }, 500, requestOrigin);
  }
});
