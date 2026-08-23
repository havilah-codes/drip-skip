"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { firebaseAuth } from "@/lib/firebase";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
} from "firebase/auth";

import AuthLayout from "@/components/AuthLayout";
import AuthInput from "@/components/AuthInput";
import AuthButton from "@/components/AuthButton";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ==========================================
  // EMAIL / PASSWORD LOGIN
  // ==========================================

  const handleLogin = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      const result =
        await signInWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password
        );

      const user = result.user;

      console.log(
        "FIREBASE EMAIL USER:",
        user
      );

      // ==========================================
      // EMAIL VERIFICATION CHECK
      // ==========================================

      if (!user.emailVerified) {
        setError(
          "Please verify your email address before logging in. Check your inbox for the verification link."
        );

        setLoading(false);

        return;
      }

      // ==========================================
      // SUCCESS
      // ==========================================

      router.replace("/feed");
    } catch (error: any) {
      console.error(
        "EMAIL LOGIN ERROR:",
        error
      );

      switch (error?.code) {
        case "auth/invalid-credential":
          setError(
            "Those login details don't look right."
          );
          break;

        case "auth/user-not-found":
          setError(
            "No account exists with that email."
          );
          break;

        case "auth/wrong-password":
          setError(
            "Those login details don't look right."
          );
          break;

        case "auth/invalid-email":
          setError(
            "Please enter a valid email address."
          );
          break;

        case "auth/too-many-requests":
          setError(
            "Too many login attempts. Please wait a little and try again."
          );
          break;

        case "auth/network-request-failed":
          setError(
            "Network error. Please check your connection and try again."
          );
          break;

        default:
          setError(
            "Could not sign you in. Please try again."
          );
      }
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // GOOGLE LOGIN — FIREBASE
  // ==========================================

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const provider =
        new GoogleAuthProvider();

      const result = await signInWithPopup(
        firebaseAuth,
        provider
      );

      const user = result.user;

      console.log(
        "FIREBASE GOOGLE USER:",
        user
      );

      // Google accounts are already considered
      // verified by Firebase.
      router.replace("/feed");
    } catch (error: any) {
      console.error(
        "GOOGLE LOGIN ERROR:",
        error
      );

      switch (error?.code) {
        case "auth/popup-closed-by-user":
          setError(
            "Google sign-in was cancelled."
          );
          break;

        case "auth/popup-blocked":
          setError(
            "Your browser blocked the Google sign-in popup. Please allow popups and try again."
          );
          break;

        case "auth/account-exists-with-different-credential":
          setError(
            "An account already exists with this email using a different sign-in method."
          );
          break;

        case "auth/network-request-failed":
          setError(
            "Network error. Please check your connection and try again."
          );
          break;

        default:
          setError(
            "Could not sign in with Google. Please try again."
          );
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <AuthLayout>
      <div className="w-full flex flex-col gap-6">

        {/* HEADER */}

        <div className="text-center">
          <h2 className="text-xl font-bold text-white font-display">
            Welcome back
          </h2>

          <p className="text-xs text-zinc-400 mt-1">
            The council is waiting.
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs font-medium text-center animate-fadeIn">
            {error}
          </div>
        )}

        {/* GOOGLE */}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={
            loading || googleLoading
          }
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

        {/* EMAIL LOGIN */}

        <form
          onSubmit={handleLogin}
          noValidate
          className="flex flex-col gap-4"
        >
          <AuthInput
            id="login-email"
            label="Email"
            type="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(
              e: ChangeEvent<HTMLInputElement>
            ) =>
              setEmail(e.target.value)
            }
            autoComplete="email"
          />

          <div>
            <AuthInput
              id="login-password"
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(
                e: ChangeEvent<HTMLInputElement>
              ) =>
                setPassword(e.target.value)
              }
              autoComplete="current-password"
            />

            <div className="flex justify-end mt-1.5">
              <button
                type="button"
                onClick={() =>
                  alert(
                    "Password reset will be available soon."
                  )
                }
                className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <div className="pt-2">
            <AuthButton
              loading={loading}
              loadingText="Logging in..."
            >
              Log in
            </AuthButton>
          </div>
        </form>

        {/* SIGNUP */}

        <div className="text-center pt-2 border-t border-zinc-900">
          <p className="text-xs text-zinc-400">
            Don't have an account?{" "}

            <Link
              href="/signup"
              className="font-semibold text-white hover:underline transition-all"
            >
              Sign up
            </Link>
          </p>
        </div>

      </div>
    </AuthLayout>
  );
}