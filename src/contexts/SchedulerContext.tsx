import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { SchedulerPost, Queue, PostKind, PostStatus } from '@/lib/types';
import { createNewPost } from '@/lib/types';
import {
  loadPosts, savePosts,
  loadQueues, saveQueues,
} from '@/lib/schedulerStore';

interface Stats {
  drafts: number;
  scheduled: number;
  queued: number;
  published: number;
  failed: number;
}

interface SchedulerContextValue {
  posts: SchedulerPost[];
  queues: Queue[];
  stats: Stats;
  createPost: (kind: PostKind, authorPubkey: string) => SchedulerPost;
  updatePost: (post: SchedulerPost) => void;
  removePost: (id: string) => void;
  getPost: (id: string) => SchedulerPost | undefined;
  getPostsByStatus: (status: PostStatus) => SchedulerPost[];
  getPostsByQueue: (queueName: string) => SchedulerPost[];
  schedulePost: (id: string, scheduledAt: number) => void;
  markPublished: (id: string, eventId: string) => void;
  markFailed: (id: string, error: string) => void;
  addQueue: (name: string, description: string) => void;
  removeQueue: (name: string) => void;
  reorderQueue: (queueName: string, postIds: string[]) => void;
  refreshPosts: () => void;
}

const SchedulerContext = createContext<SchedulerContextValue | undefined>(undefined);

export function SchedulerProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<SchedulerPost[]>(() => loadPosts());
  const [queues, setQueues] = useState<Queue[]>(() => loadQueues());

  // Compute stats from the reactive state
  const stats = useMemo<Stats>(() => ({
    drafts: posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    queued: posts.filter(p => p.status === 'queued').length,
    published: posts.filter(p => p.status === 'published').length,
    failed: posts.filter(p => p.status === 'failed').length,
  }), [posts]);

  // Sync to localStorage when posts change
  useEffect(() => {
    savePosts(posts);
  }, [posts]);

  useEffect(() => {
    saveQueues(queues);
  }, [queues]);

  const refreshPosts = useCallback(() => {
    setPosts(loadPosts());
    setQueues(loadQueues());
  }, []);

  const createPost = useCallback((kind: PostKind, authorPubkey: string): SchedulerPost => {
    const post = createNewPost(kind, authorPubkey);
    setPosts(prev => [...prev, post]);
    return post;
  }, []);

  const updatePost = useCallback((post: SchedulerPost) => {
    const updated = { ...post, updatedAt: Math.floor(Date.now() / 1000) };
    setPosts(prev => {
      const idx = prev.findIndex(p => p.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
  }, []);

  const removePost = useCallback((id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
  }, []);

  const getPost = useCallback((id: string): SchedulerPost | undefined => {
    return posts.find(p => p.id === id);
  }, [posts]);

  const getPostsByStatusFn = useCallback((status: PostStatus): SchedulerPost[] => {
    return posts.filter(p => p.status === status);
  }, [posts]);

  const getPostsByQueueFn = useCallback((queueName: string): SchedulerPost[] => {
    return posts
      .filter(p => p.queueName === queueName)
      .sort((a, b) => a.queuePosition - b.queuePosition);
  }, [posts]);

  const schedulePost = useCallback((id: string, scheduledAt: number) => {
    setPosts(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, status: 'scheduled' as PostStatus, scheduledAt, updatedAt: Math.floor(Date.now() / 1000) };
      }
      return p;
    }));
  }, []);

  const markPublished = useCallback((id: string, eventId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === id) {
        return {
          ...p,
          status: 'published' as PostStatus,
          publishedAt: Math.floor(Date.now() / 1000),
          publishedEventId: eventId,
          updatedAt: Math.floor(Date.now() / 1000),
          errorMessage: null,
        };
      }
      return p;
    }));
  }, []);

  const markFailed = useCallback((id: string, error: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === id) {
        return {
          ...p,
          status: 'failed' as PostStatus,
          errorMessage: error,
          updatedAt: Math.floor(Date.now() / 1000),
        };
      }
      return p;
    }));
  }, []);

  const addQueueFn = useCallback((name: string, description: string) => {
    const queue: Queue = { name, description, createdAt: Math.floor(Date.now() / 1000) };
    setQueues(prev => [...prev, queue]);
  }, []);

  const removeQueueFn = useCallback((name: string) => {
    setQueues(prev => prev.filter(q => q.name !== name));
    // Unassign posts from removed queue
    setPosts(prev => prev.map(p => {
      if (p.queueName === name) {
        return { ...p, queueName: '', queuePosition: 0 };
      }
      return p;
    }));
  }, []);

  const reorderQueue = useCallback((queueName: string, postIds: string[]) => {
    setPosts(prev => prev.map(p => {
      if (p.queueName === queueName) {
        const idx = postIds.indexOf(p.id);
        if (idx >= 0) {
          return { ...p, queuePosition: idx };
        }
      }
      return p;
    }));
  }, []);

  const contextValue = useMemo<SchedulerContextValue>(() => ({
    posts,
    queues,
    stats,
    createPost,
    updatePost,
    removePost,
    getPost,
    getPostsByStatus: getPostsByStatusFn,
    getPostsByQueue: getPostsByQueueFn,
    schedulePost,
    markPublished,
    markFailed,
    addQueue: addQueueFn,
    removeQueue: removeQueueFn,
    reorderQueue,
    refreshPosts,
  }), [posts, queues, stats, createPost, updatePost, removePost, getPost, getPostsByStatusFn, getPostsByQueueFn, schedulePost, markPublished, markFailed, addQueueFn, removeQueueFn, reorderQueue, refreshPosts]);

  return (
    <SchedulerContext.Provider value={contextValue}>
      {children}
    </SchedulerContext.Provider>
  );
}

export function useScheduler(): SchedulerContextValue {
  const ctx = useContext(SchedulerContext);
  if (!ctx) {
    throw new Error('useScheduler must be used within a SchedulerProvider');
  }
  return ctx;
}
