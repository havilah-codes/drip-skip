"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import Link from "next/link";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";

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

  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState("");

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // ==========================================
  // VALIDATE FORM
  // ==========================================

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const cleanUsername = username.trim().toLowerCase();

    if (!cleanUsername) {
      newErrors.username = "Please choose a username.";
    } else if (cleanUsername.length < 3) {
      newErrors.username =
        "Username must be at least 3 characters.";
    } else if (!/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
      newErrors.username =
        "Letters, numbers, underscores, and dots only.";
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email.trim()) {
      newErrors.email =
        "Email address is required.";
    } else if (!emailRegex.test(email.trim())) {
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

    return Object.keys(newErrors).length === 0;
  };

  // ==========================================
  // FIREBASE SIGNUP
  // ==========================================

  const handleSignup = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setGeneralError("");
    setErrors({});

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim();
      const cleanUsername =
        username.trim().toLowerCase();

      // ------------------------------------------
      // CREATE FIREBASE ACCOUNT
      // ------------------------------------------

      const userCredential =
        await createUserWithEmailAndPassword(
          firebaseAuth,
          cleanEmail,
          password
        );

      const user = userCredential.user;

      console.log(
        "FIREBASE ACCOUNT CREATED:",
        user.uid
      );

      // ------------------------------------------
      // SAVE USERNAME LOCALLY FOR NOW
      // ------------------------------------------
      //
      // We'll move this into the database/profile
      // system once the Firebase auth migration
      // is completely finished.
      //

      localStorage.setItem(
        "drip_username",
        cleanUsername
      );

      // ------------------------------------------
      // SEND EMAIL VERIFICATION
      // ------------------------------------------

      await sendEmailVerification(user);

      console.log(
        "VERIFICATION EMAIL SENT TO:",
        cleanEmail
      );

      // ------------------------------------------
      // SHOW EMAIL VERIFICATION SCREEN
      // ------------------------------------------

      setIsSubmitted(true);
    } catch (error: any) {
      console.error(
        "FIREBASE SIGNUP ERROR:",
        error
      );

      if (
        error?.code ===
        "auth/email-already-in-use"
      ) {
        setErrors({
          email:
            "An account with this email already exists.",
        });
      } else if (
        error?.code ===
        "auth/invalid-email"
      ) {
        setErrors({
          email:
            "Please enter a valid email address.",
        });
      } else if (
        error?.code ===
        "auth/weak-password"
      ) {
        setErrors({
          password:
            "Your password is too weak. Use at least 6 characters.",
        });
      } else if (
        error?.code ===
        "auth/network-request-failed"
      ) {
        setGeneralError(
          "Network error. Please check your connection and try again."
        );
      } else {
        setGeneralError(
          "We couldn't create your account right now. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // EMAIL VERIFICATION SCREEN
  // ==========================================

  if (isSubmitted) {
    return (
      <AuthLayout tagline="Welcome to the council">
        <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 text-center flex flex-col items-center gap-4 animate-fadeIn">
          <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl">
            ✉️
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white font-display">
              Check your email
            </h2>

            <p className="text-xs text-zinc-400">
              We sent a verification link to:
            </p>

            <p className="text-sm font-semibold text-white break-all pt-1">
              {email}
            </p>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed pt-2">
            Click the verification link in your
            email to verify your account. Once
            verified, you can log in to Drip-or-Skip.
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
  // SIGNUP FORM
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
            Join your squad and start judging the
            fits.
          </p>
        </div>

        {/* GENERAL ERROR */}

        {generalError && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs font-medium text-center">
            {generalError}
          </div>
        )}

        {/* FORM */}

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
            ) =>
              setUsername(e.target.value)
            }
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
            ) =>
              setEmail(e.target.value)
            }
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
            ) =>
              setPassword(e.target.value)
            }
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