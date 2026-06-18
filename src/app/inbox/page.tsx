'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Inbox, Filter, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import ThreadPreview from '@/components/inbox/thread-preview';
import { EmailThread, EmailCategory } from '@/types';

function InboxPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const urlCategory = searchParams.get('category') as EmailCategory | null;
  const urlSearch = searchParams.get('search') || '';
  const urlThreadId = searchParams.get('threadId') || '';

  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory | 'All'>(urlCategory || 'All');
  const [searchVal, setSearchVal] = useState(urlSearch);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(urlThreadId || null);

  // Load threads lists dynamically based on category, search, and session updates
  useEffect(() => {
    async function loadThreads() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        // Base query
        let query = supabase
          .from('threads')
          .select('*, emails(*)')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (selectedCategory && selectedCategory !== 'All') {
          query = query.eq('category', selectedCategory);
        }

        if (searchVal.trim()) {
          const searchWord = searchVal.trim();
          
          // Join query or keyword match: First fetch matching email bodies to locate thread matches
          const { data: matchedEmails } = await supabase
            .from('emails')
            .select('thread_id')
            .or(`body.ilike.%${searchWord}%,sender.ilike.%${searchWord}%,receiver.ilike.%${searchWord}%`);

          const threadIds = matchedEmails?.map(e => e.thread_id) || [];
          
          if (threadIds.length > 0) {
            // Match subjects or match email thread references
            query = query.or(`subject.ilike.%${searchWord}%,id.in.(${threadIds.map(id => `"${id}"`).join(',')})`);
          } else {
            // Match subjects only
            query = query.ilike('subject', `%${searchWord}%`);
          }
        }

        const { data } = await query;
        setThreads((data || []) as EmailThread[]);
        
        // Select first thread by default on desktop if none selected
        if (data && data.length > 0 && !activeThreadId && window.innerWidth >= 1024) {
          setActiveThreadId(data[0].id);
        }
      } catch (err) {
        console.error('[InboxPage] Failed to load threads:', err);
      } finally {
        setLoading(false);
      }
    }

    loadThreads();
  }, [selectedCategory, searchVal, router, supabase]);

  // Synchronize component state with changes in search URL parameters
  useEffect(() => {
    if (urlCategory) setSelectedCategory(urlCategory);
    if (urlSearch !== undefined) setSearchVal(urlSearch);
    if (urlThreadId) setActiveThreadId(urlThreadId);
  }, [urlCategory, urlSearch, urlThreadId]);

  const categories: Array<EmailCategory | 'All'> = [
    'All',
    'Work',
    'Personal',
    'Finance',
    'Newsletter',
    'Job',
    'Notification',
  ];

  const handleThreadSelect = (threadId: string) => {
    setActiveThreadId(threadId);
    // Optional: push threadId to URL for direct link saving
    const params = new URLSearchParams(window.location.search);
    params.set('threadId', threadId);
    router.replace(`/inbox?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setSelectedCategory('All');
    setSearchVal('');
    setActiveThreadId(null);
    router.push('/inbox');
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const params = new URLSearchParams(window.location.search);
      if (searchVal.trim()) {
        params.set('search', searchVal.trim());
      } else {
        params.delete('search');
      }
      router.replace(`/inbox?${params.toString()}`);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] lg:h-[calc(100vh-6rem)] -m-4 sm:-m-6 overflow-hidden">
      {/* Category Tabs & Quick Search row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:px-6 border-b border-border bg-card/40 backdrop-blur-xs flex-shrink-0">
        {/* Category Tabs */}
        <div className="flex items-center overflow-x-auto gap-1.5 no-scrollbar py-0.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                const params = new URLSearchParams(window.location.search);
                if (cat === 'All') {
                  params.delete('category');
                } else {
                  params.set('category', cat);
                }
                router.replace(`/inbox?${params.toString()}`);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all select-none ${
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                  : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input for Mobile/Tablet */}
        <div className="relative w-full sm:w-64 md:hidden">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={handleSearchKeyPress}
            placeholder="Search email text..."
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* Main Inbox Workspace Pane */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Email Thread List */}
        <div className={`w-full lg:w-[40%] flex flex-col h-full border-r border-border bg-card/5 ${
          activeThreadId && 'hidden lg:flex'
        }`}>
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground font-medium">Querying mailbox database...</p>
            </div>
          ) : threads.length === 0 ? (
            // Empty search or category filter results state
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-sm mx-auto">
              <div className="p-3 bg-secondary rounded-2xl text-muted-foreground/60 border border-border">
                <Inbox className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-foreground">No conversations found</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We couldn't find any email threads matching your current criteria or query filter.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleClearFilters} className="font-semibold text-xs h-8">
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {threads.map((thread) => {
                const isActive = activeThreadId === thread.id;
                const emailCount = thread.emails?.length || 0;
                
                // Get sender name snippet from latest email in thread
                const latestEmail = thread.emails && thread.emails.length > 0 
                  ? thread.emails[thread.emails.length - 1] 
                  : null;
                const senderName = latestEmail 
                  ? latestEmail.sender.split('<')[0].trim() || latestEmail.sender 
                  : 'Unknown';
                  
                const snippet = latestEmail 
                  ? latestEmail.body.substring(0, 85) + (latestEmail.body.length > 85 ? '...' : '')
                  : '(No Content)';

                return (
                  <div
                    key={thread.id}
                    onClick={() => handleThreadSelect(thread.id)}
                    className={`p-4 flex flex-col text-left gap-2 cursor-pointer transition-colors duration-150 select-none ${
                      isActive 
                        ? 'bg-primary/5 border-l-4 border-primary pl-3' 
                        : 'hover:bg-secondary/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-foreground truncate max-w-[120px]">
                          {senderName}
                        </span>
                        {emailCount > 1 && (
                          <span className="text-[10px] bg-secondary px-1.5 py-0.2 rounded-sm text-muted-foreground font-semibold">
                            {emailCount}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {new Date(thread.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <h4 className="text-xs sm:text-sm font-semibold text-foreground line-clamp-1 leading-tight">
                      {thread.subject}
                    </h4>

                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {snippet}
                    </p>

                    <div className="flex items-center justify-between mt-1">
                      <Badge variant={thread.category}>{thread.category}</Badge>
                      {thread.summary && (
                        <span className="text-[10px] text-indigo-500 font-bold flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" /> Summarized
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Thread Full Preview */}
        <div className={`w-full lg:w-[60%] h-full p-4 sm:p-6 ${
          !activeThreadId && 'hidden lg:flex'
        }`}>
          {activeThreadId ? (
            <ThreadPreview
              threadId={activeThreadId}
              onClose={() => {
                setActiveThreadId(null);
                const params = new URLSearchParams(window.location.search);
                params.delete('threadId');
                router.replace(`/inbox?${params.toString()}`);
              }}
            />
          ) : (
            // Select thread prompt state
            <div className="hidden lg:flex flex-col items-center justify-center h-full w-full border border-border/80 bg-card/20 rounded-xl border-dashed text-center text-muted-foreground p-8 space-y-3">
              <Inbox className="w-10 h-10 text-muted/60" />
              <p className="font-semibold text-sm">Select an email thread</p>
              <p className="text-xs max-w-xs leading-relaxed">
                Click a conversation in the thread list to view its contents, summaries, and write replies.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex flex-col items-center justify-center p-8 space-y-3">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-medium">Loading inbox panel...</p>
      </div>
    }>
      <InboxPageContent />
    </Suspense>
  );
}

