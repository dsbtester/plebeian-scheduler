import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPosts, savePosts, upsertPost, deletePost,
  getPostsByStatus, getDueScheduledPosts,
  loadQueues, saveQueues, addQueue, removeQueue,
  getStats,
} from './schedulerStore';
import { createNewPost } from './types';
import type { SchedulerPost } from './types';

// Clear localStorage before each test
beforeEach(() => {
  localStorage.removeItem('plebeian-scheduler:posts');
  localStorage.removeItem('plebeian-scheduler:queues');
});

describe('schedulerStore — posts', () => {
  it('loadPosts returns empty array initially', () => {
    expect(loadPosts()).toEqual([]);
  });

  it('savePosts + loadPosts round-trips correctly', () => {
    const post = createNewPost('listing', 'pubkey123');
    post.listingFields!.title = 'Test Listing';
    savePosts([post]);

    const loaded = loadPosts();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe(post.id);
    expect(loaded[0].listingFields?.title).toBe('Test Listing');
  });

  it('upsertPost inserts a new post', () => {
    const post = createNewPost('note', 'pubkey123');
    post.content = 'Hello';

    const result = upsertPost(post);
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('Hello');
  });

  it('upsertPost updates an existing post by id', () => {
    const post = createNewPost('note', 'pubkey123');
    post.content = 'Original';
    upsertPost(post);

    post.content = 'Updated';
    const result = upsertPost(post);
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('Updated');
  });

  it('deletePost removes by id', () => {
    const post1 = createNewPost('note', 'pk');
    const post2 = createNewPost('listing', 'pk');
    savePosts([post1, post2]);

    const result = deletePost(post1.id);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(post2.id);
  });

  it('getPostsByStatus filters correctly', () => {
    const draft = createNewPost('note', 'pk');
    draft.status = 'draft';

    const scheduled: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'scheduled',
      scheduledAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const published: SchedulerPost = {
      ...createNewPost('note', 'pk'),
      status: 'published',
      publishedAt: Math.floor(Date.now() / 1000),
      publishedEventId: 'event123',
    };

    savePosts([draft, scheduled, published]);

    expect(getPostsByStatus('draft').length).toBe(1);
    expect(getPostsByStatus('scheduled').length).toBe(1);
    expect(getPostsByStatus('published').length).toBe(1);
    expect(getPostsByStatus('failed').length).toBe(0);
  });
});

describe('schedulerStore — getDueScheduledPosts (scheduler core)', () => {
  it('returns posts whose scheduledAt <= now', () => {
    const now = Math.floor(Date.now() / 1000);

    // Due 5 minutes ago
    const duePost: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'scheduled',
      scheduledAt: now - 300,
    };

    // Due in 1 hour (not yet)
    const futurePost: SchedulerPost = {
      ...createNewPost('note', 'pk'),
      status: 'scheduled',
      scheduledAt: now + 3600,
    };

    // Draft (not scheduled — should not be included)
    const draftPost = createNewPost('note', 'pk');

    savePosts([duePost, futurePost, draftPost]);

    const due = getDueScheduledPosts();
    expect(due.length).toBe(1);
    expect(due[0].id).toBe(duePost.id);
  });

  it('returns empty when no posts are due', () => {
    const futurePost: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'scheduled',
      scheduledAt: Math.floor(Date.now() / 1000) + 86400,
    };
    savePosts([futurePost]);

    expect(getDueScheduledPosts().length).toBe(0);
  });

  it('does not include already-published posts', () => {
    const now = Math.floor(Date.now() / 1000);
    const publishedPost: SchedulerPost = {
      ...createNewPost('listing', 'pk'),
      status: 'published',
      scheduledAt: now - 600,
      publishedAt: now - 300,
      publishedEventId: 'evt123',
    };
    savePosts([publishedPost]);

    expect(getDueScheduledPosts().length).toBe(0);
  });
});

describe('schedulerStore — queues', () => {
  it('loadQueues returns empty array initially', () => {
    expect(loadQueues()).toEqual([]);
  });

  it('addQueue adds a queue', () => {
    const result = addQueue({ name: 'Weekly', description: 'Weekly posts', createdAt: 1000 });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Weekly');
  });

  it('removeQueue removes by name', () => {
    addQueue({ name: 'A', description: '', createdAt: 1000 });
    addQueue({ name: 'B', description: '', createdAt: 1001 });

    const result = removeQueue('A');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('B');
  });
});

describe('schedulerStore — getStats', () => {
  it('counts posts by status', () => {
    const posts: SchedulerPost[] = [
      { ...createNewPost('note', 'pk'), status: 'draft' },
      { ...createNewPost('note', 'pk'), status: 'draft' },
      { ...createNewPost('listing', 'pk'), status: 'scheduled', scheduledAt: 999999999 },
      { ...createNewPost('note', 'pk'), status: 'published', publishedAt: 100, publishedEventId: 'x' },
      { ...createNewPost('note', 'pk'), status: 'failed', errorMessage: 'oops' },
    ];
    savePosts(posts);

    const stats = getStats();
    expect(stats.drafts).toBe(2);
    expect(stats.scheduled).toBe(1);
    expect(stats.queued).toBe(0);
    expect(stats.published).toBe(1);
    expect(stats.failed).toBe(1);
  });
});
