import type { SchedulerPost, Queue, PostStatus } from './types';

const POSTS_KEY = 'plebeian-scheduler:posts';
const QUEUES_KEY = 'plebeian-scheduler:queues';

/** Migrate an older post format to the current schema by filling in defaults */
function migratePost(raw: Record<string, unknown>): SchedulerPost {
  return {
    postType: (raw.postType as SchedulerPost['postType']) ?? (raw.importedListing ? 'promo' : 'short'),
    title: (raw.title as string) ?? '',
    summary: (raw.summary as string) ?? '',
    headerImage: (raw.headerImage as string) ?? '',
    slug: (raw.slug as string) ?? '',
    hashtags: (raw.hashtags as string[]) ?? [],
    serverEventId: (raw.serverEventId as string | null) ?? null,
    recurringInterval: (raw.recurringInterval as number) ?? 0,
    recurringCount: (raw.recurringCount as number) ?? 0,
    recurringLimit: (raw.recurringLimit as number) ?? 0,
    ...raw,
  } as SchedulerPost;
}

/** Read all posts from localStorage */
export function loadPosts(): SchedulerPost[] {
  try {
    const data = localStorage.getItem(POSTS_KEY);
    if (!data) return [];
    const raw: Record<string, unknown>[] = JSON.parse(data);
    return raw.map(migratePost);
  } catch {
    console.warn('Failed to load posts from localStorage');
    return [];
  }
}

/** Save all posts to localStorage */
export function savePosts(posts: SchedulerPost[]): void {
  try {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  } catch (error) {
    console.error('Failed to save posts to localStorage:', error);
  }
}

/** Add or update a single post */
export function upsertPost(post: SchedulerPost): SchedulerPost[] {
  const posts = loadPosts();
  const idx = posts.findIndex(p => p.id === post.id);
  const updated = { ...post, updatedAt: Math.floor(Date.now() / 1000) };
  if (idx >= 0) {
    posts[idx] = updated;
  } else {
    posts.push(updated);
  }
  savePosts(posts);
  return posts;
}

/** Delete a post by ID */
export function deletePost(id: string): SchedulerPost[] {
  const posts = loadPosts().filter(p => p.id !== id);
  savePosts(posts);
  return posts;
}

/** Get posts filtered by status */
export function getPostsByStatus(status: PostStatus): SchedulerPost[] {
  return loadPosts().filter(p => p.status === status);
}

/** Get posts for a specific author */
export function getPostsByAuthor(pubkey: string): SchedulerPost[] {
  return loadPosts().filter(p => p.authorPubkey === pubkey);
}

/** Get posts in a specific queue */
export function getPostsByQueue(queueName: string): SchedulerPost[] {
  return loadPosts()
    .filter(p => p.queueName === queueName)
    .sort((a, b) => a.queuePosition - b.queuePosition);
}

/** Get all due scheduled posts (scheduledAt <= now) */
export function getDueScheduledPosts(): SchedulerPost[] {
  const now = Math.floor(Date.now() / 1000);
  return loadPosts().filter(
    p => p.status === 'scheduled' && p.scheduledAt !== null && p.scheduledAt <= now
  );
}

/** Read all queues from localStorage */
export function loadQueues(): Queue[] {
  try {
    const data = localStorage.getItem(QUEUES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    console.warn('Failed to load queues from localStorage');
    return [];
  }
}

/** Save all queues to localStorage */
export function saveQueues(queues: Queue[]): void {
  try {
    localStorage.setItem(QUEUES_KEY, JSON.stringify(queues));
  } catch (error) {
    console.error('Failed to save queues to localStorage:', error);
  }
}

/** Add a new queue */
export function addQueue(queue: Queue): Queue[] {
  const queues = loadQueues();
  queues.push(queue);
  saveQueues(queues);
  return queues;
}

/** Remove a queue by name */
export function removeQueue(name: string): Queue[] {
  const queues = loadQueues().filter(q => q.name !== name);
  saveQueues(queues);
  return queues;
}

/** Get scheduler stats */
export function getStats(pubkey?: string): {
  drafts: number;
  scheduled: number;
  queued: number;
  published: number;
  failed: number;
} {
  const posts = pubkey ? getPostsByAuthor(pubkey) : loadPosts();
  return {
    drafts: posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    queued: posts.filter(p => p.status === 'queued').length,
    published: posts.filter(p => p.status === 'published').length,
    failed: posts.filter(p => p.status === 'failed').length,
  };
}
