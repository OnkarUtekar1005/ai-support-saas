import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { ArrowLeft, Wrench, Bot, Bell, Save } from 'lucide-react';
import { StatusBadge, SkeletonCard, useToast } from '../components/shared';
import { PROJECT_STATUS_COLORS, LANGUAGES } from '../constants';

type AgentTab = 'technical' | 'functional' | 'reminders';

const DEFAULT_TECHNICAL = {
  enabled: false, gitRepoUrl: '', projectPath: '', targetBranch: 'main',
  testCommand: '', language: '', framework: '', buildCommand: '', customPromptPrefix: '',
};
const DEFAULT_FUNCTIONAL = {
  enabled: false, systemPrompt: '', confidenceThreshold: 0.7, autoResolveTickets: false,
};
const DEFAULT_REMINDERS = {
  enabled: false, overdueReminder: true, dueSoonHours: 24, statusUpdateFreq: 'daily', assignOnCreate: false,
};

export function AgentConfigDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [tab, setTab] = useState<AgentTab>('technical');
  const [technical, setTechnical] = useState<any>(DEFAULT_TECHNICAL);
  const [functional, setFunctional] = useState<any>(DEFAULT_FUNCTIONAL);
  const [reminders, setReminders] = useState<any>(DEFAULT_REMINDERS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getProject(id),
      api.getAgentConfig(id).catch(() => null),
      api.getReminderConfig(id).catch(() => null),
    ]).then(([proj, agentData, reminderData]: any[]) => {
      setProject(proj);
      setTechnical(agentData?.technical ? { ...DEFAULT_TECHNICAL, ...agentData.technical } : DEFAULT_TECHNICAL);
      setFunctional(agentData?.functional ? { ...DEFAULT_FUNCTIONAL, ...agentData.functional } : DEFAULT_FUNCTIONAL);
      setReminders(reminderData ? { ...DEFAULT_REMINDERS, ...reminderData } : DEFAULT_REMINDERS);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (type: AgentTab) => {
    if (!id) return;
    setSaving(true);
    try {
      if (type === 'technical') await api.saveAgentConfigTechnical(id, technical);
      else if (type === 'functional') await api.saveAgentConfigFunctional(id, functional);
      else await api.saveReminderConfig(id, reminders);
      toast(`${type.charAt(0).toUpperCase() + type.slice(1)} config saved`);
    } catch { toast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const tabs: { key: AgentTab; label: string; icon: any; desc: string }[] = [
    { key: 'technical', label: 'Technical Agent', icon: Wrench, desc: 'Auto-fix code bugs with Claude Code' },
    { key: 'functional', label: 'Functional Agent', icon: Bot, desc: 'Resolve issues using knowledge base' },
    { key: 'reminders', label: 'Reminders', icon: Bell, desc: 'Notifications and auto-assignment' },
  ];

  if (loading) return (
    <div className="animate-page-in space-y-4">
      <SkeletonCard /><SkeletonCard /><SkeletonCard />
    </div>
  );

  if (!project) return <div className="text-red-500">Project not found</div>;

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string, type: 'input' | 'textarea' = 'input') => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} className="input-field min-h-[100px]" placeholder={placeholder} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="input-field" placeholder={placeholder} />
      )}
    </div>
  );

  const toggle = (label: string, desc: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition-colors -mx-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded mt-0.5 text-blue-600" />
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">{desc}</div>
      </div>
    </label>
  );

  return (
    <div className="animate-page-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/agent-config')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Agent Config
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
          <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
          <StatusBadge status={project.status} colorMap={PROJECT_STATUS_COLORS} size="sm" />
        </div>
      </div>

      {/* Agent type cards (horizontal) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {tabs.map((t) => {
          const active = tab === t.key;
          const enabled = t.key === 'technical' ? technical.enabled : t.key === 'functional' ? functional.enabled : reminders.enabled;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${active ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <t.icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {enabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div className={`font-semibold text-sm ${active ? 'text-blue-900' : 'text-gray-900'}`}>{t.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Config form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-fade-in">
        {tab === 'technical' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Wrench className="w-4 h-4 text-blue-600" /> Technical Agent (Auto-Fix)</h2>
                <p className="text-xs text-gray-500 mt-0.5">Automatically detect, analyze, and fix code bugs using Claude Code</p>
              </div>
              {toggle('', '', technical.enabled, (v) => setTechnical((c: any) => ({ ...c, enabled: v })))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Git Repository URL', technical.gitRepoUrl, (v) => setTechnical((c: any) => ({ ...c, gitRepoUrl: v })), 'https://github.com/org/repo')}
              {field('Project Path', technical.projectPath, (v) => setTechnical((c: any) => ({ ...c, projectPath: v })), '/home/user/projects/my-app')}
              {field('Target Branch', technical.targetBranch, (v) => setTechnical((c: any) => ({ ...c, targetBranch: v })), 'main')}
              {field('Test Command', technical.testCommand, (v) => setTechnical((c: any) => ({ ...c, testCommand: v })), 'npm test')}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
                <input
                  list="lang-suggestions"
                  value={technical.language}
                  onChange={(e) => setTechnical((c: any) => ({ ...c, language: e.target.value }))}
                  className="input-field"
                  placeholder="Type any language..."
                />
                <datalist id="lang-suggestions">
                  {LANGUAGES.map((l) => <option key={l} value={l} />)}
                </datalist>
                <p className="text-xs text-gray-400 mt-1">Claude supports any programming language — just type it</p>
              </div>
              {field('Framework', technical.framework, (v) => setTechnical((c: any) => ({ ...c, framework: v })), 'Any framework — Express, Django, Spring Boot, Laravel, Rails...')}
              {field('Build Command', technical.buildCommand, (v) => setTechnical((c: any) => ({ ...c, buildCommand: v })), 'npm run build')}
            </div>
            {field('Custom Instructions', technical.customPromptPrefix, (v) => setTechnical((c: any) => ({ ...c, customPromptPrefix: v })), 'Extra context for the AI agent. E.g., "Auth middleware is in src/middleware/auth.ts. Never modify migrations."', 'textarea')}
            <button onClick={() => handleSave('technical')} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Technical Config'}
            </button>
          </div>
        )}

        {tab === 'functional' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Bot className="w-4 h-4 text-blue-600" /> Functional Agent (Knowledge Base)</h2>
                <p className="text-xs text-gray-500 mt-0.5">Resolve process and workflow issues using uploaded documentation</p>
              </div>
              {toggle('', '', functional.enabled, (v) => setFunctional((c: any) => ({ ...c, enabled: v })))}
            </div>
            {field('System Prompt', functional.systemPrompt, (v) => setFunctional((c: any) => ({ ...c, systemPrompt: v })),
              'Enter project-specific instructions, SOPs, process rules...\n\nExample:\n- Invoice creation requires an active subscription\n- Refunds must be requested within 30 days\n- Always check if user followed the correct steps', 'textarea')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confidence Threshold</label>
                <input type="number" min="0" max="1" step="0.05" value={functional.confidenceThreshold}
                  onChange={(e) => setFunctional((c: any) => ({ ...c, confidenceThreshold: parseFloat(e.target.value) || 0 }))}
                  className="input-field w-32" />
                <p className="text-xs text-gray-400 mt-1">Min confidence (0-1) to auto-resolve. 0.7 = 70%</p>
              </div>
            </div>
            {toggle('Auto-Resolve Tickets', 'Automatically resolve functional tickets when confidence exceeds the threshold', functional.autoResolveTickets, (v) => setFunctional((c: any) => ({ ...c, autoResolveTickets: v })))}
            <button onClick={() => handleSave('functional')} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Functional Config'}
            </button>
          </div>
        )}

        {tab === 'reminders' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Bell className="w-4 h-4 text-blue-600" /> Reminder & Assignment Settings</h2>
                <p className="text-xs text-gray-500 mt-0.5">Configure notifications, reminders, and automatic task assignment</p>
              </div>
              {toggle('', '', reminders.enabled, (v) => setReminders((c: any) => ({ ...c, enabled: v })))}
            </div>
            {toggle('Overdue Reminders', 'Send notifications when tasks pass their due date', reminders.overdueReminder, (v) => setReminders((c: any) => ({ ...c, overdueReminder: v })))}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Due Soon Threshold (hours)</label>
                <input type="number" min="1" max="168" value={reminders.dueSoonHours}
                  onChange={(e) => setReminders((c: any) => ({ ...c, dueSoonHours: parseInt(e.target.value) || 24 }))}
                  className="input-field w-32" />
                <p className="text-xs text-gray-400 mt-1">Notify this many hours before the due date</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status Update Frequency</label>
                <select value={reminders.statusUpdateFreq}
                  onChange={(e) => setReminders((c: any) => ({ ...c, statusUpdateFreq: e.target.value }))}
                  className="input-field w-48">
                  <option value="daily">Daily digest</option>
                  <option value="weekly">Weekly digest</option>
                  <option value="none">No digests</option>
                </select>
              </div>
            </div>
            {toggle('Auto-Assign on Create', 'Automatically assign new tickets to team members (round-robin)', reminders.assignOnCreate, (v) => setReminders((c: any) => ({ ...c, assignOnCreate: v })))}
            <button onClick={() => handleSave('reminders')} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Reminder Config'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
