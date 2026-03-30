import { useState, useCallback } from 'react';
import { nip19 } from 'nostr-tools';
import {
  Search,
  Tag,
  MapPin,
  Clock,
  User,
  ShoppingBag,
  Download,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMyListings, useAllListings, type ExistingListing } from '@/hooks/useMyListings';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { NostrMetadata } from '@nostrify/nostrify';
import { PLEBEIAN_MARKET_URL, type ImportedListing, type UploadedImage } from '@/lib/types';

interface ListingBrowserProps {
  onImport: (data: { content: string; media: UploadedImage[]; importedListing: ImportedListing }) => void;
}

type BrowseMode = 'mine' | 'all';

/** Build an naddr1 for a NIP-99 listing */
function buildNaddr(listing: ExistingListing): string {
  try {
    return nip19.naddrEncode({
      kind: 30402,
      pubkey: listing.event.pubkey,
      identifier: listing.dTag,
    });
  } catch {
    return '';
  }
}

/** Build the Plebeian Market web URL for a listing */
function buildMarketplaceUrl(listing: ExistingListing): string {
  const naddr = buildNaddr(listing);
  if (!naddr) return '';
  return `${PLEBEIAN_MARKET_URL}/p/${naddr}`;
}

/** Build a promo note content string from listing data */
function buildPromoContent(listing: ExistingListing): string {
  const parts: string[] = [];

  // Title as the hook
  if (listing.title) {
    parts.push(listing.title);
  }

  // Summary or a snippet of description
  if (listing.summary) {
    parts.push(listing.summary);
  } else if (listing.content) {
    // Take first ~200 chars of the listing description
    const snippet = listing.content.length > 200
      ? listing.content.slice(0, 200).trim() + '...'
      : listing.content;
    parts.push(snippet);
  }

  // Price line
  if (listing.price) {
    const currencyLabel = listing.currency === 'SAT' ? 'sats'
      : listing.currency === 'BTC' ? 'BTC'
        : listing.currency;
    parts.push(`Price: ${listing.price} ${currencyLabel}`);
  }

  // Location
  if (listing.location) {
    parts.push(`📍 ${listing.location}`);
  }

  // Direct buy link to Plebeian Market
  const marketplaceUrl = buildMarketplaceUrl(listing);
  if (marketplaceUrl) {
    parts.push(`🛒 Buy here: ${marketplaceUrl}`);
  }

  return parts.join('\n\n');
}

/** Small inline author badge */
function AuthorBadge({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || pubkey.slice(0, 10) + '...';

  return (
    <div className="flex items-center gap-1.5">
      <Avatar className="w-4 h-4">
        <AvatarImage src={metadata?.picture} alt={name} />
        <AvatarFallback className="text-[8px]">
          <User className="w-2.5 h-2.5" />
        </AvatarFallback>
      </Avatar>
      <span className="text-xs text-muted-foreground truncate max-w-[100px]">{name}</span>
    </div>
  );
}

/** Compact horizontal listing row */
function ListingCard({
  listing,
  onImport,
  showAuthor = false,
}: {
  listing: ExistingListing;
  onImport: () => void;
  showAuthor?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onImport}
      className={cn(
        'group flex items-center gap-3 w-full text-left p-2 rounded-lg border transition-all duration-150',
        'hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary/30'
      )}
    >
      {/* Thumbnail */}
      {listing.images.length > 0 ? (
        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
          <img
            src={listing.images[0].url}
            alt={listing.title}
            className="w-full h-full object-cover"
          />
          {listing.images.length > 1 && (
            <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl-sm">
              +{listing.images.length - 1}
            </span>
          )}
        </div>
      ) : (
        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-muted-foreground/30" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">
            {listing.title || 'Untitled Listing'}
          </h3>
          {listing.price && (
            <Badge variant="secondary" className="shrink-0 text-[10px] font-mono h-5 px-1.5">
              {listing.price} {listing.currency}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {showAuthor && <AuthorBadge pubkey={listing.event.pubkey} />}
          {listing.location && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              {listing.location}
            </span>
          )}
          {listing.categories.length > 0 && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate">
              <Tag className="w-2.5 h-2.5 shrink-0" />
              {listing.categories.slice(0, 2).join(', ')}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 shrink-0 ml-auto">
            <Clock className="w-2.5 h-2.5" />
            {formatDistanceToNow(new Date(listing.event.created_at * 1000), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Import indicator */}
      <Download className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
    </button>
  );
}

/** Loading skeleton rows */
function ListingSkeletons() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg border">
          <Skeleton className="w-12 h-12 rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListingBrowser({ onImport }: ListingBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<BrowseMode>('mine');
  const [searchTerm, setSearchTerm] = useState('');
  const [allSearchInput, setAllSearchInput] = useState('');
  const { user } = useCurrentUser();

  const { data: myListings, isLoading: myLoading } = useMyListings();
  const { data: allListings, isLoading: allLoading, isFetching: allFetching } = useAllListings(
    searchTerm,
    mode === 'all' && isOpen,
  );

  const handleImportListing = useCallback((listing: ExistingListing) => {
    // Build a promo note from the listing data
    const promoContent = buildPromoContent(listing);

    // Convert listing images to UploadedImage format for media attachments
    const media: UploadedImage[] = listing.images.map(img => ({
      url: img.url,
      dimensions: img.dimensions,
    }));

    // Store the imported listing metadata for AI context / reference
    const naddr = buildNaddr(listing);
    const importedListing: ImportedListing = {
      naddr,
      marketplaceUrl: naddr ? `${PLEBEIAN_MARKET_URL}/p/${naddr}` : undefined,
      title: listing.title,
      summary: listing.summary,
      price: listing.price,
      currency: listing.currency || 'SAT',
      location: listing.location,
      categories: listing.categories,
      images: media,
      authorPubkey: listing.event.pubkey,
    };

    onImport({
      content: promoContent,
      media,
      importedListing,
    });
  }, [onImport]);

  const handleAllSearch = useCallback(() => {
    setSearchTerm(allSearchInput);
  }, [allSearchInput]);

  // Filter "My Listings" client-side
  const filteredMyListings = (myListings ?? []).filter(l => {
    if (!allSearchInput.trim() || mode !== 'mine') return true;
    const q = allSearchInput.toLowerCase();
    return (
      l.title.toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q) ||
      l.content.toLowerCase().includes(q) ||
      l.categories.some(c => c.includes(q)) ||
      l.location.toLowerCase().includes(q)
    );
  });

  const currentListings = mode === 'mine' ? filteredMyListings : (allListings ?? []);
  const isLoading = mode === 'mine' ? myLoading : allLoading;

  return (
    <Card className={cn('transition-all duration-300', isOpen && 'ring-1 ring-primary/20')}>
      <CardHeader className="pb-0">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full text-left group"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-primary" />
            </div>
            Import from Listing
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isOpen && myListings && myListings.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {myListings.length} listing{myListings.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </div>
        </button>
        {!isOpen && (
          <p className="text-xs text-muted-foreground mt-1 ml-9">
            Import product data from your Plebeian Market listings to craft a promo post
          </p>
        )}
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-3 space-y-3">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted rounded-md">
            <button
              type="button"
              onClick={() => setMode('mine')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200',
                mode === 'mine'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <User className="w-3 h-3" />
              My Listings
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200',
                mode === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Globe className="w-3 h-3" />
              All Listings
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={mode === 'mine' ? 'Filter your listings...' : 'Search all NIP-99 listings on relays...'}
                value={allSearchInput}
                onChange={e => {
                  setAllSearchInput(e.target.value);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && mode === 'all') {
                    handleAllSearch();
                  }
                }}
                className="pl-9"
              />
            </div>
            {mode === 'all' && (
              <Button
                onClick={handleAllSearch}
                disabled={allFetching}
                className="gap-2 shrink-0"
              >
                {allFetching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Search
              </Button>
            )}
          </div>

          {/* Info text */}
          <p className="text-xs text-muted-foreground">
            {mode === 'all'
              ? `Search NIP-99 listings on your relays. Pick one to auto-generate a promo note.${user ? ' Results from all merchants.' : ''}`
              : 'Select a listing to auto-generate a promotional note with its title, price, images, and a link back.'
            }
          </p>

          {/* Results */}
          <ScrollArea className="max-h-[280px] -mx-1 px-1">
            {isLoading ? (
              <ListingSkeletons />
            ) : currentListings.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {mode === 'mine'
                    ? allSearchInput ? 'No listings match your filter' : 'No published listings found'
                    : searchTerm ? 'No listings found for that search' : 'Search for listings or browse recent ones'
                  }
                </p>
                {mode === 'mine' && !allSearchInput && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Publish a listing on Plebeian Market first, then import it here to promote.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {currentListings.map(listing => (
                  <ListingCard
                    key={listing.event.id}
                    listing={listing}
                    onImport={() => handleImportListing(listing)}
                    showAuthor={mode === 'all'}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Results count */}
          {!isLoading && currentListings.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing {currentListings.length} listing{currentListings.length !== 1 ? 's' : ''}
              {mode === 'mine' && ' from your account'}
              {mode === 'all' && ' from relays'}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
