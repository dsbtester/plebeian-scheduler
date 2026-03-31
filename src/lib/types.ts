/** The base URL for Plebeian Market listing pages */
export const PLEBEIAN_MARKET_URL = 'https://plebeian.market';

/** Status of a scheduled item in the pipeline */
export type PostStatus = 'draft' | 'queued' | 'scheduled' | 'published' | 'failed';

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

/** A draft/scheduled/queued promotional note in the system */
export interface SchedulerPost {
  /** Unique local ID (UUID) */
  id: string;
  /** Current status in the pipeline */
  status: PostStatus;
  /** The note content (what gets published as kind 1) */
  content: string;
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
  /** Source listing data (if this promo note was crafted from a NIP-99 listing) */
  importedListing?: ImportedListing;
}

/** Queue grouping */
export interface Queue {
  name: string;
  description: string;
  createdAt: number;
}

/** Create a new empty post (always a kind 1 promo note) */
export function createNewPost(authorPubkey: string): SchedulerPost {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: crypto.randomUUID(),
    status: 'draft',
    content: '',
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
  };
}
