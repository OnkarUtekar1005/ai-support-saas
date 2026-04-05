import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, Search, UserCircle, Mail, Phone } from 'lucide-react';
import { StatusBadge, Modal, EmptyState, PageHeader, SlideOver, SkeletonTable, useToast, ProjectSelector, Pagination } from '../components/shared';
import { CONTACT_STATUS_COLORS, CONTACT_STATUSES, CONTACT_SOURCES, formatDate } from '../constants';

export function ContactsPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || '';
  const toast = useToast();
  const [contacts, setContacts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filterProject, setFilterProject] = useState(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', status: 'ACTIVE', source: '', notes: '', companyId: '', projectId });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchContacts = () => {
    const params = new URLSearchParams();
    if (filterProject) params.set('projectId', filterProject);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', '10');
    api.getContacts(params.toString()).then((data: any) => { setContacts(data.contacts); setTotal(data.total || 0); setTotalPages(data.totalPages || 1); setLoading(false); });
  };

  useEffect(() => { fetchContacts(); }, [filterProject, search, page]);
  useEffect(() => { setPage(1); }, [filterProject, search]);
  useEffect(() => { api.getProjects().then((p: any) => setProjects(p)); api.getCompanies().then((c: any) => setCompanies(c)); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createContact({ ...form, companyId: form.companyId || null, projectId: form.projectId || null });
      setShowCreate(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', status: 'ACTIVE', source: '', notes: '', companyId: '', projectId: filterProject });
      toast.success('Contact created');
      fetchContacts();
    } catch { toast.error('Failed to create contact'); }
  };

  const viewDetail = async (id: string) => { const data = await api.getContact(id); setShowDetail(data); };

  return (
    <div className="animate-page-in">
      <PageHeader title="Contacts" subtitle="Manage your customer and lead database" action={{ label: 'Add Contact', icon: Plus, onClick: () => setShowCreate(true) }} />

      <div className="flex flex-wrap items-center gap-3 mt-4 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="input-field pl-9" />
        </div>
        <ProjectSelector projects={projects} value={filterProject} onChange={setFilterProject} allowAll />
        {contacts.length > 0 && <span className="text-xs text-gray-400 ml-1">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>}
      </div>

      {loading ? <SkeletonTable rows={4} /> : contacts.length === 0 ? (
        <EmptyState icon={UserCircle} title="No contacts found" subtitle="Add your first contact to get started." action={{ label: 'Add Contact', onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3 hidden sm:table-cell">Email</th>
                <th className="px-5 py-3 hidden md:table-cell">Company</th>
                <th className="px-5 py-3 hidden lg:table-cell">Project</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right hidden sm:table-cell">Deals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 stagger-children">
              {contacts.map((c) => (
                <tr key={c.id} onClick={() => viewDetail(c.id)} className="hover:bg-gray-50 cursor-pointer transition-colors animate-stagger-in">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-gray-500">{c.firstName?.charAt(0)}{c.lastName?.charAt(0)}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm text-gray-900">{c.firstName} {c.lastName}</div>
                        {c.jobTitle && <div className="text-xs text-gray-400">{c.jobTitle}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 hidden sm:table-cell">{c.email || '--'}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 hidden md:table-cell">{c.company?.name || '--'}</td>
                  <td className="px-5 py-3.5 hidden lg:table-cell">
                    {c.project ? <span className="inline-flex items-center gap-1.5 text-xs"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.project.color }} />{c.project.name}</span> : <span className="text-xs text-gray-400">--</span>}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={c.status} colorMap={CONTACT_STATUS_COLORS} /></td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 text-right hidden sm:table-cell">{c._count?.deals || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Contact">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">First Name</label><input value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} className="input-field" required /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label><input value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} className="input-field" required /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} className="input-field" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label><input value={form.jobTitle} onChange={(e) => setForm(f => ({ ...f, jobTitle: e.target.value }))} className="input-field" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))} className="input-field"><option value="">Select...</option>{CONTACT_SOURCES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}</select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <select value={form.companyId} onChange={(e) => setForm(f => ({ ...f, companyId: e.target.value }))} className="input-field"><option value="">None</option>{companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
              <select value={form.projectId} onChange={(e) => setForm(f => ({ ...f, projectId: e.target.value }))} className="input-field"><option value="">None</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </div>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Notes</label><textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field" rows={2} /></div>
          <div className="flex gap-3 justify-end pt-2"><button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button type="submit" className="btn-primary">Add Contact</button></div>
        </form>
      </Modal>

      <SlideOver open={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail ? `${showDetail.firstName} ${showDetail.lastName}` : ''}>
        {showDetail && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-500">{showDetail.firstName?.charAt(0)}{showDetail.lastName?.charAt(0)}</span>
              </div>
              <div>
                {showDetail.jobTitle && <div className="text-sm text-gray-600">{showDetail.jobTitle}</div>}
                {showDetail.company?.name && <div className="text-sm text-gray-500">{showDetail.company.name}</div>}
                <StatusBadge status={showDetail.status} colorMap={CONTACT_STATUS_COLORS} />
              </div>
            </div>
            <div className="space-y-3">
              {showDetail.email && <div className="flex items-center gap-3 text-sm"><Mail className="w-4 h-4 text-gray-400" /><span className="text-gray-700">{showDetail.email}</span></div>}
              {showDetail.phone && <div className="flex items-center gap-3 text-sm"><Phone className="w-4 h-4 text-gray-400" /><span className="text-gray-700">{showDetail.phone}</span></div>}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 rounded-xl p-4">
              <div><span className="text-xs text-gray-500 block mb-0.5">Source</span><span className="text-gray-900">{showDetail.source || '--'}</span></div>
              <div><span className="text-xs text-gray-500 block mb-0.5">Deals</span><span className="text-gray-900">{showDetail.deals?.length || 0}</span></div>
            </div>
            {showDetail.notes && <div><h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</h3><p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{showDetail.notes}</p></div>}
            {showDetail.deals?.length > 0 && (
              <div><h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Deals ({showDetail.deals.length})</h3>
                <div className="space-y-1">{showDetail.deals.map((d: any) => <div key={d.id} className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-lg text-sm"><span className="text-gray-900">{d.title}</span><span className="text-green-600 font-semibold">${d.value.toLocaleString()}</span></div>)}</div>
              </div>
            )}
            {showDetail.activities?.length > 0 && (
              <div><h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Activities</h3>
                <div className="space-y-1">{showDetail.activities.map((a: any) => <div key={a.id} className="py-2.5 px-3 bg-gray-50 rounded-lg text-sm"><span className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded mr-2 font-medium">{a.type}</span><span className="text-gray-700">{a.subject}</span></div>)}</div>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
}
