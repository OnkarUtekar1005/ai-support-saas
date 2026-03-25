import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, Search, UserCircle, X } from 'lucide-react';

export function ContactsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || '';
  const [contacts, setContacts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', jobTitle: '',
    status: 'ACTIVE', source: '', notes: '', companyId: '', projectId: projectId,
  });

  const fetchContacts = () => {
    const params = new URLSearchParams();
    if (filterProject) params.set('projectId', filterProject);
    if (search) params.set('search', search);
    api.getContacts(params.toString()).then((data: any) => { setContacts(data.contacts); setLoading(false); });
  };

  useEffect(() => { fetchContacts(); }, [filterProject, search]);
  useEffect(() => {
    api.getProjects().then((p: any) => setProjects(p));
    api.getCompanies().then((c: any) => setCompanies(c));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createContact({ ...form, companyId: form.companyId || null, projectId: form.projectId || null });
    setShowCreate(false);
    setForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', status: 'ACTIVE', source: '', notes: '', companyId: '', projectId: filterProject });
    fetchContacts();
  };

  const viewDetail = async (id: string) => {
    const data = await api.getContact(id);
    setShowDetail(data);
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    LEAD: 'bg-blue-100 text-blue-700',
    CUSTOMER: 'bg-purple-100 text-purple-700',
    INACTIVE: 'bg-gray-100 text-gray-600',
    CHURNED: 'bg-red-100 text-red-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Contact
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="input-field pl-9" />
        </div>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input-field w-auto">
          <option value="">All Projects</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Contact list */}
      {loading ? <div className="text-gray-500">Loading...</div> : contacts.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">No contacts found.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Deals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} onClick={() => viewDetail(c.id)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-sm">{c.firstName} {c.lastName}</div>
                        {c.jobTitle && <div className="text-xs text-gray-500">{c.jobTitle}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.company?.name || '—'}</td>
                  <td className="px-4 py-3">
                    {c.project && (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.project.color }} />
                        {c.project.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[c.status] || 'bg-gray-100'}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c._count?.deals || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-3">
            <h2 className="text-lg font-bold">Add Contact</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
                <input value={form.jobTitle} onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className="input-field">
                  <option value="">Select...</option>
                  {['Website', 'Referral', 'Cold Call', 'LinkedIn', 'Event', 'Other'].map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                <select value={form.companyId} onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))} className="input-field">
                  <option value="">None</option>
                  {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className="input-field">
                  <option value="">None</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-field" rows={2} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Add Contact</button>
            </div>
          </form>
        </div>
      )}

      {/* Detail Slide-over */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-50">
          <div className="w-full max-w-lg bg-white h-full overflow-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{showDetail.firstName} {showDetail.lastName}</h2>
              <button onClick={() => setShowDetail(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Email:</span> {showDetail.email || '—'}</div>
                <div><span className="text-gray-500">Phone:</span> {showDetail.phone || '—'}</div>
                <div><span className="text-gray-500">Title:</span> {showDetail.jobTitle || '—'}</div>
                <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[showDetail.status]}`}>{showDetail.status}</span></div>
                <div><span className="text-gray-500">Company:</span> {showDetail.company?.name || '—'}</div>
                <div><span className="text-gray-500">Source:</span> {showDetail.source || '—'}</div>
              </div>
              {showDetail.notes && <div><span className="text-sm text-gray-500">Notes:</span><p className="text-sm mt-1">{showDetail.notes}</p></div>}
              {showDetail.deals?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Deals ({showDetail.deals.length})</h3>
                  {showDetail.deals.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                      <span>{d.title}</span>
                      <span className="text-green-600 font-medium">${d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {showDetail.activities?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Recent Activities</h3>
                  {showDetail.activities.map((a: any) => (
                    <div key={a.id} className="py-2 border-b border-gray-100 text-sm">
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-2">{a.type}</span>
                      {a.subject}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
