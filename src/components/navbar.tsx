'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Sun, Moon, Search, RefreshCw, Sparkles, Check, AlertCircle } from 'lucide-react';
import { useTheme } from './theme-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Badge from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [searchVal, setSearchVal] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Sync state search field with URL parameters
  useEffect(() => {
    setSearchVal(searchParams.get('search') || '');
  }, [searchParams]);

  // Map route to breadcrumb label
  const getPageLabel = () => {
    if (pathname.startsWith('/dashboard')) return 'Dashboard';
    if (pathname.startsWith('/inbox')) return 'Inbox';
    if (pathname.startsWith('/chat')) return 'AI Chat Assistant';
    if (pathname.startsWith('/categories')) return 'Categories Manager';
    if (pathname.startsWith('/settings')) return 'Settings';
    if (pathname.startsWith('/reply')) return 'AI Compose Reply';
    return 'MailMind AI';
  };

  // Trigger search execution
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSearch = searchVal.trim();
    if (cleanSearch) {
      router.push(`/inbox?search=${encodeURIComponent(cleanSearch)}`);
    } else {
      router.push('/inbox');
    }
  };

  // Perform Gmail Sync
  const handleForceSync = async () => {
    if (syncing) return;
    setSyncing(true);

    toast({
      title: 'Syncing started',
      description: 'Connecting to Gmail API and checking for new messages...',
      variant: 'default',
    });

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete synchronization');
      }

      toast({
        title: 'Sync completed',
        description: `Successfully synchronized and categorized ${data.emailsSynced} new email(s).`,
        variant: 'success',
      });
      
      // Refresh current route to display new emails
      router.refresh();
    } catch (err: any) {
      console.error('[Navbar Sync] Sync failure:', err);
      toast({
        title: 'Sync failed',
        description: err.message || 'Gmail Sync failed. Please check your connection or credentials.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header className="h-16 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-6 z-30 mt-16 lg:mt-0">
      {/* Page Label Breadcrumb */}
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground hidden sm:block">
          {getPageLabel()}
        </h2>
        {syncing && (
          <Badge className="bg-primary/10 text-primary border-primary/25 text-[10px] animate-pulse flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Syncing...
          </Badge>
        )}
      </div>

      {/* Center Global Search */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md mx-4 relative hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          placeholder="Search sender, subjects, or body..."
          className="pl-9 bg-secondary/40 border-border/80 focus-visible:ring-primary/45"
        />
      </form>

      {/* Right Toolbar Controls */}
      <div className="flex items-center gap-2">
        {/* Sync Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleForceSync}
          disabled={syncing}
          className="flex items-center gap-1.5 font-medium h-9 text-xs sm:text-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-primary' : ''}`} />
          <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync Mail'}</span>
        </Button>

        {/* Theme Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </header>
  );
}
