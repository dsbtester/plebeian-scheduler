import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  FileText,
  CalendarClock,
  ListOrdered,
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { format, formatDistanceToNow } from 'date-fns';
import type { SchedulerPost } from '@/lib/types';

const STAT_CARDS = [
  { key: 'drafts' as const, label: 'Drafts', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'scheduled' as const, label: 'Scheduled', icon: CalendarClock, color: 'text-primary', bg: 'bg-primary/10' },
  { key: 'queued' as const, label: 'In Queue', icon: ListOrdered, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { key: 'published' as const, label: 'Published', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { key: 'failed' as const, label: 'Failed', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
];

/** Get a human-friendly title for a promo note */
function getPostTitle(post: SchedulerPost): string {
  if (post.importedListing?.title) return post.importedListing.title;
  return post.content.slice(0, 60) || 'Empty note';
}

export default function Dashboard() {
  useSeoMeta({
    title: 'Dashboard - Plebeian Scheduler',
    description: 'Manage your scheduled promotional Nostr posts.',
  });

  const { posts, stats } = useScheduler();
  const { user } = useCurrentUser();

  // Upcoming scheduled posts
  const upcoming = posts
    .filter(p => p.status === 'scheduled' && p.scheduledAt)
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
    .slice(0, 5);

  // Recent activity (published + failed)
  const recent = posts
    .filter(p => p.status === 'published' || p.status === 'failed')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  // Failed posts that need attention
  const failedPosts = posts.filter(p => p.status === 'failed');

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
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
            New Promo Note
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {STAT_CARDS.map(card => {
          const Icon = card.icon;
          const count = stats[card.key];
          return (
            <Card key={card.key} className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">{count}</p>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming Scheduled */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                Upcoming Schedule
              </CardTitle>
              <Link to="/calendar">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  View All <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <div className="py-8 text-center">
                <Clock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No scheduled posts yet</p>
                <Link to="/compose" className="text-xs text-primary hover:underline mt-1 inline-block">
                  Create your first scheduled promo note
                </Link>
              </div>
            ) : (
              upcoming.map(post => {
                const hasListing = !!post.importedListing;
                const isServer = !!post.serverEventId;
                return (
                  <Link
                    key={post.id}
                    to={`/compose?edit=${post.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      {hasListing ? (
                        <ShoppingBag className="w-4 h-4 text-primary" />
                      ) : (
                        <MessageSquare className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getPostTitle(post)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {post.scheduledAt && format(new Date(post.scheduledAt * 1000), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {post.scheduledAt && formatDistanceToNow(new Date(post.scheduledAt * 1000), { addSuffix: true })}
                      </Badge>
                      <span className={`flex items-center gap-1 text-[10px] ${isServer ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {isServer ? <Server className="w-2.5 h-2.5" /> : <Monitor className="w-2.5 h-2.5" />}
                        {isServer ? 'server' : 'local'}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 ? (
              <div className="py-8 text-center">
                <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              recent.map(post => {
                const isPublished = post.status === 'published';
                const hasListing = !!post.importedListing;
                return (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 p-3 rounded-lg"
                  >
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${isPublished ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
                      {hasListing ? (
                        <ShoppingBag className={`w-4 h-4 ${isPublished ? 'text-emerald-500' : 'text-destructive'}`} />
                      ) : (
                        <MessageSquare className={`w-4 h-4 ${isPublished ? 'text-emerald-500' : 'text-destructive'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getPostTitle(post)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(post.updatedAt * 1000), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant={isPublished ? 'default' : 'destructive'} className="text-xs shrink-0">
                      {isPublished ? 'Published' : 'Failed'}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failed posts alert */}
      {failedPosts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
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

      {/* Quick actions for empty state */}
      {posts.length === 0 && user && (
        <div className="grid sm:grid-cols-2 gap-4 animate-fade-in">
          <Link to="/compose">
            <Card className="hover:shadow-lg hover:border-primary/20 transition-all duration-300 cursor-pointer group h-full">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <ShoppingBag className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">Promote a Listing</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Import a Plebeian Market listing and craft a promo note
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/compose">
            <Card className="hover:shadow-lg hover:border-blue-500/20 transition-all duration-300 cursor-pointer group h-full">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="font-semibold text-sm">Write a Note</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Schedule a promotional note or announcement
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
