"use client";

import Link from "next/link";
import { UserPlus, UserCheck } from "lucide-react";

type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type UserCardProps = {
  profile: UserProfile;
  isFollowing: boolean;
  isCurrentUser: boolean;
  loading?: boolean;
  onFollow: () => void;
};

export default function UserCard({
  profile,
  isFollowing,
  isCurrentUser,
  loading = false,
  onFollow,
}: UserCardProps) {
  const avatar =
    profile.avatar_url || "/default-avatar.png";

  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-zinc-900 bg-zinc-950">
      {/* AVATAR */}
      <Link
        href={`/profile/${profile.username}`}
        className="shrink-0"
      >
        <img
          src={avatar}
          alt={profile.display_name}
          className="w-12 h-12 rounded-full object-cover border border-zinc-800"
        />
      </Link>

      {/* USER INFO */}
      <Link
        href={`/profile/${profile.username}`}
        className="min-w-0 flex-1"
      >
        <p className="font-semibold text-sm truncate font-display">
          {profile.display_name}
        </p>

        <p className="text-xs text-zinc-500 truncate">
          @{profile.username}
        </p>
      </Link>

      {/* FOLLOW BUTTON */}
      {!isCurrentUser && (
        <button
          type="button"
          onClick={onFollow}
          disabled={loading}
          className={`
            shrink-0
            flex
            items-center
            justify-center
            gap-1.5
            px-3.5
            py-2
            rounded-xl
            text-xs
            font-bold
            transition-all
            active:scale-95
            disabled:opacity-50
            ${
              isFollowing
                ? "border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-900"
                : "bg-white text-black hover:bg-zinc-200"
            }
          `}
        >
          {isFollowing ? (
            <>
              <UserCheck size={15} />
              Following
            </>
          ) : (
            <>
              <UserPlus size={15} />
              Follow
            </>
          )}
        </button>
      )}
    </div>
  );
}