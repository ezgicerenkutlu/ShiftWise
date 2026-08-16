import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InviteBody {
  email: string;
  role: "manager" | "employee";
  full_name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Require auth — the caller must be a signed-in manager
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Verify the caller's session
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the caller's profile to confirm they're a manager
    const { data: managerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, restaurant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !managerProfile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (managerProfile.role !== "manager") {
      return new Response(
        JSON.stringify({ error: "Only managers can invite team members" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: InviteBody = await req.json();
    const email = body.email?.toLowerCase().trim();
    const role = body.role || "employee";

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if a user with this email already exists in the restaurant
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .eq("restaurant_id", managerProfile.restaurant_id)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: "This person is already on your team" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for an existing pending invitation
    const { data: existingInvite } = await supabase
      .from("invitations")
      .select("id")
      .eq("email", email)
      .eq("restaurant_id", managerProfile.restaurant_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingInvite) {
      return new Response(
        JSON.stringify({ error: "An invitation is already pending for this email" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the invitation record (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .insert({
        restaurant_id: managerProfile.restaurant_id,
        email,
        role,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (inviteError) {
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send the invite email via Supabase Auth's invite-by-email feature
    // This creates an auth user (if one doesn't exist) and sends them a link
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { error: sendError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${req.headers.get("origin") || Deno.env.get("SUPABASE_PUBLIC_URL") || ""}/accept-invite`,
        data: {
          restaurant_id: managerProfile.restaurant_id,
          role,
          full_name: body.full_name || "",
        },
      }
    );

    if (sendError) {
      // If the email send fails, still keep the invitation record
      // The manager can resend later
      console.error("Failed to send invite email:", sendError.message);
      return new Response(
        JSON.stringify({
          warning: "Invitation created but email could not be sent",
          invitation,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Invitation sent successfully",
        invitation,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Invite error:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
