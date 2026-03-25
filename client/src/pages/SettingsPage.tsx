import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Save, UserPlus, Mail, FolderOpen, X, Plus, Shield } from 'lucide-react';

export function SettingsPage() {
  const { organization, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<'team' | 'email'>('team');
  const [emailSettings, setEmailSettings] = useState<any>({
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '',
    adminEmails: [''], notifyOnError: true, notifyOnFatal: true,
    digestEnabled: false, digestCron: '0 9 * * *',
  });
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'AGENT', password: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [assignModal, setAssignModal] = useState<any>(null); // user to assign projects to
  const [assignProjectId, setAssignProjectId] = useState('');

  const fetchUsers = () => api.getUsers().then((data: any) => setUsers(data));

  useEffect(() => {
    if (tab === 'email') {
      api.getEmailSettings().then((data: any) => {
        if (data) setEmailSettings({ ...data, smtpPass: '' });
      });
    }
    if (tab === 'team') {
      fetchUsers();
      api.getProjects().then((p: any) => setProjects(p));
    }
  }, [tab]);

  const saveEmailSettings = async () => {
    setSaving(true);
    try {
      await api.updateEmailSettings(emailSettings);
      setMessage('Email settings saved');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.inviteUser(inviteForm);
      setInviteForm({ email: '', name: '', role: 'AGENT', password: '' });
      fetchUsers();
      setMessage('User invited');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to invite user');
    }
  };

  const assignProject = async () => {
    if (!assignModal || !assignProjectId) return;
    try {
      await fetch(`/api/admin/users/${assignModal.id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ projectId: assignProjectId, projectRole: 'MANAGER' }),
      });
      setAssignProjectId('');
      fetchUsers();
      setMessage(`Project assigned to ${assignModal.name}`);
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to assign project');
    }
  };

  const removeProject = async (userId: string, projectId: string) => {
    try {
      await fetch(`/api/admin/users/${userId}/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchUsers();
    } catch {}
  };

  const ROLES = isSuperAdmin
    ? ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'VIEWER']
    : ['ADMIN', 'AGENT', 'VIEWER'];

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-700',
    ADMIN: 'bg-blue-100 text-blue-700',
    AGENT: 'bg-green-100 text-green-700',
    VIEWER: 'bg-gray-100 text-gray-600',
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">{organization?.name} — {organization?.plan} plan</p>

      {message && (
        <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm mb-4 animate-fade-in">{message}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: 'team', label: 'Team & Roles', icon: UserPlus },
          { key: 'email', label: 'Email Alerts', icon: Mail },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── Team Tab ─── */}
      {tab === 'team' && (
        <div className="max-w-3xl space-y-6">
          {/* Role hierarchy info */}
          <div className="card-static bg-blue-50/50 border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-blue-900">Role Hierarchy</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="badge bg-purple-100 text-purple-700">SUPER_ADMIN — Full access, all projects</span>
              <span className="badge bg-blue-100 text-blue-700">ADMIN — Manages assigned projects only</span>
              <span className="badge bg-green-100 text-green-700">AGENT — Works on assigned projects</span>
              <span className="badge bg-gray-100 text-gray-600">VIEWER — Read-only</span>
            </div>
          </div>

          {/* Team members */}
          <div className="card-static">
            <h2 className="font-semibold mb-4">Team Members</h2>
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{u.name?.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{u.name}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => {
                          api.updateUserRole(u.id, e.target.value).then(() => {
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: e.target.value } : x)));
                          });
                        }}
                        className="input-field w-auto text-xs py-1"
                        disabled={!isSuperAdmin && u.role === 'SUPER_ADMIN'}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {isSuperAdmin && u.role !== 'SUPER_ADMIN' && (
                        <button
                          onClick={() => setAssignModal(u)}
                          className="btn-ghost text-xs flex items-center gap-1 text-blue-600"
                          title="Assign projects"
                        >
                          <FolderOpen className="w-3.5 h-3.5" /> Projects
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Project badges */}
                  {u.projectMembers?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-12">
                      {u.projectMembers.map((pm: any) => (
                        <span key={pm.project.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pm.project.color }} />
                          {pm.project.name}
                          <span className="text-gray-400">({pm.role})</span>
                          {isSuperAdmin && (
                            <button onClick={() => removeProject(u.id, pm.project.id)} className="text-gray-400 hover:text-red-500 ml-0.5">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {u.role === 'SUPER_ADMIN' && (
                    <div className="ml-12 mt-1.5 text-xs text-purple-600 font-medium">Access to all projects</div>
                  )}
                  {(u.role === 'ADMIN' || u.role === 'AGENT') && u.projectMembers?.length === 0 && (
                    <div className="ml-12 mt-1.5 text-xs text-amber-600">No projects assigned — user has no data access</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Invite */}
          <form onSubmit={inviteUser} className="card-static space-y-3">
            <h2 className="font-semibold">Invite Team Member</h2>
            <div className="grid grid-cols-2 gap-3">
              <input value={inviteForm.name} onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Name" required />
              <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} className="input-field" placeholder="Email" required />
              <input type="password" value={inviteForm.password} onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))} className="input-field" placeholder="Password" required />
              <select value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))} className="input-field">
                {ROLES.filter(r => r !== 'SUPER_ADMIN').map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-primary flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Invite
            </button>
          </form>
        </div>
      )}

      {/* ─── Email Tab ─── */}
      {tab === 'email' && (
        <div className="card-static max-w-2xl space-y-4">
          <h2 className="font-semibold">SMTP Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
              <input value={emailSettings.smtpHost} onChange={(e) => setEmailSettings((s: any) => ({ ...s, smtpHost: e.target.value }))} className="input-field" placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
              <input type="number" value={emailSettings.smtpPort} onChange={(e) => setEmailSettings((s: any) => ({ ...s, smtpPort: Number(e.target.value) }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP User</label>
              <input value={emailSettings.smtpUser} onChange={(e) => setEmailSettings((s: any) => ({ ...s, smtpUser: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
              <input type="password" value={emailSettings.smtpPass} onChange={(e) => setEmailSettings((s: any) => ({ ...s, smtpPass: e.target.value }))} className="input-field" placeholder="Leave blank to keep existing" />
            </div>
          </div>

          <h2 className="font-semibold pt-4">Admin Emails</h2>
          <div className="space-y-2">
            {emailSettings.adminEmails.map((email: string, i: number) => (
              <div key={i} className="flex gap-2">
                <input value={email} onChange={(e) => { const emails = [...emailSettings.adminEmails]; emails[i] = e.target.value; setEmailSettings((s: any) => ({ ...s, adminEmails: emails })); }} className="input-field" placeholder="admin@company.com" />
                {emailSettings.adminEmails.length > 1 && (
                  <button onClick={() => setEmailSettings((s: any) => ({ ...s, adminEmails: s.adminEmails.filter((_: any, j: number) => j !== i) }))} className="text-red-500 text-sm">Remove</button>
                )}
              </div>
            ))}
            <button onClick={() => setEmailSettings((s: any) => ({ ...s, adminEmails: [...s.adminEmails, ''] }))} className="text-blue-600 text-sm font-medium">+ Add email</button>
          </div>

          <h2 className="font-semibold pt-4">Notification Preferences</h2>
          <div className="space-y-2">
            {[
              { key: 'notifyOnError', label: 'Notify on ERROR level' },
              { key: 'notifyOnFatal', label: 'Notify on FATAL level' },
              { key: 'digestEnabled', label: 'Enable daily error digest' },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center gap-2">
                <input type="checkbox" checked={emailSettings[opt.key]} onChange={(e) => setEmailSettings((s: any) => ({ ...s, [opt.key]: e.target.checked }))} className="rounded" />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>

          <button onClick={saveEmailSettings} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ─── Assign Project Modal ─── */}
      {assignModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Assign Projects to {assignModal.name}</h2>
              <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <p className="text-sm text-gray-500">
              Role: <span className={`badge ${roleColors[assignModal.role]}`}>{assignModal.role}</span>
              {assignModal.role === 'ADMIN' && ' — will manage selected projects'}
              {assignModal.role === 'AGENT' && ' — will work on selected projects'}
            </p>

            {/* Current projects */}
            {assignModal.projectMembers?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1.5">Current Projects</div>
                <div className="flex flex-wrap gap-2">
                  {assignModal.projectMembers.map((pm: any) => (
                    <span key={pm.project.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-lg text-sm">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pm.project.color }} />
                      {pm.project.name}
                      <button onClick={() => { removeProject(assignModal.id, pm.project.id); setAssignModal({ ...assignModal, projectMembers: assignModal.projectMembers.filter((p: any) => p.project.id !== pm.project.id) }); }} className="text-gray-400 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Add project */}
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1.5">Add Project</div>
              <div className="flex gap-2">
                <select value={assignProjectId} onChange={(e) => setAssignProjectId(e.target.value)} className="input-field flex-1">
                  <option value="">Select a project...</option>
                  {projects
                    .filter((p) => !assignModal.projectMembers?.some((pm: any) => pm.project.id === p.id))
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))
                  }
                </select>
                <button
                  onClick={() => {
                    assignProject().then(() => {
                      const proj = projects.find((p: any) => p.id === assignProjectId);
                      if (proj) {
                        setAssignModal({
                          ...assignModal,
                          projectMembers: [...(assignModal.projectMembers || []), { role: 'MANAGER', project: { id: proj.id, name: proj.name, color: proj.color } }],
                        });
                      }
                      setAssignProjectId('');
                    });
                  }}
                  disabled={!assignProjectId}
                  className="btn-primary text-sm px-3 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setAssignModal(null)} className="btn-secondary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
