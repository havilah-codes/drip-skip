/**
 * Inline script injected into <head> to apply the saved theme
 * class on <html> before any content renders — avoids flash.
 */
export default function ThemeInit() {
  const script = `
    (function() {
      try {
        var t = localStorage.getItem('theme') || 'dark';
        if (t === 'system') {
          t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.classList.add(t);
      } catch(e) {
        document.documentElement.classList.add('dark');
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
