"use client";

import {
  useState,
  FormEvent,
  ChangeEvent,
} from "react";

import Link from "next/link";

import { supabase } from "@/lib/supabase";

import AuthLayout from "@/components/AuthLayout";
import AuthInput from "@/components/AuthInput";
import AuthButton from "@/components/AuthButton";

interface FormErrors {
  username?: string;
  email?: string;
  password?: string;
}

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] =
    useState<FormErrors>({});

  const [generalError, setGeneralError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [googleLoading, setGoogleLoading] =
    useState(false);

  const [isSubmitted, setIsSubmitted] =
    useState(false);

  // ==========================================
  // VALIDATION
  // ==========================================

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const cleanUsername =
      username.trim().toLowerCase();

    if (!cleanUsername) {
      newErrors.username =
        "Please choose a username.";
    } else if (cleanUsername.length < 3) {
      newErrors.username =
        "Username must be at least 3 characters.";
    } else if (
      !/^[a-zA-Z0-9_.]+$/.test(cleanUsername)
    ) {
      newErrors.username =
        "Letters, numbers, underscores, and dots only.";
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) {
      newErrors.email =
        "Email address is required.";
    } else if (
      !emailRegex.test(email.trim())
    ) {
      newErrors.email =
        "Please enter a valid email address.";
    }

    if (!password) {
      newErrors.password =
        "Password is required.";
    } else if (password.length < 6) {
      newErrors.password =
        "Password must be at least 6 characters.";
    }

    setErrors(newErrors);

    return (
      Object.keys(newErrors).length === 0
    );
  };

  // ==========================================
  // EMAIL SIGNUP
  // ==========================================

  const handleSignup = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setGeneralError("");

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const cleanUsername =
        username.trim().toLowerCase();

      const cleanEmail =
        email.trim();

      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

      if (authError) {
        if (
          authError.message
            ?.toLowerCase()
            .includes("already registered")
        ) {
          setErrors((prev) => ({
            ...prev,
            email:
              "An account with this email already exists.",
          }));
        } else {
          console.error(
            "SIGNUP ERROR:",
            authError
          );

          setGeneralError(
            "We couldn't create your account right now. Please try again."
          );
        }

        return;
      }

      const user = authData?.user;

      if (user) {
        const {
          error: profileError,
        } = await supabase
          .from("profiles")
          .insert([
            {
              id: user.id,
              username: cleanUsername,
              display_name: cleanUsername,
            },
          ]);

        if (profileError) {
          console.error(
            "PROFILE CREATION ERROR:",
            profileError
          );

          if (
            profileError.code === "23505" ||
            profileError.message?.includes(
              "unique constraint"
            )
          ) {
            setErrors((prev) => ({
              ...prev,
              username:
                "That username is already taken.",
            }));

            return;
          }

          setGeneralError(
            "Your account was created, but we couldn't create your profile."
          );

          return;
        }
      }

      setIsSubmitted(true);
    } catch (error) {
      console.error(
        "UNEXPECTED SIGNUP ERROR:",
        error
      );

      setGeneralError(
        "An unexpected error occurred. Please check your connection."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // GOOGLE SIGNUP
  // ==========================================

  const handleGoogleSignup = async () => {
    setGeneralError("");
    setGoogleLoading(true);

    try {
      const { error: googleError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback?next=/feed`,
          },
        });

      if (googleError) {
        console.error(
          "GOOGLE SIGNUP ERROR:",
          googleError
        );

        setGeneralError(
          "Could not start Google sign-up. Please try again."
        );

        setGoogleLoading(false);
      }
    } catch (error) {
      console.error(
        "UNEXPECTED GOOGLE SIGNUP ERROR:",
        error
      );

      setGeneralError(
        "Something went wrong while connecting to Google."
      );

      setGoogleLoading(false);
    }
  };

  // ==========================================
  // EMAIL CONFIRMATION SCREEN
  // ==========================================

  if (isSubmitted) {
    return (
      <AuthLayout tagline="Welcome to the council">
        <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 text-center flex flex-col items-center gap-4 animate-fadeIn">

          <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl">
            ✉️
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">
              Check your email
            </h2>

            <p className="text-xs text-zinc-400">
              We sent a confirmation link to:
            </p>

            <p className="text-sm font-semibold text-white break-all pt-1">
              {email}
            </p>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed pt-2">
            Once you confirm your email, you can
            enter Drip-or-Skip and judge the fits.
          </p>

          <Link
            href="/login"
            className="w-full h-11 mt-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white font-medium text-sm flex items-center justify-center transition-colors"
          >
            Back to login
          </Link>

        </div>
      </AuthLayout>
    );
  }

  // ==========================================
  // SIGNUP PAGE
  // ==========================================

  return (
    <AuthLayout>
      <div className="w-full flex flex-col gap-6">

        {/* HEADER */}

        <div className="text-center">
          <h2 className="text-xl font-bold text-white">
            Create your account
          </h2>

          <p className="text-xs text-zinc-400 mt-1">
            Join your squad and start judging the fits.
          </p>
        </div>

        {/* ERROR */}

        {generalError && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs font-medium text-center">
            {generalError}
          </div>
        )}

        {/* GOOGLE */}

        <button
          type="button"
          onClick={handleGoogleSignup}
          disabled={loading || googleLoading}
          className="w-full h-11 rounded-xl bg-white text-black font-semibold text-sm flex items-center justify-center gap-3 transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            "Connecting to Google..."
          ) : (
            <>
              <span className="text-lg font-bold">
                G
              </span>

              Continue with Google
            </>
          )}
        </button>

        {/* DIVIDER */}

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />

          <span className="text-[10px] uppercase tracking-wider text-zinc-600">
            or
          </span>

          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* EMAIL SIGNUP */}

        <form
          onSubmit={handleSignup}
          noValidate
          className="flex flex-col gap-4"
        >
          <AuthInput
            id="username"
            label="Username"
            placeholder="e.g. stylegod"
            value={username}
            onChange={(
              e: ChangeEvent<HTMLInputElement>
            ) => setUsername(e.target.value)}
            autoComplete="username"
            error={errors.username}
          />

          <AuthInput
            id="email"
            label="Email"
            type="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(
              e: ChangeEvent<HTMLInputElement>
            ) => setEmail(e.target.value)}
            autoComplete="email"
            error={errors.email}
          />

          <AuthInput
            id="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(
              e: ChangeEvent<HTMLInputElement>
            ) => setPassword(e.target.value)}
            autoComplete="new-password"
            error={errors.password}
          />

          <div className="pt-2">
            <AuthButton
              loading={loading}
              loadingText="Creating account..."
            >
              Create account
            </AuthButton>
          </div>
        </form>

        {/* LOGIN */}

        <div className="text-center pt-2 border-t border-zinc-900">
          <p className="text-xs text-zinc-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-white hover:underline transition-all"
            >
              Log in
            </Link>
          </p>
        </div>

      </div>
    </AuthLayout>
  );
}