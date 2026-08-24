'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flame, SkipForward, UserPlus, Loader2, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { firebaseAuth as auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { syncProfile } from '@/lib/syncProfile';
import BottomNav from '@/components/BottomNav';

interface ActivityItem {
  id: string;
  type: 'follow' | 'drip' | 'skip';
  createdAt: string;
  actor: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  postId?: string;
  postText?: string;
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push('/');
        return;
      }

      try {
        const currentProfile = await syncProfile(firebaseUser);
        if (!currentProfile) throw new Error('Profile sync failed');

        const profileId = currentProfile.id;

        // 1. Fetch Follows targeting current user
        const { data: followsData, error: followsErr } = await supabase
          .from('follows')
          .select('id, follower_id, created_at')
          .eq('following_id', profileId);

        if (followsErr) console.error('Follows fetch error:', followsErr);

        // 2. Fetch User's Posts
        const { data: myPosts, error: postsErr } = await supabase
          .from('posts')
          .select('id, text')
          .eq('user_id', profileId);

        if (postsErr) console.error('Posts fetch error:', postsErr);

        let votesData: any[] = [];
        const postMap = new Map((myPosts || []).map((p) => [p.id, p.text]));

        if (myPosts && myPosts.length > 0) {
          const postIds = myPosts.map((p) => p.id);

          // Fetch Votes on user's posts
          const { data: vData, error: votesErr } = await supabase
            .from('votes')
            .select('id, user_id, fit_id, vote, created_at')
            .in('fit_id', postIds)
            .neq('user_id', profileId);

          if (votesErr) console.error('Votes fetch error:', votesErr);
          if (vData) votesData = vData;
        }

        // 3. Collect all user IDs that acted on current user
        const actorIds = Array.from(
          new Set([
            ...(followsData || []).map((f) => f.follower_id),
            ...votesData.map((v) => v.user_id),
          ])
        );

        // 4. Fetch actor profiles in bulk
        let profileMap = new Map<string, any>();
        if (actorIds.length > 0) {
          const { data: actorProfiles, error: profilesErr } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', actorIds);

          if (profilesErr) console.error('Profiles fetch error:', profilesErr);

          if (actorProfiles) {
            actorProfiles.forEach((p) => profileMap.set(p.id, p));
          }
        }

        // 5. Construct activity objects
        const followActivities: ActivityItem[] = (followsData || []).map((f) => {
          const actor = profileMap.get(f.follower_id) || {};
          return {
            id: `follow-${f.id}`,
            type: 'follow',
            createdAt: f.created_at,
            actor: {
              username: actor.username || 'someone',
              displayName: actor.display_name || 'Someone',
              avatarUrl: actor.avatar_url,
            },
          };
        });

        const voteActivities: ActivityItem[] = votesData.map((v) => {
          const actor = profileMap.get(v.user_id) || {};
          return {
            id: `vote-${v.id}`,
            type: v.vote?.toLowerCase() === 'drip' ? 'drip' : 'skip',
            createdAt: v.created_at,
            actor: {
              username: actor.username || 'someone',
              displayName: actor.display_name || 'Someone',
              avatarUrl: actor.avatar_url,
            },
            postId: v.fit_id,
            postText: postMap.get(v.fit_id) || '',
          };
        });

        // Combine and sort (newest first)
        const combined = [...followActivities, ...voteActivities].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setActivities(combined);
      } catch (err) {
        console.error('Error fetching activity:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const formatTimeAgo = (dateString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <div className="min-h-screen bg-bg text-text-p pb-32 pt-8 px-4 max-w-xl mx-auto">
      {/* Header Section */}
      <header className="mb-8">
        <div className="flex items-center space-x-2 text-2xl font-bold tracking-tight font-display">
          <Bell className="w-6 h-6 stroke-[2.5]" />
          <span>Activity</span>
        </div>
        <p className="text-neutral-400 text-sm mt-1">
          See recent interactions, votes, and new followers.
        </p>
      </header>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-20 text-neutral-400 border border-neutral-900 bg-neutral-950/40 rounded-2xl">
          <p className="text-base font-medium text-text-p">No activity yet</p>
          <p className="text-sm mt-1 text-neutral-500">
            When people follow you or vote on your posts, you'll see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-4 rounded-2xl bg-neutral-950 border border-neutral-900 hover:border-neutral-800 transition-colors"
            >
              <Link
                href={`/profile/${item.actor.username}`}
                className="flex items-center space-x-3.5 flex-1 min-w-0"
              >
                {/* Avatar with Action Badge */}
                <div className="relative flex-shrink-0">
                  <img
                    src={item.actor.avatarUrl || '/default-avatar.png'}
                    alt={item.actor.username}
                    className="w-12 h-12 rounded-full object-cover bg-neutral-800"
                  />
                  <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-bg border border-neutral-800">
                    {item.type === 'drip' && (
                      <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                    )}
                    {item.type === 'skip' && (
                      <SkipForward className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                    {item.type === 'follow' && (
                      <UserPlus className="w-3.5 h-3.5 text-blue-400" />
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-sm font-semibold text-text-p leading-tight truncate">
                    {item.actor.displayName || item.actor.username}
                  </p>
                  <p className="text-xs text-neutral-400 truncate mt-0.5">
                    {item.type === 'drip' && 'dripped your post 🔥'}
                    {item.type === 'skip' && 'skipped your post ⏭️'}
                    {item.type === 'follow' && 'started following you'}
                  </p>
                  {item.postText && (
                    <p className="text-xs text-neutral-500 truncate mt-1 italic">
                      "{item.postText}"
                    </p>
                  )}
                </div>
              </Link>

              {/* Timestamp Badge */}
              <span className="text-xs font-medium text-neutral-500 whitespace-nowrap pl-2">
                {formatTimeAgo(item.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <BottomNav />
    </div>
  );
}