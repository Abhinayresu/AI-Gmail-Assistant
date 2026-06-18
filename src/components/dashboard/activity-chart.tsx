'use client';

import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface ChartDataPoint {
  date: string;
  Emails: number;
}

export default function DashboardActivityChart({ data = [] }: { data?: ChartDataPoint[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Standard fallback telemetry data if no real database history is logged yet
  const fallbackData: ChartDataPoint[] = [
    { date: 'Jun 11', Emails: 4 },
    { date: 'Jun 12', Emails: 9 },
    { date: 'Jun 13', Emails: 5 },
    { date: 'Jun 14', Emails: 12 },
    { date: 'Jun 15', Emails: 8 },
    { date: 'Jun 16', Emails: 15 },
    { date: 'Jun 17', Emails: data.length > 0 ? data.reduce((acc, curr) => acc + curr.Emails, 0) : 10 },
  ];

  const chartData = data.length > 0 ? data : fallbackData;

  if (!mounted) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
        Loading analytics engine...
      </div>
    );
  }

  return (
    <div className="h-64 w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="colorEmails" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="date" 
            stroke="var(--muted-foreground)" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            stroke="var(--muted-foreground)" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
          />
          <Tooltip 
            contentStyle={{ 
              background: 'var(--card)', 
              borderColor: 'var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)'
            }} 
          />
          <Area 
            type="monotone" 
            dataKey="Emails" 
            stroke="var(--primary)" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorEmails)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
