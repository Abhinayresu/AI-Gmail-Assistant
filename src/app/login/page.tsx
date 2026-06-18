'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles, Mail, Shield, Zap, MessageSquare, ArrowRight, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');

  // Handle Google OAuth callback token extraction
  useEffect(() => {
    async function handleAuthCallback() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
          setLoading(true);
          setStatusText('Connecting your Gmail account...');
          
          const providerToken = session.provider_token;
          const providerRefreshToken = session.provider_refresh_token;
          const expiresIn = session.expires_in;

          console.log('[Login Callback] Found OAuth session. Expiry:', expiresIn);

          // Submit tokens to our secure backend database storage
          const saveRes = await fetch('/api/auth/save-token', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              provider_token: providerToken,
              provider_refresh_token: providerRefreshToken,
              expires_in: expiresIn,
            }),
          });

          if (!saveRes.ok) {
            const errBody = await saveRes.json();
            throw new Error(errBody.error || 'Failed to save authentication credentials');
          }

          setStatusText('Inbox synchronized. Redirecting...');
          router.push('/dashboard');
          router.refresh();
        }
      } catch (err: any) {
        console.error('[Login Callback] Token processing error:', err);
        setErrorText(err.message || 'An error occurred during authentication.');
        setLoading(false);
      }
    }

    handleAuthCallback();
  }, [router, supabase]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorText('');
    setStatusText('Redirecting to Google Secure Login...');
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          scopes: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.compose'
          ].join(' '),
        },
      });

      if (error) throw error;
    } catch (err: any) {
      console.error('[Login Redirect] Trigger error:', err);
      setErrorText(err.message || 'Failed to initiate Google OAuth.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Premium Neon Glowing Backgrounds */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Decorative Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] opacity-35" />

      {/* Header bar */}
      <header className="z-10 flex items-center justify-between h-20 px-6 sm:px-12 border-b border-slate-900 bg-slate-950/20 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            MailMind AI
          </span>
        </div>
        
        <div className="flex items-center gap-4 text-sm font-medium text-slate-400">
          <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-indigo-400" /> OAuth Secure</span>
        </div>
      </header>

      {/* Hero Section */}
      <main className="z-10 flex-1 flex flex-col items-center justify-center max-w-5xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/5 text-xs text-indigo-300 font-medium mb-6 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" /> Next-generation email productivity
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight max-w-3xl mb-6 bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          The Intelligent AI Layer for Your Inbox
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mb-8 leading-relaxed">
          MailMind AI connects securely to your Gmail, automatically categorizing discussions, summarizing threads, generating tone-adjusted drafts, and offering smart Q&A search.
        </p>

        {/* Action / OAuth block */}
        <div className="w-full max-w-md p-6 bg-slate-900/60 border border-slate-800 rounded-2xl glass shadow-2xl mb-12">
          {errorText && (
            <div className="mb-4 p-3 bg-red-950/30 border border-red-500/20 rounded-lg text-xs text-red-400 text-center">
              {errorText}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm font-medium text-slate-300">{statusText || 'Connecting...'}</p>
            </div>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-950 font-semibold px-4 h-12 rounded-xl transition-all duration-200 shadow-md hover:scale-[1.01] active:scale-[0.99]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.69a5.74 5.74 0 0 1-2.49 3.77v3.13h4.03c2.37-2.18 3.715-5.4 3.715-8.73Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-4.03-3.13a7.18 7.18 0 0 1-11.89-3.86H.922v3.23A12 12 0 0 0 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M4.04 14.1a7.15 7.15 0 0 1 0-4.55V6.32H.922a12 12 0 0 0 0 11.01l3.118-3.23Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.93 11.93 0 0 0 12 0 12 12 0 0 0 .92 6.32l3.12 3.23c.73-2.2 2.78-3.8 5.96-3.8Z"
                />
              </svg>
              <span>Sign In with Google Workspace</span>
            </button>
          )}

          <p className="text-[10px] text-slate-500 text-center mt-4 leading-normal">
            By connecting, you authorize MailMind AI to synchronize your email metadata securely. Read our privacy notice for data protection.
          </p>
        </div>

        {/* Feature Grid Section */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left border-t border-slate-900 pt-16 mt-6">
          <Card className="bg-slate-900/30 border-slate-800/80">
            <CardHeader className="p-5 pb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2.5">
                <Zap className="w-4 h-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-200">Smart Categorization</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <CardDescription className="text-xs text-slate-400 leading-relaxed">
                Automatically tags and organizes incoming mails into Work, Finance, Newsletter, and Personal queues using Gemini.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/30 border-slate-800/80">
            <CardHeader className="p-5 pb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2.5">
                <Mail className="w-4 h-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-200">AI Thread Summaries</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <CardDescription className="text-xs text-slate-400 leading-relaxed">
                Condenses extensive back-and-forth threads into action items and bullet summaries, keeping you informed in seconds.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/30 border-slate-800/80">
            <CardHeader className="p-5 pb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-200">Tone-Adjusted Drafts</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <CardDescription className="text-xs text-slate-400 leading-relaxed">
                Compose detailed replies instantly by selecting preset styles: Professional, Formal, Friendly, or Short.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/30 border-slate-800/80">
            <CardHeader className="p-5 pb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2.5">
                <MessageSquare className="w-4 h-4" />
              </div>
              <CardTitle className="text-sm font-bold text-slate-200">Converse with Inbox</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <CardDescription className="text-xs text-slate-400 leading-relaxed">
                Ask questions like "What happened with Acme Corp?" and let the AI search database context and reply with references.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="z-10 h-16 border-t border-slate-900/60 bg-slate-950 flex items-center justify-center text-[10px] text-slate-500">
        &copy; {new Date().getFullYear()} MailMind AI. Built with Next.js 15, Supabase, and Google Gemini.
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex flex-col bg-slate-950 text-slate-100 items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">Loading auth portal...</p>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
