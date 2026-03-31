import { useRef, useCallback, useState } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  Image,
  Minus,
  AtSign,
  Eye,
  EyeOff,
  Undo2,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface ToolbarAction {
  icon: typeof Bold;
  label: string;
  shortcut?: string;
  action: 'wrap' | 'prefix' | 'insert' | 'custom';
  before?: string;
  after?: string;
  prefix?: string;
  text?: string;
  group?: string;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { icon: Heading1, label: 'Heading 1', shortcut: 'Ctrl+1', action: 'prefix', prefix: '# ', group: 'heading' },
  { icon: Heading2, label: 'Heading 2', shortcut: 'Ctrl+2', action: 'prefix', prefix: '## ', group: 'heading' },
  { icon: Heading3, label: 'Heading 3', shortcut: 'Ctrl+3', action: 'prefix', prefix: '### ', group: 'heading' },
  { icon: Bold, label: 'Bold', shortcut: 'Ctrl+B', action: 'wrap', before: '**', after: '**', group: 'format' },
  { icon: Italic, label: 'Italic', shortcut: 'Ctrl+I', action: 'wrap', before: '*', after: '*', group: 'format' },
  { icon: Strikethrough, label: 'Strikethrough', shortcut: 'Ctrl+D', action: 'wrap', before: '~~', after: '~~', group: 'format' },
  { icon: Code, label: 'Inline code', action: 'wrap', before: '`', after: '`', group: 'format' },
  { icon: Quote, label: 'Blockquote', action: 'prefix', prefix: '> ', group: 'block' },
  { icon: List, label: 'Bullet list', action: 'prefix', prefix: '- ', group: 'block' },
  { icon: ListOrdered, label: 'Numbered list', action: 'prefix', prefix: '1. ', group: 'block' },
  { icon: Minus, label: 'Horizontal rule', action: 'insert', text: '\n\n---\n\n', group: 'block' },
  { icon: FileCode, label: 'Code block', action: 'wrap', before: '\n```\n', after: '\n```\n', group: 'block' },
];

/** Simple markdown to HTML for preview — handles basic syntax */
function renderMarkdownPreview(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (must be first to avoid inner processing)
  html = html.replace(/```([\s\S]*?)```/g, (_match, code) => {
    return `<pre class="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono my-4"><code>${code.trim()}</code></pre>`;
  });

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-6 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-6 border-border" />');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-primary/30 pl-4 py-1 my-3 text-muted-foreground italic">$1</blockquote>');

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del class="text-muted-foreground">$1</del>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noopener noreferrer">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="rounded-lg my-4 max-w-full" />');

  // Nostr mentions (nostr:npub1...)
  html = html.replace(/nostr:(npub1[a-z0-9]+)/g, '<span class="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-sm font-medium">@$1</span>');

  // Unordered list items
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  // Ordered list items
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/((?:<li class="ml-4 list-disc">.*<\/li>\n?)+)/g, '<ul class="my-3 space-y-1">$1</ul>');
  html = html.replace(/((?:<li class="ml-4 list-decimal">.*<\/li>\n?)+)/g, '<ol class="my-3 space-y-1">$1</ol>');

  // Paragraphs (double newlines)
  html = html
    .split('\n\n')
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap blocks that are already HTML elements
      if (/^<(h[1-6]|pre|blockquote|ul|ol|hr|div|img)/.test(trimmed)) return trimmed;
      return `<p class="my-2 leading-relaxed">${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .join('\n');

  return html;
}

export function MarkdownEditor({ value, onChange, placeholder, className }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [mentionNpub, setMentionNpub] = useState('');

  /** Insert text at the current cursor position */
  const insertAtCursor = useCallback((textToInsert: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newValue = value.slice(0, start) + textToInsert + value.slice(end);
    onChange(newValue);

    // Restore cursor position after the insertion
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = start + textToInsert.length;
      ta.setSelectionRange(newPos, newPos);
    });
  }, [value, onChange]);

  /** Wrap selected text with before/after markers */
  const wrapSelection = useCallback((before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const placeholder = selected || 'text';
    const wrapped = before + placeholder + after;
    const newValue = value.slice(0, start) + wrapped + value.slice(end);
    onChange(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      if (!selected) {
        // Select the placeholder text
        ta.setSelectionRange(start + before.length, start + before.length + placeholder.length);
      } else {
        // Place cursor after the wrap
        ta.setSelectionRange(start + wrapped.length, start + wrapped.length);
      }
    });
  }, [value, onChange]);

  /** Add a prefix to the current line */
  const prefixLine = useCallback((prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    // Find the start of the current line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }, [value, onChange]);

  /** Execute a toolbar action */
  const executeAction = useCallback((action: ToolbarAction) => {
    switch (action.action) {
      case 'wrap':
        wrapSelection(action.before || '', action.after || '');
        break;
      case 'prefix':
        prefixLine(action.prefix || '');
        break;
      case 'insert':
        insertAtCursor(action.text || '');
        break;
    }
  }, [wrapSelection, prefixLine, insertAtCursor]);

  /** Handle keyboard shortcuts */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const key = e.key.toLowerCase();
    let handled = false;

    if (key === 'b') {
      wrapSelection('**', '**');
      handled = true;
    } else if (key === 'i') {
      wrapSelection('*', '*');
      handled = true;
    } else if (key === 'd') {
      wrapSelection('~~', '~~');
      handled = true;
    } else if (key === 'k') {
      setLinkPopoverOpen(true);
      handled = true;
    } else if (key === '1') {
      prefixLine('# ');
      handled = true;
    } else if (key === '2') {
      prefixLine('## ');
      handled = true;
    } else if (key === '3') {
      prefixLine('### ');
      handled = true;
    }

    // Tab inserts 2 spaces instead of switching focus
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      insertAtCursor('  ');
      handled = true;
    }

    if (handled) {
      e.preventDefault();
    }
  }, [wrapSelection, prefixLine, insertAtCursor]);

  /** Insert a link */
  const handleInsertLink = useCallback(() => {
    if (!linkUrl.trim()) return;
    const text = linkText.trim() || linkUrl.trim();
    insertAtCursor(`[${text}](${linkUrl.trim()})`);
    setLinkUrl('');
    setLinkText('');
    setLinkPopoverOpen(false);
  }, [linkUrl, linkText, insertAtCursor]);

  /** Insert a nostr mention */
  const handleInsertMention = useCallback(() => {
    const npub = mentionNpub.trim();
    if (!npub) return;
    // NIP-27: nostr: URI for inline mentions
    const mention = npub.startsWith('npub1') ? `nostr:${npub}` : `nostr:${npub}`;
    insertAtCursor(mention);
    setMentionNpub('');
    setMentionPopoverOpen(false);
  }, [mentionNpub, insertAtCursor]);

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // Group actions for rendering with separators
  const groups: { group: string; actions: ToolbarAction[] }[] = [];
  for (const action of TOOLBAR_ACTIONS) {
    const existing = groups.find(g => g.group === (action.group || ''));
    if (existing) {
      existing.actions.push(action);
    } else {
      groups.push({ group: action.group || '', actions: [action] });
    }
  }

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30 flex-wrap">
        {groups.map((group, gi) => (
          <div key={group.group} className="flex items-center gap-0.5">
            {gi > 0 && <Separator orientation="vertical" className="h-6 mx-1" />}
            {group.actions.map(action => {
              const Icon = action.icon;
              return (
                <Tooltip key={action.label}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                      onClick={() => executeAction(action)}
                      disabled={showPreview}
                    >
                      <Icon className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {action.label}
                    {action.shortcut && <span className="ml-2 text-muted-foreground">{action.shortcut}</span>}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Link button */}
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  disabled={showPreview}
                >
                  <Link2 className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Insert link <span className="ml-2 text-muted-foreground">Ctrl+K</span>
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-72 space-y-3" align="start">
            <p className="text-sm font-medium">Insert Link</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Link text</Label>
                <Input
                  placeholder="Display text"
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">URL</Label>
                <Input
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleInsertLink(); }}
                  className="mt-1"
                />
              </div>
            </div>
            <Button onClick={handleInsertLink} size="sm" className="w-full" disabled={!linkUrl.trim()}>
              Insert
            </Button>
          </PopoverContent>
        </Popover>

        {/* Image markdown */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
              disabled={showPreview}
              onClick={() => wrapSelection('![', '](url)')}
            >
              <Image className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert image</TooltipContent>
        </Tooltip>

        {/* Mention button */}
        <Popover open={mentionPopoverOpen} onOpenChange={setMentionPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  disabled={showPreview}
                >
                  <AtSign className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Mention npub</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-80 space-y-3" align="start">
            <p className="text-sm font-medium">Mention a Nostr user</p>
            <div>
              <Label className="text-xs">npub or hex pubkey</Label>
              <Input
                placeholder="npub1..."
                value={mentionNpub}
                onChange={e => setMentionNpub(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInsertMention(); }}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Inserts a nostr: URI mention that Nostr clients will render as a profile link.
            </p>
            <Button onClick={handleInsertMention} size="sm" className="w-full" disabled={!mentionNpub.trim()}>
              Insert mention
            </Button>
          </PopoverContent>
        </Popover>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Preview toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showPreview ? 'secondary' : 'ghost'}
              size="icon"
              className="w-8 h-8"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {showPreview ? 'Back to editor' : 'Preview'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div className="p-6 min-h-[450px] max-h-[70vh] overflow-y-auto">
          {value.trim() ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(value) }}
            />
          ) : (
            <p className="text-muted-foreground italic text-sm">Nothing to preview yet...</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'w-full min-h-[450px] max-h-[70vh] p-6 resize-y text-[15px] leading-relaxed',
            'bg-transparent border-0 outline-none focus:ring-0',
            'placeholder:text-muted-foreground/40',
            'font-sans',
          )}
          spellCheck
        />
      )}

      {/* Footer stats */}
      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{value.length} chars</span>
          <span>{wordCount} words</span>
          <span>~{readingTime} min read</span>
        </div>
        <span className="opacity-60">Markdown · NIP-23</span>
      </div>
    </div>
  );
}
