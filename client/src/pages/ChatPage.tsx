import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { Send, Plus, MessageSquare, ArrowLeft } from 'lucide-react';

export function ChatPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getSessions().then((data: any) => setSessions(data));
  }, []);

  useEffect(() => {
    if (activeSession) {
      api.getMessages(activeSession).then((data: any) => setMessages(data));
      // On mobile, hide sidebar when session selected
      if (window.innerWidth < 768) setShowSidebar(false);
    }
  }, [activeSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();
    socket.on('chat:response', (data: any) => {
      if (data.sessionId === activeSession) {
        setMessages((prev) => [...prev, data.message]);
        setSending(false);
      }
    });
    socket.on('chat:error', () => setSending(false));
    return () => { socket.off('chat:response'); socket.off('chat:error'); };
  }, [activeSession]);

  const createSession = async () => {
    const session: any = await api.createSession();
    setSessions((prev) => [session, ...prev]);
    setActiveSession(session.id);
    setMessages([]);
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    const userMsg = { id: Date.now().toString(), role: 'user', content, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    const socket = getSocket();
    socket.emit('chat:message', { sessionId: activeSession, content });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] lg:h-[calc(100vh-5rem)] gap-0 lg:gap-4 -m-4 lg:-m-6 p-0">
      {/* Sessions sidebar */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-72 lg:w-80 bg-white border-r border-gray-200 md:rounded-l-xl flex-col flex-shrink-0`}>
        <div className="p-3 border-b border-gray-100">
          <button onClick={createSession} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No conversations yet</div>
          ) : sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                activeSession === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeSession === s.id ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-900 truncate block">
                    {s.ticket?.title || s.messages?.[0]?.content?.substring(0, 35) || 'New chat'}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(s.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className={`${!showSidebar || activeSession ? 'flex' : 'hidden'} md:flex flex-1 bg-white md:rounded-r-xl flex-col min-w-0`}>
        {!activeSession ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6">
            <MessageSquare className="w-10 h-10 mb-3 text-gray-300" />
            <p className="text-sm">Select a chat or create a new one</p>
            <p className="text-xs text-gray-300 mt-1">The AI has access to your CRM data</p>
          </div>
        ) : (
          <>
            {/* Mobile back button */}
            <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <button onClick={() => { setShowSidebar(true); setActiveSession(null); }} className="p-1 text-gray-500">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-gray-900">AI Assistant</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={msg.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start animate-fade-in">
                  <div className="chat-message-assistant">
                    <div className="flex gap-1.5 py-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 lg:p-4 border-t border-gray-100">
              <div className="flex gap-2 items-end">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about tickets, errors, contacts..."
                  className="input-field flex-1"
                />
                <button onClick={sendMessage} disabled={!input.trim() || sending} className="btn-primary px-3 py-2">
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center">AI has access to tickets, errors, contacts, deals, and projects</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
