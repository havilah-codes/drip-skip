"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        if (user) {
          router.replace("/feed");
        } else {
          router.replace("/login");
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-3xl font-extrabold italic tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent font-display">
            Drip or Skip
          </h1>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white/80 animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
        <p className="text-xs text-zinc-500 font-medium tracking-wide">
          Loading...
        </p>
      </div>
    </main>
  );
}