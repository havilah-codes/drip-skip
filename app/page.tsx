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
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-2xl font-extrabold italic bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
          Drip-or-Skip
        </h1>

        <p className="text-xs text-zinc-500 font-mono animate-pulse">
          Loading...
        </p>
      </div>
    </main>
  );
}