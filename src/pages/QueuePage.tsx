import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  ListOrdered,
  Plus,
  Trash2,
  GripVertical,
  ShoppingBag,
  MessageSquare,
  BookOpen,
  ArrowUp,
  ArrowDown,
  Send,
  PenSquare,
  Clock,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useToast } from '@/hooks/useToast';
import { format, formatDistanceToNow } from 'date-fns';
import type { SchedulerPost } from '@/lib/types';

const KIND_ICONS = {
  note: MessageSquare,
  listing: ShoppingBag,
  article: BookOpen,
};

const STATUS_BADGES: Record<string, { variant: 'default' | 'outline' | 'destructive' | 'secondary'; icon: React.ElementType }> = {
  scheduled: { variant: 'default', icon: CalendarClock },
  queued: { variant: 'secondary', icon: ListOrdered },
  published: { variant: 'outline', icon: CheckCircle2 },
  failed: { variant: 'destructive', icon: AlertTriangle },
  draft: { variant: 'outline', icon: Clock },
};

export default function QueuePage() {
  useSeoMeta({
    title: 'Queue - Plebeian Scheduler',
    description: 'Manage your post queues and scheduled items.',
  });

  const { posts, queues, addQueue, removeQueue: removeQueueAction, updatePost, reorderQueue } = useScheduler();
  const { toast } = useToast();
  const [showNewQueue, setShowNewQueue] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueueDesc, setNewQueueDesc] = useState('');

  // Categorize posts
  const scheduledPosts = posts
    .filter(p => p.status === 'scheduled')
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));

  const queuedPosts = posts
    .filter(p => p.status === 'queued')
    .sort((a, b) => a.queuePosition - b.queuePosition);

  const failedPosts = posts.filter(p => p.status === 'failed');

  const handleCreateQueue = () => {
    if (!newQueueName.trim()) return;
    addQueue(newQueueName.trim(), newQueueDesc.trim());
    setNewQueueName('');
    setNewQueueDesc('');
    setShowNewQueue(false);
    toast({ title: 'Queue created' });
  };

  const handleMoveInQueue = (post: SchedulerPost, direction: 'up' | 'down') => {
    const queuePosts = posts
      .filter(p => p.queueName === post.queueName && p.status === 'queued')
      .sort((a, b) => a.queuePosition - b.queuePosition);

    const idx = queuePosts.findIndex(p => p.id === post.id);
    if (direction === 'up' && idx > 0) {
      const ids = queuePosts.map(p => p.id);
      [ids[idx], ids[idx - 1]] = [ids[idx - 1], ids[idx]];
      reorderQueue(post.queueName, ids);
    }
    if (direction === 'down' && idx < queuePosts.length - 1) {
      const ids = queuePosts.map(p => p.id);
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      reorderQueue(post.queueName, ids);
    }
  };

  const handlePromoteToScheduled = (post: SchedulerPost) => {
    // Set to 1 hour from now by default
    const updated: SchedulerPost = {
      ...post,
      status: 'scheduled',
      scheduledAt: Math.floor(Date.now() / 1000) + 3600,
    };
    updatePost(updated);
    toast({ title: 'Moved to scheduled' });
  };

  const getPostTitle = (post: SchedulerPost): string => {
    if (post.kind === 'listing') return post.listingFields?.title || 'Untitled Listing';
    if (post.kind === 'article') return post.articleFields?.title || 'Untitled Article';
    return post.content.slice(0, 60) || 'Empty note';
  };

  const renderPostCard = (post: SchedulerPost, showReorder = false) => {
    const KindIcon = KIND_ICONS[post.kind];
    const statusInfo = STATUS_BADGES[post.status] || STATUS_BADGES.draft;
    const StatusIcon = statusInfo.icon;

    return (
      <Card key={post.id} className="hover:shadow-md transition-shadow group">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            {showReorder && (
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => handleMoveInQueue(post, 'up')}
                >
                  <ArrowUp className="w-3 h-3" />
                </Button>
                <GripVertical className="w-4 h-4 text-muted-foreground mx-auto" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => handleMoveInQueue(post, 'down')}
                >
                  <ArrowDown className="w-3 h-3" />
                </Button>
              </div>
            )}
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <KindIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{getPostTitle(post)}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {post.scheduledAt && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(post.scheduledAt * 1000), 'MMM d, h:mm a')}
                  </span>
                )}
                {post.errorMessage && (
                  <span className="text-xs text-destructive truncate max-w-[200px]">
                    {post.errorMessage}
                  </span>
                )}
              </div>
            </div>
            <Badge variant={statusInfo.variant} className="gap-1 text-xs shrink-0">
              <StatusIcon className="w-3 h-3" />
              {post.status}
            </Badge>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Link to={`/compose?edit=${post.id}`}>
                <Button variant="ghost" size="icon" className="w-7 h-7">
                  <PenSquare className="w-3.5 h-3.5" />
                </Button>
              </Link>
              {(post.status === 'queued' || post.status === 'failed') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7"
                  onClick={() => handlePromoteToScheduled(post)}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Queue</h1>
          <p className="text-muted-foreground mt-1">
            Manage your publishing pipeline
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setShowNewQueue(true)}>
          <Plus className="w-4 h-4" />
          New Queue
        </Button>
      </div>

      {/* Scheduled section */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          Scheduled ({scheduledPosts.length})
        </h2>
        {scheduledPosts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No scheduled posts. Schedule a draft from the compose page.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {scheduledPosts.map(p => renderPostCard(p))}
          </div>
        )}
      </div>

      {/* Failed section */}
      {failedPosts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-destructive uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Failed ({failedPosts.length})
          </h2>
          <div className="space-y-2">
            {failedPosts.map(p => renderPostCard(p))}
          </div>
        </div>
      )}

      {/* Named Queues */}
      {queues.map(queue => {
        const queuePosts = posts
          .filter(p => p.queueName === queue.name)
          .sort((a, b) => a.queuePosition - b.queuePosition);

        return (
          <div key={queue.name} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-amber-500" />
                {queue.name} ({queuePosts.length})
              </h2>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete queue "{queue.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Posts in this queue will be unassigned but not deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        removeQueueAction(queue.name);
                        toast({ title: 'Queue deleted' });
                      }}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {queuePosts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-4 text-center text-sm text-muted-foreground">
                  Queue is empty
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {queuePosts.map(p => renderPostCard(p, true))}
              </div>
            )}
          </div>
        );
      })}

      {/* New Queue Dialog */}
      <Dialog open={showNewQueue} onOpenChange={setShowNewQueue}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Queue</DialogTitle>
            <DialogDescription>
              Group related posts together for easy management and batch scheduling.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Queue Name</label>
              <Input
                placeholder="e.g., Weekly Listings, Product Launch"
                value={newQueueName}
                onChange={e => setNewQueueName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateQueue()}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="What is this queue for?"
                value={newQueueDesc}
                onChange={e => setNewQueueDesc(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewQueue(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateQueue} disabled={!newQueueName.trim()}>
              Create Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
