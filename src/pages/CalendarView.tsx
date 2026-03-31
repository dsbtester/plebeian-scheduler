import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  MessageSquare,
  Newspaper,
  Clock,
  PenSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScheduler } from '@/contexts/SchedulerContext';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
} from 'date-fns';
import { cn } from '@/lib/utils';
import type { SchedulerPost } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-primary',
  published: 'bg-emerald-500',
  failed: 'bg-destructive',
  draft: 'bg-muted-foreground',
  queued: 'bg-amber-500',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getPostTitle(post: SchedulerPost): string {
  if (post.postType === 'long' && post.title) return post.title;
  if (post.importedListing?.title) return post.importedListing.title;
  return post.content.slice(0, 40) || 'Empty note';
}

function getPostIcon(post: SchedulerPost) {
  if (post.postType === 'long') return Newspaper;
  if (post.postType === 'promo') return ShoppingBag;
  return MessageSquare;
}

export default function CalendarView() {
  useSeoMeta({
    title: 'Calendar - Plebeian Scheduler',
    description: 'View your scheduled posts in a calendar layout.',
  });

  const { posts } = useScheduler();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Get all days to display in the calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Group posts by date
  const postsByDate = useMemo(() => {
    const map = new Map<string, SchedulerPost[]>();
    for (const post of posts) {
      const ts = post.scheduledAt ?? post.createdAt;
      if (!ts) continue;
      const key = format(new Date(ts * 1000), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [posts]);

  // Get posts for selected date
  const selectedDayPosts = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, 'yyyy-MM-dd');
    return (postsByDate.get(key) ?? []).sort((a, b) => {
      const tsA = a.scheduledAt ?? a.createdAt;
      const tsB = b.scheduledAt ?? b.createdAt;
      return tsA - tsB;
    });
  }, [selectedDate, postsByDate]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground mt-1">
          Visualize your publishing schedule
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Calendar Grid */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <CardTitle className="text-lg font-display">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {calendarDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const dayPosts = postsByDate.get(key) ?? [];
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const today = isToday(day);

                  // Heatmap intensity based on post count
                  const intensity = dayPosts.length === 0 ? '' :
                    dayPosts.length === 1 ? 'bg-primary/10' :
                    dayPosts.length === 2 ? 'bg-primary/20' :
                    dayPosts.length >= 3 ? 'bg-primary/30' : '';

                  return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      'relative min-h-[72px] md:min-h-[88px] p-1.5 text-left bg-card transition-colors',
                      !isCurrentMonth && 'opacity-40',
                      isSelected && 'ring-2 ring-primary ring-inset bg-primary/5',
                      !isSelected && intensity,
                      !isSelected && !intensity && 'hover:bg-secondary/50'
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs font-medium',
                        today && 'bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center',
                        !today && 'px-1'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayPosts.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {dayPosts.slice(0, 3).map(post => (
                          <div
                            key={post.id}
                            className={cn(
                              'h-1.5 rounded-full',
                              STATUS_COLORS[post.status] || 'bg-muted-foreground'
                            )}
                            title={getPostTitle(post)}
                          />
                        ))}
                        {dayPosts.length > 3 && (
                          <span className="text-[10px] text-muted-foreground leading-none">
                            +{dayPosts.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {[
                { label: 'Scheduled', color: 'bg-primary' },
                { label: 'Published', color: 'bg-emerald-500' },
                { label: 'Failed', color: 'bg-destructive' },
                { label: 'Draft', color: 'bg-muted-foreground' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={cn('w-2.5 h-2.5 rounded-full', item.color)} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Day Detail Panel */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Select a day'}
          </h2>

          {!selectedDate ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Click on a day to see scheduled posts
              </CardContent>
            </Card>
          ) : selectedDayPosts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No posts on this day
              </CardContent>
            </Card>
          ) : (
            selectedDayPosts.map(post => {
              const PostIcon = getPostIcon(post);
              const ts = post.scheduledAt ?? post.createdAt;

              return (
                <Card key={post.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
                        STATUS_COLORS[post.status] ? 'bg-primary/15' : 'bg-blue-500/15'
                      )}>
                        <PostIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getPostTitle(post)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(ts * 1000), 'h:mm a')}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {post.status}
                          </Badge>
                        </div>
                      </div>
                      <Link to={`/compose?edit=${post.id}`}>
                        <Button variant="ghost" size="icon" className="w-7 h-7">
                          <PenSquare className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
