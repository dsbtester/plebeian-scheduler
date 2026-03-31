/**
 * Client for the Netlify scheduler function API.
 *
 * When deployed, the function is at /.netlify/functions/scheduler
 * During development, we detect the base URL from the current origin.
 */

interface ScheduleRequest {
  signedEvent: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
  publishAt: number;
  relays?: string[];
}

interface ScheduleResponse {
  ok: boolean;
  id: string;
  publishAt: number;
  status: string;
}

interface StatusResponse {
  id: string;
  status: 'pending' | 'published' | 'failed';
  publishAt: number;
  publishedAt: number | null;
  results: { relay: string; ok: boolean; message?: string; error?: string }[] | null;
}

function getApiUrl(): string {
  // In production (Netlify), the function is at the same origin
  // In dev, we use the deployed site URL if available
  return '/.netlify/functions/scheduler';
}

/**
 * Schedule a pre-signed event for future publishing.
 * The server stores it and publishes to relays at the specified time.
 */
export async function scheduleEvent(request: ScheduleRequest): Promise<ScheduleResponse> {
  const url = getApiUrl();

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check the status of a scheduled event.
 */
export async function checkEventStatus(eventId: string): Promise<StatusResponse> {
  const url = `${getApiUrl()}?id=${encodeURIComponent(eventId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Cancel a scheduled event that hasn't been published yet.
 */
export async function cancelScheduledEvent(eventId: string): Promise<{ ok: boolean }> {
  const url = `${getApiUrl()}?id=${encodeURIComponent(eventId)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if the scheduler API is available (deployed on Netlify).
 */
export async function isSchedulerApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl(), {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}
