import { describe, it, expect } from 'vitest';
import { createNewPost } from './types';
import { buildEvent } from './eventBuilder';
import type { SchedulerPost } from './types';

/**
 * These tests simulate the core filtering logic from useSchedulerPublish:
 *
 *   posts.filter(p =>
 *     p.status === 'scheduled' &&
 *     p.scheduledAt !== null &&
 *     p.scheduledAt <= now &&
 *     !p.useDvm
 *   )
 *
 * This is the exact code path that determines which posts get auto-published
 * when the user has the app open. We test it as a pure function here.
 */
function getDuePosts(posts: SchedulerPost[], now: number): SchedulerPost[] {
  return posts.filter(
    p => p.status === 'scheduled' &&
      p.scheduledAt !== null &&
      p.scheduledAt <= now &&
      !p.useDvm
  );
}

describe('Scheduler publish — due post detection', () => {
  const now = 1743264000; // Fixed timestamp for deterministic tests

  it('finds a post scheduled in the past', () => {
    const post: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'scheduled',
      scheduledAt: now - 60, // 1 minute ago
    };
    post.listingFields!.title = 'Past Due Listing';

    const due = getDuePosts([post], now);
    expect(due.length).toBe(1);
    expect(due[0].listingFields?.title).toBe('Past Due Listing');
  });

  it('finds a post scheduled at exactly now', () => {
    const post: SchedulerPost = {
      ...createNewPost('note', 'pk'),
      status: 'scheduled',
      scheduledAt: now,
    };
    const due = getDuePosts([post], now);
    expect(due.length).toBe(1);
  });

  it('skips a post scheduled in the future', () => {
    const post: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'scheduled',
      scheduledAt: now + 3600,
    };
    const due = getDuePosts([post], now);
    expect(due.length).toBe(0);
  });

  it('skips draft posts even if scheduledAt is in the past', () => {
    const post: SchedulerPost = {
      ...createNewPost('note', 'pk'),
      status: 'draft',
      scheduledAt: now - 600,
    };
    const due = getDuePosts([post], now);
    expect(due.length).toBe(0);
  });

  it('skips published posts', () => {
    const post: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'published',
      scheduledAt: now - 600,
      publishedAt: now - 300,
      publishedEventId: 'evt123',
    };
    const due = getDuePosts([post], now);
    expect(due.length).toBe(0);
  });

  it('skips DVM-delegated posts (useDvm = true)', () => {
    const post: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'scheduled',
      scheduledAt: now - 60,
      useDvm: true,
      dvmRelays: ['wss://relay.damus.io'],
    };
    const due = getDuePosts([post], now);
    expect(due.length).toBe(0);
  });

  it('handles mixed batch: returns only due non-DVM scheduled posts', () => {
    const posts: SchedulerPost[] = [
      // Should be published: due, scheduled, not DVM
      { ...createNewPost('listing', 'pk'), status: 'scheduled', scheduledAt: now - 120 },
      // Should be published: due, scheduled, not DVM
      { ...createNewPost('note', 'pk'), status: 'scheduled', scheduledAt: now },
      // Should NOT: future
      { ...createNewPost('listing', 'pk'), status: 'scheduled', scheduledAt: now + 600 },
      // Should NOT: DVM
      { ...createNewPost('article', 'pk'), status: 'scheduled', scheduledAt: now - 60, useDvm: true, dvmRelays: [] },
      // Should NOT: draft
      { ...createNewPost('note', 'pk'), status: 'draft', scheduledAt: null },
      // Should NOT: already published
      { ...createNewPost('listing', 'pk'), status: 'published', scheduledAt: now - 300, publishedAt: now - 200, publishedEventId: 'x' },
    ];

    const due = getDuePosts(posts, now);
    expect(due.length).toBe(2);
    expect(due.every(p => p.status === 'scheduled')).toBe(true);
    expect(due.every(p => !p.useDvm)).toBe(true);
    expect(due.every(p => p.scheduledAt !== null && p.scheduledAt <= now)).toBe(true);
  });
});

describe('Scheduler publish — event output for scheduled listing', () => {
  it('builds a correct NIP-99 event for a scheduled listing that is due', () => {
    const scheduledTs = 1743264000;
    const post: SchedulerPost = {
      ...createNewPost('listing', 'merchant-pubkey-hex'),
      status: 'scheduled',
      scheduledAt: scheduledTs,
      dTag: 'handmade-soap-001',
      content: 'Organic handmade soap. All natural ingredients.\n\nBitcoin accepted.',
    };
    post.listingFields = {
      title: 'Organic Handmade Soap',
      summary: 'All-natural soap, Bitcoin only',
      price: '5000',
      currency: 'SAT',
      priceFrequency: '',
      location: 'Portland, OR',
      status: 'active',
      categories: ['soap', 'handmade', 'organic'],
      images: [
        { url: 'https://example.com/soap.jpg', mimeType: 'image/jpeg', dimensions: '800x600' },
      ],
      shippingInfo: '',
    };

    const event = buildEvent(post);

    // Verify the full event structure matches NIP-99 spec
    expect(event.kind).toBe(30402);
    expect(event.created_at).toBe(scheduledTs);
    expect(event.content).toContain('Organic handmade soap');

    // Verify all NIP-99 tags are present
    const tagMap = new Map<string, string[][]>();
    for (const tag of event.tags) {
      if (!tagMap.has(tag[0])) tagMap.set(tag[0], []);
      tagMap.get(tag[0])!.push(tag);
    }

    expect(tagMap.get('d')![0]).toEqual(['d', 'handmade-soap-001']);
    expect(tagMap.get('title')![0]).toEqual(['title', 'Organic Handmade Soap']);
    expect(tagMap.get('summary')![0]).toEqual(['summary', 'All-natural soap, Bitcoin only']);
    expect(tagMap.get('price')![0]).toEqual(['price', '5000', 'SAT']);
    expect(tagMap.get('location')![0]).toEqual(['location', 'Portland, OR']);
    expect(tagMap.get('status')![0]).toEqual(['status', 'active']);
    expect(tagMap.get('published_at')![0]).toEqual(['published_at', String(scheduledTs)]);
    expect(tagMap.get('t')!.length).toBe(3);
    expect(tagMap.get('image')!.length).toBe(1);
    expect(tagMap.get('imeta')!.length).toBe(1);
  });
});
