'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
  Sparkles, 
  Send, 
  User, 
  MessageSquare, 
  Trash2, 
  RefreshCw, 
  HelpCircle,
  Copy,
  Check,
  Search,
  MessageCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatHistoryItem } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // States
  const [historyItems, setHistoryItems] = useState<ChatHistoryItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const suggestedQuestions = [
    'What happened with Acme Corp?',
    'Show all finance discussions.',
    'Summarize conversations with Rahul.',
  ];

  // Fetch past chat logs for the sidebar
  const loadChatHistory = async () => {
    setSidebarLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('chat_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(15);
        setHistoryItems(data || []);
      }
    } catch (err) {
      console.error('[ChatPage] Load history error:', err);
    } finally {
      setSidebarLoading(false);
    }
  };

  useEffect(() => {
    loadChatHistory();
  }, [supabase]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsg = textToSend.trim();
    setInputVal('');
    
    // Append user message
    const updatedMessages = [...messages, { role: 'user', content: userMsg } as Message];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          question: userMsg,
          history: messages, // Send existing logs for multi-turn
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to query assistant');

      // Append assistant response
      setMessages([...updatedMessages, { role: 'assistant', content: data.answer }]);
      
      // Reload sidebar history
      loadChatHistory();
    } catch (err) {
      console.error('[ChatPage] Query error:', err);
      setMessages([
        ...updatedMessages,
        { 
          role: 'assistant', 
          content: 'I encountered an error querying the assistant. Please confirm your credentials.' 
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputVal);
  };

  const handleCopyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(idx);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('[ChatPage] Copy error:', err);
    }
  };

  const handleHistoricalSelect = (item: ChatHistoryItem) => {
    // Loads selected historical Q&A into active view
    setMessages([
      { role: 'user', content: item.question },
      { role: 'assistant', content: item.answer },
    ]);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] lg:h-[calc(100vh-6rem)] -m-4 sm:-m-6 overflow-hidden select-none">
      {/* Left Column: Chat History Sidebar */}
      <div className="hidden md:flex flex-col w-64 border-r border-border bg-card/10 flex-shrink-0">
        <div className="p-4 border-b border-border/80 flex items-center justify-between bg-secondary/10">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Chat History</span>
          <button 
            onClick={loadChatHistory} 
            title="Refresh History"
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sidebarLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sidebarLoading && historyItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">Loading list...</div>
          ) : historyItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground/80 flex flex-col items-center justify-center space-y-1 py-12">
              <MessageCircle className="w-6 h-6 text-muted" />
              <span>No past chats</span>
            </div>
          ) : (
            historyItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleHistoricalSelect(item)}
                className="w-full text-left p-2 text-xs font-semibold rounded-lg hover:bg-secondary truncate text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
              >
                <MessageSquare className="w-3.5 h-3.5 text-primary/65 flex-shrink-0" />
                <span className="truncate">{item.question}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Active Chat Thread Area */}
      <div className="flex-1 flex flex-col bg-background/30 h-full relative overflow-hidden">
        {/* Chat Control Toolbar */}
        <div className="h-12 border-b border-border/80 px-6 flex items-center justify-between bg-card/20 flex-shrink-0">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" /> Gemini Inbox Agent
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearChat} className="text-xs h-7 text-muted-foreground hover:text-red-500 font-semibold">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Screen
            </Button>
          )}
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 ? (
            // Chat Assistant Welcome Screen (Empty State)
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-500 flex items-center justify-center shadow-xs">
                <Sparkles className="w-8 h-8 animate-pulse-slow" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-foreground tracking-tight">Talk to Your Mailbox</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ask conversational questions about your synchronized emails. Gemini will retrieve context, locate answers, and cite specific references.
                </p>
              </div>

              {/* Suggestions row */}
              <div className="w-full space-y-2.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-primary" /> Suggested Questions
                </p>
                <div className="flex flex-col gap-2">
                  {suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(q)}
                      className="px-4 py-2.5 text-xs text-left font-semibold bg-card hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/80 rounded-xl transition-all duration-150 flex items-center gap-2 hover:translate-x-0.5"
                    >
                      <span className="text-primary font-bold">{idx + 1}.</span>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Conversation Message Logs
            <div className="space-y-4 max-w-4xl mx-auto">
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={idx} className={`flex items-start gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {/* Assistant icon */}
                    {!isUser && (
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-500 flex-shrink-0">
                        <Sparkles className="w-4.5 h-4.5" />
                      </div>
                    )}
                    
                    {/* Content Bubble */}
                    <div className={`p-4 rounded-2xl max-w-[85%] text-xs sm:text-sm leading-relaxed border relative group ${
                      isUser 
                        ? 'bg-primary text-primary-foreground border-primary rounded-tr-none' 
                        : 'bg-card text-foreground border-border rounded-tl-none glass'
                    }`}>
                      <div className="whitespace-pre-wrap font-normal">{msg.content}</div>
                      
                      {/* Copy Action for assistant reply */}
                      {!isUser && (
                        <button
                          onClick={() => handleCopyText(msg.content, idx)}
                          className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 p-1 bg-secondary border border-border rounded-md hover:bg-accent text-muted-foreground transition-all duration-150"
                          title="Copy Answer"
                        >
                          {copiedId === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    {/* User icon */}
                    {isUser && (
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-foreground text-xs font-bold border border-border flex-shrink-0">
                        U
                      </div>
                    )}
                  </div>
                );
              })}

              {/* AI loading response indicator */}
              {loading && (
                <div className="flex items-start gap-4 justify-start">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-500 flex-shrink-0">
                    <Sparkles className="w-4.5 h-4.5 animate-pulse-slow" />
                  </div>
                  <div className="p-4 rounded-2xl bg-card border border-border rounded-tl-none flex items-center gap-1.5 py-3.5">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-border bg-card/30 backdrop-blur-xs flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto relative">
            <Input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="e.g., Did Sarah Jenkins say anything about Project Alpha schedule delays?"
              disabled={loading}
              className="pr-12 h-11 bg-card border-border/80 focus-visible:ring-primary/45 rounded-xl text-xs sm:text-sm"
            />
            <Button
              type="submit"
              disabled={loading || !inputVal.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg p-0 bg-primary text-primary-foreground hover:bg-opacity-90 active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

