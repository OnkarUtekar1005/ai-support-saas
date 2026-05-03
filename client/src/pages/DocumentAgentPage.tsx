import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/shared';
import { FileText, Send, Plus, Download, Trash2, Clock, CheckCircle, Loader, ChevronLeft } from 'lucide-react';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  QUESTIONING:  { label: 'In Progress',  color: 'bg-blue-100 text-blue-700'    },
  GENERATING:   { label: 'Generating…',  color: 'bg-amber-100 text-amber-700'  },
  COMPLETED:    { label: 'Completed',    color: 'bg-green-100 text-green-700'  },
  FAILED:       { label: 'Failed',       color: 'bg-red-100 text-red-700'      },
};

const DOC_LABEL: Record<string, string> = {
  scope_of_work: 'Scope of Work',
  project_plan:  'Project Plan',
};

export function DocumentAgentPage() {
  const { toast } = useToast();
  const [sessions, setSessions]         = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [view, setView]                 = useState<'list' | 'chat' | 'new'>('list');
  const [answer, setAnswer]             = useState('');
  const [sending, setSending]           = useState(false);
  const [polling, setPolling]           = useState(false);
  const pollRef                         = useRef<ReturnType<typeof setInterval> | null>(null);

  // New session form
  const [newTitle, setNewTitle]         = useState('');
  const [newReqs, setNewReqs]           = useState('');
  const [starting, setStarting]         = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  // Poll when GENERATING
  useEffect(() => {
    if (activeSession?.status === 'GENERATING') {
      pollRef.current = setInterval(async () => {
        const updated: any = await api.getDocumentSession(activeSession.id);
        if (updated.status !== 'GENERATING') {
          setActiveSession(updated);
          clearInterval(pollRef.current!);
          loadSessions();
        }
      }, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeSession?.status]);

  const loadSessions = async () => {
    try {
      const data: any = await api.listDocumentSessions();
      setSessions(data);
    } catch { /* ignore */ }
  };

  const handleStart = async () => {
    if (!newReqs.trim()) return;
    setStarting(true);
    try {
      const result: any = await api.startDocumentSession({ title: newTitle || 'New Project', requirements: newReqs });
      setActiveSession(result.session);
      setView('chat');
      loadSessions();
      setNewTitle('');
      setNewReqs('');
    } catch { toast('Failed to start session', 'error'); }
    finally { setStarting(false); }
  };

  const handleSend = async () => {
    if (!answer.trim() || sending) return;
    setSending(true);
    try {
      const result: any = await api.replyDocumentSession(activeSession.id, answer);
      setActiveSession(result.session);
      setAnswer('');
    } catch { toast('Failed to send reply', 'error'); }
    finally { setSending(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session and its documents?')) return;
    try {
      await api.deleteDocumentSession(id);
      setSessions(s => s.filter(x => x.id !== id));
      if (activeSession?.id === id) { setActiveSession(null); setView('list'); }
      toast('Session deleted');
    } catch { toast('Failed to delete', 'error'); }
  };

  const openSession = async (id: string) => {
    const s: any = await api.getDocumentSession(id);
    setActiveSession(s);
    setView('chat');
  };

  const messages: any[] = activeSession ? (activeSession.messages || []) : [];
  const generatedDocs: any[] = activeSession ? (activeSession.generatedDocs || []) : [];

  // ── List view ─────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="animate-page-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Agent</h1>
          <p className="text-sm text-gray-500 mt-1">Generate project documents through a guided Q&amp;A with the AI agent</p>
        </div>
        <button onClick={() => setView('new')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No sessions yet</p>
          <p className="text-sm mt-1">Start a new session to generate project documentation</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map((s: any) => {
            const st = STATUS_LABEL[s.status] || STATUS_LABEL.QUESTIONING;
            const docs: any[] = s.generatedDocs || [];
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug flex-1 mr-2">{s.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${st.color}`}>{st.label}</span>
                </div>
                {s.project && <p className="text-xs text-gray-400 mb-3">{s.project.name}</p>}
                <p className="text-xs text-gray-400 flex items-center gap-1 mb-4">
                  <Clock className="w-3 h-3" /> {new Date(s.createdAt).toLocaleDateString()}
                </p>
                {docs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {docs.map((d: any) => (
                      <a key={d.filename} href={`/api/document-agent/download/${d.filename}`}
                        className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors"
                        download>
                        <Download className="w-3 h-3" /> {DOC_LABEL[d.type] || d.type}
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => openSession(s.id)} className="flex-1 btn-secondary text-xs py-1.5">
                    {s.status === 'COMPLETED' ? 'View' : 'Continue'}
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── New session view ───────────────────────────────────────────────────────
  if (view === 'new') return (
    <div className="animate-page-in max-w-2xl mx-auto space-y-6">
      <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Document Session</h1>
        <p className="text-sm text-gray-500 mt-1">Paste your project requirements and the agent will ask you questions to generate the documents.</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Session Title</label>
          <input
            className="input-field"
            placeholder="e.g. E-commerce Platform Redesign"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Project Requirements <span className="text-red-500">*</span></label>
          <textarea
            className="input-field min-h-[200px]"
            placeholder="Paste or type the project requirements, brief, or description here..."
            value={newReqs}
            onChange={e => setNewReqs(e.target.value)}
          />
        </div>
        <button
          onClick={handleStart}
          disabled={starting || !newReqs.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {starting ? <><Loader className="w-4 h-4 animate-spin" /> Starting session...</> : <><FileText className="w-4 h-4" /> Start Document Session</>}
        </button>
      </div>
    </div>
  );

  // ── Chat view ─────────────────────────────────────────────────────────────
  return (
    <div className="animate-page-in flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">{activeSession?.title}</h1>
            {activeSession?.status && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABEL[activeSession.status]?.color}`}>
                {STATUS_LABEL[activeSession.status]?.label}
              </span>
            )}
          </div>
        </div>
        {generatedDocs.length > 0 && (
          <div className="flex gap-2">
            {generatedDocs.map((d: any) => (
              <a key={d.filename} href={`/api/document-agent/download/${d.filename}`}
                className="flex items-center gap-1.5 text-sm btn-primary py-1.5"
                download>
                <Download className="w-3.5 h-3.5" /> {DOC_LABEL[d.type] || d.type}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg: any, i: number) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {activeSession?.status === 'GENERATING' && (
          <div className="flex justify-start">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <Loader className="w-4 h-4 animate-spin" /> Generating your documents… this may take a moment.
            </div>
          </div>
        )}

        {activeSession?.status === 'COMPLETED' && generatedDocs.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-green-50 border border-green-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-green-800">
              <div className="flex items-center gap-2 font-medium mb-2">
                <CheckCircle className="w-4 h-4" /> Documents ready!
              </div>
              <div className="flex flex-wrap gap-2">
                {generatedDocs.map((d: any) => (
                  <a key={d.filename} href={`/api/document-agent/download/${d.filename}`}
                    className="flex items-center gap-1 bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium"
                    download>
                    <Download className="w-3 h-3" /> {DOC_LABEL[d.type] || d.type}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {activeSession?.status === 'QUESTIONING' && (
        <div className="mt-4 flex gap-2 shrink-0">
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
            className="input-field flex-1 resize-none min-h-[60px] max-h-[140px]"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={sending || !answer.trim()}
            className="btn-primary px-4 self-end flex items-center gap-1.5"
          >
            {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
