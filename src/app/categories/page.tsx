'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Folder, 
  Briefcase, 
  User, 
  DollarSign, 
  Mail, 
  Sparkles, 
  Bell, 
  ArrowRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase';
import { EmailCategory } from '@/types';

interface CategoryConfig {
  name: EmailCategory;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
  bgLight: string;
  borderLight: string;
  triggers: string[];
}

export default function CategoriesPage() {
  const supabase = createClient();
  const [counts, setCounts] = useState<Record<EmailCategory, number>>({
    Work: 0,
    Personal: 0,
    Finance: 0,
    Newsletter: 0,
    Job: 0,
    Notification: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCategoryCounts() {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: threads } = await supabase
            .from('threads')
            .select('category')
            .eq('user_id', user.id);

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
      } catch (err) {
        console.error('[CategoriesPage] Load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCategoryCounts();
  }, [supabase]);

  const categoriesConfig: CategoryConfig[] = [
    {
      name: 'Work',
      description: 'Business discussions, client emails, project collaborations, and general office communication.',
      icon: Briefcase,
      color: 'text-blue-500',
      bgLight: 'bg-blue-500/10',
      borderLight: 'border-blue-500/20',
      triggers: ['Acme Corp', 'project schedules', 'status report', 'meeting notes', 'deployment delay'],
    },
    {
      name: 'Personal',
      description: 'Family conversations, personal messages, greetings, social events, and planning with friends.',
      icon: User,
      color: 'text-emerald-500',
      bgLight: 'bg-emerald-500/10',
      borderLight: 'border-emerald-500/20',
      triggers: ['lunch plans', 'dinner invitation', 'birthday party', 'weekend plans', 'family updates'],
    },
    {
      name: 'Finance',
      description: 'Billing notifications, Stripe invoices, credit card charges, purchase receipts, and banking statements.',
      icon: DollarSign,
      color: 'text-amber-500',
      bgLight: 'bg-amber-500/10',
      borderLight: 'border-amber-500/20',
      triggers: ['Stripe billing', 'invoice details', 'payment received', 'charged successfully', 'subscription renewal'],
    },
    {
      name: 'Newsletter',
      description: 'Weekly tech newsletters, industry digest roundups, developer articles, and mailing list subscriptions.',
      icon: Mail,
      color: 'text-purple-500',
      bgLight: 'bg-purple-500/10',
      borderLight: 'border-purple-500/20',
      triggers: ['JS Weekly', 'dev roundup', 'weekly highlights', 'ecosystem updates', 'subscription newsletter'],
    },
    {
      name: 'Job',
      description: 'Recruitment outreach, application confirmations, technical interviews, and hiring offers.',
      icon: Sparkles,
      color: 'text-indigo-500',
      bgLight: 'bg-indigo-500/10',
      borderLight: 'border-indigo-500/20',
      triggers: ['application update', 'Vercel careers', 'technical conversation', 'Calendly scheduling', 'Frontend Engineer role'],
    },
    {
      name: 'Notification',
      description: 'Automated software updates, system alerts, password resets, login logs, and security confirmations.',
      icon: Bell,
      color: 'text-rose-500',
      bgLight: 'bg-rose-500/10',
      borderLight: 'border-rose-500/20',
      triggers: ['security alert', 'new login detected', 'password reset', 'system notification', 'verify email address'],
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none">
      {/* Intro section */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">AI Email Categorizations</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          Gemini runs real-time semantic analysis on email content, assigning incoming threads to distinct queues.
        </p>
      </div>

      {loading ? (
        <div className="py-24 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          <span>Counting folder tallies...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categoriesConfig.map((cat) => {
            const Icon = cat.icon;
            const count = counts[cat.name] || 0;
            return (
              <Card key={cat.name} className="flex flex-col justify-between hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${cat.bgLight} ${cat.color}`}>
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <CardTitle className="text-sm font-bold text-foreground">{cat.name}</CardTitle>
                    </div>
                    
                    <Badge variant={cat.name} className="text-xs font-bold px-2.5 py-0.5">
                      {count} {count === 1 ? 'thread' : 'threads'}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-4 flex-1 space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed h-12 overflow-hidden">
                    {cat.description}
                  </p>
                  
                  {/* Triggers list */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Example Semantic Identifiers</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.triggers.map((trigger, idx) => (
                        <span key={idx} className="text-[10px] bg-secondary/80 text-muted-foreground border border-border px-2 py-0.5 rounded-sm font-medium">
                          {trigger}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
                
                <CardFooter className="pt-2 border-t border-border/40 flex justify-end">
                  <Link
                    href={`/inbox?category=${cat.name}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-foreground hover:underline transition-colors"
                  >
                    View Mailbox <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

