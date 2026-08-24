'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { MessageCircle, Send, X, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Comment {
  id: string;
  text: string;
  created_at: string;
  user_id: string;
  profile: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface CommentDrawerProps {
  postId: string;
  currentProfileId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export default function CommentDrawer({
  postId,
  currentProfileId,
  isOpen,
  onClose,
  onCommentAdded,
}: CommentDrawerProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch comments when drawer opens
  useEffect(() => {
    if (!isOpen || !postId) return;

    async function fetchComments() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('comments')
          .select(`
            id,
            text,
            created_at,
            user_id,
            profile:profiles!comments_user_id_fkey (
              username,
              display_name,
              avatar_url
            )
          `)
          .eq('post_id', postId)
          .order('created_at', { ascending: true });

        if (error) {
          // Fallback manual query if join fails
          const { data: rawComments } = await supabase
            .from('comments')
            .select('id, text, created_at, user_id')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

          if (rawComments && rawComments.length > 0) {
            const userIds = Array.from(new Set(rawComments.map((c) => c.user_id)));
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .in('id', userIds);

            const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

            const formatted = rawComments.map((c) => ({
              ...c,
              profile: profileMap.get(c.user_id) || {
                username: 'someone',
                display_name: 'Someone',
                avatar_url: null,
              },
            }));
            setComments(formatted as any);
          } else {
            setComments([]);
          }
        } else if (data) {
          setComments(data as any);
        }
      } catch (err) {
        console.error('Error fetching comments:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchComments();
  }, [isOpen, postId]);

  // Add Comment
  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentProfileId || submitting) return;

    setSubmitting(true);
    const textToInsert = newComment.trim();

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: currentProfileId,
          text: textToInsert,
        })
        .select(`
          id,
          text,
          created_at,
          user_id,
          profile:profiles!comments_user_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      if (data) {
        setComments((prev) => [...prev, data as any]);
      }
      setNewComment('');
      if (onCommentAdded) onCommentAdded();
    } catch (err) {
      console.error('Error posting comment:', err);
      alert('Could not post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg/70 backdrop-blur-sm animate-fade-in">
      {/* Backdrop click to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Container (Centered) */}
      <div className="relative z-10 bg-bg-raised border border-border-d rounded-2xl max-h-[85vh] h-[600px] flex flex-col w-full max-w-md mx-auto overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-4 border-b border-border-s flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-text-p font-semibold">
            <MessageCircle className="w-5 h-5 text-text-s" />
            <span>Comments ({comments.length})</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-s hover:text-text-p bg-bg-sunken hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-text-t" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-text-t text-sm">
              No comments yet. Be the first to drop your take!
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3 group">
                <Link href={`/profile/${comment.profile?.username || ''}`}>
                  <img
                    src={comment.profile?.avatar_url || '/default-avatar.png'}
                    alt={comment.profile?.username || 'User'}
                    className="w-8 h-8 rounded-full object-cover border border-border-d"
                  />
                </Link>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/profile/${comment.profile?.username || ''}`}
                      className="text-xs font-semibold text-text-p hover:underline"
                    >
                      {comment.profile?.display_name || `@${comment.profile?.username}`}
                    </Link>

                    {comment.user_id === currentProfileId && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-text-m hover:text-red-400 opacity-0 group-hover:opacity-100 transition p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-text-s mt-0.5 break-words">
                    {comment.text}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleAddComment}
          className="p-3 border-t border-border-s bg-bg flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            disabled={submitting || !currentProfileId}
            className="flex-1 bg-bg-sunken border border-border-d rounded-xl px-3 py-2 text-sm text-text-p placeholder:text-text-t focus:outline-none focus:border-zinc-700"
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting || !currentProfileId}
            className="p-2 rounded-xl bg-btn text-btn-text hover:bg-btn/80 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>

      </div>
    </div>
  );
}