'use client';

import React, { createContext, useContext, useState } from 'react';

interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export function Tabs({ 
  value, 
  onValueChange, 
  defaultValue, 
  children,
  className = ''
}: { 
  value?: string; 
  onValueChange?: (value: string) => void; 
  defaultValue?: string; 
  children: React.ReactNode;
  className?: string;
}) {
  const [localValue, setLocalValue] = useState(defaultValue || '');
  const activeValue = value !== undefined ? value : localValue;
  const activeOnChange = onValueChange !== undefined ? onValueChange : setLocalValue;

  return (
    <TabsContext.Provider value={{ value: activeValue, onValueChange: activeOnChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`inline-flex h-10 items-center justify-start rounded-lg bg-secondary p-1 text-muted-foreground border border-border overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ 
  value, 
  className = '', 
  children 
}: { 
  value: string; 
  className?: string; 
  children: React.ReactNode;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used inside a Tabs component');

  const isActive = context.value === value;

  return (
    <button
      type="button"
      onClick={() => context.onValueChange(value)}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 h-8 text-xs sm:text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 select-none ${
        isActive 
          ? 'bg-card text-foreground shadow-sm font-semibold border-b-2 border-primary' 
          : 'hover:text-foreground hover:bg-card/30'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ 
  value, 
  className = '', 
  children 
}: { 
  value: string; 
  className?: string; 
  children: React.ReactNode;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used inside a Tabs component');

  if (context.value !== value) return null;

  return (
    <div className={`mt-4 focus-visible:outline-hidden ${className}`}>
      {children}
    </div>
  );
}
