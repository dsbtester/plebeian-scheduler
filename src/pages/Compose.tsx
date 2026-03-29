import { useState, useEffect, useCallback, useRef } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  MessageSquare,
  BookOpen,
  Save,
  CalendarClock,
  Send,
  Loader2,
  ArrowLeft,
  Trash2,
  ImageIcon,
  Clock,
  Zap,
  Tag,
  MapPin,
  DollarSign,
  X,
  Plus,
  ChevronDown,
  Server,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { useScheduler } from '@/contexts/SchedulerContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { buildEvent, buildDvmPublishRequest } from '@/lib/eventBuilder';
import { CURRENCIES, PRICE_FREQUENCIES, type PostKind, type SchedulerPost, type Currency, type PriceFrequency, type ListingStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const KIND_OPTIONS = [
  { value: 'listing' as PostKind, label: 'Marketplace Listing', icon: ShoppingBag, desc: 'NIP-99 (kind 30402)', color: 'text-primary' },
  { value: 'note' as PostKind, label: 'Short Note', icon: MessageSquare, desc: 'Kind 1', color: 'text-blue-500' },
  { value: 'article' as PostKind, label: 'Long-form Article', icon: BookOpen, desc: 'NIP-23 (kind 30023)', color: 'text-emerald-500' },
];

export default function Compose() {
  useSeoMeta({
    title: 'Compose - Plebeian Scheduler',
    description: 'Create and schedule Nostr posts, marketplace listings, and articles.',
  });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { createPost, updatePost, removePost, getPost } = useScheduler();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();

  const editId = searchParams.get('edit');
  const initialKind = (searchParams.get('kind') as PostKind) || 'listing';

  const [post, setPost] = useState<SchedulerPost | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [showScheduler, setShowScheduler] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize post - only run once on mount or when edit ID / user changes
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (initializedRef.current) return;

    if (editId) {
      const existing = getPost(editId);
      if (existing) {
        setPost(existing);
        if (existing.scheduledAt) {
          const d = new Date(existing.scheduledAt * 1000);
          setScheduleDate(d);
          setScheduleTime(format(d, 'HH:mm'));
          setShowScheduler(true);
        }
        initializedRef.current = true;
        return;
      }
    }

    const newPost = createPost(initialKind, user.pubkey);
    setPost(newPost);
    initializedRef.current = true;
  }, [user, editId, initialKind, createPost, getPost]);

  const updateField = useCallback(<K extends keyof SchedulerPost>(field: K, value: SchedulerPost[K]) => {
    setPost(prev => prev ? { ...prev, [field]: value } : null);
  }, []);

  const updateListingField = useCallback((field: string, value: string | string[]) => {
    setPost(prev => {
      if (!prev?.listingFields) return prev;
      return {
        ...prev,
        listingFields: { ...prev.listingFields, [field]: value },
      };
    });
  }, []);

  const updateArticleField = useCallback((field: string, value: string | string[]) => {
    setPost(prev => {
      if (!prev?.articleFields) return prev;
      return {
        ...prev,
        articleFields: { ...prev.articleFields, [field]: value },
      };
    });
  }, []);

  const addCategory = useCallback(() => {
    if (!newCategory.trim() || !post) return;
    const cats = post.kind === 'listing'
      ? post.listingFields?.categories ?? []
      : post.articleFields?.categories ?? [];
    if (!cats.includes(newCategory.trim().toLowerCase())) {
      const updated = [...cats, newCategory.trim().toLowerCase()];
      if (post.kind === 'listing') {
        updateListingField('categories', updated);
      } else {
        updateArticleField('categories', updated);
      }
    }
    setNewCategory('');
  }, [newCategory, post, updateListingField, updateArticleField]);

  const removeCategory = useCallback((cat: string) => {
    if (!post) return;
    if (post.kind === 'listing') {
      updateListingField('categories', (post.listingFields?.categories ?? []).filter(c => c !== cat));
    } else {
      updateArticleField('categories', (post.articleFields?.categories ?? []).filter(c => c !== cat));
    }
  }, [post, updateListingField, updateArticleField]);

  // Save as draft
  const handleSaveDraft = useCallback(async () => {
    if (!post) return;
    setIsSaving(true);
    const updated = { ...post, status: 'draft' as const };
    updatePost(updated);
    setPost(updated);
    toast({ title: 'Draft saved', description: 'Your draft has been saved locally.' });
    setIsSaving(false);
  }, [post, updatePost, toast]);

  // Schedule for later
  const handleSchedule = useCallback(async () => {
    if (!post || !scheduleDate) return;

    const [hours, minutes] = scheduleTime.split(':').map(Number);
    const scheduledDate = new Date(scheduleDate);
    scheduledDate.setHours(hours, minutes, 0, 0);
    const scheduledAt = Math.floor(scheduledDate.getTime() / 1000);

    if (scheduledAt <= Math.floor(Date.now() / 1000)) {
      toast({ title: 'Invalid time', description: 'Schedule time must be in the future.', variant: 'destructive' });
      return;
    }

    const updated: SchedulerPost = { ...post, status: 'scheduled', scheduledAt };
    updatePost(updated);
    setPost(updated);
    toast({ title: 'Post scheduled', description: `Scheduled for ${format(scheduledDate, 'MMM d, yyyy h:mm a')}` });
    navigate('/');
  }, [post, scheduleDate, scheduleTime, updatePost, toast, navigate]);

  // Publish now
  const handlePublishNow = useCallback(async () => {
    if (!post || !user) return;

    try {
      const event = buildEvent(post, false);

      if (post.useDvm) {
        // Build DVM job request
        const dvmRequest = buildDvmPublishRequest(post, JSON.stringify(event));
        const published = await publishEvent({
          kind: dvmRequest.kind,
          content: dvmRequest.content,
          tags: dvmRequest.tags,
          created_at: dvmRequest.created_at,
        });
        const updated: SchedulerPost = {
          ...post,
          status: 'published',
          publishedAt: Math.floor(Date.now() / 1000),
          publishedEventId: published.id,
        };
        updatePost(updated);
        toast({ title: 'DVM job submitted', description: 'Your publish job has been submitted to the DVM network.' });
      } else {
        const published = await publishEvent({
          kind: event.kind,
          content: event.content,
          tags: event.tags,
          created_at: event.created_at,
        });
        const updated: SchedulerPost = {
          ...post,
          status: 'published',
          publishedAt: Math.floor(Date.now() / 1000),
          publishedEventId: published.id,
        };
        updatePost(updated);
        toast({ title: 'Published!', description: 'Your event has been published to Nostr relays.' });
      }
      navigate('/');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const updated: SchedulerPost = { ...post, status: 'failed', errorMessage: errorMsg };
      updatePost(updated);
      toast({ title: 'Publish failed', description: errorMsg, variant: 'destructive' });
    }
  }, [post, user, publishEvent, updatePost, toast, navigate]);

  const handleDelete = useCallback(() => {
    if (!post) return;
    removePost(post.id);
    toast({ title: 'Post deleted' });
    navigate('/');
  }, [post, removePost, toast, navigate]);

  if (!post) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const categories = post.kind === 'listing'
    ? post.listingFields?.categories ?? []
    : post.kind === 'article'
      ? post.articleFields?.categories ?? []
      : [];

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
            {post.kind === 'listing' && 'NIP-99 Classified Listing (kind 30402)'}
            {post.kind === 'note' && 'Short text note (kind 1)'}
            {post.kind === 'article' && 'Long-form article (NIP-23, kind 30023)'}
          </p>
        </div>
        {post.status !== 'draft' && (
          <Badge variant={post.status === 'scheduled' ? 'default' : post.status === 'published' ? 'outline' : 'destructive'}>
            {post.status}
          </Badge>
        )}
      </div>

      {/* Kind selector (only when creating new) */}
      {!editId && (
        <div className="grid grid-cols-3 gap-3">
          {KIND_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const isSelected = post.kind === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  if (post.kind !== opt.value) {
                    const newPost = createPost(opt.value, user?.pubkey ?? '');
                    newPost.content = post.content;
                    setPost(newPost);
                  }
                }}
                className={cn(
                  'p-4 rounded-xl border-2 transition-all duration-200 text-left',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-border hover:border-primary/30 hover:bg-secondary/50'
                )}
              >
                <Icon className={cn('w-5 h-5 mb-2', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="media">
            <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Media
          </TabsTrigger>
          <TabsTrigger value="options">
            <Zap className="w-3.5 h-3.5 mr-1.5" /> Options
          </TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-4">
          {/* Listing-specific fields */}
          {post.kind === 'listing' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                  Listing Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    placeholder="What are you selling?"
                    value={post.listingFields?.title ?? ''}
                    onChange={e => updateListingField('title', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Summary</Label>
                  <Input
                    placeholder="Short tagline for your listing..."
                    value={post.listingFields?.summary ?? ''}
                    onChange={e => updateListingField('summary', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Price
                    </Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={post.listingFields?.price ?? ''}
                      onChange={e => updateListingField('price', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select
                      value={post.listingFields?.currency ?? 'SAT'}
                      onValueChange={v => updateListingField('currency', v as Currency)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.symbol} {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select
                      value={post.listingFields?.priceFrequency || 'one-time'}
                      onValueChange={v => updateListingField('priceFrequency', (v === 'one-time' ? '' : v) as PriceFrequency)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_FREQUENCIES.map(f => (
                          <SelectItem key={f.value || 'one-time'} value={f.value || 'one-time'}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Location
                    </Label>
                    <Input
                      placeholder="City, Country or online"
                      value={post.listingFields?.location ?? ''}
                      onChange={e => updateListingField('location', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={post.listingFields?.status ?? 'active'}
                      onValueChange={v => updateListingField('status', v as ListingStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="sold">Sold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Article-specific fields */}
          {post.kind === 'article' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500" />
                  Article Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    placeholder="Article title..."
                    value={post.articleFields?.title ?? ''}
                    onChange={e => updateArticleField('title', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Summary</Label>
                  <Input
                    placeholder="Brief summary of your article..."
                    value={post.articleFields?.summary ?? ''}
                    onChange={e => updateArticleField('summary', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cover Image URL</Label>
                  <Input
                    placeholder="https://..."
                    value={post.articleFields?.image ?? ''}
                    onChange={e => updateArticleField('image', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Content editor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {post.kind === 'note' ? 'Note Content' : 'Description (Markdown)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={
                  post.kind === 'listing'
                    ? 'Describe your product or service in detail. Markdown supported...'
                    : post.kind === 'article'
                      ? 'Write your article in Markdown...'
                      : "What's on your mind?"
                }
                value={post.content}
                onChange={e => updateField('content', e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                rows={10}
              />
              <p className="text-xs text-muted-foreground mt-2">
                {post.content.length} characters
                {post.kind !== 'note' && ' \u00B7 Markdown supported'}
              </p>
            </CardContent>
          </Card>

          {/* Categories/Tags */}
          {post.kind !== 'note' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Categories / Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a category..."
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={addCategory}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                      <Badge key={cat} variant="secondary" className="gap-1 pr-1">
                        {cat}
                        <button onClick={() => removeCategory(cat)} className="hover:bg-foreground/10 rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                {post.kind === 'listing' ? 'Listing Images' : 'Media Attachments'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUploader
                images={post.kind === 'listing' ? (post.listingFields?.images ?? []) : post.media}
                onImagesChange={imgs => {
                  if (post.kind === 'listing') {
                    setPost(prev => prev ? {
                      ...prev,
                      listingFields: prev.listingFields ? { ...prev.listingFields, images: imgs } : prev.listingFields,
                    } : null);
                  } else {
                    updateField('media', imgs);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground mt-3">
                Images are uploaded to Blossom servers with NIP-92 imeta tags for interoperability.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Options Tab */}
        <TabsContent value="options" className="space-y-4">
          {/* DVM Publishing */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="w-4 h-4" />
                DVM Publishing (NIP-90)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Delegate to DVM</p>
                  <p className="text-xs text-muted-foreground">
                    Use a Data Vending Machine to publish on your behalf (like Shipyard)
                  </p>
                </div>
                <Switch
                  checked={post.useDvm}
                  onCheckedChange={v => updateField('useDvm', v)}
                />
              </div>

              {post.useDvm && (
                <div className="space-y-2 pl-1">
                  <Label className="text-xs">DVM Relay URLs (one per line)</Label>
                  <Textarea
                    placeholder="wss://relay.example.com"
                    value={post.dvmRelays.join('\n')}
                    onChange={e => updateField('dvmRelays', e.target.value.split('\n').filter(Boolean))}
                    rows={3}
                    className="text-xs font-mono"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* NIP-40 Expiration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Event Expiration (NIP-40)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Set expiration</p>
                  <p className="text-xs text-muted-foreground">
                    Relays should delete the event after this time
                  </p>
                </div>
                <Switch
                  checked={post.expiresAt !== null}
                  onCheckedChange={v => updateField('expiresAt', v ? Math.floor(Date.now() / 1000) + 86400 * 7 : null)}
                />
              </div>

              {post.expiresAt !== null && (
                <div className="space-y-2 pl-1">
                  <Label className="text-xs">Expires at</Label>
                  <Input
                    type="datetime-local"
                    value={post.expiresAt ? format(new Date(post.expiresAt * 1000), "yyyy-MM-dd'T'HH:mm") : ''}
                    onChange={e => {
                      const d = new Date(e.target.value);
                      if (!isNaN(d.getTime())) {
                        updateField('expiresAt', Math.floor(d.getTime() / 1000));
                      }
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* d-tag (for addressable events) */}
          {post.kind !== 'note' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Identifier (d-tag)</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={post.dTag}
                  onChange={e => updateField('dTag', e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Unique identifier for this addressable event. Auto-generated, but you can customize it.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Separator />

      {/* Action Bar */}
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

          <Popover open={showScheduler} onOpenChange={setShowScheduler}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarClock className="w-4 h-4" />
                Schedule
                <ChevronDown className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3 space-y-3">
                <Calendar
                  mode="single"
                  selected={scheduleDate}
                  onSelect={setScheduleDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
                <div className="flex items-center gap-2 px-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={handleSchedule}
                  disabled={!scheduleDate}
                >
                  <CalendarClock className="w-4 h-4" />
                  {scheduleDate
                    ? `Schedule for ${format(scheduleDate, 'MMM d')} at ${scheduleTime}`
                    : 'Pick a date'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
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

          <Button
            className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30"
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
      </div>
    </div>
  );
}
