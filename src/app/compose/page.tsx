'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Sparkles, 
  Send, 
  FileText, 
  Copy, 
  Check, 
  ArrowLeft, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase';

export default function ComposePage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  // Inputs
  const [recipient, setRecipient] = useState('');
  const [instruction, setInstruction] = useState('');
  const [tone, setTone] = useState<'Professional' | 'Friendly' | 'Formal' | 'Casual' | 'Follow-Up'>('Professional');
  const [length, setLength] = useState<'Short' | 'Medium' | 'Long'>('Medium');

  // Outputs (Editable by user)
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // States
  const [generating, setGenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) {
      setErrorText('Please enter instructions for the AI.');
      return;
    }

    setGenerating(true);
    setErrorText('');
    setSuccessText('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          instruction,
          tone,
          length,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate draft');

      setSubject(data.subject);
      setBody(data.body);
      toast({
        title: 'Draft Generated',
        description: 'AI successfully composed subject and body based on your parameters.',
        variant: 'success',
      });
    } catch (err: any) {
      console.error('[ComposePage] Generation error:', err);
      setErrorText(err.message || 'Failed to generate AI email draft.');
      toast({
        title: 'Generation Failed',
        description: err.message || 'AI generation failed.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!recipient.trim()) {
      setErrorText('Please enter a recipient email.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setErrorText('Please generate or enter email content before saving.');
      return;
    }

    setSavingDraft(true);
    setErrorText('');
    setSuccessText('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/compose/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          to: recipient,
          subject,
          emailBody: body,
          action: 'draft',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save draft');

      setSuccessText('Gmail Draft saved successfully!');
      toast({
        title: 'Draft Saved',
        description: 'The email draft has been successfully synchronized to your Gmail account.',
        variant: 'success',
      });
    } catch (err: any) {
      console.error('[ComposePage] Save Draft error:', err);
      setErrorText(err.message || 'Failed to save draft in Gmail.');
      toast({
        title: 'Save Draft Failed',
        description: err.message || 'Failed to save draft in Gmail.',
        variant: 'destructive',
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSend = async () => {
    if (!recipient.trim()) {
      setErrorText('Please enter a recipient email.');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setErrorText('Please generate or enter email content before sending.');
      return;
    }

    setSending(true);
    setErrorText('');
    setSuccessText('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/compose/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          to: recipient,
          subject,
          emailBody: body,
          action: 'send',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');

      setSuccessText('Email sent successfully! Redirecting to dashboard...');
      toast({
        title: 'Email Sent',
        description: 'Your email has been sent and recorded in your workspace history.',
        variant: 'success',
      });

      // Clear inputs
      setRecipient('');
      setInstruction('');
      setSubject('');
      setBody('');

      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 2000);
    } catch (err: any) {
      console.error('[ComposePage] Send error:', err);
      setErrorText(err.message || 'Failed to send email. Verify connection settings.');
      toast({
        title: 'Sending Failed',
        description: err.message || 'Failed to dispatch email.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ComposePage] Copy error:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 select-none">
      {/* Top Breadcrumb Nav */}
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()} 
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Go Back
        </span>
      </div>

      {errorText && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4" />
          {errorText}
        </div>
      )}

      {successText && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          {successText}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Side: Parameters Form */}
        <div className="space-y-6">
          <Card className="border-border/80">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5 leading-snug">
                <Sparkles className="w-4 h-4 text-primary" /> AI Compose Settings
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Set up your email parameters and let Gemini write the draft.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Recipient Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  To (Recipient Email)
                </label>
                <Input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="name@example.com"
                  className="text-xs bg-secondary/20 h-10 border-border"
                />
              </div>

              {/* Prompt Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Drafting Instructions
                </label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g., Email Sarah to coordinate the next developer sync. Request if Thursday at 10 AM works. Be concise."
                  className="w-full h-28 p-3 rounded-lg border border-border bg-secondary/20 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/45"
                />
              </div>

              {/* Tone Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Email Tone
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['Professional', 'Friendly', 'Formal', 'Casual', 'Follow-Up'] as const).map((t) => (
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

              {/* Length Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Length Style
                </label>
                <div className="flex gap-2">
                  {(['Short', 'Medium', 'Long'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLength(l)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        length === l
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold'
                          : 'bg-secondary/40 text-muted-foreground border-border/80 hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2 border-t border-border/40">
              <Button
                variant="gradient"
                className="w-full flex items-center justify-center gap-1.5 h-10 font-bold text-xs"
                disabled={generating || !instruction.trim()}
                onClick={handleGenerate}
              >
                {generating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generating ? 'Drafting Content...' : 'Generate AI Email'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Side: Editable Preview Card */}
        <Card className="h-full min-h-[460px] flex flex-col justify-between border-border/80">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-indigo-500">
              <Mail className="w-4 h-4" /> Composed Email Draft (Editable)
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Review, edit the subject or body parameters directly before executing.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 pt-4 space-y-4 overflow-y-auto">
            {generating ? (
              <div className="h-full flex flex-col items-center justify-center space-y-3 py-20 text-muted-foreground">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs font-medium">Gemini is generating the subject and body...</p>
              </div>
            ) : subject || body ? (
              <div className="space-y-4">
                {/* Editable Subject */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                    Subject Line
                  </label>
                  <Input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="text-xs sm:text-sm font-semibold bg-secondary/10 h-10 border-border"
                  />
                </div>

                {/* Editable Body */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                    Email Body Content
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full h-60 p-3 rounded-lg border border-border bg-secondary/10 text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary/45 font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="h-full py-20 flex flex-col items-center justify-center text-center text-muted-foreground/60 space-y-2">
                <FileText className="w-8 h-8 text-muted/60" />
                <p className="font-semibold text-xs">No email content generated yet</p>
                <p className="text-[10px] max-w-xs leading-normal">
                  Configure the settings on the left side panel and click "Generate AI Email" to populate this workspace.
                </p>
              </div>
            )}
          </CardContent>

          {(subject || body) && (
            <CardFooter className="border-t border-border/40 pt-4 flex gap-3">
              {/* Copy Draft button */}
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

              {/* Save Draft Button */}
              <Button
                variant="outline"
                disabled={savingDraft || sending}
                onClick={handleSaveDraft}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 font-semibold text-xs border-border"
              >
                {savingDraft ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                {savingDraft ? 'Saving...' : 'Save Draft'}
              </Button>

              {/* Send Button */}
              <Button
                disabled={sending || savingDraft}
                onClick={handleSend}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 font-bold text-xs bg-primary text-white hover:bg-opacity-95"
              >
                {sending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {sending ? 'Sending...' : 'Send Email'}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
