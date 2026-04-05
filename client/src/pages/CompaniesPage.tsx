import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, Building2, Search } from 'lucide-react';
import { Modal, EmptyState, PageHeader, SkeletonCard, useToast, ProjectSelector, Pagination } from '../components/shared';
import { COMPANY_SIZES } from '../constants';

export function CompaniesPage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState(searchParams.get('projectId') || '');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', domain: '', industry: '', size: '', phone: '', address: '', notes: '', projectId: '' });
  const [page, setPage] = useState(1);

  const fetchCompanies = () => {
    const params = new URLSearchParams();
    if (filterProject) params.set('projectId', filterProject);
    if (search) params.set('search', search);
    api.getCompanies(params.toString()).then((data: any) => { setCompanies(data); setLoading(false); });
  };

  useEffect(() => { fetchCompanies(); }, [filterProject, search]);
  useEffect(() => { setPage(1); }, [filterProject, search]);
  useEffect(() => { api.getProjects().then((p: any) => setProjects(p)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCompany({ ...form, projectId: form.projectId || null });
      setShowCreate(false);
      setForm({ name: '', domain: '', industry: '', size: '', phone: '', address: '', notes: '', projectId: '' });
      toast.success('Company created');
      fetchCompanies();
    } catch { toast.error('Failed to create company'); }
  };

  return (
    <div className="animate-page-in">
      <PageHeader title="Companies" subtitle="Manage company accounts and organizations" action={{ label: 'Add Company', icon: Plus, onClick: () => setShowCreate(true) }} />

      <div className="flex flex-wrap items-center gap-3 mt-4 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..." className="input-field pl-9" />
        </div>
        <ProjectSelector projects={projects} value={filterProject} onChange={setFilterProject} allowAll />
        {companies.length > 0 && <span className="text-xs text-gray-400 ml-1">{companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}</span>}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : companies.length === 0 ? (
        <EmptyState icon={Building2} title="No companies found" subtitle="Add your first company to get started." action={{ label: 'Add Company', onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {companies.slice((page - 1) * 10, page * 10).map((c) => (
            <div key={c.id} className="card group animate-stagger-in">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4.5 h-4.5 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                  {c.domain && <div className="text-xs text-blue-600 truncate">{c.domain}</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                {c.industry && <span className="bg-gray-50 px-2 py-0.5 rounded">{c.industry}</span>}
                {c.size && <span className="bg-gray-50 px-2 py-0.5 rounded">{c.size} employees</span>}
              </div>
              {c.project && (
                <span className="inline-flex items-center gap-1.5 text-xs mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.project.color }} />
                  <span className="text-gray-500">{c.project.name}</span>
                </span>
              )}
              <div className="flex gap-4 text-xs text-gray-400 pt-3 border-t border-gray-100">
                <span>{c._count?.contacts || 0} contacts</span>
                <span>{c._count?.deals || 0} deals</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={Math.max(1, Math.ceil(companies.length / 10))} total={companies.length} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Company" maxWidth="max-w-md">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Domain</label><input value={form.domain} onChange={(e) => setForm(f => ({ ...f, domain: e.target.value }))} className="input-field" placeholder="company.com" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Industry</label><input value={form.industry} onChange={(e) => setForm(f => ({ ...f, industry: e.target.value }))} className="input-field" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
              <select value={form.size} onChange={(e) => setForm(f => ({ ...f, size: e.target.value }))} className="input-field"><option value="">Select...</option>{COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field" /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
            <select value={form.projectId} onChange={(e) => setForm(f => ({ ...f, projectId: e.target.value }))} className="input-field"><option value="">None</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button type="submit" className="btn-primary">Add Company</button></div>
        </form>
      </Modal>
    </div>
  );
}
