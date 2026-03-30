import { useEffect, useRef, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useToast } from '@/hooks/useToast';
import { buildEvent, buildDvmPublishRequest } from '@/lib/eventBuilder';
import type { SchedulerPost } from '@/lib/types';

const POLL_INTERVAL = 10_000; // Check every 10 seconds

/**
 * Hook that handles scheduled post publishing via two methods:
 *
 * 1. **DVM (NIP-90, kind 5905)**: For posts marked useDvm=true, a DVM job
 *    request is published immediately at schedule time. The DVM service
 *    provider will publish the actual event. This works even if the
 *    browser is closed — the DVM holds the job.
 *
 * 2. **Direct publish**: For posts with useDvm=false, the browser polls
 *    every 10 seconds and publishes due posts directly. This requires
 *    the tab to remain open.
 *
 * When scheduling, posts with useDvm=true get their DVM job request
 * published right away (with a publish_at param), so the DVM can
 * handle it independently of the browser being open.
 */
export function useSchedulerPublish() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { posts, markPublished, markFailed } = useScheduler();
  const { toast } = useToast();
  const publishingRef = useRef(new Set<string>());

  const getLabel = (post: SchedulerPost) => {
    if (post.kind === 'listing') return post.listingFields?.title || 'Untitled Listing';
    if (post.kind === 'article') return post.articleFields?.title || 'Untitled Article';
    return post.content.slice(0, 40) || 'Note';
  };

  // Direct publish — signs and publishes the event right now
  const publishDirect = useCallback(async (post: SchedulerPost) => {
    if (!user || publishingRef.current.has(post.id)) return;
    publishingRef.current.add(post.id);

    const label = getLabel(post);
    console.log(`[Scheduler] Direct publishing "${label}" (post ${post.id})...`);

    try {
      const eventData = buildEvent(post, false);
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

  // DVM publish — sends a kind 5905 job request for delegated publishing
  const publishViaDvm = useCallback(async (post: SchedulerPost) => {
    if (!user || publishingRef.current.has(post.id)) return;
    publishingRef.current.add(post.id);

    const label = getLabel(post);
    console.log(`[Scheduler] Submitting DVM job for "${label}" (post ${post.id})...`);

    try {
      const eventData = buildEvent(post, false);
      const dvmRequest = buildDvmPublishRequest(post, JSON.stringify(eventData));

      const signedDvmRequest = await user.signer.signEvent({
        kind: dvmRequest.kind,
        content: dvmRequest.content,
        tags: dvmRequest.tags,
        created_at: dvmRequest.created_at,
      });

      await nostr.event(signedDvmRequest, { signal: AbortSignal.timeout(15000) });
      markPublished(post.id, signedDvmRequest.id);

      console.log(`[Scheduler] DVM job submitted! Request ID: ${signedDvmRequest.id}`);
      toast({
        title: `DVM job submitted: ${label}`,
        description: `Publish job sent to DVM network. The service provider will publish at the scheduled time.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      markFailed(post.id, msg);
      console.error(`[Scheduler] DVM submission failed for "${label}":`, error);
      toast({
        title: `DVM failed: ${label}`,
        description: msg,
        variant: 'destructive',
      });
    } finally {
      publishingRef.current.delete(post.id);
    }
  }, [user, nostr, markPublished, markFailed, toast]);

  // Poll for due posts
  useEffect(() => {
    if (!user) return;

    const checkDuePosts = () => {
      const now = Math.floor(Date.now() / 1000);

      // Direct publish — due posts without DVM
      const directDue = posts.filter(
        p => p.status === 'scheduled' &&
          p.scheduledAt !== null &&
          p.scheduledAt <= now &&
          !p.useDvm
      );

      if (directDue.length > 0) {
        console.log(`[Scheduler] Found ${directDue.length} due post(s) for direct publish...`);
      }

      for (const post of directDue) {
        publishDirect(post);
      }
    };

    // Check immediately on mount and whenever posts change
    checkDuePosts();

    // Then poll on interval
    const interval = setInterval(checkDuePosts, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user, posts, publishDirect]);

  // DVM posts — submit job requests immediately when they become scheduled
  // (so the DVM can handle publishing at the right time, even if browser closes)
  useEffect(() => {
    if (!user) return;

    const dvmPending = posts.filter(
      p => p.status === 'scheduled' &&
        p.scheduledAt !== null &&
        p.useDvm
    );

    for (const post of dvmPending) {
      publishViaDvm(post);
    }
  }, [user, posts, publishViaDvm]);
}
