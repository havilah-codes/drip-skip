import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } =
    new URL(request.url);

  const code = searchParams.get("code");

  let next =
    searchParams.get("next") || "/feed";

  // Only allow internal redirects.
  if (!next.startsWith("/")) {
    next = "/feed";
  }

  if (!code) {
    console.error(
      "OAUTH CALLBACK: No authorization code"
    );

    return NextResponse.redirect(
      new URL(
        "/login?error=oauth_failed",
        origin
      )
    );
  }

  const supabase =
    await createServerSupabaseClient();

  const {
    data,
    error,
  } =
    await supabase.auth.exchangeCodeForSession(
      code
    );

  if (error || !data.user) {
    console.error(
      "OAUTH CODE EXCHANGE ERROR:",
      error
    );

    return NextResponse.redirect(
      new URL(
        "/login?error=oauth_failed",
        origin
      )
    );
  }

  const user = data.user;

  // ==========================================
  // CHECK PROFILE
  // ==========================================

  const {
    data: existingProfile,
    error: profileLookupError,
  } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileLookupError) {
    console.error(
      "PROFILE LOOKUP ERROR:",
      profileLookupError
    );
  }

  // ==========================================
  // CREATE PROFILE IF NEEDED
  // ==========================================

  if (!existingProfile) {
    const metadata =
      user.user_metadata || {};

    const displayName =
      metadata.full_name ||
      metadata.name ||
      "Drip User";

    const emailUsername =
      user.email
        ?.split("@")[0]
        ?.toLowerCase()
        .replace(
          /[^a-z0-9_.]/g,
          ""
        )
        .slice(0, 20) ||
      "user";

    const randomSuffix =
      Math.random()
        .toString(36)
        .substring(2, 7);

    const username =
      `${emailUsername}_${randomSuffix}`;

    const avatarUrl =
      metadata.avatar_url ||
      metadata.picture ||
      null;

    const {
      error: profileError,
    } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        username,
        display_name:
          displayName,
        avatar_url:
          avatarUrl,
      });

    if (profileError) {
      console.error(
        "PROFILE CREATION ERROR:",
        profileError
      );

      return NextResponse.redirect(
        new URL(
          "/login?error=profile_creation_failed",
          origin
        )
      );
    }
  }

  // ==========================================
  // SUCCESS
  // ==========================================

  return NextResponse.redirect(
    new URL(next, origin)
  );
}