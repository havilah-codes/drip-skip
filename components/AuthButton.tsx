'use client';

import { ReactNode } from 'react';

interface AuthButtonProps {
  loading?: boolean;
  children: ReactNode;
  loadingText?: string;
}

export default function AuthButton({
  loading = false,
  children,
  loadingText = "Processing..."
}: AuthButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-12 mt-2 rounded-xl bg-btn text-btn-text font-semibold text-sm tracking-wide transition-all duration-200 hover:bg-btn/80 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-white/5"
    >
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}