"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Lock,
  Bell,
  BellOff,
  Moon,
  Sun,
  Monitor,
  LogOut,
  Trash2,
  Loader2,
  ChevronRight,
  Check,
  Eye,
  EyeOff,
  Shield,
  Palette,
} from "lucide-react";
import { GRADIENT_PRESETS, generateRandomGradient } from "@/components/ProfileCard";

import {
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  type User,
} from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import {
  subscribeToPush,
  type PushPermissionResult,
} from "@/lib/push";

type Theme = "dark" | "light" | "system";

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Password
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  // Notifications
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [notifLoading, setNotifLoading] = useState(false);

  // Appearance
  const [theme, setTheme] = useState<Theme>("dark");
  const [cardGradient, setCardGradient] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ==========================================
  // AUTH
  // ==========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      const profile = await syncProfile(currentUser);
      if (profile?.id) {
        setProfileId(profile.id);
        setCardGradient(profile.card_gradient || generateRandomGradient(profile.id));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // ==========================================
  // NOTIFICATION PERMISSION
  // ==========================================

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotifPermission("unsupported");
      return;
    }
    setNotifPermission(Notification.permission);
  }, []);

  const handleEnableNotifications = async () => {
    if (notifLoading) return;
    setNotifLoading(true);
    try {
      const result: PushPermissionResult = await subscribeToPush();
      setNotifPermission(result === "granted" ? "granted" : result === "denied" ? "denied" : "default");
    } catch {
      // ignore
    } finally {
      setNotifLoading(false);
    }
  };

  const handleOpenSystemSettings = () => {
    // Best-effort: open browser notification settings
    if (typeof window !== "undefined" && "Notification" in window) {
      // Chrome/Edge: can't programmatically open settings, just inform user
      alert(
        "To change notification settings, go to your browser settings → Site Settings → Notifications."
      );
    }
  };

  // ==========================================
  // APPEARANCE
  // ==========================================

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("theme") as Theme | null;
    setTheme(saved || "dark");
  }, []);

  const applyTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    const root = document.documentElement;
    root.classList.remove("dark", "light");

    if (newTheme === "dark") {
      root.classList.add("dark");
      document.querySelector("meta[name='theme-color']")?.setAttribute("content", "#000000");
    } else if (newTheme === "light") {
      root.classList.add("light");
      document.querySelector("meta[name='theme-color']")?.setAttribute("content", "#ffffff");
    } else {
      // system
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(prefersDark ? "dark" : "light");
    }
  };

  // ==========================================
  // PASSWORD RESET
  // ==========================================

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email || resetLoading) return;

    setResetLoading(true);
    setResetError("");

    try {
      await sendPasswordResetEmail(firebaseAuth, user.email);
      setResetSent(true);
    } catch (err: any) {
      setResetError(err?.message || "Failed to send reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  // ==========================================
  // SIGN OUT
  // ==========================================

  const handleSignOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut(firebaseAuth);
      router.replace("/login");
    } catch (err) {
      console.error("❌ SIGN OUT FAILED:", err);
      setLoggingOut(false);
    }
  };

  // ==========================================
  // DELETE ACCOUNT
  // ==========================================

  const handleDeleteAccount = async () => {
    if (!user || deleting) return;
    setDeleting(true);

    try {
      // Delete Supabase profile + cascade (posts, votes, etc.)
      const { error } = await supabase.rpc("delete_user_account");

      if (error) {
        // Fallback: try deleting profile row directly
        const profile = await syncProfile(user);
        if (profile?.id) {
          await supabase.from("profiles").delete().eq("id", profile.id);
        }
      }

      // Sign out Firebase
      await signOut(firebaseAuth);
      router.replace("/login");
    } catch (err) {
      console.error("❌ DELETE ACCOUNT FAILED:", err);
      alert("Failed to delete account. Please try again or contact support.");
      setDeleting(false);
    }
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-t" />
      </main>
    );
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <main className="min-h-screen bg-bg text-text-p">

      {/* ====================================== */}
      {/* HEADER */}
      {/* ====================================== */}

      <header className="sticky top-0 z-40 border-b border-border-s bg-bg/85 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-all"
          >
            <ArrowLeft size={19} />
          </button>
          <h1 className="ml-3 font-semibold font-display">
            Settings
          </h1>
        </div>
      </header>

      {/* ====================================== */}
      {/* CONTENT */}
      {/* ====================================== */}

      <div className="max-w-2xl mx-auto px-4 py-6 pb-28 space-y-8">

        {/* ==================================== */}
        {/* ACCOUNT */}
        {/* ==================================== */}

        <section>
          <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
            Account
          </h2>

          <div className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden divide-y divide-zinc-900">

            {/* Email */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-xl bg-bg-sunken flex items-center justify-center shrink-0">
                <Mail size={17} className="text-text-s" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-text-t">Email</p>
                <p className="text-sm font-medium truncate">{user?.email || "—"}</p>
              </div>
            </div>

            {/* Change password */}
            <button
              type="button"
              onClick={() => setShowPasswordReset(!showPasswordReset)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-bg-sunken/50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-bg-sunken flex items-center justify-center shrink-0">
                <Lock size={17} className="text-text-s" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Change password</p>
                <p className="text-xs text-text-t">Send a reset link to your email</p>
              </div>
              <ChevronRight
                size={16}
                className={`text-text-m transition-transform ${showPasswordReset ? "rotate-90" : ""}`}
              />
            </button>

            {/* Password reset form (expandable) */}
            {showPasswordReset && (
              <div className="px-4 pb-4 pt-1 bg-bg-raised">
                {resetSent ? (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-950/40 border border-emerald-900/40 px-4 py-3">
                    <Check size={16} className="text-emerald-400 shrink-0" />
                    <p className="text-sm text-emerald-300">
                      Reset link sent to <span className="font-medium">{user?.email}</span>. Check your inbox.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordReset} className="space-y-3">
                    <p className="text-xs text-text-t">
                      We&apos;ll send a password reset link to <span className="text-text-s">{user?.email}</span>.
                    </p>
                    {resetError && (
                      <p className="text-xs text-red-400">{resetError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full rounded-xl bg-btn text-btn-text py-2.5 text-sm font-bold hover:bg-btn/80 disabled:opacity-50 transition-all"
                    >
                      {resetLoading ? "Sending..." : "Send reset link"}
                    </button>
                  </form>
                )}
              </div>
            )}

          </div>
        </section>

        {/* ==================================== */}
        {/* NOTIFICATIONS */}
        {/* ==================================== */}

        <section>
          <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
            Notifications
          </h2>

          <div className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden divide-y divide-zinc-900">

            {/* Push notifications */}
            <div className="px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-bg-sunken flex items-center justify-center shrink-0">
                  {notifPermission === "granted" ? (
                    <Bell size={17} className="text-emerald-400" />
                  ) : (
                    <BellOff size={17} className="text-text-s" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Push notifications</p>
                  <p className="text-xs text-text-t mt-0.5">
                    {notifPermission === "granted"
                      ? "Enabled — you'll get notified about messages and activity"
                      : notifPermission === "denied"
                        ? "Blocked — enable in your browser settings"
                        : notifPermission === "unsupported"
                          ? "Not supported in this browser"
                          : "Get notified when someone messages you"}
                  </p>
                </div>
              </div>

              <div className="mt-3 ml-12">
                {notifPermission === "granted" ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <Check size={14} />
                    <span>Notifications enabled</span>
                  </div>
                ) : notifPermission === "denied" ? (
                  <button
                    type="button"
                    onClick={handleOpenSystemSettings}
                    className="text-xs text-text-s underline underline-offset-2 hover:text-text-p transition-colors"
                  >
                    Open browser settings
                  </button>
                ) : notifPermission === "unsupported" ? (
                  <span className="text-xs text-text-m">Unavailable</span>
                ) : (
                  <button
                    type="button"
                    disabled={notifLoading}
                    onClick={handleEnableNotifications}
                    className="px-4 py-2 rounded-xl bg-btn text-btn-text text-xs font-bold hover:bg-btn/80 disabled:opacity-50 transition-all"
                  >
                    {notifLoading ? "Enabling..." : "Enable notifications"}
                  </button>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* ==================================== */}
        {/* APPEARANCE */}
        {/* ==================================== */}

        <section>
          <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
            Appearance
          </h2>

          <div className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-bg-sunken flex items-center justify-center shrink-0">
                  <Moon size={17} className="text-text-s" />
                </div>
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-text-t">Choose your preferred look</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 ml-12">
                {([
                  { value: "dark" as Theme, icon: Moon, label: "Dark" },
                  { value: "light" as Theme, icon: Sun, label: "Light" },
                  { value: "system" as Theme, icon: Monitor, label: "System" },
                ]).map((option) => {
                  const Icon = option.icon;
                  const active = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => applyTheme(option.value)}
                      className={`
                        flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all
                        ${active
                          ? "border-white/30 bg-white/10 text-text-p"
                          : "border-border-d bg-bg-sunken/50 text-text-t hover:text-text-s hover:border-zinc-700"
                        }
                      `}
                    >
                      <Icon size={18} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ==================================== */}
        {/* CARD GRADIENT */}
        {/* ==================================== */}

        <section>
          <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
            Card Gradient
          </h2>

          <div className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-bg-sunken flex items-center justify-center shrink-0">
                  <Palette size={17} className="text-text-s" />
                </div>
                <div>
                  <p className="text-sm font-medium">Profile card color</p>
                  <p className="text-xs text-text-t">Choose the gradient that appears when people find you on Explore</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 ml-12">
                {GRADIENT_PRESETS.map((preset) => {
                  const active = cardGradient === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={async () => {
                        setCardGradient(preset.id);
                        if (profileId) {
                          await supabase
                            .from("profiles")
                            .update({ card_gradient: preset.id })
                            .eq("id", profileId);
                        }
                      }}
                      className={`
                        relative h-10 rounded-xl bg-gradient-to-r ${preset.classes} border-2 transition-all
                        ${active
                          ? "border-white scale-105 shadow-lg"
                          : "border-transparent hover:border-white/30 hover:scale-105"
                        }
                      `}
                    >
                      {active && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Check size={14} className="text-white drop-shadow-md" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ==================================== */}
        {/* DANGER ZONE */}
        {/* ==================================== */}

        <section>
          <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
            Account actions
          </h2>

          <div className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden divide-y divide-zinc-900">

            {/* Sign out */}
            <button
              type="button"
              disabled={loggingOut}
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-bg-sunken/50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-bg-sunken flex items-center justify-center shrink-0">
                <LogOut size={17} className="text-text-s" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {loggingOut ? "Signing out..." : "Sign out"}
                </p>
              </div>
            </button>

            {/* Delete account */}
            <button
              type="button"
              disabled={deleting}
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-bg-sunken/50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-red-950/60 flex items-center justify-center shrink-0">
                <Trash2 size={17} className="text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-400">
                  {deleting ? "Deleting..." : "Delete account"}
                </p>
                <p className="text-xs text-text-t">
                  Permanently remove your account and all data
                </p>
              </div>
            </button>

          </div>
        </section>

        {/* ==================================== */}
        {/* VERSION */}
        {/* ==================================== */}

        <div className="text-center pt-4">
          <p className="text-[11px] text-text-m">Drip or Skip v0.1.0</p>
        </div>

      </div>

      {/* ====================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ====================================== */}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteConfirm(false)}
          />
          <div className="relative w-full max-w-sm rounded-3xl bg-bg-raised border border-border-d p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-red-950/60 flex items-center justify-center shrink-0">
                <Shield size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-bold font-display">Delete account?</h3>
                <p className="text-xs text-text-t mt-0.5">This cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-text-s leading-relaxed">
              All your posts, votes, messages, and profile data will be permanently deleted. This action is irreversible.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl border border-border-d py-3 text-sm font-medium hover:bg-bg-sunken transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteAccount}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-text-p hover:bg-red-500 disabled:opacity-50 transition-all"
              >
                {deleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={15} className="animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  "Yes, delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
