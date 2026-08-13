import {
  type EmailOtpType,
} from "@supabase/supabase-js";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createServerSupabaseClient,
} from "@/lib/supabase-server";

export async function GET(
  request: NextRequest
) {
  const { searchParams, origin } =
    new URL(request.url);

  const tokenHash =
    searchParams.get("token_hash");

  const type =
    searchParams.get("type") as EmailOtpType | null;

  const next =
    searchParams.get("next") || "/feed";

  // Only allow internal redirects
  const safeNext =
    next.startsWith("/") ? next : "/feed";

  if (!tokenHash || !type) {
    console.error(
      "EMAIL CONFIRM: Missing token_hash or type"
    );

    return NextResponse.redirect(
      new URL(
        "/login?error=email_confirmation_failed",
        origin
      )
    );
  }

  const supabase =
    await createServerSupabaseClient();

  const { error } =
    await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

  if (error) {
    console.error(
      "EMAIL CONFIRMATION ERROR:",
      error
    );

    return NextResponse.redirect(
      new URL(
        "/login?error=email_confirmation_failed",
        origin
      )
    );
  }

  // Email is verified and the session
  // has now been stored in the SSR cookies.
  return NextResponse.redirect(
    new URL(safeNext, origin)
  );
}