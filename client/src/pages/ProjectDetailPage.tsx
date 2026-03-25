import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { ArrowLeft, Users, DollarSign, Building2, UserCircle, Activity } from 'lucide-react';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) api.getProject(id).then((data) => { setProject(data); setLoading(false); });
  }, [id]);

  if (loading) return <div className="text-gray-500">Loading project...</div>;
  if (!project) return <div className="text-red-500">Project not found</div>;

  const counts = project._count || {};

  return (
    <div>
      <button onClick={() => navigate('/projects')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Projects
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color }} />
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
          project.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
        }`}>{project.status}</span>
      </div>

      {project.description && <p className="text-gray-600 mb-6">{project.description}</p>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { icon: UserCircle, label: 'Contacts', value: counts.contacts || 0, onClick: () => navigate(`/contacts?projectId=${id}`) },
          { icon: Building2, label: 'Companies', value: counts.companies || 0, onClick: () => navigate(`/companies?projectId=${id}`) },
          { icon: DollarSign, label: 'Deals', value: counts.deals || 0, onClick: () => navigate(`/deals?projectId=${id}`) },
          { icon: Activity, label: 'Activities', value: counts.activities || 0, onClick: () => navigate(`/activities?projectId=${id}`) },
          { icon: Users, label: 'Members', value: counts.members || project.members?.length || 0 },
        ].map((s) => (
          <div
            key={s.label}
            onClick={s.onClick}
            className={`card text-center py-4 ${s.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
          >
            <s.icon className="w-5 h-5 mx-auto text-gray-400 mb-1" />
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Deal Pipeline Summary */}
      {project.dealsByStage?.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold mb-4">Deal Pipeline</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {project.dealsByStage.map((s: any) => (
              <div key={s.stage} className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">{s._count}</div>
                <div className="text-xs text-gray-500">{s.stage.replace(/_/g, ' ')}</div>
                <div className="text-xs text-green-600 font-medium">${(s._sum.value || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
      {project.members?.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Team Members</h2>
          <div className="space-y-2">
            {project.members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="font-medium text-sm">{m.user.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{m.user.email}</span>
                </div>
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
