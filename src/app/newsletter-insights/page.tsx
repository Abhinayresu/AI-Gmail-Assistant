'use client';

import React, { useEffect, useState } from 'react';
import { 
  Newspaper, 
  Sparkles, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Mail, 
  AlertCircle,
  HelpCircle,
  Inbox
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { NewsletterClusterResult } from '@/types';

export default function NewsletterInsightsPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [clusters, setClusters] = useState<NewsletterClusterResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [errorText, setErrorText] = useState('');
  
  // Track which cluster details are expanded
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});

  const loadClusters = async (showToast = false) => {
    setLoading(true);
    setErrorText('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/newsletters/cluster', {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch newsletter insights');
      
      setClusters(data.clusters || []);
      if (showToast) {
        toast({
          title: 'Insights Loaded',
          description: 'Latest newsletter deduplication results fetched successfully.',
          variant: 'success',
        });
      }
    } catch (err: any) {
      console.error('[NewsletterInsights] Fetch error:', err);
      setErrorText(err.message || 'Failed to load newsletter clusters.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    setErrorText('');
    toast({
      title: 'Clustering Newsletters',
      description: 'Computing vector similarity and generating AI digests...',
      variant: 'default',
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/newsletters/cluster', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to execute clustering');

      setClusters(data.clusters || []);
      toast({
        title: 'Clustering Complete',
        description: `Grouped and summarized ${data.clusters?.length || 0} topics successfully.`,
        variant: 'success',
      });
    } catch (err: any) {
      console.error('[NewsletterInsights] Recalculate error:', err);
      setErrorText(err.message || 'Deduplication clustering failed.');
      toast({
        title: 'Recalculation Failed',
        description: err.message || 'Clustering process encountered an error.',
        variant: 'destructive',
      });
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    loadClusters();
  }, []);

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 select-none">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Newspaper className="w-5.5 h-5.5 text-primary" /> Newsletter Insights & Deduplication
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Consolidate multiple newsletters covering similar topics into single, high-fidelity AI summaries using pgvector semantic clusters.
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => loadClusters(true)} 
            disabled={loading || recalculating}
            className="h-9 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading && !recalculating ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button 
            variant="gradient" 
            size="sm" 
            onClick={handleRecalculate} 
            disabled={loading || recalculating}
            className="h-9 font-bold text-xs"
          >
            <Sparkles className={`w-3.5 h-3.5 mr-1.5 ${recalculating ? 'animate-pulse' : ''}`} />
            {recalculating ? 'Analyzing...' : 'Re-Cluster Mails'}
          </Button>
        </div>
      </div>

      {errorText && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {errorText}
        </div>
      )}

      {/* Main Content Area */}
      {loading && clusters.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm font-semibold text-muted-foreground">Running similarity algorithms...</p>
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[45vh] max-w-md mx-auto text-center space-y-5">
          <div className="p-4 bg-secondary/60 rounded-2xl border border-border text-muted-foreground">
            <Inbox className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-md font-bold text-foreground">No newsletter clusters compiled</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We couldn't locate newsletter entries in your inbox database to cluster. Ensure you have synced messages categorized as "Newsletter" first.
            </p>
          </div>
          <Button onClick={handleRecalculate} size="sm" className="font-bold text-xs">
            Run Deduplication Scan
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {clusters.map((cluster, idx) => {
            const isMultiSource = cluster.sourceEmails.length > 1;
            const isExpanded = !!expandedIndices[idx];

            return (
              <Card key={idx} className="border-border/80 hover:border-border transition-all">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-xs sm:text-sm font-bold leading-snug text-foreground">
                        {cluster.topic}
                      </CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground flex items-center gap-1">
                        Compiled on {new Date(cluster.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={isMultiSource ? 'Newsletter' : 'default'} className="text-[10px] font-bold">
                        {cluster.sourceEmails.length === 1 
                          ? '1 newsletter' 
                          : `${cluster.sourceEmails.length} newsletters consolidated`}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-normal text-foreground space-y-4">
                  <div className="bg-secondary/10 p-4 border border-border/60 rounded-xl">
                    {cluster.summary}
                  </div>

                  {/* Collapsible sources list */}
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleExpand(idx)}
                      className="w-full flex items-center justify-between p-3 bg-secondary/35 hover:bg-secondary/50 text-[11px] font-bold text-muted-foreground transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-primary/80" /> 
                        Source Documents ({cluster.sourceEmails.length})
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {isExpanded && (
                      <div className="p-2 bg-secondary/10 divide-y divide-border/30">
                        {cluster.sourceEmails.map((email, eIdx) => (
                          <div key={email.id} className="p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5 text-left">
                              <p className="font-semibold text-foreground">{email.subject}</p>
                              <p className="text-[10px] text-muted-foreground">{email.sender}</p>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-semibold flex-shrink-0">
                              {new Date(email.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
