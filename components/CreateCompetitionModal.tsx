"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Trophy,
  Hash,
  Link2,
  Copy,
  Check,
  Loader2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";

type CreateCompetitionModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type SuggestedHashtag = {
  name: string;
  post_count: number;
};

export default function CreateCompetitionModal({
  isOpen,
  onClose,
}: CreateCompetitionModalProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtag, setHashtag] = useState("");
  const [hashtagSuggestions, setHashtagSuggestions] = useState<
    SuggestedHashtag[]
  >([]);
  const [showHashtagDropdown, setShowHashtagDropdown] = useState(false);
  const [duration, setDuration] = useState(7);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [leaderboardUrl, setLeaderboardUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Auth
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
          const profile = await syncProfile(currentUser);
          // Safety: ensure we have a valid Supabase UUID, not a Firebase UID
          const id = profile?.id;
          if (id && id.includes('-')) {
            setProfileId(id);
          } else {
            console.error('Invalid profile ID received:', id);
          }
        }
      }
    );
    return () => unsubscribe();
  }, [isOpen]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setDescription("");
      setHashtag("");
      setDuration(7);
      setCreated(false);
      setLeaderboardUrl("");
      setShowHashtagDropdown(false);
    }
  }, [isOpen]);

  // Search hashtags as user types
  useEffect(() => {
    if (!hashtag.trim() || hashtag.length < 2) {
      setHashtagSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("hashtags")
        .select("name")
        .ilike("name", `%${hashtag.trim()}%`)
        .limit(5);

      if (!data) {
        setHashtagSuggestions([]);
        return;
      }

      // Get post counts
      const results = await Promise.all(
        data.map(async (h) => {
          const { count } = await supabase
            .from("post_hashtags")
            .select("id", { count: "exact", head: true })
            .eq("hashtag_id", h.name); // This won't work perfectly, need to join
          return { name: h.name, post_count: count || 0 };
        })
      );

      setHashtagSuggestions(results);
    }, 300);

    return () => clearTimeout(timer);
  }, [hashtag]);

  const handleCreate = async () => {
    if (!title.trim() || !hashtag.trim() || !user || creating) return;

    setCreating(true);
    try {
      const now = new Date();
      const endsAt = new Date(
        now.getTime() + duration * 24 * 60 * 60 * 1000
      );

      // Clean hashtag (remove # if user typed it)
      const cleanHashtag = hashtag.trim().replace(/^#/, "").toLowerCase();

      const { data, error } = await supabase
        .from("challenges")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          theme: cleanHashtag,
          status: "active",
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;

      // Save ownership
      if (data?.id) {
        await supabase.from("challenge_ownership").insert({
          challenge_id: data.id,
          firebase_uid: user.uid,
        });
      }

      // Make sure hashtag exists
      await supabase
        .from("hashtags")
        .upsert({ name: cleanHashtag }, { onConflict: "name" });

      const url = `${window.location.origin}/leaderboard/${cleanHashtag}`;
      setLeaderboardUrl(url);
      setCreated(true);
    } catch (err) {
      console.error("Failed to create competition:", err);
      alert("Could not create competition. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(leaderboardUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* MODAL */}
      <div className="relative w-full max-w-md bg-bg rounded-3xl border border-border-s shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-s">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-purple-400" />
            <h2 className="text-lg font-bold font-display">
              {created ? "Competition Created!" : "Create Competition"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-m hover:text-text-p hover:bg-bg-sunken transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-5">
          {created ? (
            /* SUCCESS VIEW */
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-purple-950/50 flex items-center justify-center mx-auto mb-4">
                <Trophy size={32} className="text-purple-400" />
              </div>
              <h3 className="text-lg font-bold font-display mb-2">
                🎉 Your competition is live!
              </h3>
              <p className="text-sm text-text-t mb-4">
                Share this leaderboard link so participants can track their
                rankings:
              </p>

              {/* LEADERBOARD URL */}
              <div className="flex items-center gap-2 bg-bg-sunken rounded-xl p-3 mb-4">
                <Link2 size={16} className="text-text-m shrink-0" />
                <p className="text-sm text-text-s truncate flex-1 text-left">
                  {leaderboardUrl}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    copied
                      ? "bg-emerald-950/50 text-emerald-400"
                      : "bg-bg-raised text-text-s hover:text-text-p"
                  }`}
                >
                  {copied ? (
                    <span className="flex items-center gap-1">
                      <Check size={12} /> Copied
                    </span>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>

              <p className="text-xs text-text-t mb-4">
                Posts with <span className="font-bold text-purple-400">#{hashtag}</span> will appear on this leaderboard.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/leaderboard/${hashtag.replace(/^#/, "").toLowerCase()}`);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold transition-all active:scale-[0.98]"
                >
                  <Trophy size={14} />
                  View Leaderboard
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-border-s text-sm font-semibold text-text-s hover:bg-bg-sunken transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* CREATE FORM */
            <div className="space-y-4">
              {/* TITLE */}
              <div>
                <label className="text-xs font-semibold text-text-t mb-1.5 block">
                  Challenge Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                  placeholder="e.g. Neon Nights, All Black Everything"
                  maxLength={80}
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>

              {/* DESCRIPTION */}
              <div>
                <label className="text-xs font-semibold text-text-t mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                  placeholder="What should people wear? Give them guidance..."
                  rows={2}
                  maxLength={300}
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors resize-none"
                />
              </div>

              {/* HASHTAG */}
              <div className="relative">
                <label className="text-xs font-semibold text-text-t mb-1.5 block">
                  Challenge Hashtag
                </label>
                <div className="relative">
                  <Hash
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-m"
                  />
                  <input
                    type="text"
                    value={hashtag}
                    onChange={(e) => {
                      const val = e.target.value
                        .replace(/[^a-zA-Z0-9_]/g, "")
                        .slice(0, 30);
                      setHashtag(val);
                      setShowHashtagDropdown(val.length >= 2);
                    }}
                    placeholder="e.g. neonnight, allblack"
                    maxLength={30}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
                <p className="text-[10px] text-text-m mt-1">
                  Posts with this hashtag will be tracked on the leaderboard
                </p>

                {/* HASHTAG SUGGESTIONS */}
                {showHashtagDropdown && hashtagSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-bg-raised border border-border-d rounded-xl shadow-xl z-10 overflow-hidden max-h-40 overflow-y-auto">
                    {hashtagSuggestions.map((h) => (
                      <button
                        key={h.name}
                        type="button"
                        onClick={() => {
                          setHashtag(h.name);
                          setShowHashtagDropdown(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-bg-sunken transition-colors"
                      >
                        <Hash size={14} className="text-purple-400" />
                        <span className="text-sm font-medium">{h.name}</span>
                        <span className="text-[10px] text-text-m ml-auto">
                          {h.post_count} posts
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* DURATION */}
              <div>
                <label className="text-xs font-semibold text-text-t mb-1.5 block">
                  Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) as 7 | 14 | 30)}
                  className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p outline-none focus:border-purple-500/50 transition-colors appearance-none cursor-pointer"
                >
                  {[...Array(14)].map((_, i) => {
                    const days = i + 1;
                    return (
                      <option key={days} value={days}>
                        {days} {days === 1 ? "day" : "days"}
                        {days === 14 ? " (2 weeks)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* PREVIEW */}
              {title.trim() && hashtag.trim() && (
                <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-3">
                  <p className="text-[10px] text-text-t mb-1">PREVIEW</p>
                  <p className="text-sm font-semibold">{title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-purple-400 font-medium">
                      #{hashtag}
                    </span>
                    <span className="text-[10px] text-text-m">·</span>
                    <span className="text-[10px] text-text-m">
                      {duration} days
                    </span>
                  </div>
                </div>
              )}

              {/* CREATE BUTTON */}
              <button
                type="button"
                onClick={handleCreate}
                disabled={!title.trim() || !hashtag.trim() || creating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                <span>{creating ? "Creating..." : "Create Competition"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
