'use client';

import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { EmailCategory } from '@/types';

interface PieChartProps {
  categoriesCount: Record<EmailCategory, number>;
}

export default function DashboardPieChart({ categoriesCount }: PieChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const data = Object.entries(categoriesCount)
    .map(([name, value]) => ({
      name,
      value,
    }))
    .filter((d) => d.value > 0);

  // If no email categories found, display fallback data to avoid empty UI
  const chartData = data.length > 0 ? data : [
    { name: 'Work', value: 8 },
    { name: 'Personal', value: 4 },
    { name: 'Finance', value: 2 },
    { name: 'Newsletter', value: 6 },
    { name: 'Job', value: 3 },
    { name: 'Notification', value: 5 }
  ];

  const totalCount = chartData.reduce((sum, item) => sum + item.value, 0);

  const COLORS: Record<string, string> = {
    Work: '#3b82f6',        // blue
    Personal: '#10b981',    // emerald
    Finance: '#f59e0b',     // amber
    Newsletter: '#8b5cf6',  // purple
    Job: '#6366f1',         // indigo
    Notification: '#f43f5e', // rose
  };

  if (!mounted) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-muted-foreground animate-pulse">
        Loading composition chart...
      </div>
    );
  }

  return (
    <div className="relative h-48 w-full text-xs flex items-center justify-center">
      {/* Centered Donut Label */}
      <div className="absolute flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-black tracking-tight text-foreground">{totalCount}</span>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">Emails</span>
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
            animationDuration={800}
          >
            {chartData.map((entry) => (
              <Cell 
                key={`cell-${entry.name}`} 
                fill={COLORS[entry.name] || '#6b7280'} 
                className="stroke-background border-2 focus:outline-none"
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
              borderRadius: '12px',
              color: 'var(--foreground)',
              fontSize: '11px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            }}
            itemStyle={{ color: 'var(--foreground)' }}
            formatter={(value: any, name: any) => [`${value} thread(s)`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
