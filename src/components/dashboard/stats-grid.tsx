import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MessageSquare, Folder, Sparkles } from 'lucide-react';

interface StatsProps {
  totalEmails: number;
  totalThreads: number;
  categoriesCount: Record<string, number>;
  aiSummarizedCount: number;
}

export default function DashboardStatsGrid({
  totalEmails,
  totalThreads,
  categoriesCount,
  aiSummarizedCount
}: StatsProps) {
  const activeCategoriesCount = Object.values(categoriesCount).filter(c => c > 0).length;

  const statsItems = [
    {
      title: 'Total Emails',
      value: totalEmails,
      description: 'Synchronized messages',
      icon: Mail,
      color: 'text-blue-500 bg-blue-500/10'
    },
    {
      title: 'Total Threads',
      value: totalThreads,
      description: 'Grouped conversations',
      icon: MessageSquare,
      color: 'text-indigo-500 bg-indigo-500/10'
    },
    {
      title: 'Active Categories',
      value: `${activeCategoriesCount} / 6`,
      description: 'Auto-categorized slots',
      icon: Folder,
      color: 'text-emerald-500 bg-emerald-500/10'
    },
    {
      title: 'AI Insights',
      value: aiSummarizedCount,
      description: 'Summaries generated',
      icon: Sparkles,
      color: 'text-purple-500 bg-purple-500/10'
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statsItems.map((item, idx) => {
        const Icon = item.icon;
        return (
          <Card key={idx} className="hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {item.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${item.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{item.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

