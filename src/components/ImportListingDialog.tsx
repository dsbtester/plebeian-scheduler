import { useState } from 'react';
import {
  Download,
  ShoppingBag,
  BookOpen,
  Loader2,
  Search,
  Image as ImageIcon,
  Tag,
  MapPin,
  Clock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyListings, type ExistingListing } from '@/hooks/useMyListings';
import { useMyArticles } from '@/hooks/useMyListings';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { SchedulerPost, Currency, PriceFrequency, ListingStatus } from '@/lib/types';

interface ImportListingDialogProps {
  postKind: 'listing' | 'article';
  onImport: (data: Partial<SchedulerPost>) => void;
  children?: React.ReactNode;
}

export function ImportListingDialog({ postKind, onImport, children }: ImportListingDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: listings, isLoading: listingsLoading } = useMyListings();
  const { data: articles, isLoading: articlesLoading } = useMyArticles();

  const isLoading = postKind === 'listing' ? listingsLoading : articlesLoading;

  const handleImportListing = (listing: ExistingListing) => {
    onImport({
      content: listing.content,
      dTag: listing.dTag,
      listingFields: {
        title: listing.title,
        summary: listing.summary,
        price: listing.price,
        currency: (listing.currency || 'SAT') as Currency,
        priceFrequency: (listing.priceFrequency || '') as PriceFrequency,
        location: listing.location,
        status: (listing.status || 'active') as ListingStatus,
        categories: listing.categories,
        images: listing.images.map(img => ({
          url: img.url,
          dimensions: img.dimensions,
        })),
        shippingInfo: '',
      },
    });
    setOpen(false);
    setSearch('');
  };

  const handleImportArticle = (article: {
    content: string;
    dTag: string;
    title: string;
    summary: string;
    image: string;
    categories: string[];
  }) => {
    onImport({
      content: article.content,
      dTag: article.dTag,
      articleFields: {
        title: article.title,
        summary: article.summary,
        image: article.image,
        categories: article.categories,
      },
    });
    setOpen(false);
    setSearch('');
  };

  const filteredListings = (listings ?? []).filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.title.toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q) ||
      l.content.toLowerCase().includes(q) ||
      l.categories.some(c => c.includes(q))
    );
  });

  const filteredArticles = (articles ?? []).filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-3.5 h-3.5" />
            Import from Nostr
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {postKind === 'listing' ? (
              <ShoppingBag className="w-5 h-5 text-primary" />
            ) : (
              <BookOpen className="w-5 h-5 text-emerald-500" />
            )}
            Import from Your Published {postKind === 'listing' ? 'Listings' : 'Articles'}
          </DialogTitle>
          <DialogDescription>
            Pull in an existing {postKind === 'listing' ? 'NIP-99 listing' : 'NIP-23 article'} from Nostr relays. All fields including {postKind === 'listing' ? 'title, price, images,' : 'title, summary, cover image,'} and content will be auto-filled.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search your ${postKind === 'listing' ? 'listings' : 'articles'}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Separator />

        {/* Results */}
        <ScrollArea className="max-h-[50vh] pr-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                  <Skeleton className="w-16 h-16 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : postKind === 'listing' ? (
            filteredListings.length === 0 ? (
              <div className="py-12 text-center">
                <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search ? 'No listings match your search' : 'No published listings found on your relays'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Publish a listing first on Plebeian Market or another NIP-99 client.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredListings.map(listing => (
                  <button
                    key={listing.event.id}
                    type="button"
                    onClick={() => handleImportListing(listing)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-all duration-200',
                      'hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm',
                      'focus:outline-none focus:ring-2 focus:ring-primary/30'
                    )}
                  >
                    <div className="flex gap-3">
                      {/* Thumbnail */}
                      {listing.images.length > 0 ? (
                        <img
                          src={listing.images[0].url}
                          alt={listing.title}
                          className="w-16 h-16 rounded-lg object-cover shrink-0 border"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold truncate">
                            {listing.title || 'Untitled Listing'}
                          </h3>
                          {listing.price && (
                            <Badge variant="secondary" className="shrink-0 text-xs font-mono">
                              {listing.price} {listing.currency}
                            </Badge>
                          )}
                        </div>

                        {listing.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {listing.summary}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {listing.location && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {listing.location}
                            </span>
                          )}
                          {listing.images.length > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              {listing.images.length} image{listing.images.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {listing.categories.length > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {listing.categories.slice(0, 3).join(', ')}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(listing.event.created_at * 1000), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            // Articles
            filteredArticles.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search ? 'No articles match your search' : 'No published articles found on your relays'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredArticles.map(article => (
                  <button
                    key={article.event.id}
                    type="button"
                    onClick={() => handleImportArticle(article)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-all duration-200',
                      'hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:shadow-sm',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500/30'
                    )}
                  >
                    <div className="flex gap-3">
                      {article.image ? (
                        <img
                          src={article.image}
                          alt={article.title}
                          className="w-16 h-16 rounded-lg object-cover shrink-0 border"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <BookOpen className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate">
                          {article.title || 'Untitled Article'}
                        </h3>
                        {article.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {article.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {article.categories.length > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {article.categories.slice(0, 3).join(', ')}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(article.event.created_at * 1000), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
