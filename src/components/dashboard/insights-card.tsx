import React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import { EmailCategory } from '@/types';

interface InsightThread {
  id: string;
  subject: string;
  summary: string | null;
  category: EmailCategory;
  created_at: string;
}

interface InsightsProps {
  threads: InsightThread[];
}

export default function DashboardInsightsCard({ threads = [] }: InsightsProps) {
  return (
    <Card className="h-full border-primary/20 bg-primary/5/30 hover:border-primary/30 transition-all duration-300">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="w-5 h-5 animate-pulse-slow" />
          <CardTitle className="text-md font-bold">MailMind AI Briefings</CardTitle>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Summaries of active email threads needing your attention.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-4 divide-y divide-border/40">
        {threads.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-2">
            <Sparkles className="w-8 h-8 text-muted/80" />
            <p className="font-medium">No briefings generated yet</p>
            <p className="text-[10px] max-w-xs">New thread briefings will display here as soon as you synchronize your Gmail account.</p>
          </div>
        ) : (
          threads.map((thread) => (
            <div key={thread.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold tracking-tight text-foreground line-clamp-1">
                    {thread.subject}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    Received {new Date(thread.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={thread.category}>{thread.category}</Badge>
              </div>

              {/* AI Bullet points summary */}
              <div className="text-xs text-muted-foreground space-y-1 pl-1 border-l-2 border-primary/25">
                {thread.summary ? (
                  thread.summary.split('\n').map((bullet, idx) => (
                    <div key={idx} className="leading-relaxed">
                      {bullet}
                    </div>
                  ))
                ) : (
                  <p className="italic text-[11px]">No summary available.</p>
                )}
              </div>

              <div className="flex justify-end">
                <Link
                  href={`/inbox/${thread.id}`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-foreground hover:underline transition-colors"
                >
                  Open conversation <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

