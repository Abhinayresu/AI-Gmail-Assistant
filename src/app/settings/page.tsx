'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Settings, 
  User, 
  Mail, 
  Zap, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  AlertCircle,
  ShieldAlert,
  Key,
  Database
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase';
import { UserProfile } from '@/types';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  // Settings States
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [customGeminiKey, setCustomGeminiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  
  // Status flags
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; text: string } | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data as UserProfile);
        // Load custom key from user row if available (retrieve from local storage or database if saved)
        const savedKey = (data as any).gemini_api_key || '';
        setCustomGeminiKey(savedKey);
      }
    } catch (err) {
      console.error('[SettingsPage] Fetch profile failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserProfile();
  }, [supabase]);

  // Disconnect Google OAuth
  const handleDisconnectGmail = async () => {
    if (!profile) return;
    setActionMsg(null);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          google_access_token: null,
          google_refresh_token: null,
          google_token_expires_at: null,
          last_synced_at: null
        })
        .eq('id', profile.id);

      if (error) throw error;
      
      setActionMsg({ type: 'success', text: 'Gmail account disconnected successfully.' });
      loadUserProfile();
    } catch (err: any) {
      console.error('[Settings] Disconnect error:', err);
      setActionMsg({ type: 'error', text: err.message || 'Failed to disconnect Gmail.' });
    }
  };

  // Re-connect Gmail by signing in again
  const handleReconnectGmail = async () => {
    try {
      await supabase.auth.signInWithOAuth({
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
    } catch (err: any) {
      console.error('[Settings] Reconnect trigger error:', err);
    }
  };

  // Save Custom Gemini Key
  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingKey(true);
    setActionMsg(null);

    try {
      // Save key in database
      const { error } = await supabase
        .from('users')
        .update({ gemini_api_key: customGeminiKey.trim() })
        .eq('id', profile.id);

      if (error) throw error;

      setActionMsg({ type: 'success', text: 'Gemini Developer Key configuration updated.' });
    } catch (err: any) {
      console.error('[Settings] Save key error:', err);
      setActionMsg({ type: 'error', text: err.message || 'Failed to update Gemini Key.' });
    } finally {
      setSavingKey(false);
    }
  };

  // Manual Trigger Force Sync
  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/sync', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Sync service failed');

      setSyncResult({
        success: true,
        text: `Sync completed: downloaded ${data.emailsSynced} new messages and updated ${data.threadsUpdated} briefings.`,
      });
      loadUserProfile();
    } catch (err: any) {
      console.error('[Settings] Sync action failure:', err);
      setSyncResult({
        success: false,
        text: err.message || 'Gmail Sync failed. Check connection settings.',
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        <span>Loading settings configs...</span>
      </div>
    );
  }

  const isGmailLinked = !!profile?.google_refresh_token || !!profile?.google_access_token;

  return (
    <div className="space-y-6 max-w-4xl mx-auto select-none">
      {/* Intro */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Settings Panel</h2>
        <p className="text-xs text-muted-foreground mt-1">Configure profile connections, custom Gemini API keys, and inbox synchronicities.</p>
      </div>

      {actionMsg && (
        <div className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200 ${
          actionMsg.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {actionMsg.text}
        </div>
      )}

      {syncResult && (
        <div className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200 ${
          syncResult.success 
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
        }`}>
          {syncResult.success ? <CheckCircle className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          {syncResult.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Details Card */}
        <Card className="md:col-span-1 h-fit">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <User className="w-4.5 h-4.5 text-muted-foreground" /> Profile Info
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 text-center space-y-4">
            <div className="flex justify-center">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full border border-border"
                />
              ) : (
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/20 text-lg">
                  {profile?.email?.substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-md font-bold text-foreground leading-snug">{profile?.name || 'MailMind User'}</h3>
              <p className="text-xs text-muted-foreground font-mono truncate">{profile?.email}</p>
            </div>
            
            <div className="text-[10px] text-muted-foreground text-left bg-secondary/40 p-2.5 rounded-lg border border-border/60">
              <div className="flex justify-between py-1">
                <span>Account Created:</span>
                <span className="font-semibold">{profile ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Last Synced:</span>
                <span className="font-semibold">{profile?.last_synced_at ? new Date(profile.last_synced_at).toLocaleTimeString() : 'Never'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integration Credentials Card */}
        <div className="md:col-span-2 space-y-6">
          {/* Integration check statuses */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Database className="w-4.5 h-4.5 text-muted-foreground" /> Connections
              </CardTitle>
              <CardDescription className="text-xs">Connection checkpoints for primary services.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Gmail status check */}
              <div className="flex items-center justify-between p-3 bg-secondary/35 border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isGmailLinked ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    <Mail className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-foreground">Gmail API Integration</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isGmailLinked ? 'Linked and authorized to access mailbox.' : 'Offline. Relies on OAuth connectivity.'}
                    </p>
                  </div>
                </div>

                <Button
                  variant={isGmailLinked ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={isGmailLinked ? handleDisconnectGmail : handleReconnectGmail}
                  className="font-semibold text-xs h-8 px-3.5"
                >
                  {isGmailLinked ? 'Disconnect' : 'Connect Gmail'}
                </Button>
              </div>

              {/* Gemini API key overrides */}
              <form onSubmit={handleSaveGeminiKey} className="space-y-4 border-t border-border/40 pt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-primary" /> Custom Gemini API Key (Optional)
                  </label>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    By default, the server uses the system default developer key. Input a custom key below to override settings for your user profile session.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={customGeminiKey}
                      onChange={(e) => setCustomGeminiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="text-xs flex-1 h-9"
                    />
                    <Button 
                      type="submit" 
                      disabled={savingKey}
                      className="text-xs h-9 px-4 font-semibold"
                    >
                      {savingKey ? 'Saving...' : 'Save Key'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Sync control Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-muted-foreground" /> Manual Synchronization
              </CardTitle>
              <CardDescription className="text-xs">Force synchronization metadata sweeps.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 text-xs text-muted-foreground leading-relaxed space-y-4">
              <p>
                Triggering the sync fetches the latest un-synced emails from Google servers, runs classifications, clusters threads, and updates summaries.
              </p>
              
              <div className="flex justify-start">
                <Button
                  onClick={handleSyncNow}
                  disabled={syncing || !isGmailLinked}
                  className="flex items-center gap-1.5 h-10 px-5 font-semibold text-xs bg-primary text-white hover:bg-opacity-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Synchronizing Mailbox...' : 'Force Sync Now'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

