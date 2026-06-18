export type EmailCategory = 'Work' | 'Personal' | 'Finance' | 'Newsletter' | 'Job' | 'Notification';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expires_at: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface EmailThread {
  id: string;
  user_id: string;
  gmail_thread_id: string;
  subject: string;
  summary: string | null;
  category: EmailCategory;
  created_at: string;
  updated_at: string;
  emails?: EmailMessage[];
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  gmail_message_id: string;
  sender: string;
  receiver: string;
  body: string;
  category: EmailCategory;
  created_at: string;
}

export interface ChatHistoryItem {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export interface DashboardStats {
  totalEmails: number;
  totalThreads: number;
  categoriesCount: Record<EmailCategory, number>;
  recentActivity: Array<{
    id: string;
    type: 'sync' | 'email_received' | 'ai_reply' | 'chat';
    description: string;
    timestamp: string;
  }>;
  syncStatus: {
    gmailConnected: boolean;
    geminiConnected: boolean;
    lastSyncedAt: string | null;
  };
}

export interface NewsletterClusterResult {
  id?: string;
  topic: string;
  summary: string;
  sourceEmails: Array<{
    id: string;
    sender: string;
    subject: string;
    created_at: string;
  }>;
  created_at: string;
}

