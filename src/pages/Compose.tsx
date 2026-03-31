import { useState, useCallback, useMemo, useRef } from 'react';
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
  MessageSquare,
  FileText,
  Upload,
  Hash,
  Eye,
  BookOpen,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { ListingBrowser, type CampaignListing } from '@/components/ListingBrowser';
import { AiGenerateDialog } from '@/components/AiGenerateDialog';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { TimePicker } from '@/components/TimePicker';
import { NoteContent } from '@/components/NoteContent';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { buildEvent } from '@/lib/eventBuilder';
import { scheduleEvent } from '@/lib/schedulerApi';
import { createNewPost, type SchedulerPost, type PostType, type PostTemplate, type ImportedListing, type UploadedImage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const POST_TYPES: { value: PostType; label: string; icon: typeof MessageSquare; description: string; kind: string }[] = [
  { value: 'short', label: 'Short Note', icon: MessageSquare, description: 'Quick update, announcement, or thought', kind: 'kind 1' },
  { value: 'long', label: 'Long-form Article', icon: FileText, description: 'Newsletter, blog post, or in-depth content', kind: 'kind 30023' },
  { value: 'promo', label: 'Promo Note', icon: ShoppingBag, description: 'Promote a product from your marketplace listing', kind: 'kind 1' },
];

export default function Compose() {
  useSeoMeta({
    title: 'Compose - Plebeian Scheduler',
    description: 'Craft and schedule Nostr posts — short notes, long-form articles, and product promotions.',
  });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { updatePost, removePost, posts } = useScheduler();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();

  const editId = searchParams.get('edit');
  const headerImageInputRef = useRef<HTMLInputElement>(null);
  const [headerImageUploading, setHeaderImageUploading] = useState(false);

  const existingPost = useMemo(() => {
    if (editId) return posts.find(p => p.id === editId);
    return undefined;
  }, [editId, posts]);

  const [post, setPost] = useState<SchedulerPost>(() => {
    if (existingPost) return existingPost;
    return createNewPost(user?.pubkey ?? '');
  });

  // Load templates
  const templates = useMemo<PostTemplate[]>(() => {
    try {
      const raw = localStorage.getItem('plebeian-scheduler:templates');
      if (!raw) return [];
      return (JSON.parse(raw) as PostTemplate[]).sort((a, b) => b.createdAt - a.createdAt);
    } catch { return []; }
  }, []);

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
  const [hashtagInput, setHashtagInput] = useState('');
  const [showNotePreview, setShowNotePreview] = useState(false);

  const updateField = useCallback(<K extends keyof SchedulerPost>(field: K, value: SchedulerPost[K]) => {
    setPost(prev => ({ ...prev, [field]: value }));
  }, []);

  const setPostType = useCallback((postType: PostType) => {
    setPost(prev => ({ ...prev, postType }));
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
  const [isScheduling, setIsScheduling] = useState(false);
  const handleSchedule = useCallback(async () => {
    if (!scheduleDate || !user || isScheduling) return;

    const [hours, minutes] = scheduleTime.split(':').map(Number);
    const scheduledDate = new Date(scheduleDate);
    scheduledDate.setHours(hours, minutes, 0, 0);
    const scheduledAt = Math.floor(scheduledDate.getTime() / 1000);

    if (scheduledAt <= Math.floor(Date.now() / 1000)) {
      toast({ title: 'Invalid time', description: 'The selected date and time is in the past. Pick a future time.', variant: 'destructive' });
      // Don't close the popover — let user fix the time
      return;
    }

    setIsScheduling(true);
    setShowScheduler(false);

    try {
      const result = await submitSchedule(scheduledAt);

      if (result?.ok) {
        toast({
          title: 'Post scheduled!',
          description: `Will publish on ${format(scheduledDate, 'MMM d, yyyy')} at ${format(scheduledDate, 'h:mm a')}. You can close this tab.`,
        });
      } else {
        toast({
          title: 'Scheduled locally',
          description: `Server unavailable — keep this tab open for it to publish at ${format(scheduledDate, 'h:mm a')}.`,
          variant: 'destructive',
        });
      }
      navigate('/');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: 'Scheduling failed', description: msg, variant: 'destructive' });
    } finally {
      setIsScheduling(false);
    }
  }, [post, scheduleDate, scheduleTime, user, isScheduling, submitSchedule, toast, navigate]);

  // Quick schedule — offset in seconds from now
  const handleQuickSchedule = useCallback(async (offsetSeconds: number, label: string) => {
    if (!user) return;
    const scheduledAt = Math.floor(Date.now() / 1000) + offsetSeconds;

    setShowScheduler(false);
    const result = await submitSchedule(scheduledAt);

    if (result?.ok) {
      toast({
        title: `Scheduled in ${label}`,
        description: `Will publish at ${format(new Date(scheduledAt * 1000), 'h:mm a')}. You can close this tab.`,
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

  // Publish now — direct publish to relays
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
      toast({ title: 'Published!', description: `Your ${post.postType === 'long' ? 'article' : 'note'} is now live on Nostr.` });
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
      postType: 'promo' as PostType,
      content: data.content,
      media: data.media,
      importedListing: data.importedListing,
    }));
    toast({ title: 'Listing imported!', description: 'A promo note has been drafted. Edit it to your liking.' });
  }, [toast]);

  // Insert AI-generated content
  const handleAiInsert = useCallback((text: string) => {
    setPost(prev => ({
      ...prev,
      content: prev.content ? prev.content + '\n\n' + text : text,
    }));
    toast({ title: 'Content inserted', description: 'AI-generated text added.' });
  }, [toast]);

  // Multi-listing campaign — create scheduled promo posts with user-specified timing
  const handleCampaign = useCallback((listings: CampaignListing[], options?: { startDate: Date; startTime: string; intervalSeconds: number }) => {
    if (!user || listings.length === 0) return;

    // Use provided options or default fallback
    let startTimestamp: number;
    let interval: number;

    if (options) {
      const [hours, minutes] = options.startTime.split(':').map(Number);
      const start = new Date(options.startDate);
      start.setHours(hours, minutes, 0, 0);
      startTimestamp = Math.floor(start.getTime() / 1000);
      interval = options.intervalSeconds;
    } else {
      startTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      interval = 6 * 3600;
    }

    for (let i = 0; i < listings.length; i++) {
      const item = listings[i];
      const newPost = createNewPost(user.pubkey, 'promo');
      newPost.content = item.content;
      newPost.media = item.media;
      newPost.importedListing = item.importedListing;
      newPost.status = 'scheduled';
      newPost.scheduledAt = startTimestamp + (interval * i);
      updatePost(newPost);
    }

    const intervalLabel = interval < 3600 ? `${interval / 60} min` :
      interval === 3600 ? '1 hour' :
      interval < 86400 ? `${interval / 3600} hours` :
      interval === 86400 ? '1 day' : `${interval / 86400} days`;

    toast({
      title: `Campaign created!`,
      description: `${listings.length} promo notes scheduled, one every ${intervalLabel}.`,
    });
    navigate('/');
  }, [user, updatePost, toast, navigate]);

  // Upload header image for articles
  const handleHeaderImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderImageUploading(true);
    try {
      const tags = await uploadFile(file);
      const url = tags.find(([name]) => name === 'url')?.[1] ?? '';
      if (url) {
        updateField('headerImage', url);
      }
    } catch (error) {
      console.error('Failed to upload header image:', error);
      toast({ title: 'Upload failed', description: 'Could not upload header image.', variant: 'destructive' });
    } finally {
      setHeaderImageUploading(false);
      if (headerImageInputRef.current) headerImageInputRef.current.value = '';
    }
  }, [uploadFile, updateField, toast]);

  // Add hashtag
  const addHashtag = useCallback(() => {
    const tag = hashtagInput.trim().toLowerCase().replace(/^#/, '');
    if (tag && !post.hashtags.includes(tag)) {
      updateField('hashtags', [...post.hashtags, tag]);
    }
    setHashtagInput('');
  }, [hashtagInput, post.hashtags, updateField]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const currentType = POST_TYPES.find(t => t.value === post.postType) ?? POST_TYPES[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">
            {editId ? 'Edit Post' : 'Compose'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and schedule content for your Nostr audience
          </p>
        </div>
        {post.status !== 'draft' && (
          <Badge variant={post.status === 'scheduled' ? 'default' : post.status === 'published' ? 'outline' : 'destructive'}>
            {post.status}
          </Badge>
        )}
      </div>

      {/* Post Type Selector */}
      <div className="grid grid-cols-3 gap-2">
        {POST_TYPES.map(type => {
          const Icon = type.icon;
          const isActive = post.postType === type.value;
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => setPostType(type.value)}
              className={cn(
                'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center',
                isActive
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30 hover:bg-secondary/50'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                isActive ? 'bg-primary/15' : 'bg-muted'
              )}>
                <Icon className={cn('w-5 h-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div>
                <p className={cn('text-sm font-medium', isActive && 'text-primary')}>{type.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">{type.description}</p>
              </div>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{type.kind}</Badge>
            </button>
          );
        })}
      </div>

      {/* Template selector — only show if templates exist and not editing */}
      {!editId && templates.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Load from template</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {templates.slice(0, 6).map((tpl, i) => (
                <Button
                  key={`${tpl.name}-${i}`}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1.5"
                  onClick={() => {
                    setPost(prev => ({
                      ...prev,
                      content: tpl.content,
                      postType: (tpl.postType as PostType) || prev.postType,
                    }));
                    toast({ title: 'Template loaded', description: `"${tpl.name}" applied.` });
                  }}
                >
                  {tpl.name.slice(0, 25)}{tpl.name.length > 25 ? '...' : ''}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Promo: Listing Browser */}
      {post.postType === 'promo' && (
        <ListingBrowser onImport={handleImport} onCampaign={handleCampaign} />
      )}

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

      {/* ===== LONG-FORM ARTICLE FIELDS ===== */}
      {post.postType === 'long' && (
        <div className="space-y-4">
          {/* Title */}
          <div>
            <Input
              placeholder="Article title"
              value={post.title}
              onChange={e => updateField('title', e.target.value)}
              className="text-xl font-bold font-display border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary placeholder:font-normal placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Summary */}
          <div>
            <Input
              placeholder="Brief summary or subtitle (shown in previews)"
              value={post.summary}
              onChange={e => updateField('summary', e.target.value)}
              className="text-sm border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Header Image */}
          <div>
            {post.headerImage ? (
              <div className="relative rounded-xl overflow-hidden border group">
                <img src={post.headerImage} alt="Header" className="w-full h-48 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => headerImageInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => updateField('headerImage', '')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-full border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-all group"
                onClick={() => headerImageInputRef.current?.click()}
                disabled={headerImageUploading}
              >
                {headerImageUploading ? (
                  <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground group-hover:text-primary transition-colors" />
                    <p className="text-sm text-muted-foreground mt-2">Add a header image</p>
                  </>
                )}
              </button>
            )}
            <input
              ref={headerImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleHeaderImageUpload}
            />
          </div>

          {/* Hashtags */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Add hashtags (e.g. bitcoin, farming)"
                  value={hashtagInput}
                  onChange={e => setHashtagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag(); } }}
                  className="pl-9 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" onClick={addHashtag} disabled={!hashtagInput.trim()}>
                Add
              </Button>
            </div>
            {post.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {post.hashtags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1 text-xs pr-1">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => updateField('hashtags', post.hashtags.filter(t => t !== tag))}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== CONTENT EDITOR (all post types) ===== */}
      {post.postType === 'long' ? (
        /* Long-form: rich Markdown editor with toolbar */
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Article Content</p>
            <AiGenerateDialog
              currentContent={post.content}
              listingTitle={post.title || undefined}
              listingContext={undefined}
              onInsert={handleAiInsert}
            >
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                AI Generate
              </Button>
            </AiGenerateDialog>
          </div>
          <MarkdownEditor
            value={post.content}
            onChange={val => updateField('content', val)}
            placeholder="Start writing your article...\n\nUse the toolbar above for formatting, or write Markdown directly. Keyboard shortcuts: Ctrl+B for bold, Ctrl+I for italic, Ctrl+K for links."
          />
        </div>
      ) : (
        /* Short / Promo: simple card editor with edit/preview toggle */
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Your Note</CardTitle>
              <div className="flex items-center gap-2">
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
                {/* Edit / Preview toggle */}
                <Button
                  variant={showNotePreview ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowNotePreview(!showNotePreview)}
                >
                  {showNotePreview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showNotePreview ? 'Edit' : 'Preview'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {showNotePreview ? (
              /* Preview mode */
              <div className="min-h-[160px] rounded-lg border bg-secondary/20 p-4 space-y-3">
                {post.content ? (
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    <NoteContent event={{ kind: 1, content: post.content, tags: [], id: '', pubkey: '', sig: '', created_at: 0 }} className="text-sm" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Nothing to preview yet...</p>
                )}
                {/* Image gallery preview */}
                {post.media.length > 0 && (
                  <div className={cn(
                    'grid gap-2',
                    post.media.length === 1 && 'grid-cols-1',
                    post.media.length === 2 && 'grid-cols-2',
                    post.media.length >= 3 && 'grid-cols-2 sm:grid-cols-3',
                  )}>
                    {post.media.map((img, idx) => (
                      <div
                        key={img.url}
                        className={cn(
                          'relative rounded-lg overflow-hidden border bg-muted',
                          post.media.length === 1 ? 'aspect-video' : 'aspect-square',
                        )}
                      >
                        <img
                          src={img.url}
                          alt={img.alt || `Image ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Edit mode */
              <Textarea
                placeholder={
                  post.postType === 'promo'
                    ? "Write your promotional note... e.g. 'Check out my fresh Christmas Cakes! 50,000 sats 🎄'"
                    : "What's on your mind? Share an update, announcement, or thought..."
                }
                value={post.content}
                onChange={e => updateField('content', e.target.value)}
                className="min-h-[160px] text-sm"
                rows={8}
              />
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {post.content.length} characters
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="w-3 h-3" />
                Publishes as kind 1 note
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== MEDIA / IMAGE ATTACHMENTS ===== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Media {post.media.length > 0 && <Badge variant="secondary" className="text-xs">{post.media.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader
            images={post.media}
            onImagesChange={imgs => updateField('media', imgs)}
          />
        </CardContent>
      </Card>

      {/* ===== HASHTAG SUGGESTIONS ===== */}
      {post.postType !== 'long' && (
        <Card className="bg-muted/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Quick hashtags — click to add to your note</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ...(post.postType === 'promo'
                  ? ['PlebeianMarket', 'Bitcoin', 'Nostr', 'CircularEconomy', 'V4V', 'BuyWithBitcoin', 'NostrMarket', 'Plebchain', 'SupportPlebs', 'PermissionlessCommerce', 'SatsEconomy', 'BitcoinMerchant']
                  : ['Bitcoin', 'Nostr', 'Plebchain', 'V4V', 'BTC', 'Zap', 'BuildOnNostr', 'StackSats', 'PlebeianMarket', 'CircularEconomy']
                ),
                ...(post.importedListing?.categories ?? []).map(c => c.replace(/\s+/g, '')),
              ].filter((tag, i, arr) => arr.indexOf(tag) === i).map(tag => {
                const isInContent = post.content.toLowerCase().includes(`#${tag.toLowerCase()}`);
                return (
                  <Button
                    key={tag}
                    variant={isInContent ? 'secondary' : 'outline'}
                    size="sm"
                    className={cn(
                      'text-xs h-7 px-2.5 gap-1 transition-all',
                      isInContent && 'opacity-50 cursor-default'
                    )}
                    disabled={isInContent}
                    onClick={() => {
                      const hashtag = `#${tag}`;
                      const separator = post.content && !post.content.endsWith('\n') && !post.content.endsWith(' ') ? ' ' : '';
                      updateField('content', post.content + separator + hashtag);
                    }}
                  >
                    <Hash className="w-2.5 h-2.5" />
                    {tag}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ===== ACTION BAR ===== */}
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
                Schedule
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
                      <Clock className="w-3 h-3" /> 5 min
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
                  <TimePicker
                    value={scheduleTime}
                    onChange={setScheduleTime}
                  />
                </div>

                {/* Recurring option */}
                <Separator />
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Repeat</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: 'Once', value: 0 },
                      { label: 'Daily', value: 86400 },
                      { label: 'Every 3 days', value: 86400 * 3 },
                      { label: 'Weekly', value: 604800 },
                    ].map(opt => (
                      <Button
                        key={opt.value}
                        size="sm"
                        variant={post.recurringInterval === opt.value ? 'default' : 'outline'}
                        className="text-xs h-8"
                        onClick={() => updateField('recurringInterval', opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  {post.recurringInterval > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Will auto-reschedule after each publish
                    </p>
                  )}
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleSchedule}
                  disabled={!scheduleDate || isScheduling}
                >
                  {isScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                  {isScheduling
                    ? 'Scheduling...'
                    : scheduleDate
                      ? (() => {
                          const [h, m] = scheduleTime.split(':').map(Number);
                          const d = new Date(scheduleDate);
                          d.setHours(h, m);
                          return `Schedule for ${format(d, 'MMM d')} at ${format(d, 'h:mm a')}`;
                        })()
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
