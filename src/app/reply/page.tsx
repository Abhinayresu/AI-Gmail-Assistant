'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Sparkles, 
  CornerUpLeft, 
  Copy, 
  Check, 
  Send, 
  RefreshCw, 
  ArrowLeft, 
  Mail,
  AlertCircle,
  Inbox
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import Badge from '@/components/ui/badge';
import { EmailThread, EmailMessage } from '@/types';

function ReplyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const threadId = searchParams.get('threadId');

  const [thread, setThread] = useState<EmailThread | null>(null);
  const [latestEmail, setLatestEmail] = useState<EmailMessage | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Input states
  const [instruction, setInstruction] = useState('');
  const [tone, setTone] = useState<'Professional' | 'Friendly' | 'Formal' | 'Short'>('Professional');
  
  // Output states
  const [generating, setGenerating] = useState(false);
  const [generatedReply, setGeneratedReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    async function loadThreadContext() {
      if (!threadId) return;
      setLoadingContext(true);
      setErrorText('');
      
      try {
        const { data: threadData } = await supabase
          .from('threads')
          .select('*')
          .eq('id', threadId)
          .single();

        if (threadData) {
          setThread(threadData);
          
          // Get the latest email in the thread
          const { data: emailData } = await supabase
            .from('emails')
            .select('*')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          setLatestEmail(emailData);
        }
      } catch (err) {
        console.error('[ReplyPage] Load error:', err);
        setErrorText('Failed to retrieve thread context.');
      } finally {
        setLoadingContext(false);
      }
    }

    loadThreadContext();
  }, [threadId, supabase]);

  const handleGenerate = async () => {
    if (!threadId || !instruction.trim()) return;
    setGenerating(true);
    setGeneratedReply('');
    setErrorText('');
    setSendSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          threadId,
          instruction,
          tone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate draft');

      setGeneratedReply(data.reply);
    } catch (err: any) {
      console.error('[ReplyPage] Generation failure:', err);
      setErrorText(err.message || 'AI generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedReply) return;
    try {
      await navigator.clipboard.writeText(generatedReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ReplyPage] Copy failed:', err);
    }
  };

  const handleSend = async () => {
    if (!threadId || !generatedReply) return;
    setSending(true);
    setErrorText('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/sync/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          threadId,
          replyBody: generatedReply,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reply');

      setSendSuccess(true);
      setGeneratedReply('');
      setInstruction('');
      
      // Redirect back to inbox showing this thread
      setTimeout(() => {
        router.push(`/inbox?threadId=${threadId}`);
        router.refresh();
      }, 1500);
    } catch (err: any) {
      console.error('[ReplyPage] Send error:', err);
      setErrorText(err.message || 'Failed to send email. Verify connection.');
    } finally {
      setSending(false);
    }
  };

  if (!threadId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-sm mx-auto text-center space-y-4">
        <div className="p-3 bg-secondary rounded-2xl text-muted-foreground border border-border">
          <Inbox className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-md font-bold text-foreground">Select email context to reply</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            AI Compose Reply requires an active email thread context. Please go to your Inbox and select a thread.
          </p>
        </div>
        <Button onClick={() => router.push('/inbox')} size="sm" className="font-semibold text-xs h-8">
          Go to Inbox
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none">
      {/* Page header navigation */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Back to inbox</span>
      </div>

      {errorText && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4" /> {errorText}
        </div>
      )}

      {sendSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4" /> Reply sent successfully! Redirecting back to thread...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Pane: Thread Context and Instruction Builder */}
        <div className="space-y-6">
          {/* Email Context Card */}
          <Card className="border-border/80">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-start justify-between gap-4">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5 leading-snug">
                  <Mail className="w-4 h-4 text-muted-foreground" /> Context Email
                </CardTitle>
                {thread && <Badge variant={thread.category}>{thread.category}</Badge>}
              </div>
              {thread && <CardDescription className="text-xs font-medium text-foreground truncate mt-1">{thread.subject}</CardDescription>}
            </CardHeader>
            <CardContent className="pt-4 text-xs space-y-2 text-muted-foreground">
              {loadingContext ? (
                <div className="py-6 text-center animate-pulse">Loading context data...</div>
              ) : latestEmail ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] bg-secondary/40 p-2 rounded-md font-medium">
                    <span>From: <strong className="text-foreground">{latestEmail.sender.split('<')[0]}</strong></span>
                    <span>Received: {new Date(latestEmail.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="line-clamp-4 leading-relaxed whitespace-pre-wrap">{latestEmail.body}</p>
                </div>
              ) : (
                <p className="italic">Context email data missing.</p>
              )}
            </CardContent>
          </Card>

          {/* AI Drafting Config */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Draft Instructions</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">Specify what details to write and choose a tone styling.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Instructions text area */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Prompt Instructions</label>
                <Textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g., Agree to the proposed 2-day deployment delay for Project Alpha, but mention that Dave will run accessibility validations on the staging build during this window."
                  className="h-28 text-xs leading-relaxed"
                />
              </div>

              {/* Tone pills */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Drafting Tone</label>
                <div className="flex flex-wrap gap-2">
                  {(['Professional', 'Friendly', 'Formal', 'Short'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        tone === t
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold'
                          : 'bg-secondary/40 text-muted-foreground border-border/80 hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2">
              <Button
                variant="gradient"
                className="w-full flex items-center justify-center gap-1.5 h-10 font-bold text-xs"
                disabled={generating || !instruction.trim() || loadingContext}
                onClick={handleGenerate}
              >
                <Sparkles className="w-3.5 h-3.5" /> 
                {generating ? 'Drafting Reply...' : 'Generate AI Draft'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Pane: Live AI Preview Output */}
        <Card className="h-full min-h-[420px] flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-indigo-500">
              <Sparkles className="w-4 h-4 animate-pulse-slow" /> AI Generated Draft
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Review and polish the response here before sending.</CardDescription>
          </CardHeader>

          <CardContent className="flex-1 pt-4 overflow-y-auto">
            {generating ? (
              <div className="h-full flex flex-col items-center justify-center space-y-3 py-12 text-muted-foreground">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs font-medium">Gemini is writing the draft...</p>
              </div>
            ) : generatedReply ? (
              <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed border border-border p-4 bg-secondary/10 rounded-xl font-normal text-foreground">
                {generatedReply}
              </div>
            ) : (
              <div className="h-full py-12 flex flex-col items-center justify-center text-center text-muted-foreground/60 space-y-2">
                <CornerUpLeft className="w-8 h-8 text-muted/60" />
                <p className="font-semibold text-xs">Awaiting draft generation</p>
                <p className="text-[10px] max-w-xs leading-normal">Configure instructions on the left and click Generate to see the AI preview draft output.</p>
              </div>
            )}
          </CardContent>

          {generatedReply && (
            <CardFooter className="border-t border-border/40 pt-4 flex gap-3">
              {/* Copy Button */}
              <Button
                variant="outline"
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 font-semibold text-xs border-border"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Text
                  </>
                )}
              </Button>

              {/* Send Button */}
              <Button
                disabled={sending}
                onClick={handleSend}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 font-semibold text-xs bg-primary text-white hover:bg-opacity-95"
              >
                {sending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {sending ? 'Sending...' : 'Send Reply'}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ReplyPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex flex-col items-center justify-center p-8 space-y-3">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-medium">Loading composer interface...</p>
      </div>
    }>
      <ReplyPageContent />
    </Suspense>
  );
}

