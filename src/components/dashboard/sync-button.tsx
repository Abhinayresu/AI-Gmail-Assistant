'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase';

export default function SyncTriggerButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSync = async () => {
    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        const res = await fetch('/api/sync', { 
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });
        if (res.ok) {
          router.refresh();
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <Button
        variant="gradient"
        size="lg"
        onClick={handleSync}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 h-12 text-sm font-semibold rounded-xl"
      >
        <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Synchronizing Mailbox...' : 'Synchronize Inbox Now'}
      </Button>
      <button
        onClick={handleSignOut}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline cursor-pointer"
      >
        Stuck? Sign Out and Reconnect Account
      </button>
    </div>
  );
}
