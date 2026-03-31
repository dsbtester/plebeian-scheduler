import { useState, useCallback, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Save,
  CalendarClock,
  Send,
  Loader2,
  ArrowLeft,
  Trash2,
  ImageIcon,
  Clock,
  X,
  ChevronDown,
  Sparkles,
  ShoppingBag,
  Info,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
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
import { ImageUploader } from '@/components/ImageUploader';
import { ListingBrowser } from '@/components/ListingBrowser';
import { AiGenerateDialog } from '@/components/AiGenerateDialog';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { buildEvent } from '@/lib/eventBuilder';
import { scheduleEvent } from '@/lib/schedulerApi';
import { createNewPost, type SchedulerPost, type ImportedListing, type UploadedImage } from '@/lib/types';
import { format } from 'date-fns';

export default function Compose() {
  useSeoMeta({
    title: 'Compose - Plebeian Scheduler',
    description: 'Craft and schedule promotional Nostr posts for your marketplace listings.',
  });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { updatePost, removePost, posts } = useScheduler();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();

  const editId = searchParams.get('edit');

  const existingPost = useMemo(() => {
    if (editId) return posts.find(p => p.id === editId);
    return undefined;
  }, [editId, posts]);

  const [post, setPost] = useState<SchedulerPost>(() => {
    if (existingPost) return existingPost;
    return createNewPost(user?.pubkey ?? '');
  });

  const [persisted, setPersisted] = useState(!!editId);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(() => {
    if (existingPost?.scheduledAt) return new Date(existingPost.scheduledAt * 1000);
    return undefined;
  });
  const [scheduleTime, setScheduleTime] = useState(() => {
    if (existingPost?.scheduledAt) return format(new Date(existingPost.scheduledAt * 1000), 'HH:mm');
    return '12:00';
  });
  const [showScheduler, setShowScheduler] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = useCallback(<K extends keyof SchedulerPost>(field: K, value: SchedulerPost[K]) => {
    setPost(prev => ({ ...prev, [field]: value }));
  }, []);

  // Save as draft
  const handleSaveDraft = useCallback(() => {
    setIsSaving(true);
    const updated = { ...post, status: 'draft' as const, authorPubkey: user?.pubkey ?? post.authorPubkey };
    updatePost(updated);
    setPost(updated);
    setPersisted(true);
    toast({ title: 'Draft saved', description: 'Your draft has been saved locally.' });
    setIsSaving(false);
  }, [post, user, updatePost, toast]);

  // Core scheduling logic — signs the event now and sends to the server
  const submitSchedule = useCallback(async (scheduledAt: number) => {
    if (!user) return;

    const postToSchedule = { ...post, authorPubkey: user.pubkey };
    const eventData = buildEvent(postToSchedule);

    // Sign the event NOW so the server never needs our private key
    const signedEvent = await user.signer.signEvent({
      kind: eventData.kind,
      content: eventData.content,
      tags: eventData.tags,
      created_at: eventData.created_at,
    });

    // Send the pre-signed event to the server for future publishing
    try {
      const result = await scheduleEvent({
        signedEvent,
        publishAt: scheduledAt,
      });

      const updated: SchedulerPost = {
        ...postToSchedule,
        status: 'scheduled',
        scheduledAt,
        serverEventId: result.id,
        publishedEventId: signedEvent.id,
      };
      updatePost(updated);
      setPost(updated);
      setPersisted(true);
      return { ok: true, eventId: signedEvent.id };
    } catch (error) {
      // Server unavailable — fall back to local scheduling
      console.warn('[Scheduler] Server unavailable, falling back to local scheduling:', error);
      const updated: SchedulerPost = {
        ...postToSchedule,
        status: 'scheduled',
        scheduledAt,
        serverEventId: null,
      };
      updatePost(updated);
      setPost(updated);
      setPersisted(true);
      return { ok: false, local: true };
    }
  }, [post, user, updatePost]);

  // Schedule for a specific date & time
  const handleSchedule = useCallback(async () => {
    if (!scheduleDate || !user) return;

    const [hours, minutes] = scheduleTime.split(':').map(Number);
    const scheduledDate = new Date(scheduleDate);
    scheduledDate.setHours(hours, minutes, 0, 0);
    const scheduledAt = Math.floor(scheduledDate.getTime() / 1000);

    if (scheduledAt <= Math.floor(Date.now() / 1000)) {
      toast({ title: 'Invalid time', description: 'Schedule time must be in the future.', variant: 'destructive' });
      return;
    }

    setShowScheduler(false);
    const result = await submitSchedule(scheduledAt);

    if (result?.ok) {
      toast({
        title: 'Post scheduled!',
        description: `Your note will publish on ${format(scheduledDate, 'MMM d, yyyy')} at ${format(scheduledDate, 'h:mm a')}. You can close this tab.`,
      });
    } else {
      toast({
        title: 'Scheduled locally',
        description: `Server unavailable — keep this tab open for it to publish at ${format(scheduledDate, 'h:mm a')}.`,
        variant: 'destructive',
      });
    }
    navigate('/');
  }, [post, scheduleDate, scheduleTime, user, submitSchedule, toast, navigate]);

  // Quick schedule — offset in seconds from now
  const handleQuickSchedule = useCallback(async (offsetSeconds: number, label: string) => {
    if (!user) return;
    const scheduledAt = Math.floor(Date.now() / 1000) + offsetSeconds;

    setShowScheduler(false);
    const result = await submitSchedule(scheduledAt);

    if (result?.ok) {
      toast({
        title: `Scheduled in ${label}`,
        description: `Your note will publish at ${format(new Date(scheduledAt * 1000), 'h:mm a')}. You can close this tab.`,
      });
    } else {
      toast({
        title: `Scheduled locally in ${label}`,
        description: `Server unavailable — keep this tab open for it to publish at ${format(new Date(scheduledAt * 1000), 'h:mm a')}.`,
        variant: 'destructive',
      });
    }
    navigate('/');
  }, [user, submitSchedule, toast, navigate]);

  // Publish now — direct publish to relays (no DVM)
  const handlePublishNow = useCallback(async () => {
    if (!user) return;

    try {
      const postToPublish = { ...post, authorPubkey: user.pubkey };
      const event = buildEvent(postToPublish);

      const published = await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: event.created_at,
      });

      const updated: SchedulerPost = {
        ...postToPublish,
        status: 'published',
        publishedAt: Math.floor(Date.now() / 1000),
        publishedEventId: published.id,
      };
      updatePost(updated);
      setPersisted(true);
      toast({ title: 'Published!', description: 'Your promo note is now live on Nostr.' });
      navigate('/');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const updated: SchedulerPost = { ...post, status: 'failed', errorMessage: errorMsg };
      updatePost(updated);
      setPersisted(true);
      toast({ title: 'Publish failed', description: errorMsg, variant: 'destructive' });
    }
  }, [post, user, publishEvent, updatePost, toast, navigate]);

  const handleDelete = useCallback(() => {
    if (persisted) removePost(post.id);
    toast({ title: 'Post deleted' });
    navigate('/');
  }, [post, persisted, removePost, toast, navigate]);

  // Import from listing browser
  const handleImport = useCallback((data: { content: string; media: UploadedImage[]; importedListing: ImportedListing }) => {
    setPost(prev => ({
      ...prev,
      content: data.content,
      media: data.media,
      importedListing: data.importedListing,
    }));
    toast({ title: 'Listing imported!', description: 'A promo note has been drafted from your listing. Edit it to your liking.' });
  }, [toast]);

  // Insert AI-generated content
  const handleAiInsert = useCallback((text: string) => {
    setPost(prev => ({
      ...prev,
      content: prev.content ? prev.content + '\n\n' + text : text,
    }));
    toast({ title: 'Content inserted', description: 'AI-generated text added to your note.' });
  }, [toast]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">
            {editId ? 'Edit Promo Note' : 'Compose Promo Note'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Craft a promotional note to market your products on Nostr
          </p>
        </div>
        {post.status !== 'draft' && (
          <Badge variant={post.status === 'scheduled' ? 'default' : post.status === 'published' ? 'outline' : 'destructive'}>
            {post.status}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="media">
            <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Media {post.media.length > 0 && `(${post.media.length})`}
          </TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-4">
          {/* Import Listing Browser */}
          <ListingBrowser onImport={handleImport} />

          {/* Imported listing reference */}
          {post.importedListing && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      Promoting: {post.importedListing.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {post.importedListing.price && `${post.importedListing.price} ${post.importedListing.currency}`}
                      {post.importedListing.location && ` · ${post.importedListing.location}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 shrink-0"
                    onClick={() => setPost(prev => {
                      const { importedListing: _, ...rest } = prev;
                      return rest as SchedulerPost;
                    })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {post.importedListing.marketplaceUrl && (
                  <a
                    href={post.importedListing.marketplaceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline ml-11"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on Plebeian Market
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {/* Content editor */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Your Note</CardTitle>
                <AiGenerateDialog
                  currentContent={post.content}
                  listingTitle={post.importedListing?.title}
                  listingContext={
                    post.importedListing
                      ? [
                          post.importedListing.summary && `Summary: ${post.importedListing.summary}`,
                          post.importedListing.price && `Price: ${post.importedListing.price} ${post.importedListing.currency}`,
                          post.importedListing.location && `Location: ${post.importedListing.location}`,
                          post.importedListing.categories.length > 0 && `Categories: ${post.importedListing.categories.join(', ')}`,
                        ].filter(Boolean).join('. ')
                      : undefined
                  }
                  onInsert={handleAiInsert}
                >
                  <Button variant="outline" size="sm" className="gap-2 text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Generate
                  </Button>
                </AiGenerateDialog>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Write your promotional note... e.g. 'Check out my fresh Christmas Cakes! 50,000 sats 🎄'"
                value={post.content}
                onChange={e => updateField('content', e.target.value)}
                className="min-h-[200px] text-sm"
                rows={10}
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  {post.content.length} characters
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="w-3 h-3" />
                  This will be published as a kind 1 note
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Media Attachments
              </CardTitle>
              {post.media.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Images will be appended to your note and tagged with NIP-92 metadata
                </p>
              )}
            </CardHeader>
            <CardContent>
              <ImageUploader
                images={post.media}
                onImagesChange={imgs => updateField('media', imgs)}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Action Bar — Schedule is the hero, Publish Now is secondary */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pb-8">
        <div className="flex-1 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleSaveDraft}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </Button>

          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground"
            onClick={handlePublishNow}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Publish Now
          </Button>
        </div>

        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The draft will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Schedule — the main action */}
          <Popover open={showScheduler} onOpenChange={setShowScheduler}>
            <PopoverTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30">
                <CalendarClock className="w-4 h-4" />
                Schedule Post
                <ChevronDown className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="end">
              <div className="p-3 space-y-3">
                {/* Quick schedule */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Quick schedule</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button size="sm" variant="secondary" className="text-xs h-9 gap-1.5" onClick={() => handleQuickSchedule(300, '5 minutes')}>
                      <Clock className="w-3 h-3" /> 5 minutes
                    </Button>
                    <Button size="sm" variant="secondary" className="text-xs h-9 gap-1.5" onClick={() => handleQuickSchedule(3600, '1 hour')}>
                      <Clock className="w-3 h-3" /> 1 hour
                    </Button>
                    <Button size="sm" variant="secondary" className="text-xs h-9 gap-1.5" onClick={() => handleQuickSchedule(86400, '24 hours')}>
                      <Clock className="w-3 h-3" /> 24 hours
                    </Button>
                    <Button size="sm" variant="secondary" className="text-xs h-9 gap-1.5" onClick={() => handleQuickSchedule(604800, '1 week')}>
                      <Clock className="w-3 h-3" /> 1 week
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Custom date & time */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Pick a date & time</p>
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={setScheduleDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="rounded-md border"
                  />
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleSchedule}
                  disabled={!scheduleDate}
                >
                  <CalendarClock className="w-4 h-4" />
                  {scheduleDate
                    ? `Schedule for ${format(scheduleDate, 'MMM d')} at ${scheduleTime}`
                    : 'Pick a date & time'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
