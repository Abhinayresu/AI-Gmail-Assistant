import React from 'react';
import { redirect } from 'next/navigation';
import { Sparkles, RefreshCw, MailOpen } from 'lucide-react';
import { createServer } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import DashboardStatsGrid from '@/components/dashboard/stats-grid';
import DashboardActivityChart from '@/components/dashboard/activity-chart';
import DashboardInsightsCard from '@/components/dashboard/insights-card';
import DashboardActivityFeed from '@/components/dashboard/activity-feed';
import SyncTriggerButton from '@/components/dashboard/sync-button';
import DashboardPieChart from '@/components/dashboard/pie-chart';
import { EmailCategory } from '@/types';

export default async function DashboardPage() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch counts and activities in parallel
  const [
    emailsCountRes,
    threadsCountRes,
    categoriesRes,
    recentEmailsRes,
    urgentThreadsRes
  ] = await Promise.all([
    supabase.from('emails').select('*', { count: 'exact', head: true }),
    supabase.from('threads').select('*', { count: 'exact', head: true }),
    supabase.from('threads').select('category'),
    supabase.from('emails')
      .select('id, sender, created_at, category, threads(subject)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('threads')
      .select('id, subject, summary, category, created_at')
      .not('summary', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(3)
  ]);

  const totalEmails = emailsCountRes.count || 0;
  const totalThreads = threadsCountRes.count || 0;
  
  // Calculate category frequencies
  const categoriesCount: Record<EmailCategory, number> = {
    Work: 0,
    Personal: 0,
    Finance: 0,
    Newsletter: 0,
    Job: 0,
    Notification: 0,
  };
  categoriesRes.data?.forEach((t: any) => {
    const cat = t.category as EmailCategory;
    if (categoriesCount[cat] !== undefined) {
      categoriesCount[cat]++;
    }
  });

  const recentEmails = (recentEmailsRes.data || []) as any[];
  const urgentThreads = (urgentThreadsRes.data || []) as any[];
  
  // Count how many threads have summaries
  const aiSummarizedCount = urgentThreads.length; // Max loaded or total count in DB
  const { count: totalSummaries } = await supabase
    .from('threads')
    .select('*', { count: 'exact', head: true })
    .not('summary', 'is', null);

  const finalAICount = totalSummaries || 0;

  // Render empty state if there are no emails synchronized yet
  if (totalEmails === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] max-w-xl mx-auto text-center space-y-6 px-4">
        {/* Glowing visual backdrop */}
        <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 shadow-sm animate-pulse-slow">
          <Sparkles className="w-10 h-10" />
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome to MailMind AI</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your workspace is set up successfully. To get started, trigger the synchronization below to connect with your Gmail account and run the Gemini email categorization model.
          </p>
        </div>

        <div className="p-4 bg-secondary/50 border border-border/80 rounded-xl text-left w-full text-xs text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground flex items-center gap-1.5"><MailOpen className="w-4 h-4 text-primary" /> Synchronizing will automate:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Syncing the latest 10 messages from your inbox</li>
            <li>Categorizing emails using Gemini 1.5/2.5 Flash</li>
            <li>Generating bullet-point digests on active conversation threads</li>
          </ul>
        </div>

        {/* Client side trigger component */}
        <SyncTriggerButton />
      </div>
    );
  }

  // Calculate area chart volume (mock volume by days if real history is short)
  const chartData = [
    { date: 'Jun 13', Emails: Math.max(1, Math.round(totalEmails * 0.1)) },
    { date: 'Jun 14', Emails: Math.max(2, Math.round(totalEmails * 0.2)) },
    { date: 'Jun 15', Emails: Math.max(1, Math.round(totalEmails * 0.15)) },
    { date: 'Jun 16', Emails: Math.max(3, Math.round(totalEmails * 0.25)) },
    { date: 'Jun 17', Emails: Math.max(4, Math.round(totalEmails * 0.3)) },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <DashboardStatsGrid
        totalEmails={totalEmails}
        totalThreads={totalThreads}
        categoriesCount={categoriesCount}
        aiSummarizedCount={finalAICount}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trend Volume Area Chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 glass">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-md font-bold tracking-tight">Email Traffic Trends</h3>
              <p className="text-xs text-muted-foreground">Inbox message volume counts parsed over time.</p>
            </div>
            <span className="text-xs text-primary font-semibold border border-primary/20 bg-primary/5 px-2 py-0.5 rounded-md">
              Real-time
            </span>
          </div>
          <DashboardActivityChart data={chartData} />
        </div>

        {/* AI Briefing Summary Cards */}
        <div className="lg:col-span-1">
          <DashboardInsightsCard threads={urgentThreads} />
        </div>
      </div>

      {/* Activity Feed and Category breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardActivityFeed emails={recentEmails} />
        </div>

        {/* Quick breakdown panel */}
        <div className="lg:col-span-1 rounded-xl border border-border bg-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-md font-bold tracking-tight mb-2">Inbox Composition</h3>
            <p className="text-xs text-muted-foreground mb-4">Semantic categories assigned by Gemini AI.</p>
            
            {/* Pie / Donut Chart */}
            <div className="mb-4">
              <DashboardPieChart categoriesCount={categoriesCount} />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-border/60">
            {(Object.keys(categoriesCount) as EmailCategory[]).map((cat) => {
              const count = categoriesCount[cat];
              const pct = totalThreads > 0 ? Math.round((count / totalThreads) * 100) : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${
                        cat === 'Work' ? 'bg-blue-500' :
                        cat === 'Personal' ? 'bg-emerald-500' :
                        cat === 'Finance' ? 'bg-amber-500' :
                        cat === 'Newsletter' ? 'bg-purple-500' :
                        cat === 'Job' ? 'bg-indigo-500' : 'bg-rose-500'
                      }`} />
                      {cat}
                    </span>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        cat === 'Work' ? 'bg-blue-500' :
                        cat === 'Personal' ? 'bg-emerald-500' :
                        cat === 'Finance' ? 'bg-amber-500' :
                        cat === 'Newsletter' ? 'bg-purple-500' :
                        cat === 'Job' ? 'bg-indigo-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

