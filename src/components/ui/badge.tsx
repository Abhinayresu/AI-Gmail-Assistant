import React from 'react';
import { EmailCategory } from '@/types';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | EmailCategory;
}

export function Badge({ className = '', variant = 'default', children, ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring';

  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-opacity-80',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-opacity-80 border border-border',
    outline: 'text-foreground border border-border bg-transparent',
    destructive: 'bg-rose-500/15 text-rose-500 border border-rose-500/20',
    
    // Email categories styles
    Work: 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/25',
    Personal: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/25',
    Finance: 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/25',
    Newsletter: 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/25',
    Job: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/25',
    Notification: 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/25',
  };

  const combinedClassName = `${baseStyles} ${variants[variant] || variants.default} ${className}`;

  return (
    <div className={combinedClassName} {...props}>
      {children}
    </div>
  );
}
export default Badge;
