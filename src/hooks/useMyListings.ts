import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import type { NostrEvent } from '@nostrify/nostrify';

/** Parsed listing data from a NIP-99 kind 30402 event */
export interface ExistingListing {
  event: NostrEvent;
  dTag: string;
  title: string;
  summary: string;
  content: string;
  price: string;
  currency: string;
  priceFrequency: string;
  location: string;
  status: string;
  categories: string[];
  images: { url: string; dimensions?: string }[];
  publishedAt: number | null;
}

function parseListing(event: NostrEvent): ExistingListing | null {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1];
  if (!dTag) return null;

  const title = event.tags.find(([n]) => n === 'title')?.[1] ?? '';
  const summary = event.tags.find(([n]) => n === 'summary')?.[1] ?? '';
  const location = event.tags.find(([n]) => n === 'location')?.[1] ?? '';
  const status = event.tags.find(([n]) => n === 'status')?.[1] ?? 'active';
  const publishedAtStr = event.tags.find(([n]) => n === 'published_at')?.[1];
  const publishedAt = publishedAtStr ? parseInt(publishedAtStr) : null;

  // Parse price tag: ["price", "<amount>", "<currency>", "<frequency>"]
  const priceTag = event.tags.find(([n]) => n === 'price');
  const price = priceTag?.[1] ?? '';
  const currency = priceTag?.[2] ?? 'SAT';
  const priceFrequency = priceTag?.[3] ?? '';

  // Categories from t tags
  const categories = event.tags
    .filter(([n]) => n === 't')
    .map(([, v]) => v);

  // Images from image tags
  const images = event.tags
    .filter(([n]) => n === 'image')
    .map(([, url, dims]) => ({ url, dimensions: dims }));

  // Also check imeta tags for images not in image tags
  const imetaUrls = new Set(images.map(i => i.url));
  for (const tag of event.tags) {
    if (tag[0] !== 'imeta') continue;
    const urlPart = tag.find(p => p.startsWith('url '));
    if (urlPart) {
      const url = urlPart.replace('url ', '');
      if (!imetaUrls.has(url)) {
        const dimPart = tag.find(p => p.startsWith('dim '));
        images.push({ url, dimensions: dimPart?.replace('dim ', '') });
        imetaUrls.add(url);
      }
    }
  }

  return {
    event,
    dTag,
    title,
    summary,
    content: event.content,
    price,
    currency,
    priceFrequency,
    location,
    status,
    categories,
    images,
    publishedAt,
  };
}

/**
 * Fetches the current user's existing NIP-99 classified listings
 * (kind 30402) from Nostr relays.
 */
export function useMyListings() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['my-listings', user?.pubkey],
    queryFn: async () => {
      if (!user) return [];

      const events = await nostr.query([{
        kinds: [30402],
        authors: [user.pubkey],
        limit: 50,
      }]);

      const listings: ExistingListing[] = [];
      for (const event of events) {
        const parsed = parseListing(event);
        if (parsed) listings.push(parsed);
      }

      // Sort by most recent first
      listings.sort((a, b) => b.event.created_at - a.event.created_at);
      return listings;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetches the current user's existing NIP-23 articles
 * (kind 30023) from Nostr relays.
 */
export function useMyArticles() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['my-articles', user?.pubkey],
    queryFn: async () => {
      if (!user) return [];

      const events = await nostr.query([{
        kinds: [30023],
        authors: [user.pubkey],
        limit: 50,
      }]);

      return events
        .filter(e => e.tags.some(([n]) => n === 'd'))
        .sort((a, b) => b.created_at - a.created_at)
        .map(event => ({
          event,
          dTag: event.tags.find(([n]) => n === 'd')![1],
          title: event.tags.find(([n]) => n === 'title')?.[1] ?? '',
          summary: event.tags.find(([n]) => n === 'summary')?.[1] ?? '',
          image: event.tags.find(([n]) => n === 'image')?.[1] ?? '',
          content: event.content,
          categories: event.tags.filter(([n]) => n === 't').map(([, v]) => v),
        }));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
