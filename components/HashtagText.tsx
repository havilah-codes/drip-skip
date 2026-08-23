import Link from "next/link";

/**
 * Renders text with #hashtags as clickable colored links.
 * Non-hashtag text is rendered as plain text segments.
 */
export default function HashtagText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  // Split on hashtags, keeping the delimiters
  const parts = text.split(/(#[\w\u00C0-\u024F]+)/gi);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("#")) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={`${tag}-${i}`}
              href={`/hashtag/${tag}`}
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
