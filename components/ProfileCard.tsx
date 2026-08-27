"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { UserPlus, UserCheck, MessageCircle } from "lucide-react";
import { extractColorsClient, colorsToGradient, isLightColor } from "@/lib/colors";

// All available gradient presets (fallback when no colors available)
export const GRADIENT_PRESETS = [
  { id: "violet", label: "Violet", classes: "from-violet-600 via-fuchsia-500 to-cyan-400" },
  { id: "ocean", label: "Ocean", classes: "from-blue-600 via-indigo-500 to-purple-400" },
  { id: "sunset", label: "Sunset", classes: "from-rose-600 via-pink-500 to-orange-400" },
  { id: "emerald", label: "Emerald", classes: "from-emerald-600 via-teal-500 to-cyan-400" },
  { id: "fire", label: "Fire", classes: "from-amber-500 via-orange-500 to-rose-500" },
  { id: "sky", label: "Sky", classes: "from-cyan-500 via-blue-500 to-indigo-500" },
  { id: "aurora", label: "Aurora", classes: "from-fuchsia-600 via-purple-500 to-blue-400" },
  { id: "mint", label: "Mint", classes: "from-teal-500 via-emerald-500 to-green-400" },
  { id: "neon", label: "Neon", classes: "from-lime-400 via-emerald-400 to-cyan-400" },
  { id: "candy", label: "Candy", classes: "from-pink-500 via-rose-400 to-red-400" },
  { id: "midnight", label: "Midnight", classes: "from-slate-800 via-indigo-900 to-purple-900" },
  { id: "gold", label: "Gold", classes: "from-yellow-500 via-amber-500 to-orange-500" },
] as const;

type GradientId = (typeof GRADIENT_PRESETS)[number]["id"];

export function getGradientClasses(id: string | null | undefined): string {
  if (!id) return GRADIENT_PRESETS[0].classes;
  const preset = GRADIENT_PRESETS.find((p) => p.id === id);
  return preset ? preset.classes : GRADIENT_PRESETS[0].classes;
}

// Deterministic random gradient for users who haven't set one
export function generateRandomGradient(userId: string): GradientId {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return GRADIENT_PRESETS[Math.abs(hash) % GRADIENT_PRESETS.length].id;
}

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  card_gradient?: string | null;
  dominant_colors?: string | null; // JSON array of hex strings
  bio?: string | null;
};

type ProfileCardProps = {
  profile: Profile;
  isFollowing: boolean;
  isCurrentUser: boolean;
  loading?: boolean;
  onFollow?: () => void;
};

export default function ProfileCard({
  profile,
  isFollowing,
  isCurrentUser,
  loading = false,
  onFollow,
}: ProfileCardProps) {
  const avatar = profile.avatar_url || "/default-avatar.png";
  const imgRef = useRef<HTMLImageElement>(null);
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [colorMode, setColorMode] = useState<"loading" | "extracted" | "failed">("loading");

  // Parse stored colors from DB
  let storedColors: string[] = [];
  try {
    if (profile.dominant_colors) {
      storedColors = JSON.parse(profile.dominant_colors);
    }
  } catch {
    // ignore parse error
  }

  // Determine if we have colors from DB
  const hasStoredColors = storedColors.length > 0;

  // ColorThief fallback: extract colors from avatar when no stored colors
  const handleImageLoad = useCallback(() => {
    if (hasStoredColors) {
      // Already have stored colors, no need to extract
      setColorMode("extracted");
      return;
    }

    const img = imgRef.current;
    if (!img) return;

    try {
      const colors = extractColorsClient(img);
      if (colors.length > 0) {
        setExtractedColors(colors);
        setColorMode("extracted");
      } else {
        setColorMode("failed");
      }
    } catch {
      setColorMode("failed");
    }
  }, [hasStoredColors]);

  // Determine final colors: stored > extracted > fallback preset
  const finalColors = hasStoredColors ? storedColors : extractedColors;
  const useGradientImage = finalColors.length >= 2;
  const gradientStyle = useGradientImage ? {
    background: colorsToGradient(finalColors),
    color: isLightColor(finalColors[0]) ? "#000000" : "#ffffff",
  } : undefined;

  // Fallback gradient class
  const fallbackGradient = getGradientClasses(
    profile.card_gradient || generateRandomGradient(profile.id)
  );

  return (
    <div className="relative rounded-2xl overflow-hidden bg-bg-raised border border-border-s">
      {/* GRADIENT BACKGROUND */}
      {useGradientImage ? (
        <div className="absolute inset-0" style={gradientStyle} />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-r ${fallbackGradient}`} />
      )}
      <div className="absolute inset-0 bg-black/10" />

      {/* HIDDEN IMG FOR COLORTHIEF */}
      {!hasStoredColors && (
        <img
          ref={imgRef}
          src={avatar}
          crossOrigin="anonymous"
          onLoad={handleImageLoad}
          className="hidden"
          alt=""
        />
      )}

      {/* CONTENT — horizontal layout */}
      <div className="relative flex items-center gap-3 p-3 pr-3">
        {/* AVATAR */}
        <Link href={`/profile/${profile.username}`} className="shrink-0">
          <img
            src={avatar}
            alt={profile.display_name}
            className="w-16 h-16 rounded-xl object-cover border-2 border-white/20 shadow-lg"
          />
        </Link>

        {/* INFO */}
        <Link
          href={`/profile/${profile.username}`}
          className="flex-1 min-w-0"
        >
          <p className="text-sm font-bold text-white truncate drop-shadow-sm">
            {profile.display_name}
          </p>
          <p className="text-xs text-white/70 truncate">
            @{profile.username}
          </p>
          {profile.bio && (
            <p className="text-[11px] text-white/50 truncate mt-0.5">
              {profile.bio}
            </p>
          )}
        </Link>

        {/* ACTIONS */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isCurrentUser && onFollow && (
            <button
              type="button"
              onClick={onFollow}
              disabled={loading}
              className={`flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                isFollowing
                  ? "bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm"
                  : "bg-white text-gray-900 hover:bg-white/90"
              }`}
            >
              {isFollowing ? (
                <UserCheck size={14} />
              ) : (
                <UserPlus size={14} />
              )}
            </button>
          )}
          {!isCurrentUser && (
            <Link
              href={`/messages/new?user=${profile.username}`}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm transition-colors"
            >
              <MessageCircle size={15} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
