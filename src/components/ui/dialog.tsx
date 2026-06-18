import React from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={() => onOpenChange(false)}
      />
      {/* Content Container */}
      <div className="z-50 w-full max-w-lg p-4">
        {children}
      </div>
    </div>
  );
}

export function DialogContent({ 
  className = '', 
  children,
  onClose
}: { 
  className?: string; 
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={`relative rounded-xl border border-border bg-card p-6 shadow-lg glass animate-in fade-in zoom-in-95 duration-200 ${className}`}>
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
      {children}
    </div>
  );
}

export function DialogHeader({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className}`}>
      {children}
    </div>
  );
}

export function DialogTitle({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h2>
  );
}

export function DialogDescription({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      {children}
    </p>
  );
}

export function DialogFooter({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6 ${className}`}>
      {children}
    </div>
  );
}
