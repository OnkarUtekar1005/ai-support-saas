import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Wrench, Bot, Bell, ChevronRight, Search, Settings } from 'lucide-react';
import { PageHeader, StatusBadge, SkeletonCard, EmptyState } from '../components/shared';
import { PROJECT_STATUS_COLORS } from '../constants';

export function AgentConfigPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, { technical: boolean; functional: boolean; reminders: boolean }>>({});

  useEffect(() => {
    api.getProjects().then(async (p: any) => {
      setProjects(p);
      const statuses: Record<string, any> = {};
      await Promise.all(p.map(async (proj: any) => {
        try {
          const [agent, reminder]: any[] = await Promise.all([
            api.getAgentConfig(proj.id).catch(() => null),
            api.getReminderConfig(proj.id).catch(() => null),
          ]);
          statuses[proj.id] = {
            technical: agent?.technical?.enabled || false,
            functional: agent?.functional?.enabled || false,
            reminders: reminder?.enabled || false,
          };
        } catch { statuses[proj.id] = { technical: false, functional: false, reminders: false }; }
      }));
      setAgentStatuses(statuses);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const badge = (enabled: boolean) => (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
      {enabled ? 'ON' : 'OFF'}
    </span>
  );

  return (
    <div className="animate-page-in">
      <PageHeader title="Agent Configuration" subtitle="Configure agents for each project — click a project to set up its agents" />

      {projects.length > 0 && (
        <div className="relative max-w-sm mt-4 mb-5">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects..." className="input-field pl-9" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3 stagger-children">{[0, 1, 2].map(i => <SkeletonCard key={i} />)}</div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Settings} title="No projects found" subtitle="Create a project first, then configure its agents." />
      ) : (
        <div className="space-y-2 stagger-children">
          {filtered.map((p) => {
            const s = agentStatuses[p.id] || { technical: false, functional: false, reminders: false };
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/agent-config/${p.id}`)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all group animate-stagger-in"
              >
                <div className="flex items-center gap-4">
                  {/* Project info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#6b7280' }} />
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-400 truncate mt-0.5">{p.description}</div>}
                    </div>
                    <StatusBadge status={p.status || 'ACTIVE'} colorMap={PROJECT_STATUS_COLORS} />
                  </div>

                  {/* Agent statuses */}
                  <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-gray-400" />
                      {badge(s.technical)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-gray-400" />
                      {badge(s.functional)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-gray-400" />
                      {badge(s.reminders)}
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                </div>

                {/* Mobile agent status row */}
                <div className="flex sm:hidden items-center gap-3 mt-2.5 pt-2.5 border-t border-gray-100 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> Technical: {s.technical ? 'On' : 'Off'}</span>
                  <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> Functional: {s.functional ? 'On' : 'Off'}</span>
                  <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> Reminders: {s.reminders ? 'On' : 'Off'}</span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-gray-400 py-8 text-sm">No projects match your search</div>
          )}
        </div>
      )}
    </div>
  );
}
