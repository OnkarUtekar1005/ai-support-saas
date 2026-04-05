import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { ClipboardList, AlertCircle } from 'lucide-react';
import { StatusBadge, EmptyState, PageHeader, SkeletonTable, useToast } from '../components/shared';
import { PRIORITY_COLORS, STATUS_COLORS, formatDate } from '../constants';

export function MyTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTickets()
      .then((data: any) => {
        const all = data.tickets || data || [];
        const mine = all.filter((t: any) => t.assigneeId === user?.id || t.assignee?.id === user?.id);
        setTickets(mine);
      })
      .catch(() => { toast('Failed to load tasks', 'error'); setTickets([]); })
      .finally(() => setLoading(false));
  }, [user?.id]);

  // Group by project
  const grouped: Record<string, { name: string; color: string; tickets: any[] }> = {};
  tickets.forEach((t) => {
    const pid = t.projectId || 'unassigned';
    if (!grouped[pid]) {
      grouped[pid] = {
        name: t.project?.name || 'Unassigned Project',
        color: t.project?.color || '#6b7280',
        tickets: [],
      };
    }
    grouped[pid].tickets.push(t);
  });

  const now = new Date();
  const isOverdue = (t: any) => {
    if (t.status === 'RESOLVED' || t.status === 'CLOSED') return false;
    const activities = t.activities || [];
    return activities.some((a: any) => a.dueDate && new Date(a.dueDate) < now && a.status !== 'DONE');
  };

  return (
    <div className="animate-page-in">
      <PageHeader title="My Tasks" subtitle="Tickets assigned to you" />

      {loading ? (
        <SkeletonTable rows={6} />
      ) : tickets.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No tasks assigned" subtitle="You don't have any tickets assigned to you yet." />
      ) : (
        <div className="space-y-6 stagger-children">
          {Object.entries(grouped).map(([pid, group]) => (
            <div key={pid}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                <h2 className="font-semibold text-gray-900 text-sm">{group.name}</h2>
                <span className="text-xs text-gray-400">({group.tickets.length})</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Title</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 hidden md:table-cell">Priority</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 hidden sm:table-cell">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.tickets.map((t) => (
                      <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}
                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${isOverdue(t) ? 'bg-red-50/50' : ''}`}>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex items-center gap-2">
                            {isOverdue(t) && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                            <span className="font-medium text-gray-900 truncate">{t.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell"><StatusBadge status={t.priority} colorMap={PRIORITY_COLORS} /></td>
                        <td className="px-4 py-3"><StatusBadge status={t.status} colorMap={STATUS_COLORS} /></td>
                        <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{formatDate(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
