import { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
  tagline?: string;
}

export default function AuthLayout({
  children,
  tagline = "The council has judged your fit."
}: AuthLayoutProps) {
  return (
    <main className="min-h-screen w-full bg-bg text-text-p flex flex-col justify-between items-center px-6 py-8 sm:justify-center sm:py-12 select-none">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black pointer-events-none -z-10" />

      <div className="w-full max-w-[400px] my-auto flex flex-col items-center">
        <header className="text-center mb-8 sm:mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent italic font-display">
            Drip-or-Skip
          </h1>
          <p className="text-xs sm:text-sm font-medium text-text-s mt-2 tracking-wide uppercase">
            {tagline}
          </p>
        </header>

        {children}
      </div>

      <footer className="mt-8 text-center text-xs text-text-m">
        &copy; {new Date().getFullYear()} DRIP-OR-SKIP. ALL RIGHTS RESERVED.
      </footer>
    </main>
  );
}