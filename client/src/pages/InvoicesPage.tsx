import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import {
  Receipt, Plus, FileText, ShoppingCart, Wrench, ExternalLink, Filter,
  X, Trash2, Loader2,
} from 'lucide-react';
import { StatusBadge, PageHeader, EmptyState, Modal, useToast } from '../components/shared';
import { formatDate } from '../constants';

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-sky-100 text-sky-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  INVOICE: { label: 'Invoice', icon: FileText, color: 'text-sky-600' },
  PURCHASE_ORDER: { label: 'PO', icon: ShoppingCart, color: 'text-purple-600' },
  WORK_ORDER: { label: 'WO', icon: Wrench, color: 'text-orange-600' },
};

const CURRENCIES = ['USD', 'INR', 'GBP', 'EUR', 'AUD', 'SGD', 'AED', 'CAD'];

const emptyForm = () => ({
  type: 'INVOICE',
  projectId: '',
  currency: 'USD',
  taxRate: '0',
  notes: '',
  dueDate: '',
  // Billing / Vendor details
  billingName: '',
  billingEmail: '',
  billingAddress: '',
  lineItems: [{ description: '', qty: '1', unitPrice: '' }],
});

export function InvoicesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const loadInvoices = () => {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (statusFilter) params.set('status', statusFilter);
    setLoading(true);
    api.getInvoices(params.toString() || undefined)
      .then((data: any) => setInvoices(data))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInvoices(); }, [typeFilter, statusFilter]);

  useEffect(() => {
    // Prefetch projects + contacts + companies for create modal
    api.getProjects().then((d: any) => setProjects((d || []).filter((p: any) => p.isMember)));
    api.getContacts().then((d: any) => setContacts(d.contacts || d || [])).catch(() => {});
    api.getCompanies().then((d: any) => setCompanies(d.companies || d || [])).catch(() => {});
  }, []);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const updated: any = await api.updateInvoice(id, { status });
      setInvoices((prev) => prev.map((inv) => inv.id === id ? { ...inv, status: updated.status } : inv));
      toast(`Marked as ${status.toLowerCase()}`);
    } catch { toast('Failed to update status', 'error'); }
  };

  // Line items
  const updateLine = (idx: number, field: string, value: string) => {
    setForm((f) => ({ ...f, lineItems: f.lineItems.map((li, i) => i === idx ? { ...li, [field]: value } : li) }));
  };
  const addLine = () => setForm((f) => ({ ...f, lineItems: [...f.lineItems, { description: '', qty: '1', unitPrice: '' }] }));
  const removeLine = (idx: number) => setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }));

  const subtotal = form.lineItems.reduce((s, li) => s + (parseFloat(li.qty) || 1) * (parseFloat(li.unitPrice) || 0), 0);
  const taxAmt = subtotal * (parseFloat(form.taxRate) || 0) / 100;
  const total = subtotal + taxAmt;

  // Auto-fill billing from contact
  const fillFromContact = (contactId: string) => {
    const c = contacts.find((c) => c.id === contactId);
    if (!c) return;
    setForm((f) => ({
      ...f,
      billingName: `${c.firstName} ${c.lastName}`,
      billingEmail: c.email || '',
      billingAddress: c.address || c.company?.address || '',
    }));
  };

  // Auto-fill vendor from company
  const fillFromCompany = (companyId: string) => {
    const c = companies.find((c) => c.id === companyId);
    if (!c) return;
    setForm((f) => ({
      ...f,
      billingName: c.name,
      billingEmail: c.email || '',
      billingAddress: c.address || '',
    }));
  };

  // Auto-fill from project's client contact
  const onProjectChange = (projectId: string) => {
    const p = projects.find((p) => p.id === projectId);
    setForm((f) => ({
      ...f,
      projectId,
      currency: p?.currency || f.currency,
      billingName: p?.clientContact ? `${p.clientContact.firstName} ${p.clientContact.lastName}` : f.billingName,
      billingEmail: p?.clientContact?.email || f.billingEmail,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId) { toast('Please select a project', 'error'); return; }
    setSaving(true);
    try {
      const lineItems = form.lineItems
        .filter((li) => li.description && li.unitPrice)
        .map((li) => ({ description: li.description, qty: parseFloat(li.qty) || 1, unitPrice: parseFloat(li.unitPrice) || 0 }));
      if (lineItems.length === 0) { toast('Add at least one line item', 'error'); setSaving(false); return; }

      const created: any = await api.createInvoice(form.projectId, {
        type: form.type,
        currency: form.currency,
        taxRate: form.taxRate,
        notes: form.notes || undefined,
        dueDate: form.dueDate || undefined,
        billingName: form.billingName || undefined,
        billingEmail: form.billingEmail || undefined,
        billingAddress: form.billingAddress || undefined,
        lineItems,
      });
      setInvoices((prev) => [{ ...created, project: projects.find((p) => p.id === form.projectId) }, ...prev]);
      setShowCreate(false);
      setForm(emptyForm());
      toast(`${TYPE_LABELS[form.type]?.label || 'Invoice'} created`);
    } catch (err: any) { toast(err.message || 'Failed to create', 'error'); }
    finally { setSaving(false); }
  };

  const total_v = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const paid_v = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + (i.total || 0), 0);
  const outstanding_v = invoices.filter((i) => ['DRAFT', 'SENT'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0);

  const isPO = form.type === 'PURCHASE_ORDER' || form.type === 'WORK_ORDER';

  return (
    <div className="animate-page-in">
      <PageHeader
        title="Invoices"
        subtitle="Manage invoices, purchase orders, and work orders"
        action={{ label: 'New Invoice / PO / WO', icon: Plus, onClick: () => { setForm(emptyForm()); setShowCreate(true); } }}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Value', value: total_v, color: 'text-gray-900' },
          { label: 'Paid', value: paid_v, color: 'text-green-600' },
          { label: 'Outstanding', value: outstanding_v, color: 'text-orange-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`text-2xl font-bold ${s.color}`}>${s.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <Filter className="w-4 h-4 text-gray-400" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="">All Types</option>
          <option value="INVOICE">Invoice</option>
          <option value="PURCHASE_ORDER">Purchase Order</option>
          <option value="WORK_ORDER">Work Order</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        {(typeFilter || statusFilter) && (
          <button onClick={() => { setTypeFilter(''); setStatusFilter(''); }}
            className="text-sm text-sky-600 hover:text-sky-800">Clear</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
      ) : invoices.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices found"
          subtitle="Create an invoice, purchase order, or work order."
          action={{ label: 'New Invoice', onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Project</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Contact / Vendor</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Due</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => {
                const typeInfo = TYPE_LABELS[inv.type] || TYPE_LABELS.INVOICE;
                const TypeIcon = typeInfo.icon;
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TypeIcon className={`w-4 h-4 flex-shrink-0 ${typeInfo.color}`} />
                        <span className="font-medium text-gray-900">{inv.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{typeInfo.label}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {inv.project ? (
                        <button onClick={() => navigate(`/projects/${inv.project.id}`)}
                          className="flex items-center gap-1.5 text-gray-700 hover:text-sky-600 transition-colors">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: inv.project.color }} />
                          {inv.project.name}
                        </button>
                      ) : '--'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">
                      {inv.billingName || (inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}` : '--')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {inv.currency} {(inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                      {inv.dueDate ? formatDate(inv.dueDate) : '--'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} colorMap={INVOICE_STATUS_COLORS} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {inv.project && (
                          <button onClick={() => navigate(`/projects/${inv.project.id}`)}
                            title="Open project"
                            className="p-1.5 text-gray-400 hover:text-sky-600 rounded transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                          <button onClick={() => handleStatusChange(inv.id, 'PAID')}
                            className="text-xs px-2 py-1 text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors whitespace-nowrap">
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Invoice Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice / PO / WO" maxWidth="max-w-2xl">
        <form onSubmit={handleCreate} className="space-y-5">
          {/* Type + Project */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                <option value="INVOICE">Invoice</option>
                <option value="PURCHASE_ORDER">Purchase Order (PO)</option>
                <option value="WORK_ORDER">Work Order (WO)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project *</label>
              <select value={form.projectId} onChange={(e) => onProjectChange(e.target.value)} className="input-field" required>
                <option value="">Select project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Bill To / Vendor section */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {isPO ? 'Vendor / Supplier Details' : 'Bill To'}
              </h3>
              {/* Quick fill from contact or company */}
              <div className="flex items-center gap-2">
                {contacts.length > 0 && (
                  <select
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) fillFromContact(e.target.value); e.target.value = ''; }}
                  >
                    <option value="">Fill from contact...</option>
                    {contacts.slice(0, 30).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                  </select>
                )}
                {companies.length > 0 && (
                  <select
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) fillFromCompany(e.target.value); e.target.value = ''; }}
                  >
                    <option value="">Fill from company...</option>
                    {companies.slice(0, 30).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">{isPO ? 'Vendor Name' : 'Client Name'}</label>
                <input value={form.billingName} onChange={(e) => setForm((f) => ({ ...f, billingName: e.target.value }))} className="input-field" placeholder="Company or person name" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.billingEmail} onChange={(e) => setForm((f) => ({ ...f, billingEmail: e.target.value }))} className="input-field" placeholder="vendor@example.com" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                <textarea value={form.billingAddress} onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} className="input-field resize-none" rows={2} placeholder="Full billing / shipping address" />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Line Items</h3>
              <button type="button" onClick={addLine} className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {form.lineItems.map((li, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="input-field col-span-6"
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateLine(idx, 'description', e.target.value)}
                  />
                  <input
                    type="number" min="1"
                    className="input-field col-span-2"
                    placeholder="Qty"
                    value={li.qty}
                    onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="input-field col-span-3"
                    placeholder="Unit price"
                    value={li.unitPrice}
                    onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                  />
                  <button type="button" onClick={() => removeLine(idx)} className="col-span-1 p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {/* Totals */}
            <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm space-y-1 text-right">
              <div className="text-gray-600">Subtotal: <span className="font-medium text-gray-900">{form.currency} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex items-center justify-end gap-2">
                <span className="text-gray-600">Tax:</span>
                <input type="number" min="0" max="100" step="0.1"
                  className="w-16 text-sm border border-gray-200 rounded px-2 py-0.5 text-center"
                  value={form.taxRate}
                  onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
                />
                <span className="text-gray-600">% = {form.currency} {taxAmt.toFixed(2)}</span>
              </div>
              <div className="text-base font-bold text-sky-700 border-t border-gray-200 pt-1">Total: {form.currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          {/* Currency + Due Date + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="input-field">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="input-field" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="input-field resize-none" rows={2} placeholder="Payment terms, special instructions..." />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Creating...' : `Create ${TYPE_LABELS[form.type]?.label || 'Invoice'}`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
