/**
 * SkeletonPulse — reusable building blocks for skeleton loaders.
 * Uses the `.skeleton-bone` class defined in globals.css (shimmer animation).
 */

export function Bone({
  className = "",
  rounded = false,
}: {
  className?: string;
  rounded?: boolean;
}) {
  return (
    <div
      className={`skeleton-bone ${
        rounded ? "rounded-full" : "rounded-xl"
      } ${className}`}
    />
  );
}

/* ==========================================
   FEED SKELETON — matches PostCard layout
   ========================================== */

export function PostSkeleton() {
  return (
    <article className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden">
      {/* Header: avatar + name + username */}
      <div className="flex items-center gap-3 p-4">
        <Bone className="w-10 h-10 shrink-0" rounded />
        <div className="flex-1 space-y-2">
          <Bone className="h-3.5 w-28" />
          <Bone className="h-3 w-20" />
        </div>
      </div>

      {/* Text lines */}
      <div className="px-4 pb-4 space-y-2">
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-3/4" />
      </div>

      {/* Image placeholder (random-ish height to feel natural) */}
      <Bone className="h-64 sm:h-80 w-full !rounded-none" />

      {/* Vote buttons */}
      <div className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Bone className="h-14 rounded-2xl" />
          <Bone className="h-14 rounded-2xl" />
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-3 py-3 mt-3 border-t border-border-s/50">
        <Bone className="h-4 w-20" />
        <Bone className="h-4 w-16" />
        <Bone className="h-4 w-14" />
      </div>
    </article>
  );
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}

/* ==========================================
   CHAT LIST SKELETON — matches messages list
   ========================================== */

export function ChatListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-2xl"
        >
          <Bone className="w-12 h-12 shrink-0" rounded />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Bone className="h-3.5 w-32" />
              <Bone className="h-3 w-10" />
            </div>
            <Bone className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ==========================================
   USER CARD SKELETON — matches explore results
   ========================================== */

export function UserCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-3xl border border-border-s bg-bg-raised overflow-hidden"
        >
          <Bone className="h-28 w-full" />
          <div className="px-5 pb-5">
            <div className="-mt-10 mb-3 flex items-end gap-3.5">
              <Bone className="w-20 h-20 rounded-2xl shrink-0" />
              <Bone className="h-9 w-24 rounded-xl mb-1" />
            </div>
            <Bone className="h-4 w-32 mb-1" />
            <Bone className="h-3 w-24 mb-3" />
            <div className="flex gap-1 mb-4">
              <Bone className="flex-1 h-14 rounded-xl" />
              <Bone className="flex-1 h-14 rounded-xl" />
              <Bone className="flex-1 h-14 rounded-xl" />
            </div>
            <div className="flex gap-2">
              <Bone className="flex-1 h-10 rounded-xl" />
              <Bone className="flex-1 h-10 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ==========================================
   PROFILE SKELETON — matches profile header + posts
   ========================================== */

export function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back button */}
      <Bone className="h-9 w-9 mb-6" rounded />

      {/* Profile header */}
      <div className="flex items-start gap-4 mb-6">
        <Bone className="w-20 h-20 shrink-0" rounded />
        <div className="flex-1 space-y-3">
          <Bone className="h-5 w-40" />
          <Bone className="h-3.5 w-28" />
          <div className="flex gap-6 pt-1">
            <div className="space-y-1">
              <Bone className="h-4 w-8" />
              <Bone className="h-2.5 w-12" />
            </div>
            <div className="space-y-1">
              <Bone className="h-4 w-8" />
              <Bone className="h-2.5 w-16" />
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 mb-8">
        <Bone className="h-10 flex-1 rounded-xl" />
        <Bone className="h-10 flex-1 rounded-xl" />
      </div>

      {/* Posts */}
      <FeedSkeleton count={2} />
    </div>
  );
}

/* ==========================================
   MESSAGE BUBBLE SKELETON — matches chat detail
   ========================================== */

export function MessageSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {Array.from({ length: count }).map((_, i) => {
        const isMine = i % 3 === 0;
        const width = isMine ? "w-2/3 ml-auto" : "w-2/3";
        return (
          <div
            key={i}
            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
          >
            <div className={`${width} space-y-1.5`}>
              <Bone className="h-3 w-16" />
              <Bone className={`h-10 ${isMine ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md"}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ==========================================
   EXPLORE PAGE SKELETON
   ========================================== */

export function ExploreSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Bone className="w-6 h-6 shrink-0" rounded />
        <Bone className="h-6 w-28" />
      </div>

      {/* Search bar */}
      <Bone className="h-12 w-full rounded-2xl mb-6" />

      {/* Trending pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <Bone key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>

      {/* Results header */}
      <Bone className="h-4 w-36 mb-4" />

      {/* User cards */}
      <UserCardSkeleton count={4} />
    </div>
  );
}
