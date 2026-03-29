import { useState, useCallback } from 'react';
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
  Wand2,
  ShoppingBag,
  MessageSquare,
  BookOpen,
  X,
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useDvmGenerate } from '@/hooks/useDvmGenerate';
import { cn } from '@/lib/utils';
import type { PostKind } from '@/lib/types';

interface AiGenerateDialogProps {
  postKind: PostKind;
  currentContent: string;
  listingTitle?: string;
  listingContext?: string;
  onInsert: (text: string) => void;
  children?: React.ReactNode;
}

const QUICK_PROMPTS: Record<PostKind, { label: string; prompt: string }[]> = {
  listing: [
    {
      label: 'Product description',
      prompt: 'Write a compelling product description for a marketplace listing. Make it engaging, highlight key features and benefits. Keep it under 300 words.',
    },
    {
      label: 'Sales pitch',
      prompt: 'Write a persuasive sales pitch for this product. Focus on value proposition and urgency. Keep it concise and engaging.',
    },
    {
      label: 'Improve description',
      prompt: 'Improve and polish the following product description. Make it more professional, add relevant details, and optimize for marketplace search. Keep the same structure but enhance the writing quality.',
    },
  ],
  note: [
    {
      label: 'Announcement',
      prompt: 'Write a short, engaging social media announcement. Keep it under 280 characters, make it punchy and attention-grabbing.',
    },
    {
      label: 'Product update',
      prompt: 'Write a brief product update note for social media. Keep it casual, informative, and under 500 characters.',
    },
    {
      label: 'Promotional post',
      prompt: 'Write a promotional social media post. Include a call to action. Keep it brief and engaging.',
    },
  ],
  article: [
    {
      label: 'Blog post outline',
      prompt: 'Create a detailed blog post outline with sections, key points, and a compelling introduction. Use Markdown formatting.',
    },
    {
      label: 'Product review',
      prompt: 'Write a thorough product review article in Markdown. Include pros, cons, detailed analysis, and a verdict section.',
    },
    {
      label: 'How-to guide',
      prompt: 'Write a step-by-step how-to guide article in Markdown. Include clear instructions, tips, and a summary.',
    },
  ],
};

const KIND_CONTEXT: Record<PostKind, string> = {
  listing: 'a Nostr marketplace listing (NIP-99)',
  note: 'a short social media note on Nostr',
  article: 'a long-form article on Nostr (NIP-23)',
};

export function AiGenerateDialog({
  postKind,
  currentContent,
  listingTitle,
  listingContext,
  onInsert,
  children,
}: AiGenerateDialogProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  const { generate, cancel, isGenerating, error } = useDvmGenerate();

  const KindIcon = postKind === 'listing' ? ShoppingBag
    : postKind === 'article' ? BookOpen
      : MessageSquare;

  const buildFullPrompt = useCallback((basePrompt: string) => {
    let full = `You are writing content for ${KIND_CONTEXT[postKind]}.`;

    if (listingTitle) {
      full += `\n\nProduct/Item: "${listingTitle}"`;
    }
    if (listingContext) {
      full += `\n\nAdditional context: ${listingContext}`;
    }
    if (currentContent.trim()) {
      full += `\n\nExisting content to work with:\n"""${currentContent.trim()}"""`;
    }

    full += `\n\nTask: ${basePrompt}`;
    return full;
  }, [postKind, listingTitle, listingContext, currentContent]);

  const handleGenerate = useCallback(async (basePrompt?: string) => {
    const promptText = basePrompt || prompt;
    if (!promptText.trim()) return;

    setResult('');
    const fullPrompt = buildFullPrompt(promptText);
    const response = await generate({ prompt: fullPrompt });
    if (response) {
      setResult(response.content);
    }
  }, [prompt, buildFullPrompt, generate]);

  const handleInsert = useCallback(() => {
    onInsert(result);
    setOpen(false);
    setResult('');
    setPrompt('');
  }, [result, onInsert]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen && isGenerating) {
      cancel();
    }
    setOpen(isOpen);
    if (!isOpen) {
      setResult('');
      setPrompt('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            AI Generate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI Content Generation
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <KindIcon className="w-3 h-3" />
              {postKind === 'listing' ? 'Listing' : postKind === 'article' ? 'Article' : 'Note'}
            </Badge>
            Powered by NIP-90 Data Vending Machines (kind 5050)
          </DialogDescription>
        </DialogHeader>

        {/* Quick Prompts */}
        {!result && !isGenerating && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick prompts</p>
              <div className="grid gap-2">
                {QUICK_PROMPTS[postKind].map(qp => (
                  <button
                    key={qp.label}
                    type="button"
                    onClick={() => {
                      setPrompt(qp.prompt);
                      handleGenerate(qp.prompt);
                    }}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200',
                      'hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-sm'
                    )}
                  >
                    <div className="w-8 h-8 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Wand2 className="w-4 h-4 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{qp.label}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{qp.prompt}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <Separator />
          </>
        )}

        {/* Custom Prompt */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {result ? 'Your prompt' : 'Custom prompt'}
          </p>
          <Textarea
            placeholder={
              postKind === 'listing'
                ? 'e.g., Write a detailed description for my vintage camera listing...'
                : postKind === 'article'
                  ? 'e.g., Write an article about Bitcoin privacy best practices...'
                  : 'e.g., Write a catchy announcement about my new product...'
            }
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={result ? 2 : 3}
            className="text-sm"
            disabled={isGenerating}
          />
          {!result && (
            <Button
              onClick={() => handleGenerate()}
              disabled={isGenerating || !prompt.trim()}
              className="w-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Waiting for DVM response...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate with DVM
                </>
              )}
            </Button>
          )}
        </div>

        {/* Loading state */}
        {isGenerating && (
          <div className="py-6 text-center space-y-3">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-20 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-white animate-pulse" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Requesting AI generation via DVM...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Waiting for a service provider on the Nostr network to respond.
                This typically takes 10-30 seconds.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={cancel} className="gap-1.5">
              <X className="w-3.5 h-3.5" />
              Cancel
            </Button>
          </div>
        )}

        {/* Error */}
        {error && !isGenerating && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Generation failed</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Tip: DVM service providers need to be online to respond.
                Try again or use a different prompt.
              </p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && !isGenerating && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Generated content
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => handleGenerate()}
                    disabled={isGenerating}
                  >
                    <Sparkles className="w-3 h-3" />
                    Regenerate
                  </Button>
                </div>
              </div>

              <ScrollArea className="max-h-[200px]">
                <div className="p-3 rounded-lg bg-secondary/50 border">
                  <p className="text-sm whitespace-pre-wrap">{result}</p>
                </div>
              </ScrollArea>

              <Button
                onClick={handleInsert}
                className="w-full gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Insert into {postKind === 'listing' ? 'description' : 'content'}
              </Button>
            </div>
          </>
        )}

        {/* Footer info */}
        <div className="text-[11px] text-muted-foreground text-center pt-1">
          Content is generated by decentralized AI service providers via the Nostr DVM protocol (NIP-90, kind 5050).
          Results may vary depending on available providers.
        </div>
      </DialogContent>
    </Dialog>
  );
}
