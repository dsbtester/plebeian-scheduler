import { describe, it, expect } from 'vitest';
import { buildEvent, buildDvmPublishRequest } from './eventBuilder';
import { createNewPost } from './types';
import type { SchedulerPost } from './types';

/** Helper: create a fully-populated NIP-99 listing post */
function makeListingPost(overrides: Partial<SchedulerPost> = {}): SchedulerPost {
  const post = createNewPost('listing', 'abc123pubkey');
  post.content = 'Beautiful hand-forged axe. Ships worldwide.';
  post.dTag = 'forged-axe-01';
  post.listingFields = {
    title: 'Hand-Forged Viking Axe',
    summary: 'Authentic carbon steel axe, hand-forged in Iceland.',
    price: '100000',
    currency: 'SAT',
    priceFrequency: '',
    location: 'Reykjavik, Iceland',
    status: 'active',
    categories: ['tools', 'handmade', 'bitcoin'],
    images: [
      {
        url: 'https://example.com/axe.jpg',
        mimeType: 'image/jpeg',
        dimensions: '1200x800',
        sha256: 'abc123hash',
        alt: 'Hand-forged Viking axe',
      },
    ],
    shippingInfo: 'Ships worldwide',
  };
  return { ...post, ...overrides };
}

describe('buildEvent — NIP-99 listing (kind 30402)', () => {
  it('produces kind 30402 with all required NIP-99 tags', () => {
    const post = makeListingPost();
    const event = buildEvent(post);

    expect(event.kind).toBe(30402);
    expect(event.content).toBe('Beautiful hand-forged axe. Ships worldwide.');

    // d tag
    const dTag = event.tags.find(t => t[0] === 'd');
    expect(dTag).toEqual(['d', 'forged-axe-01']);

    // title
    const title = event.tags.find(t => t[0] === 'title');
    expect(title).toEqual(['title', 'Hand-Forged Viking Axe']);

    // summary
    const summary = event.tags.find(t => t[0] === 'summary');
    expect(summary).toEqual(['summary', 'Authentic carbon steel axe, hand-forged in Iceland.']);

    // published_at
    const publishedAt = event.tags.find(t => t[0] === 'published_at');
    expect(publishedAt).toBeDefined();
    expect(Number(publishedAt![1])).toBeGreaterThan(0);

    // price — format: ["price", "100000", "SAT"]
    const price = event.tags.find(t => t[0] === 'price');
    expect(price).toEqual(['price', '100000', 'SAT']);

    // location
    const location = event.tags.find(t => t[0] === 'location');
    expect(location).toEqual(['location', 'Reykjavik, Iceland']);

    // status
    const status = event.tags.find(t => t[0] === 'status');
    expect(status).toEqual(['status', 'active']);
  });

  it('includes t tags for each category (relay-queryable)', () => {
    const post = makeListingPost();
    const event = buildEvent(post);

    const tTags = event.tags.filter(t => t[0] === 't');
    expect(tTags).toEqual([
      ['t', 'tools'],
      ['t', 'handmade'],
      ['t', 'bitcoin'],
    ]);
  });

  it('includes NIP-99 image tags and NIP-92 imeta tags', () => {
    const post = makeListingPost();
    const event = buildEvent(post);

    // NIP-99 image tag
    const imageTags = event.tags.filter(t => t[0] === 'image');
    expect(imageTags.length).toBe(1);
    expect(imageTags[0][1]).toBe('https://example.com/axe.jpg');
    expect(imageTags[0][2]).toBe('1200x800');

    // NIP-92 imeta tag
    const imetaTags = event.tags.filter(t => t[0] === 'imeta');
    expect(imetaTags.length).toBe(1);
    expect(imetaTags[0]).toContain('url https://example.com/axe.jpg');
    expect(imetaTags[0]).toContain('m image/jpeg');
    expect(imetaTags[0]).toContain('dim 1200x800');
    expect(imetaTags[0]).toContain('x abc123hash');
    expect(imetaTags[0]).toContain('alt Hand-forged Viking axe');
  });

  it('includes price frequency when set (recurring)', () => {
    const post = makeListingPost();
    post.listingFields!.price = '15';
    post.listingFields!.currency = 'EUR';
    post.listingFields!.priceFrequency = 'month';

    const event = buildEvent(post);
    const price = event.tags.find(t => t[0] === 'price');
    expect(price).toEqual(['price', '15', 'EUR', 'month']);
  });

  it('uses scheduledAt as created_at for future-dated events', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 3600; // +1 hour
    const post = makeListingPost({ scheduledAt: futureTs });

    const event = buildEvent(post);
    expect(event.created_at).toBe(futureTs);
  });

  it('uses scheduledAt in published_at when set', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 7200;
    const post = makeListingPost({ scheduledAt: futureTs });

    const event = buildEvent(post);
    const publishedAt = event.tags.find(t => t[0] === 'published_at');
    expect(publishedAt).toEqual(['published_at', String(futureTs)]);
  });
});

describe('buildEvent — NIP-99 draft listing (kind 30403)', () => {
  it('produces kind 30403 with same tags when asDraft=true', () => {
    const post = makeListingPost();
    const event = buildEvent(post, true);

    expect(event.kind).toBe(30403);
    // Same tags as 30402
    expect(event.tags.find(t => t[0] === 'd')).toEqual(['d', 'forged-axe-01']);
    expect(event.tags.find(t => t[0] === 'title')).toBeDefined();
  });
});

describe('buildEvent — NIP-40 expiration', () => {
  it('includes expiration tag when expiresAt is set', () => {
    const expiryTs = Math.floor(Date.now() / 1000) + 86400 * 7; // +7 days
    const post = makeListingPost({ expiresAt: expiryTs });

    const event = buildEvent(post);
    const expTag = event.tags.find(t => t[0] === 'expiration');
    expect(expTag).toEqual(['expiration', String(expiryTs)]);
  });

  it('omits expiration tag when expiresAt is null', () => {
    const post = makeListingPost({ expiresAt: null });
    const event = buildEvent(post);

    const expTag = event.tags.find(t => t[0] === 'expiration');
    expect(expTag).toBeUndefined();
  });
});

describe('buildEvent — NIP-23 article (kind 30023)', () => {
  it('produces kind 30023 with article tags', () => {
    const post = createNewPost('article', 'author123');
    post.content = '# My Article\n\nSome content.';
    post.dTag = 'my-article';
    post.articleFields = {
      title: 'My Long-Form Article',
      summary: 'A summary of the article',
      image: 'https://example.com/cover.jpg',
      categories: ['bitcoin', 'philosophy'],
    };

    const event = buildEvent(post);

    expect(event.kind).toBe(30023);
    expect(event.content).toBe('# My Article\n\nSome content.');
    expect(event.tags.find(t => t[0] === 'd')).toEqual(['d', 'my-article']);
    expect(event.tags.find(t => t[0] === 'title')).toEqual(['title', 'My Long-Form Article']);
    expect(event.tags.find(t => t[0] === 'summary')).toEqual(['summary', 'A summary of the article']);
    expect(event.tags.find(t => t[0] === 'image')).toEqual(['image', 'https://example.com/cover.jpg']);

    const tTags = event.tags.filter(t => t[0] === 't');
    expect(tTags).toEqual([['t', 'bitcoin'], ['t', 'philosophy']]);
  });

  it('produces kind 30024 when asDraft=true', () => {
    const post = createNewPost('article', 'author123');
    post.articleFields = { title: 'Draft', summary: '', image: '', categories: [] };

    const event = buildEvent(post, true);
    expect(event.kind).toBe(30024);
  });
});

describe('buildEvent — kind 1 note', () => {
  it('produces kind 1 with content and media imeta', () => {
    const post = createNewPost('note', 'author123');
    post.content = 'Hello Nostr!';
    post.media = [
      { url: 'https://example.com/photo.jpg', mimeType: 'image/jpeg', dimensions: '1024x768' },
    ];

    const event = buildEvent(post);

    expect(event.kind).toBe(1);
    // URL appended to content
    expect(event.content).toContain('https://example.com/photo.jpg');
    // imeta tag
    const imeta = event.tags.find(t => t[0] === 'imeta');
    expect(imeta).toContain('url https://example.com/photo.jpg');
    expect(imeta).toContain('m image/jpeg');
    expect(imeta).toContain('dim 1024x768');
  });

  it('does not duplicate media URL if already in content', () => {
    const post = createNewPost('note', 'author123');
    post.content = 'Check this out https://example.com/photo.jpg';
    post.media = [{ url: 'https://example.com/photo.jpg' }];

    const event = buildEvent(post);
    // Count occurrences of the URL in content
    const matches = event.content.match(/https:\/\/example\.com\/photo\.jpg/g);
    expect(matches?.length).toBe(1); // not duplicated
  });
});

describe('buildDvmPublishRequest — NIP-90 (kind 5905)', () => {
  it('produces kind 5905 with event payload and schedule params', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 3600;
    const post = makeListingPost({
      scheduledAt: futureTs,
      useDvm: true,
      dvmRelays: ['wss://relay.damus.io', 'wss://relay.primal.net'],
    });

    const eventJson = JSON.stringify(buildEvent(post));
    const dvmEvent = buildDvmPublishRequest(post, eventJson);

    expect(dvmEvent.kind).toBe(5905);
    expect(dvmEvent.content).toBe('');

    // Input tag with event JSON
    const iTag = dvmEvent.tags.find(t => t[0] === 'i');
    expect(iTag).toBeDefined();
    expect(iTag![1]).toBe(eventJson);
    expect(iTag![2]).toBe('text');

    // Publish_at param
    const publishAt = dvmEvent.tags.find(t => t[0] === 'param' && t[1] === 'publish_at');
    expect(publishAt).toEqual(['param', 'publish_at', String(futureTs)]);

    // Relay hints
    const relays = dvmEvent.tags.find(t => t[0] === 'relays');
    expect(relays).toEqual(['relays', 'wss://relay.damus.io', 'wss://relay.primal.net']);

    // NIP-31 alt tag
    const alt = dvmEvent.tags.find(t => t[0] === 'alt');
    expect(alt).toBeDefined();
    expect(alt![1]).toContain('DVM job request');

    // Output format
    const output = dvmEvent.tags.find(t => t[0] === 'output');
    expect(output).toEqual(['output', 'text/plain']);
  });

  it('omits publish_at param when not scheduled', () => {
    const post = makeListingPost({ scheduledAt: null, useDvm: true, dvmRelays: [] });
    const dvmEvent = buildDvmPublishRequest(post, '{}');

    const publishAt = dvmEvent.tags.find(t => t[0] === 'param' && t[1] === 'publish_at');
    expect(publishAt).toBeUndefined();
  });
});
