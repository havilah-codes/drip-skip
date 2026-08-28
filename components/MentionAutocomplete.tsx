"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Hash, AtSign, TrendingUp } from "lucide-react";

type Suggestion = {
  id: string;
  name: string;
  subtitle?: string;
  avatarUrl?: string;
  type: "mention" | "hashtag";
};

type MentionAutocompleteProps = {
  query: string;
  type: "mention" | "hashtag" | null;
  isOpen: boolean;
  onSelect: (suggestion: Suggestion) => void;
  onClose: () => void;
};

export default function MentionAutocomplete({
  query,
  type,
  isOpen,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions based on query and type
  useEffect(() => {
    if (!isOpen || !type || query.length === 0) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setLoading(true);
      try {
        if (type === "mention") {
          // Search usernames AND display names
          const { data: usernameData, error: usernameError } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .ilike("username", `%${query}%`)
            .limit(5);

          if (usernameError) throw usernameError;

          const seen = new Set<string>();
          const results: Suggestion[] = [];

          // Add username matches first
          for (const p of usernameData || []) {
            if (!seen.has(p.id) && results.length < 5) {
              seen.add(p.id);
              results.push({
                id: p.id,
                name: p.username,
                subtitle: p.display_name,
                avatarUrl: p.avatar_url,
                type: "mention" as const,
              });
            }
          }

          // If less than 5, also search display_name
          if (results.length < 5) {
            const { data: nameData } = await supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .ilike("display_name", `%${query}%`)
              .limit(5);

            for (const p of nameData || []) {
              if (!seen.has(p.id) && results.length < 5) {
                seen.add(p.id);
                results.push({
                  id: p.id,
                  name: p.username,
                  subtitle: p.display_name,
                  avatarUrl: p.avatar_url,
                  type: "mention" as const,
                });
              }
            }
          }

          setSuggestions(results);
        } else if (type === "hashtag") {
          // Search hashtags
          const { data, error } = await supabase
            .from("hashtags")
            .select("id, name")
            .ilike("name", `%${query}%`)
            .limit(5);

          if (error) throw error;

          const results: Suggestion[] = (data || []).map((h) => ({
            id: h.id,
            name: h.name,
            type: "hashtag" as const,
          }));

          // If less than 5 results, add "create hashtag" option
          if (results.length < 5 && query.length > 0) {
            const alreadyExists = results.some(
              (r) => r.name.toLowerCase() === query.toLowerCase()
            );
            if (!alreadyExists) {
              results.push({
                id: "create",
                name: query.toLowerCase(),
                subtitle: "Create new hashtag",
                type: "hashtag",
              });
            }
          }

          setSuggestions(results);
        }
      } catch (error) {
        console.error("❌ FETCH SUGGESTIONS ERROR:", error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [query, type, isOpen]);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (suggestions[selectedIndex]) {
        onSelect(suggestions[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen || suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-bg-raised border border-border-d rounded-2xl overflow-hidden shadow-xl max-h-64 overflow-y-auto z-50"
      role="listbox"
      onKeyDown={handleKeyDown}
    >
      {loading && (
        <div className="p-4 text-center text-sm text-text-t">
          <div className="w-4 h-4 border-2 border-text-t border-t-text-p rounded-full animate-spin mx-auto" />
        </div>
      )}

      {!loading && suggestions.length > 0 && (
        <div className="py-1">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSelect(suggestion)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                index === selectedIndex
                  ? "bg-bg-sunken"
                  : "hover:bg-bg-hover"
              }`}
              role="option"
              aria-selected={index === selectedIndex}
            >
              {/* Icon or Avatar */}
              {suggestion.type === "mention" ? (
                suggestion.avatarUrl ? (
                  <img
                    src={suggestion.avatarUrl}
                    alt={suggestion.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center">
                    <AtSign size={16} className="text-cyan-400" />
                  </div>
                )
              ) : (
                <div className="w-8 h-8 rounded-lg bg-purple-400/10 flex items-center justify-center">
                  <Hash size={16} className="text-purple-400" />
                </div>
              )}

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {suggestion.type === "mention" ? "@" : "#"}
                  {suggestion.name}
                </p>
                {suggestion.subtitle && (
                  <p className="text-xs text-text-t truncate">
                    {suggestion.subtitle}
                  </p>
                )}
              </div>

              {/* Action */}
              {suggestion.id === "create" && (
                <span className="text-xs text-text-m px-2 py-1 rounded-lg bg-bg-sunken">
                  Create
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Trending section for hashtags when empty query */}
      {type === "hashtag" && query.length === 0 && !loading && (
        <div className="p-3 border-t border-border-s">
          <div className="flex items-center gap-2 text-xs text-text-m mb-2">
            <TrendingUp size={12} />
            <span>Trending hashtags</span>
          </div>
          <HashtagSuggestions onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

// Fetch trending hashtags
function HashtagSuggestions({
  onSelect,
}: {
  onSelect: (suggestion: Suggestion) => void;
}) {
  const [hashtags, setHashtags] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchTrending = async () => {
      const { data, error } = await supabase
        .from("post_hashtags")
        .select("hashtag_id, hashtags!inner(id, name)")
        .limit(100);

      if (error || !data) return;

      // Count occurrences
      const counts = new Map<string, { id: string; name: string; count: number }>();
      for (const item of data) {
        const hashtag = Array.isArray(item.hashtags)
          ? item.hashtags[0]
          : item.hashtags;
        if (!hashtag) continue;

        const existing = counts.get(hashtag.name);
        if (existing) {
          existing.count++;
        } else {
          counts.set(hashtag.name, {
            id: hashtag.id,
            name: hashtag.name,
            count: 1,
          });
        }
      }

      // Sort by count and take top 5
      const trending = Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(({ count, ...rest }) => rest);

      setHashtags(trending);
    };

    fetchTrending();
  }, []);

  if (hashtags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {hashtags.map((hashtag) => (
        <button
          key={hashtag.id}
          type="button"
          onClick={() =>
            onSelect({
              id: hashtag.id,
              name: hashtag.name,
              type: "hashtag",
            })
          }
          className="px-3 py-1.5 rounded-lg bg-bg-sunken hover:bg-bg-hover text-sm text-text-s transition-colors"
        >
          #{hashtag.name}
        </button>
      ))}
    </div>
  );
}
