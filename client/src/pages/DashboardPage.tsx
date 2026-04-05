import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Ticket, AlertTriangle, Users, CheckCircle, TrendingUp, ArrowRight, Activity, MessageSquare } from 'lucide-react';
import { StatusBadge, SkeletonCard, useToast } from '../components/shared';
import { PRIORITY_COLORS, STATUS_COLORS } from '../constants';

export function DashboardPage() {
  const { organization, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<any>(null);
  const [errorStats, setErrorStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      isAdmin ? api.getDashboard().catch(() => null) : null,
      isAdmin ? api.getErrorLogStats().catch(() => null) : null,
    ]).then(([dash, errors]) => {
      setDashboard(dash);
      setErrorStats(errors);
      setLoading(false);
    }).catch(() => { toast('Failed to load dashboard', 'error'); setLoading(false); });
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="animate-page-in space-y-6">
        <div className="h-8 skeleton-shimmer rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  const ticketStats = dashboard?.tickets || {};
  const totalTickets = Object.values(ticketStats).reduce((s: number, v: any) => s + (v || 0), 0);

  const statCards = [
    { icon: Ticket, label: 'Total Tickets', value: totalTickets, bg: 'bg-blue-50', ic: 'text-blue-600', path: '/tickets' },
    { icon: CheckCircle, label: 'Resolved', value: ticketStats.RESOLVED || 0, bg: 'bg-green-50', ic: 'text-green-600', path: '/tickets?status=RESOLVED' },
    { icon: AlertTriangle, label: 'Errors (24h)', value: errorStats?.last24h || 0, bg: 'bg-red-50', ic: 'text-red-600', path: '/error-logs' },
    { icon: Users, label: 'Team Members', value: dashboard?.users || 0, bg: 'bg-gray-100', ic: 'text-gray-600', path: '/settings' },
  ];

  return (
    <div className="animate-page-in space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{organization?.name} -- {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 stagger-children">
        {statCards.map((s) => (
          <div key={s.label} onClick={() => navigate(s.path)}
            className="card-static flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow animate-stagger-in">
            <div className={`p-2.5 rounded-lg ${s.bg} flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.ic}`} />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Recent tickets */}
        <div className="lg:col-span-2 card-static">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Tickets</h2>
            <button onClick={() => navigate('/tickets')} className="btn-ghost text-xs flex items-center gap-1 text-blue-600">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {dashboard?.recentTickets?.length > 0 ? (
            <div className="space-y-1">
              {dashboard.recentTickets.map((t: any) => (
                <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}
                  className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-gray-900 truncate">{t.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{new Date(t.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <StatusBadge status={t.priority} colorMap={PRIORITY_COLORS} />
                    <StatusBadge status={t.status} colorMap={STATUS_COLORS} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-gray-400">No tickets yet</div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Error level breakdown */}
          {errorStats?.byLevel && (
            <div className="card-static">
              <h2 className="font-semibold text-gray-900 mb-3">Error Levels (7d)</h2>
              <div className="space-y-2">
                {['FATAL', 'ERROR', 'WARN', 'INFO'].map((level) => {
                  const count = errorStats.byLevel[level] || 0;
                  const max = Math.max(...Object.values(errorStats.byLevel as Record<string, number>), 1);
                  const barColors: Record<string, string> = { FATAL: 'bg-red-600', ERROR: 'bg-orange-500', WARN: 'bg-amber-400', INFO: 'bg-blue-400' };
                  return (
                    <div key={level} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-500 w-12">{level}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${barColors[level]} rounded-full transition-all duration-500`} style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="card-static">
            <h2 className="font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="space-y-1.5">
              {[
                { label: 'New Ticket', icon: Ticket, path: '/tickets', color: 'text-blue-600' },
                { label: 'AI Assistant', icon: MessageSquare, path: '/chat', color: 'text-blue-600' },
                { label: 'View Pipeline', icon: TrendingUp, path: '/deals', color: 'text-green-600' },
                { label: 'Activities', icon: Activity, path: '/activities', color: 'text-purple-600' },
              ].map((action) => (
                <button key={action.path} onClick={() => navigate(action.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <action.icon className={`w-4 h-4 ${action.color}`} />
                  {action.label}
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
