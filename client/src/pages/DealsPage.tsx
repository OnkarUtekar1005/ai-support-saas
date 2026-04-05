import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, DollarSign, TrendingUp, Award } from 'lucide-react';
import { Modal, PageHeader, SkeletonCard, useToast, ProjectSelector } from '../components/shared';
import { DEAL_STAGES, DEAL_STAGE_COLORS, DEAL_STAGE_BG, CURRENCIES } from '../constants';

export function DealsPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState(searchParams.get('projectId') || '');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', value: '', currency: 'USD', stage: 'LEAD', probability: '20',
    expectedClose: '', notes: '', contactId: '', companyId: '', projectId: '',
  });

  const fetchPipeline = () => {
    api.getDealPipeline(filterProject || undefined)
      .then((data: any) => { setPipeline(data); setLoading(false); })
      .catch(() => { toast('Failed to load pipeline', 'error'); setLoading(false); });
  };

  useEffect(() => { fetchPipeline(); }, [filterProject]);
  useEffect(() => {
    Promise.all([api.getProjects(), api.getContacts(), api.getCompanies()])
      .then(([p, c, co]: any) => { setProjects(p); setContacts(c.contacts || c); setCompanies(co); })
      .catch(() => toast('Failed to load data', 'error'));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createDeal({
        ...form, value: Number(form.value) || 0, probability: Number(form.probability) || 0,
        contactId: form.contactId || null, companyId: form.companyId || null,
        projectId: form.projectId || null, expectedClose: form.expectedClose || null,
      });
      setShowCreate(false);
      setForm({ title: '', value: '', currency: 'USD', stage: 'LEAD', probability: '20', expectedClose: '', notes: '', contactId: '', companyId: '', projectId: '' });
      toast('Deal created');
      fetchPipeline();
    } catch { toast('Failed to create deal', 'error'); }
  };

  const updateStage = async (dealId: string, stage: string) => {
    try { await api.updateDeal(dealId, { stage }); fetchPipeline(); }
    catch { toast('Failed to update deal', 'error'); }
  };

  const totalPipelineValue = pipeline.filter((s) => !['CLOSED_WON', 'CLOSED_LOST'].includes(s.stage)).reduce((sum, s) => sum + s.totalValue, 0);
  const wonValue = pipeline.find((s) => s.stage === 'CLOSED_WON')?.totalValue || 0;

  return (
    <div className="animate-page-in">
      <PageHeader title="Deal Pipeline" subtitle="Track deals across your sales pipeline" action={{ label: 'New Deal', icon: Plus, onClick: () => setShowCreate(true) }} />

      {/* Stats + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4 mb-6">
        <div className="flex gap-3 flex-1">
          <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-4 py-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <div><div className="text-sm font-bold text-gray-900">${totalPipelineValue.toLocaleString()}</div><div className="text-[10px] text-gray-500">Pipeline</div></div>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-4 py-2">
            <Award className="w-4 h-4 text-green-600" />
            <div><div className="text-sm font-bold text-green-600">${wonValue.toLocaleString()}</div><div className="text-[10px] text-gray-500">Won</div></div>
          </div>
        </div>
        <ProjectSelector projects={projects} value={filterProject} onChange={setFilterProject} allowAll />
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
          {pipeline.map((stage) => (
            <div key={stage.stage} className="flex-shrink-0 w-[280px] sm:w-72 snap-start">
              <div className={`bg-white rounded-t-xl border-t-4 ${DEAL_STAGE_COLORS[stage.stage]} px-4 py-3 flex items-center justify-between shadow-sm`}>
                <div>
                  <span className="font-semibold text-sm text-gray-900">{stage.stage.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-gray-400 ml-2">({stage.count})</span>
                </div>
                <span className="text-xs font-semibold text-green-600">${stage.totalValue.toLocaleString()}</span>
              </div>
              <div className={`space-y-2 mt-1 min-h-[200px] rounded-b-xl p-2 ${DEAL_STAGE_BG[stage.stage] || 'bg-gray-50'}`}>
                {stage.deals.map((deal: any) => (
                  <div key={deal.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-all">
                    <div className="font-medium text-sm text-gray-900 mb-1.5 truncate">{deal.title}</div>
                    <div className="flex items-center gap-1 text-green-600 font-bold text-sm mb-2">
                      <DollarSign className="w-3.5 h-3.5" />{deal.value.toLocaleString()} {deal.currency}
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {deal.contact && <div>{deal.contact.firstName} {deal.contact.lastName}</div>}
                      {deal.company && <div>{deal.company.name}</div>}
                    </div>
                    {!['CLOSED_WON', 'CLOSED_LOST'].includes(stage.stage) && (
                      <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-gray-100">
                        {stage.stage !== 'LEAD' && (
                          <button onClick={() => updateStage(deal.id, DEAL_STAGES[DEAL_STAGES.indexOf(stage.stage) - 1])} className="text-xs text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors">&larr;</button>
                        )}
                        {DEAL_STAGES.indexOf(stage.stage) < 3 && (
                          <button onClick={() => updateStage(deal.id, DEAL_STAGES[DEAL_STAGES.indexOf(stage.stage) + 1])} className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">&rarr;</button>
                        )}
                        <div className="flex-1" />
                        <button onClick={() => updateStage(deal.id, 'CLOSED_WON')} className="text-xs text-green-600 hover:bg-green-50 px-1.5 py-0.5 rounded transition-colors">Won</button>
                        <button onClick={() => updateStage(deal.id, 'CLOSED_LOST')} className="text-xs text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded transition-colors">Lost</button>
                      </div>
                    )}
                  </div>
                ))}
                {stage.deals.length === 0 && <div className="text-center py-8 text-xs text-gray-400">No deals</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Deal">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deal Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input-field" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
              <input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="input-field">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Probability %</label>
              <input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact</label>
              <select value={form.contactId} onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))} className="input-field">
                <option value="">None</option>
                {contacts.map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Expected Close</label>
              <input type="date" value={form.expectedClose} onChange={(e) => setForm((f) => ({ ...f, expectedClose: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
              <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className="input-field">
                <option value="">None</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Deal</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
