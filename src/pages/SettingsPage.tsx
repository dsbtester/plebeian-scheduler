import { useSeoMeta } from '@unhead/react';
import {
  Settings,
  Radio,
  Trash2,
  Download,
  Upload,
  Moon,
  Sun,
  Monitor,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { RelayListManager } from '@/components/RelayListManager';
import { useTheme } from '@/hooks/useTheme';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useToast } from '@/hooks/useToast';
import { loadPosts, savePosts, loadQueues, saveQueues } from '@/lib/schedulerStore';
import type { Theme } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  useSeoMeta({
    title: 'Settings - Plebeian Scheduler',
    description: 'Configure your Plebeian Scheduler preferences.',
  });

  const { theme, setTheme } = useTheme();
  const { posts, queues, refreshPosts } = useScheduler();
  const { toast } = useToast();

  const handleExport = () => {
    const data = {
      posts: loadPosts(),
      queues: loadQueues(),
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plebeian-scheduler-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'Scheduler data exported to JSON file.' });
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.posts) savePosts(data.posts);
        if (data.queues) saveQueues(data.queues);
        refreshPosts();
        toast({ title: 'Imported', description: `Imported ${data.posts?.length ?? 0} posts and ${data.queues?.length ?? 0} queues.` });
      } catch {
        toast({ title: 'Import failed', description: 'Invalid JSON file.', variant: 'destructive' });
      }
    };
    input.click();
  };

  const handleClearAll = () => {
    savePosts([]);
    saveQueues([]);
    refreshPosts();
    toast({ title: 'All data cleared' });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your scheduler preferences
        </p>
      </div>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Appearance
          </CardTitle>
          <CardDescription>Choose your preferred theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                    theme === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  )}
                >
                  <Icon className={cn('w-5 h-5', theme === opt.value ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Relay Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="w-4 h-4" />
            Relay Configuration
          </CardTitle>
          <CardDescription>Manage your Nostr relay connections (NIP-65)</CardDescription>
        </CardHeader>
        <CardContent>
          <RelayListManager />
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Management</CardTitle>
          <CardDescription>
            Your drafts, queues, and schedules are stored locally in your browser.
            Export regularly to avoid data loss.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div>
              <p className="text-sm font-medium">{posts.length} posts</p>
              <p className="text-xs text-muted-foreground">{queues.length} queues</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export Data
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleImport}>
              <Upload className="w-4 h-4" />
              Import Data
            </Button>
          </div>

          <Separator />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Trash2 className="w-4 h-4" />
                Clear All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all scheduler data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all drafts, scheduled posts, and queues.
                  Published posts on Nostr relays will not be affected.
                  Consider exporting your data first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Plebeian Scheduler is a free and open-source scheduling tool for Nostr merchants.
            Built for the{' '}
            <a
              href="https://plebeian.market"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Plebeian Market <ExternalLink className="w-3 h-3" />
            </a>{' '}
            ecosystem.
          </p>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Supported NIPs: NIP-01, NIP-07, NIP-19, NIP-40, NIP-46, NIP-90, NIP-92, NIP-99 (read)</p>
            <p>
              Vibed with{' '}
              <a
                href="https://shakespeare.diy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Shakespeare
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
