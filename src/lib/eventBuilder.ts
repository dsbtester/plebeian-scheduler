import type { SchedulerPost, UploadedImage } from './types';

interface UnsignedEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/** Build an imeta tag from an UploadedImage (NIP-92) */
function buildImetaTag(img: UploadedImage): string[] {
  const parts: string[] = ['imeta', `url ${img.url}`];
  if (img.mimeType) parts.push(`m ${img.mimeType}`);
  if (img.dimensions) parts.push(`dim ${img.dimensions}`);
  if (img.sha256) parts.push(`x ${img.sha256}`);
  if (img.blurhash) parts.push(`blurhash ${img.blurhash}`);
  if (img.alt) parts.push(`alt ${img.alt}`);
  return parts;
}

/**
 * Build a kind 1 (note) event — the only event type this scheduler produces.
 *
 * The content is the promotional note text. Media URLs are appended
 * to the content and accompanied by imeta tags (NIP-92).
 */
export function buildEvent(post: SchedulerPost): UnsignedEvent {
  const tags: string[][] = [];

  // Append media URLs to content
  let content = post.content;
  for (const img of post.media) {
    if (!content.includes(img.url)) {
      content += `\n${img.url}`;
    }
    tags.push(buildImetaTag(img));
  }

  // NIP-40 expiration
  if (post.expiresAt) {
    tags.push(['expiration', String(post.expiresAt)]);
  }

  return {
    kind: 1,
    content,
    tags,
    // Always use current time — relays reject future created_at.
    // For server-scheduled posts, this means created_at reflects when the event
    // was signed, not when it was published. This is intentional: the signature
    // covers created_at and cannot be changed after signing.
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** Build a NIP-90 DVM job request for delegated publishing */
export function buildDvmPublishRequest(post: SchedulerPost, eventJson: string): UnsignedEvent {
  const tags: string[][] = [
    ['i', eventJson, 'text'],
    ['output', 'text/plain'],
    ['param', 'action', 'publish'],
  ];

  if (post.scheduledAt) {
    tags.push(['param', 'publish_at', String(post.scheduledAt)]);
  }

  if (post.dvmRelays.length > 0) {
    tags.push(['relays', ...post.dvmRelays]);
  }

  // NIP-31 alt tag for human-readable description
  tags.push(['alt', `DVM job request: publish scheduled Nostr event at ${post.scheduledAt ? new Date(post.scheduledAt * 1000).toISOString() : 'now'}`]);

  return {
    kind: 5905,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
}
