import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, Building2, Search } from 'lucide-react';

export function CompaniesPage() {
  const [searchParams] = useSearchParams();
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState(searchParams.get('projectId') || '');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', domain: '', industry: '', size: '', phone: '', address: '', notes: '', projectId: '' });

  const fetchCompanies = () => {
    const params = new URLSearchParams();
    if (filterProject) params.set('projectId', filterProject);
    if (search) params.set('search', search);
    api.getCompanies(params.toString()).then((data: any) => { setCompanies(data); setLoading(false); });
  };

  useEffect(() => { fetchCompanies(); }, [filterProject, search]);
  useEffect(() => { api.getProjects().then((p: any) => setProjects(p)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createCompany({ ...form, projectId: form.projectId || null });
    setShowCreate(false);
    setForm({ name: '', domain: '', industry: '', size: '', phone: '', address: '', notes: '', projectId: '' });
    fetchCompanies();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Company
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..." className="input-field pl-9" />
        </div>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input-field w-auto">
          <option value="">All Projects</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? <div className="text-gray-500">Loading...</div> : companies.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">No companies found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c) => (
            <div key={c.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="w-5 h-5 text-gray-400" />
                <h3 className="font-semibold text-gray-900">{c.name}</h3>
              </div>
              {c.domain && <div className="text-sm text-blue-600 mb-1">{c.domain}</div>}
              <div className="flex gap-3 text-xs text-gray-500 mb-2">
                {c.industry && <span>{c.industry}</span>}
                {c.size && <span>{c.size} employees</span>}
              </div>
              {c.project && (
                <span className="inline-flex items-center gap-1 text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.project.color }} />
                  {c.project.name}
                </span>
              )}
              <div className="flex gap-4 text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                <span>{c._count?.contacts || 0} contacts</span>
                <span>{c._count?.deals || 0} deals</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-3">
            <h2 className="text-lg font-bold">Add Company</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Domain</label>
                <input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} className="input-field" placeholder="company.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                <input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
                <select value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} className="input-field">
                  <option value="">Select...</option>
                  {['1-10', '11-50', '51-200', '201-500', '500+'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
              <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className="input-field">
                <option value="">None</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Add Company</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
