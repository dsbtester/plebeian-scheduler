import { useState, useCallback, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import type { NostrEvent } from '@nostrify/nostrify';

interface DvmGenerateOptions {
  /** The prompt text to send */
  prompt: string;
  /** Optional specific DVM provider pubkey to target */
  dvmPubkey?: string;
  /** Timeout in ms to wait for a result (default: 60000) */
  timeout?: number;
}

interface DvmGenerateResult {
  content: string;
  event: NostrEvent;
}

/**
 * Hook for generating text via NIP-90 DVM (kind 5050 - Text Generation).
 * Publishes a job request and subscribes for the result.
 */
export function useDvmGenerate() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (options: DvmGenerateOptions): Promise<DvmGenerateResult | null> => {
    if (!user) {
      setError('You must be logged in');
      return null;
    }

    // Cancel any previous request
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setIsGenerating(true);
    setError(null);

    try {
      const timeout = options.timeout ?? 60_000;

      // Build the kind 5050 job request
      const tags: string[][] = [
        ['i', options.prompt, 'text'],
        ['output', 'text/plain'],
        ['param', 'max_tokens', '1024'],
        ['param', 'temperature', '0.7'],
        ['alt', 'NIP-90 Text Generation request'],
      ];

      // Target a specific DVM if provided
      if (options.dvmPubkey) {
        tags.push(['p', options.dvmPubkey]);
      }

      // Sign and publish the job request
      const jobRequest = await user.signer.signEvent({
        kind: 5050,
        content: '',
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(jobRequest, { signal: abort.signal });
      console.log('[DVM] Published job request:', jobRequest.id);

      // Now subscribe for the result (kind 6050) referencing our job
      const result = await new Promise<DvmGenerateResult | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('DVM request timed out. No service provider responded.'));
        }, timeout);

        // Poll for results
        const pollInterval = setInterval(async () => {
          if (abort.signal.aborted) {
            clearInterval(pollInterval);
            clearTimeout(timer);
            resolve(null);
            return;
          }

          try {
            // Check for job results (kind 6050)
            const results = await nostr.query([{
              kinds: [6050],
              '#e': [jobRequest.id],
              limit: 1,
            }], { signal: abort.signal });

            if (results.length > 0) {
              clearInterval(pollInterval);
              clearTimeout(timer);
              const resultEvent = results[0];
              resolve({
                content: resultEvent.content,
                event: resultEvent,
              });
              return;
            }

            // Also check for job feedback (kind 7000) for errors
            const feedback = await nostr.query([{
              kinds: [7000],
              '#e': [jobRequest.id],
              limit: 5,
            }], { signal: abort.signal });

            for (const fb of feedback) {
              const statusTag = fb.tags.find(([n]) => n === 'status');
              if (statusTag) {
                const [, status, info] = statusTag;
                if (status === 'error') {
                  clearInterval(pollInterval);
                  clearTimeout(timer);
                  reject(new Error(info || 'DVM returned an error'));
                  return;
                }
                if (status === 'success' && fb.content) {
                  clearInterval(pollInterval);
                  clearTimeout(timer);
                  resolve({ content: fb.content, event: fb });
                  return;
                }
              }
            }
          } catch {
            // Ignore poll errors, keep trying
          }
        }, 3000); // Poll every 3 seconds

        abort.signal.addEventListener('abort', () => {
          clearInterval(pollInterval);
          clearTimeout(timer);
          resolve(null);
        });
      });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [user, nostr]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  return { generate, cancel, isGenerating, error };
}
