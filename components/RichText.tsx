import Link from "next/link";

/**
 * Renders text with #hashtags and @mentions as clickable colored links.
 * Non-tag text is rendered as plain text segments.
 */
export default function RichText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  // Split on hashtags and mentions, keeping the delimiters
  const parts = text.split(/(#[\w\u00C0-\u024F]+|@[a-zA-Z0-9_]+)/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("#")) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={`tag-${tag}-${i}`}
              href={`/hashtag/${tag}`}
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith("@")) {
          const username = part.slice(1).toLowerCase();
          return (
            <Link
              key={`mention-${username}-${i}`}
              href={`/profile/${username}`}
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
