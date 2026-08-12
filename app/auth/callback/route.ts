import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/feed";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", url.origin)
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const {
    data,
    error,
  } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (error || !data.user) {
    console.error(
      "OAUTH CALLBACK ERROR:",
      error
    );

    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", url.origin)
    );
  }

  const user = data.user;

  // ==========================================
  // CHECK FOR EXISTING PROFILE
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
  // CREATE PROFILE FOR GOOGLE USER
  // ==========================================

  if (!existingProfile) {
    const metadata = user.user_metadata || {};

    const displayName =
      metadata.full_name ||
      metadata.name ||
      "Drip User";

    const emailUsername =
      user.email
        ?.split("@")[0]
        ?.toLowerCase()
        .replace(/[^a-z0-9_.]/g, "")
        .slice(0, 20) || "user";

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
        display_name: displayName,
        avatar_url: avatarUrl,
      });

    if (profileError) {
      console.error(
        "GOOGLE PROFILE CREATION ERROR:",
        profileError
      );

      return NextResponse.redirect(
        new URL(
          "/login?error=profile_creation_failed",
          url.origin
        )
      );
    }
  }

  // ==========================================
  // SEND USER TO FEED
  // ==========================================

  return NextResponse.redirect(
    new URL(next, url.origin)
  );
}