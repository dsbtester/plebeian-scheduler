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

/** Build image tags for NIP-99 listings */
function buildImageTags(images: UploadedImage[]): string[][] {
  return images.map(img => {
    const tag = ['image', img.url];
    if (img.dimensions) tag.push(img.dimensions);
    return tag;
  });
}

/** Build a kind 1 (note) event */
function buildNoteEvent(post: SchedulerPost): UnsignedEvent {
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
    // Always use current time — relays reject future created_at
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** Build a kind 30402 (NIP-99 classified listing) event */
function buildListingEvent(post: SchedulerPost): UnsignedEvent {
  const fields = post.listingFields;
  if (!fields) throw new Error('Listing fields are required for kind 30402');

  const tags: string[][] = [];

  // Required d tag for addressable events
  tags.push(['d', post.dTag]);

  // Standard NIP-99 tags
  if (fields.title) tags.push(['title', fields.title]);
  if (fields.summary) tags.push(['summary', fields.summary]);

  // Published_at timestamp
  const publishedAt = post.publishedAt ?? post.scheduledAt ?? Math.floor(Date.now() / 1000);
  tags.push(['published_at', String(publishedAt)]);

  // Price tag: ["price", "<number>", "<currency>", "<frequency>"]
  if (fields.price) {
    const priceTag = ['price', fields.price, fields.currency];
    if (fields.priceFrequency) {
      priceTag.push(fields.priceFrequency);
    }
    tags.push(priceTag);
  }

  // Location
  if (fields.location) tags.push(['location', fields.location]);

  // Status
  if (fields.status) tags.push(['status', fields.status]);

  // Categories as t tags
  for (const cat of fields.categories) {
    if (cat.trim()) tags.push(['t', cat.trim().toLowerCase()]);
  }

  // Image tags per NIP-99
  tags.push(...buildImageTags(fields.images));

  // Also add imeta tags for NIP-92 compatibility
  for (const img of fields.images) {
    tags.push(buildImetaTag(img));
  }

  // Additional media from the media array
  for (const img of post.media) {
    if (!fields.images.some(li => li.url === img.url)) {
      tags.push(buildImetaTag(img));
    }
  }

  // NIP-40 expiration
  if (post.expiresAt) {
    tags.push(['expiration', String(post.expiresAt)]);
  }

  return {
    kind: 30402,
    content: post.content,
    tags,
    // Always use current time — relays reject future created_at
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** Build a kind 30403 (NIP-99 draft listing) event */
function buildDraftListingEvent(post: SchedulerPost): UnsignedEvent {
  const event = buildListingEvent(post);
  return { ...event, kind: 30403 };
}

/** Build a kind 30023 (NIP-23 long-form article) event */
function buildArticleEvent(post: SchedulerPost): UnsignedEvent {
  const fields = post.articleFields;
  if (!fields) throw new Error('Article fields are required for kind 30023');

  const tags: string[][] = [];

  tags.push(['d', post.dTag]);

  if (fields.title) tags.push(['title', fields.title]);
  if (fields.summary) tags.push(['summary', fields.summary]);
  if (fields.image) tags.push(['image', fields.image]);

  const publishedAt = post.publishedAt ?? post.scheduledAt ?? Math.floor(Date.now() / 1000);
  tags.push(['published_at', String(publishedAt)]);

  for (const cat of fields.categories) {
    if (cat.trim()) tags.push(['t', cat.trim().toLowerCase()]);
  }

  // Media attachments
  for (const img of post.media) {
    tags.push(buildImetaTag(img));
  }

  // NIP-40 expiration
  if (post.expiresAt) {
    tags.push(['expiration', String(post.expiresAt)]);
  }

  return {
    kind: 30023,
    content: post.content,
    tags,
    // Always use current time — relays reject future created_at
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** Build a kind 30024 (NIP-23 draft article) event */
function buildDraftArticleEvent(post: SchedulerPost): UnsignedEvent {
  const event = buildArticleEvent(post);
  return { ...event, kind: 30024 };
}

/** Build the unsigned event for a post based on its kind and status */
export function buildEvent(post: SchedulerPost, asDraft = false): UnsignedEvent {
  switch (post.kind) {
    case 'note':
      return buildNoteEvent(post);
    case 'listing':
      return asDraft ? buildDraftListingEvent(post) : buildListingEvent(post);
    case 'article':
      return asDraft ? buildDraftArticleEvent(post) : buildArticleEvent(post);
    default:
      throw new Error(`Unknown post kind: ${post.kind}`);
  }
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
