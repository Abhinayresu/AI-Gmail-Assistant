import React from 'react';
import Link from 'next/link';
import { Mail, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import Badge from '@/components/ui/badge';
import { EmailCategory } from '@/types';

interface ActivityItem {
  id: string;
  sender: string;
  created_at: string;
  category: EmailCategory;
  threads: {
    subject: string;
  } | null;
}

interface ActivityProps {
  emails: ActivityItem[];
}

export default function DashboardActivityFeed({ emails = [] }: ActivityProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-md font-bold flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" /> Recent Activity
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          List of the latest synchronized messages from your inbox.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-4">
        {emails.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center space-y-2">
            <Mail className="w-8 h-8 text-muted/60" />
            <p className="font-medium">No activity synced yet</p>
            <p className="text-[10px] max-w-xs">Recent incoming email details will list here as soon as they are synchronized.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="divide-y divide-border/40">
              {emails.map((email) => {
                // Parse sender name
                const senderName = email.sender.split('<')[0].trim() || email.sender;
                
                return (
                  <div key={email.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar initial bubble */}
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-foreground text-xs font-bold border border-border flex-shrink-0">
                        {senderName.substring(0, 2).toUpperCase()}
                      </div>
                      
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {senderName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {email.threads?.subject || '(No Subject)'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge variant={email.category}>{email.category}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(email.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="pt-2 border-t border-border flex justify-end">
              <Link
                href="/inbox"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-foreground hover:underline transition-colors"
              >
                Go to Inbox <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

