'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Sparkles, 
  CornerUpLeft, 
  Trash2, 
  FolderMinus, 
  User, 
  Clock, 
  ArrowLeft,
  MailOpen,
  RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Badge from '@/components/ui/badge';
import { createClient } from '@/lib/supabase';
import { EmailThread, EmailMessage } from '@/types';

interface PreviewProps {
  threadId: string;
  onClose?: () => void;
}

export default function ThreadPreview({ threadId, onClose }: PreviewProps) {
  const supabase = createClient();
  const [thread, setThread] = useState<EmailThread | null>(null);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reSummarizing, setReSummarizing] = useState(false);

  const loadThreadDetails = async () => {
    setLoading(true);
    try {
      // Fetch thread details
      const { data: threadData } = await supabase
        .from('threads')
        .select('*')
        .eq('id', threadId)
        .single();

      if (threadData) {
        setThread(threadData);
        
        // Fetch emails in thread ordered by date
        const { data: emailData } = await supabase
          .from('emails')
          .select('*')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true });

        setEmails(emailData || []);
      }
    } catch (err) {
      console.error('[ThreadPreview] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (threadId) {
      loadThreadDetails();
    }
  }, [threadId]);

  const handleRegenerateSummary = async () => {
    if (reSummarizing) return;
    setReSummarizing(true);
    try {
      // Trigger sync with the API to recompute this thread summary
      const { data: { session } } = await supabase.auth.getSession();
      const syncRes = await fetch(`/api/sync?thread_id=${threadId}`, { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      if (syncRes.ok) {
        await loadThreadDetails();
      }
    } catch (err) {
      console.error('[ThreadPreview] Summary rebuild failed:', err);
    } finally {
      setReSummarizing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 space-y-3">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-medium text-muted-foreground">Reading thread history...</p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-2 text-muted-foreground">
        <MailOpen className="w-10 h-10 text-muted/60" />
        <p className="font-semibold text-sm">Thread not found</p>
        <p className="text-xs">The selected conversation could not be loaded from database.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl shadow-xs overflow-hidden">
      {/* Thread Header Controls */}
      <div className="flex items-center justify-between p-4 border-b border-border/80 bg-secondary/20">
        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <Badge variant={thread.category}>{thread.category}</Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Link href={`/reply?threadId=${thread.id}`}>
            <Button size="sm" className="flex items-center gap-1.5 h-8 font-semibold text-xs bg-primary text-white hover:bg-opacity-95">
              <CornerUpLeft className="w-3.5 h-3.5" /> AI Reply
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Preview layout */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Title */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-foreground leading-tight tracking-tight">
            {thread.subject}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" /> 
            <span>Started {new Date(thread.created_at).toLocaleString()}</span>
          </div>
        </div>

        {/* AI Summary Block */}
        <div className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10/30 border border-indigo-500/20 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-indigo-500 font-semibold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 animate-pulse-slow" /> AI Generated Summary
            </div>
            <button 
              onClick={handleRegenerateSummary}
              disabled={reSummarizing}
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${reSummarizing ? 'animate-spin' : ''}`} />
              Re-summarize
            </button>
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
            {thread.summary ? (
              thread.summary.split('\n').map((bullet, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="text-indigo-500 font-bold mt-0.5">•</span>
                  <span>{bullet.replace(/^•\s*/, '')}</span>
                </div>
              ))
            ) : (
              <p className="italic text-[11px] text-muted-foreground/85">No summary available. Synchronize mail to trigger Gemini summarizations.</p>
            )}
          </div>
        </div>

        {/* Sequential Conversation view */}
        <div className="space-y-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-1">
            Conversation History ({emails.length})
          </h3>
          
          <div className="space-y-4">
            {emails.map((email) => {
              const senderParts = email.sender.split('<');
              const senderName = senderParts[0].trim() || email.sender;
              const senderEmail = senderParts[1] ? senderParts[1].replace('>', '') : '';

              return (
                <Card key={email.id} className="border-border/60 shadow-none">
                  {/* Sender Header */}
                  <div className="p-4 border-b border-border/40 flex items-start justify-between gap-4 bg-secondary/5">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-foreground text-xs font-bold border border-border">
                        {senderName.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold text-foreground leading-snug">
                          {senderName}
                        </div>
                        {senderEmail && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {senderEmail}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(email.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* Body Text */}
                  <CardContent className="p-4">
                    <div className="text-xs sm:text-sm text-foreground whitespace-pre-wrap leading-relaxed font-normal">
                      {email.body}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

