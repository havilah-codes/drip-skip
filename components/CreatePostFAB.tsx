"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

export default function CreatePostFAB() {
  return (
    <Link
      href="/create-post"
      aria-label="Create post"
      className="
        fixed
        bottom-24
        right-5
        z-50
        w-14
        h-14
        rounded-full
        bg-btn
        text-btn-text
        flex
        items-center
        justify-center
        shadow-lg
        shadow-black/30
        transition-all
        duration-200
        hover:scale-110
        active:scale-95
        sm:bottom-8
        sm:right-8
      "
    >
      <Plus size={26} strokeWidth={2.5} />
    </Link>
  );
}
