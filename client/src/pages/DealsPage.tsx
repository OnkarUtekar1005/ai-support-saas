import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, DollarSign } from 'lucide-react';

const STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];
const STAGE_COLORS: Record<string, string> = {
  LEAD: 'border-t-gray-400',
  QUALIFIED: 'border-t-blue-500',
  PROPOSAL: 'border-t-purple-500',
  NEGOTIATION: 'border-t-yellow-500',
  CLOSED_WON: 'border-t-green-500',
  CLOSED_LOST: 'border-t-red-500',
};

export function DealsPage() {
  const [searchParams] = useSearchParams();
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
    api.getDealPipeline(filterProject || undefined).then((data: any) => { setPipeline(data); setLoading(false); });
  };

  useEffect(() => { fetchPipeline(); }, [filterProject]);
  useEffect(() => {
    Promise.all([api.getProjects(), api.getContacts(), api.getCompanies()]).then(([p, c, co]: any) => {
      setProjects(p);
      setContacts(c.contacts || c);
      setCompanies(co);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createDeal({
      ...form,
      value: Number(form.value) || 0,
      probability: Number(form.probability) || 0,
      contactId: form.contactId || null,
      companyId: form.companyId || null,
      projectId: form.projectId || null,
      expectedClose: form.expectedClose || null,
    });
    setShowCreate(false);
    setForm({ title: '', value: '', currency: 'USD', stage: 'LEAD', probability: '20', expectedClose: '', notes: '', contactId: '', companyId: '', projectId: '' });
    fetchPipeline();
  };

  const updateStage = async (dealId: string, stage: string) => {
    await api.updateDeal(dealId, { stage });
    fetchPipeline();
  };

  const totalPipelineValue = pipeline
    .filter((s) => !['CLOSED_WON', 'CLOSED_LOST'].includes(s.stage))
    .reduce((sum, s) => sum + s.totalValue, 0);

  const wonValue = pipeline.find((s) => s.stage === 'CLOSED_WON')?.totalValue || 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deal Pipeline</h1>
          <div className="flex gap-4 text-sm text-gray-500 mt-1">
            <span>Pipeline: <span className="font-semibold text-gray-900">${totalPipelineValue.toLocaleString()}</span></span>
            <span>Won: <span className="font-semibold text-green-600">${wonValue.toLocaleString()}</span></span>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input-field w-auto">
            <option value="">All Projects</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Deal
          </button>
        </div>
      </div>

      {loading ? <div className="text-gray-500">Loading pipeline...</div> : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {pipeline.map((stage) => (
            <div key={stage.stage} className="flex-shrink-0 w-72">
              {/* Stage header */}
              <div className={`bg-white rounded-t-lg border-t-4 ${STAGE_COLORS[stage.stage]} px-3 py-2 flex items-center justify-between`}>
                <div>
                  <span className="font-semibold text-sm">{stage.stage.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-gray-500 ml-2">({stage.count})</span>
                </div>
                <span className="text-xs font-medium text-green-600">${stage.totalValue.toLocaleString()}</span>
              </div>

              {/* Deal cards */}
              <div className="space-y-2 mt-2 min-h-[200px]">
                {stage.deals.map((deal: any) => (
                  <div key={deal.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="font-medium text-sm text-gray-900 mb-1">{deal.title}</div>
                    <div className="flex items-center gap-1 text-green-600 font-semibold text-sm mb-2">
                      <DollarSign className="w-3.5 h-3.5" />
                      {deal.value.toLocaleString()} {deal.currency}
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {deal.contact && <div>{deal.contact.firstName} {deal.contact.lastName}</div>}
                      {deal.company && <div>{deal.company.name}</div>}
                      {deal.owner && <div>Owner: {deal.owner.name}</div>}
                    </div>

                    {/* Quick stage move buttons */}
                    {!['CLOSED_WON', 'CLOSED_LOST'].includes(stage.stage) && (
                      <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100">
                        {stage.stage !== 'LEAD' && (
                          <button
                            onClick={() => updateStage(deal.id, STAGES[STAGES.indexOf(stage.stage) - 1])}
                            className="text-xs text-gray-500 hover:text-gray-700 px-1"
                          >
                            &larr;
                          </button>
                        )}
                        {STAGES.indexOf(stage.stage) < 3 && (
                          <button
                            onClick={() => updateStage(deal.id, STAGES[STAGES.indexOf(stage.stage) + 1])}
                            className="text-xs text-blue-600 hover:text-blue-800 px-1"
                          >
                            &rarr;
                          </button>
                        )}
                        <div className="flex-1" />
                        <button onClick={() => updateStage(deal.id, 'CLOSED_WON')} className="text-xs text-green-600 hover:text-green-800">Won</button>
                        <button onClick={() => updateStage(deal.id, 'CLOSED_LOST')} className="text-xs text-red-500 hover:text-red-700 ml-1">Lost</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-3">
            <h2 className="text-lg font-bold">New Deal</h2>
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
                  {['USD', 'EUR', 'GBP', 'INR', 'AUD'].map((c) => <option key={c}>{c}</option>)}
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
        </div>
      )}
    </div>
  );
}
