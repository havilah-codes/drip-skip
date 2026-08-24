import { Bone } from "./SkeletonPulse";

export function CreateSkeleton() {
  return (
    <main className="min-h-screen bg-white dark:bg-black">
      <div className="mx-auto w-full max-w-xl px-4 pb-10">
        {/* Header */}
        <header className="flex items-center justify-between py-5">
          <Bone className="h-4 w-16" />
          <Bone className="h-5 w-20" />
          <div className="w-12" />
        </header>

        <div className="space-y-6">
          {/* Image picker */}
          <Bone className="aspect-square w-full rounded-2xl" />

          {/* Caption */}
          <div className="space-y-2">
            <Bone className="h-3.5 w-24" />
            <Bone className="h-24 w-full rounded-2xl" />
          </div>

          {/* Submit button */}
          <Bone className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    </main>
  );
}
