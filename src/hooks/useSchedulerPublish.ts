import { useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useToast } from '@/hooks/useToast';
import { buildEvent } from '@/lib/eventBuilder';
import { checkEventStatus } from '@/lib/schedulerApi';
import type { SchedulerPost } from '@/lib/types';

const POLL_INTERVAL = 10_000; // Check every 10 seconds
const SERVER_CHECK_INTERVAL = 60_000; // Check server status every 60 seconds

/**
 * Hook that handles publishing scheduled posts via two methods:
 *
 * 1. **Server-side** (preferred): If the post has a `serverEventId`, the
 *    pre-signed event is stored on the Netlify backend. We periodically
 *    check if the server has published it. No browser tab required.
 *
 * 2. **Client-side fallback**: If the post has no `serverEventId` (server
 *    was unavailable at schedule time), we poll locally and publish when
 *    due. The browser tab must remain open.
 */
export function useSchedulerPublish() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { posts, markPublished, markFailed } = useScheduler();
  const { toast } = useToast();
  const publishingRef = useRef(new Set<string>());

  const getLabel = (post: SchedulerPost) => {
    if (post.importedListing?.title) return post.importedListing.title;
    return post.content.slice(0, 40) || 'Note';
  };

  // Client-side publish — signs and sends the kind 1 event to relays directly
  const publishPost = useCallback(async (post: SchedulerPost) => {
    if (!user || publishingRef.current.has(post.id)) return;
    publishingRef.current.add(post.id);

    const label = getLabel(post);
    console.log(`[Scheduler] Local publishing "${label}" (post ${post.id})...`);

    try {
      const eventData = buildEvent(post);
      const signedEvent = await user.signer.signEvent({
        kind: eventData.kind,
        content: eventData.content,
        tags: eventData.tags,
        created_at: eventData.created_at,
      });

      await nostr.event(signedEvent, { signal: AbortSignal.timeout(15000) });
      markPublished(post.id, signedEvent.id);

      console.log(`[Scheduler] Published! Event ID: ${signedEvent.id}`);
      toast({
        title: `Published: ${label}`,
        description: `Event ${signedEvent.id.slice(0, 12)}... published to relays.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      markFailed(post.id, msg);
      console.error(`[Scheduler] Failed to publish "${label}":`, error);
      toast({
        title: `Failed: ${label}`,
        description: msg,
        variant: 'destructive',
      });
    } finally {
      publishingRef.current.delete(post.id);
    }
  }, [user, nostr, markPublished, markFailed, toast]);

  // Local fallback: poll for due posts that have no serverEventId
  useEffect(() => {
    if (!user) return;

    const checkDuePosts = () => {
      const now = Math.floor(Date.now() / 1000);

      // Only auto-publish posts that are NOT handled by the server
      const duePosts = posts.filter(
        p => p.status === 'scheduled' &&
          p.scheduledAt !== null &&
          p.scheduledAt <= now &&
          !p.serverEventId
      );

      if (duePosts.length > 0) {
        console.log(`[Scheduler] Found ${duePosts.length} local due post(s), publishing...`);
      }

      for (const post of duePosts) {
        publishPost(post);
      }
    };

    checkDuePosts();
    const interval = setInterval(checkDuePosts, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user, posts, publishPost]);

  // Server-side: periodically check if server-scheduled posts have been published
  useEffect(() => {
    if (!user) return;

    const serverScheduledPosts = posts.filter(
      p => p.status === 'scheduled' && p.serverEventId
    );

    if (serverScheduledPosts.length === 0) return;

    const checkServerStatus = async () => {
      for (const post of serverScheduledPosts) {
        if (!post.serverEventId) continue;

        try {
          const status = await checkEventStatus(post.serverEventId);

          if (status.status === 'published') {
            markPublished(post.id, post.serverEventId);
            const label = getLabel(post);
            toast({
              title: `Published: ${label}`,
              description: 'Your scheduled note was published by the server.',
            });
          } else if (status.status === 'failed') {
            markFailed(post.id, 'Server failed to publish to relays');
          }
        } catch {
          // Server not reachable — will check again next interval
          console.log(`[Scheduler] Could not check server status for ${post.serverEventId}`);
        }
      }
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, SERVER_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [user, posts, markPublished, markFailed, toast]);
}
