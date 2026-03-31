import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  FileText,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  PenSquare,
  Clock,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  ShoppingBag,
  Server,
  Monitor,
  Newspaper,
  Heart,
  Zap,
  Users,
  ExternalLink,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBatchEngagement, type PostEngagement } from '@/hooks/usePostEngagement';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { SchedulerPost } from '@/lib/types';

/** Get a human-friendly title for a post */
function getPostTitle(post: SchedulerPost): string {
  if (post.postType === 'long' && post.title) return post.title;
  if (post.importedListing?.title) return post.importedListing.title;
  return post.content.slice(0, 60) || 'Empty note';
}

/** Get the appropriate icon for a post type */
function getPostIcon(post: SchedulerPost) {
  if (post.postType === 'long') return Newspaper;
  if (post.postType === 'promo') return ShoppingBag;
  return MessageSquare;
}

/** Format sats for display */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}k`;
  return sats.toLocaleString();
}

/** Engagement display for a published post */
function EngagementRow({ engagement, isLoading }: { engagement?: PostEngagement; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-14" />
      </div>
    );
  }

  if (!engagement || (engagement.reactionCount === 0 && engagement.zapCount === 0)) {
    return (
      <span className="text-[11px] text-muted-foreground/60 italic">No engagement yet</span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {engagement.reactionCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-xs text-rose-500">
              <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
              {engagement.reactionCount}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {engagement.uniqueReactors} unique reactor{engagement.uniqueReactors !== 1 ? 's' : ''}
            {Object.keys(engagement.reactions).length > 0 && (
              <span className="ml-1">
                ({Object.entries(engagement.reactions).slice(0, 3).map(([emoji, count]) => `${emoji} ${count}`).join(', ')})
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      )}
      {engagement.zapCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
              <Zap className="w-3.5 h-3.5 fill-amber-500/20" />
              {formatSats(engagement.totalSats)} sats
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {engagement.zapCount} zap{engagement.zapCount !== 1 ? 's' : ''} from {engagement.uniqueZappers} person{engagement.uniqueZappers !== 1 ? 's' : ''}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function Dashboard() {
  useSeoMeta({
    title: 'Dashboard - Plebeian Scheduler',
    description: 'Manage your scheduled Nostr posts and track engagement.',
  });

  const { posts, stats } = useScheduler();
  const { user } = useCurrentUser();

  // Published posts sorted by most recent
  const publishedPosts = useMemo(() =>
    posts
      .filter(p => p.status === 'published' && p.publishedEventId)
      .sort((a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt)),
    [posts],
  );

  // Upcoming scheduled posts
  const upcoming = useMemo(() =>
    posts
      .filter(p => p.status === 'scheduled' && p.scheduledAt)
      .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
      .slice(0, 5),
    [posts],
  );

  // Failed posts
  const failedPosts = useMemo(() => posts.filter(p => p.status === 'failed'), [posts]);

  // Batch-fetch engagement for all published posts
  const publishedEventIds = useMemo(
    () => publishedPosts.map(p => p.publishedEventId!).filter(Boolean),
    [publishedPosts],
  );
  const { data: engagementMap, isLoading: engagementLoading } = useBatchEngagement(publishedEventIds);

  // Aggregate engagement across all published posts
  const totalEngagement = useMemo(() => {
    if (!engagementMap) return { reactions: 0, zaps: 0, sats: 0, uniqueZappers: 0 };
    let reactions = 0, zaps = 0, sats = 0;
    const allZappers = new Set<string>();
    for (const eng of engagementMap.values()) {
      reactions += eng.reactionCount;
      zaps += eng.zapCount;
      sats += eng.totalSats;
    }
    return { reactions, zaps, sats, uniqueZappers: allZappers.size };
  }, [engagementMap]);

  return (
    <div className="space-y-8 animate-fade-in overflow-hidden">
      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Your merchant marketing command center
          </p>
        </div>
        <Link to="/compose">
          <Button className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow">
            <PenSquare className="w-4 h-4" />
            New Post
          </Button>
        </Link>
      </div>

      {/* ===== HERO STATS — 4 key numbers ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/20">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">Scheduled</p>
                <p className="text-2xl sm:text-3xl font-bold font-display mt-1">{stats.scheduled}</p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-md transition-all duration-200 hover:border-emerald-500/20">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">Published</p>
                <p className="text-2xl sm:text-3xl font-bold font-display mt-1">{stats.published}</p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-md transition-all duration-200 hover:border-rose-500/20">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">Reactions</p>
                <p className="text-2xl sm:text-3xl font-bold font-display mt-1">
                  {engagementLoading ? <Skeleton className="h-9 w-12 inline-block" /> : totalEngagement.reactions}
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-rose-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-md transition-all duration-200 hover:border-amber-500/20">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">Zapped</p>
                <p className="text-2xl sm:text-3xl font-bold font-display mt-1">
                  {engagementLoading ? (
                    <Skeleton className="h-9 w-20 inline-block" />
                  ) : totalEngagement.sats > 0 ? (
                    <span className="flex items-center gap-1">
                      <Zap className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                      <span className="truncate">{formatSats(totalEngagement.sats)}</span>
                    </span>
                  ) : (
                    '0'
                  )}
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== FAILED ALERT ===== */}
      {failedPosts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 animate-fade-in">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {failedPosts.length} post{failedPosts.length > 1 ? 's' : ''} failed to publish
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Check the queue or try republishing.
                </p>
              </div>
              <Link to="/queue">
                <Button variant="outline" size="sm" className="shrink-0">
                  Review
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== TWO-COLUMN: UPCOMING + PUBLISHED WITH ENGAGEMENT ===== */}
      <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">

        {/* LEFT COLUMN — Upcoming Schedule (2/5 width) */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  Upcoming
                </CardTitle>
                <Link to="/calendar">
                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                    All <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {upcoming.length === 0 ? (
                <div className="py-8 text-center">
                  <Clock className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Nothing scheduled</p>
                  <Link to="/compose" className="text-xs text-primary hover:underline mt-1 inline-block">
                    Schedule your first post
                  </Link>
                </div>
              ) : (
                upcoming.map(post => {
                  const isServer = !!post.serverEventId;
                  const PostIcon = getPostIcon(post);
                  return (
                    <Link
                      key={post.id}
                      to={`/compose?edit=${post.id}`}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <PostIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getPostTitle(post)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[11px] text-muted-foreground">
                            {post.scheduledAt && format(new Date(post.scheduledAt * 1000), 'MMM d, h:mm a')}
                          </p>
                          <span className={cn(
                            'flex items-center gap-0.5 text-[10px]',
                            isServer ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                          )}>
                            {isServer ? <Server className="w-2.5 h-2.5" /> : <Monitor className="w-2.5 h-2.5" />}
                            {isServer ? 'server' : 'local'}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 h-5 hidden sm:inline-flex">
                        {post.scheduledAt && formatDistanceToNow(new Date(post.scheduledAt * 1000), { addSuffix: true })}
                      </Badge>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Drafts count */}
          {stats.drafts > 0 && (
            <Link to="/drafts">
              <Card className="hover:shadow-md transition-all hover:border-blue-500/20 cursor-pointer group">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{stats.drafts} draft{stats.drafts !== 1 ? 's' : ''}</p>
                    <p className="text-[11px] text-muted-foreground">Continue editing</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* RIGHT COLUMN — Published posts with engagement (3/5 width) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              Published Posts
            </h2>
            {publishedPosts.length > 5 && (
              <Link to="/queue">
                <Button variant="ghost" size="sm" className="gap-1 text-xs h-7">
                  View all <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            )}
          </div>

          {publishedPosts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No published posts yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Publish or schedule a post to see engagement metrics here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {publishedPosts.slice(0, 8).map((post, i) => {
                const PostIcon = getPostIcon(post);
                const engagement = engagementMap?.get(post.publishedEventId!);
                const hasImage = post.media.length > 0 || (post.postType === 'long' && post.headerImage);
                const firstImage = post.postType === 'long' && post.headerImage
                  ? post.headerImage
                  : post.media[0]?.url;

                return (
                  <Card
                    key={post.id}
                    className={cn(
                      'group hover:shadow-md transition-all duration-200 hover:border-primary/15 overflow-hidden',
                      i === 0 && 'ring-1 ring-primary/10',
                    )}
                  >
                    <CardContent className="p-0">
                      <div className="flex min-w-0">
                        {/* Image thumbnail — hidden on very small screens if content is tight */}
                        {hasImage && firstImage && (
                          <div className="w-16 sm:w-28 shrink-0 bg-muted">
                            <img
                              src={firstImage}
                              alt=""
                              className="w-full h-full object-cover min-h-[72px]"
                            />
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 p-3 sm:p-4 min-w-0 space-y-1.5 overflow-hidden">
                          <div className="flex items-start gap-2">
                            <div className={cn(
                              'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                              'bg-emerald-500/10',
                            )}>
                              <PostIcon className="w-3.5 h-3.5 text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate leading-tight">{getPostTitle(post)}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {post.publishedAt
                                  ? formatDistanceToNow(new Date(post.publishedAt * 1000), { addSuffix: true })
                                  : formatDistanceToNow(new Date(post.updatedAt * 1000), { addSuffix: true })
                                }
                                {post.postType === 'long' && <Badge variant="secondary" className="ml-2 text-[9px] px-1.5 py-0">article</Badge>}
                                {post.postType === 'promo' && post.importedListing && (
                                  <Badge variant="secondary" className="ml-2 text-[9px] px-1.5 py-0">promo</Badge>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Content preview */}
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {post.content.slice(0, 140)}
                          </p>

                          {/* Engagement + actions */}
                          <div className="flex items-center justify-between pt-1">
                            <EngagementRow engagement={engagement} isLoading={engagementLoading} />

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {post.publishedEventId && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link to={`/compose?edit=${post.id}`}>
                                      <Button variant="ghost" size="icon" className="w-7 h-7">
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </Button>
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">View details</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== EMPTY STATE ===== */}
      {posts.length === 0 && user && (
        <div className="space-y-6 animate-fade-in">
          <Separator />
          <div className="text-center space-y-2">
            <Sparkles className="w-8 h-8 mx-auto text-primary/40" />
            <h3 className="font-display font-semibold">Get Started</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Create your first post — a quick note, a long-form article, or a product promo from your Plebeian Market listings.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <Link to="/compose">
              <Card className="hover:shadow-lg hover:border-blue-500/20 transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-5 text-center">
                  <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-2.5 group-hover:scale-110 transition-transform">
                    <MessageSquare className="w-5 h-5 text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-sm">Short Note</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">Quick update</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/compose">
              <Card className="hover:shadow-lg hover:border-violet-500/20 transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-5 text-center">
                  <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center mx-auto mb-2.5 group-hover:scale-110 transition-transform">
                    <Newspaper className="w-5 h-5 text-violet-500" />
                  </div>
                  <h3 className="font-semibold text-sm">Article</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">Newsletter / blog</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/compose">
              <Card className="hover:shadow-lg hover:border-primary/20 transition-all duration-300 cursor-pointer group h-full">
                <CardContent className="p-5 text-center">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2.5 group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">Promo</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">Market listing</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
