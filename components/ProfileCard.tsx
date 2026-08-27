"use client";

import Link from "next/link";
import { UserPlus, UserCheck, MessageCircle, Flame, Users, FileImage } from "lucide-react";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string | null;
  drip_count?: number;
  follower_count?: number;
  post_count?: number;
};

type ProfileCardProps = {
  profile: Profile;
  isFollowing: boolean;
  isCurrentUser: boolean;
  loading?: boolean;
  onFollow?: () => void;
};

// Deterministic gradient based on user id so each card is unique
const GRADIENTS = [
  "from-violet-600 via-fuchsia-500 to-cyan-400",
  "from-blue-600 via-indigo-500 to-purple-400",
  "from-rose-600 via-pink-500 to-orange-400",
  "from-emerald-600 via-teal-500 to-cyan-400",
  "from-amber-500 via-orange-500 to-rose-500",
  "from-cyan-500 via-blue-500 to-indigo-500",
  "from-fuchsia-600 via-purple-500 to-blue-400",
  "from-teal-500 via-emerald-500 to-green-400",
];

function getGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function ProfileCard({
  profile,
  isFollowing,
  isCurrentUser,
  loading = false,
  onFollow,
}: ProfileCardProps) {
  const avatar = profile.avatar_url || "/default-avatar.png";
  const gradient = getGradient(profile.id);
  const dripCount = profile.drip_count ?? 0;
  const followerCount = profile.follower_count ?? 0;
  const postCount = profile.post_count ?? 0;

  return (
    <div className="rounded-3xl border border-border-s bg-bg-raised overflow-hidden transition-all hover:shadow-lg hover:shadow-black/20">
      {/* GRADIENT HEADER */}
      <div className={`relative h-28 bg-gradient-to-br ${gradient}`}>
        {/* Decorative blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-xl" />
          <div className="absolute top-8 left-6 w-16 h-16 rounded-full bg-white/10 blur-lg" />
          <div className="absolute -bottom-4 right-10 w-20 h-20 rounded-full bg-black/10 blur-xl" />
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-5 pb-5">
        {/* AVATAR — overlaps header */}
        <div className="-mt-10 mb-3 flex items-end gap-3.5">
          <Link href={`/profile/${profile.username}`} className="shrink-0">
            <img
              src={avatar}
              alt={profile.display_name}
              className="w-20 h-20 rounded-2xl object-cover border-[3px] border-bg-raised shadow-lg"
            />
          </Link>
          {!isCurrentUser && onFollow && (
            <button
              type="button"
              onClick={onFollow}
              disabled={loading}
              className={`mb-1 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                isFollowing
                  ? "border border-border-d text-text-s hover:text-text-p hover:bg-bg-sunken"
                  : "bg-btn text-btn-text hover:bg-btn/80"
              }`}
            >
              {isFollowing ? (
                <>
                  <UserCheck size={14} />
                  Following
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  Follow
                </>
              )}
            </button>
          )}
        </div>

        {/* NAME + USERNAME */}
        <Link href={`/profile/${profile.username}`}>
          <h3 className="text-base font-bold font-display text-text-p truncate">
            {profile.display_name}
          </h3>
        </Link>
        <p className="text-xs text-text-t truncate mb-3">
          @{profile.username}
        </p>

        {/* BIO */}
        {profile.bio && (
          <p className="text-xs text-text-s line-clamp-2 mb-3 leading-relaxed">
            {profile.bio}
          </p>
        )}

        {/* STATS ROW */}
        <div className="flex items-center gap-0.5 mb-4">
          <div className="flex-1 text-center py-2 rounded-xl bg-bg-sunken/50">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Flame size={12} className="text-cyan-400" />
              <span className="text-sm font-bold text-text-p">{dripCount}</span>
            </div>
            <p className="text-[10px] text-text-t">Drips</p>
          </div>
          <div className="flex-1 text-center py-2 rounded-xl bg-bg-sunken/50 mx-1">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Users size={12} className="text-purple-400" />
              <span className="text-sm font-bold text-text-p">{followerCount}</span>
            </div>
            <p className="text-[10px] text-text-t">Followers</p>
          </div>
          <div className="flex-1 text-center py-2 rounded-xl bg-bg-sunken/50">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <FileImage size={12} className="text-amber-400" />
              <span className="text-sm font-bold text-text-p">{postCount}</span>
            </div>
            <p className="text-[10px] text-text-t">Posts</p>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        {!isCurrentUser && (
          <div className="flex items-center gap-2">
            <Link
              href={`/profile/${profile.username}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-bg-sunken/50 text-text-s text-xs font-semibold hover:bg-bg-sunken transition-colors"
            >
              View Profile
            </Link>
            <Link
              href={`/messages/new?user=${profile.username}`}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-btn text-btn-text text-xs font-semibold hover:bg-btn/80 transition-colors"
            >
              <MessageCircle size={14} />
              Message
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
