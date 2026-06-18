'use client';

import React, { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './sidebar';
import Navbar from './navbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Navigation Sidebar */}
      <Sidebar />
      
      {/* Primary Workspace Window */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header Bar */}
        <Suspense fallback={<div className="h-16 border-b border-border bg-card/60 flex-shrink-0" />}>
          <Navbar />
        </Suspense>
        
        {/* Workspace Canvas (Scrollable area) */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
          {children}
        </main>
      </div>
    </div>
  );
}

