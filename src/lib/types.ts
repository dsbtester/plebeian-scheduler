/** The base URL for Plebeian Market listing pages */
export const PLEBEIAN_MARKET_URL = 'https://plebeian.market';

/** Status of a scheduled item in the pipeline */
export type PostStatus = 'draft' | 'queued' | 'scheduled' | 'published' | 'failed';

/** The type of post being composed */
export type PostType = 'short' | 'long' | 'promo';

/** An uploaded image with metadata for NIP-92 imeta tags */
export interface UploadedImage {
  url: string;
  mimeType?: string;
  dimensions?: string;
  sha256?: string;
  blurhash?: string;
  alt?: string;
  size?: number;
}

/**
 * Source listing info — metadata imported from a NIP-99 listing
 * that's used as context/source material for crafting the promo note.
 * This is never published; it's just local reference data.
 */
export interface ImportedListing {
  /** The naddr or event coordinate of the original listing */
  naddr?: string;
  /** Direct web URL to the listing on Plebeian Market (for buyers to click) */
  marketplaceUrl?: string;
  /** Original listing title */
  title: string;
  /** Original listing summary */
  summary: string;
  /** Price amount */
  price: string;
  /** Currency code */
  currency: string;
  /** Location from the listing */
  location: string;
  /** Categories/tags from the listing */
  categories: string[];
  /** Images from the listing */
  images: UploadedImage[];
  /** The author pubkey of the listing */
  authorPubkey?: string;
}

/** A draft/scheduled/queued post in the system */
export interface SchedulerPost {
  /** Unique local ID (UUID) */
  id: string;
  /** Current status in the pipeline */
  status: PostStatus;
  /** Post type: short note (kind 1), long-form article (kind 30023), or promo note (kind 1 + listing) */
  postType: PostType;
  /** The note/article content */
  content: string;
  /** Article title (for long-form posts, kind 30023) */
  title: string;
  /** Article summary (for long-form posts) */
  summary: string;
  /** Article header image URL (for long-form posts) */
  headerImage: string;
  /** Article slug / d-tag identifier (for long-form posts) */
  slug: string;
  /** Article hashtags (for long-form posts) */
  hashtags: string[];
  /** Which npub (hex) this should be published as */
  authorPubkey: string;
  /** Scheduled publish time (unix timestamp in seconds), null if draft */
  scheduledAt: number | null;
  /** When this was created locally */
  createdAt: number;
  /** When this was last modified locally */
  updatedAt: number;
  /** When this was actually published (if published) */
  publishedAt: number | null;
  /** The published event ID (if published) */
  publishedEventId: string | null;
  /** Attached media for NIP-92 imeta tags */
  media: UploadedImage[];
  /** Queue name this belongs to (optional) */
  queueName: string;
  /** Position in queue for ordering */
  queuePosition: number;
  /** NIP-40 expiration timestamp (optional) */
  expiresAt: number | null;
  /** Whether to use DVM (NIP-90) for publishing */
  useDvm: boolean;
  /** DVM-specific: relay URLs where the DVM should publish */
  dvmRelays: string[];
  /** Error message if publishing failed */
  errorMessage: string | null;
  /** Server-side event ID (when scheduled via the backend) */
  serverEventId: string | null;
  /** Recurring schedule interval in seconds (0 = not recurring) */
  recurringInterval: number;
  /** How many times this recurring post has been published */
  recurringCount: number;
  /** Maximum recurrences (0 = infinite) */
  recurringLimit: number;
  /** Source listing data (if this promo note was crafted from a NIP-99 listing) */
  importedListing?: ImportedListing;
}

/** Queue grouping */
export interface Queue {
  name: string;
  description: string;
  createdAt: number;
}

/** Reusable content template */
export interface PostTemplate {
  id: string;
  name: string;
  content: string;
  postType: PostType;
  createdAt: number;
}

/** Create a new empty post */
export function createNewPost(authorPubkey: string, postType: PostType = 'short'): SchedulerPost {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: crypto.randomUUID(),
    status: 'draft',
    postType,
    content: '',
    title: '',
    summary: '',
    headerImage: '',
    slug: '',
    hashtags: [],
    authorPubkey,
    scheduledAt: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    publishedEventId: null,
    media: [],
    queueName: '',
    queuePosition: 0,
    expiresAt: null,
    useDvm: false,
    dvmRelays: [],
    errorMessage: null,
    serverEventId: null,
    recurringInterval: 0,
    recurringCount: 0,
    recurringLimit: 0,
  };
}
