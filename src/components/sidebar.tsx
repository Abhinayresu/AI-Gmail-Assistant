'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Inbox, 
  MessageSquare, 
  FolderOpen, 
  Settings, 
  LogOut, 
  Sparkles,
  Menu,
  X,
  RefreshCw,
  Mail,
  Zap,
  Newspaper
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { EmailCategory } from '@/types';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  
  const [user, setUser] = useState<any>(null);
  const [counts, setCounts] = useState<Record<EmailCategory, number>>({
    Work: 0,
    Personal: 0,
    Finance: 0,
    Newsletter: 0,
    Job: 0,
    Notification: 0,
  });
  const [isOpen, setIsOpen] = useState(false); // Mobile toggle state
  const [syncStatus, setSyncStatus] = useState({ gmail: false, gemini: false });

  useEffect(() => {
    async function loadUserData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        
        // Fetch Gmail/Gemini connection status from profile
        const { data: profile } = await supabase
          .from('users')
          .select('google_refresh_token, google_access_token, gemini_api_key')
          .eq('id', user.id)
          .single();

        setSyncStatus({
          gmail: !!profile?.google_refresh_token || !!profile?.google_access_token,
          gemini: true // Default to true as it's enabled on server backend by default
        });

        // Load thread categories count
        const { data: threads } = await supabase
          .from('threads')
          .select('category');
        
        if (threads) {
          const newCounts = {
            Work: 0,
            Personal: 0,
            Finance: 0,
            Newsletter: 0,
            Job: 0,
            Notification: 0,
          };
          threads.forEach((t: any) => {
            const cat = t.category as EmailCategory;
            if (newCounts[cat] !== undefined) {
              newCounts[cat]++;
            }
          });
          setCounts(newCounts);
        }
      }
    }

    loadUserData();
  }, [pathname, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { label: 'Inbox', icon: Inbox, href: '/inbox' },
    { label: 'Compose', icon: Mail, href: '/compose' },
    { label: 'Newsletter Insights', icon: Newspaper, href: '/newsletter-insights' },
    { label: 'AI Chat', icon: MessageSquare, href: '/chat' },
    { label: 'Categories', icon: FolderOpen, href: '/categories' },
    { label: 'Settings', icon: Settings, href: '/settings' },
  ];

  const categoryBadges: Record<EmailCategory, string> = {
    Work: 'Work',
    Personal: 'Personal',
    Finance: 'Finance',
    Newsletter: 'Newsletter',
    Job: 'Job',
    Notification: 'Notification',
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card border-r border-border text-foreground">
      {/* Brand Logo */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xs">
            <Sparkles className="w-4 h-4 animate-pulse-slow" />
          </div>
          <span className="text-md font-bold tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            MailMind AI
          </span>
        </Link>
        {isOpen && (
          <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 rounded-md hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/10 text-primary border-l-2 border-primary pl-2.5'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Categories Quick Links */}
        <div className="space-y-2">
          <h4 className="px-3 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            Categories
          </h4>
          <div className="space-y-1">
            {(Object.keys(categoryBadges) as EmailCategory[]).map((cat) => {
              const count = counts[cat] || 0;
              return (
                <Link
                  key={cat}
                  href={`/inbox?category=${cat}`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      cat === 'Work' ? 'bg-blue-500' :
                      cat === 'Personal' ? 'bg-emerald-500' :
                      cat === 'Finance' ? 'bg-amber-500' :
                      cat === 'Newsletter' ? 'bg-purple-500' :
                      cat === 'Job' ? 'bg-indigo-500' : 'bg-rose-500'
                    }`} />
                    <span>{cat}</span>
                  </div>
                  {count > 0 && (
                    <Badge variant={cat} className="text-[10px] px-1.5 py-0">
                      {count}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* System API Status */}
        <div className="p-3 bg-secondary/50 border border-border/60 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Gmail Status
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${syncStatus.gmail ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
              <span className="font-semibold text-[10px]">{syncStatus.gmail ? 'Connected' : 'Offline'}</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Gemini API
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="font-semibold text-[10px]">Active</span>
            </span>
          </div>
        </div>
      </div>

      {/* User Session Footer */}
      {user && (
        <div className="p-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-9 h-9 rounded-full border border-border"
              />
            ) : (
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-500 font-semibold border border-indigo-500/20">
                {user.email?.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col text-left overflow-hidden">
              <span className="text-sm font-semibold truncate leading-tight">
                {user.user_metadata?.full_name || 'MailMind User'}
              </span>
              <span className="text-[10px] text-muted-foreground truncate">
                {user.email}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign Out"
            className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-secondary/80 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Burger Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border flex items-center justify-between px-4 z-40">
        <button onClick={() => setIsOpen(true)} className="p-1 rounded-md hover:bg-secondary">
          <Menu className="w-6 h-6" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
            MailMind AI
          </span>
        </Link>
        <div className="w-8" /> {/* Balance spacer */}
      </div>

      {/* Sidebar Desktop view */}
      <div className="hidden lg:block w-64 h-screen flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar Overlay Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative w-64 max-w-xs h-full animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

