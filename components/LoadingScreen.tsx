export default function LoadingScreen({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <main className="min-h-screen bg-bg text-text-p flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        {/* LOGO */}
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-3xl font-extrabold italic tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent font-display">
            Drip or Skip
          </h1>

          {/* ANIMATED LOADING DOTS */}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white/80 animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-white/50 animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-white/30 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>

        {/* MESSAGE */}
        <p className="text-xs text-text-t font-medium tracking-wide">
          {message}
        </p>
      </div>
    </main>
  );
}
