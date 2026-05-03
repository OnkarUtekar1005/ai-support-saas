import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import {
  ArrowLeft, Users, Building2, UserCircle, Activity, Ticket, Settings,
  LayoutDashboard, Clock, CheckCircle, Save, Zap, AlertTriangle,
  ChevronDown, ChevronRight, DollarSign, TrendingUp, Paperclip, Bell,
  Receipt, Plus, Trash2, Upload, Mail, FileText, ShoppingCart, Wrench,
  Download, Calendar, X, Pencil, Lock, Send, Loader2,
} from 'lucide-react';
import { StatusBadge, Modal, EmptyState, SkeletonTable, ConfirmDialog, useToast } from '../components/shared';
import {
  PRIORITY_COLORS, STATUS_COLORS, LEVEL_COLORS, PROJECT_STATUS_COLORS,
  PROJECT_COLORS, ACTIVITY_STATUS_COLORS, formatDate, formatStatus,
} from '../constants';

type Tab = 'overview' | 'finance' | 'attachments' | 'updates' | 'invoices' | 'tickets' | 'contacts' | 'activities' | 'errors' | 'settings';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'finance', label: 'Finance', icon: DollarSign },
  { key: 'attachments', label: 'Attachments', icon: Paperclip },
  { key: 'updates', label: 'Updates', icon: Bell },
  { key: 'invoices', label: 'Invoices', icon: Receipt },
  { key: 'tickets', label: 'Tickets', icon: Ticket },
  { key: 'contacts', label: 'Contacts', icon: UserCircle },
  { key: 'activities', label: 'Activities', icon: Activity },
  { key: 'errors', label: 'Errors', icon: AlertTriangle },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const COST_TYPE_META: Record<string, { label: string; color: string; sign: number }> = {
  BASE_COST:        { label: 'Contract', color: 'bg-sky-100 text-sky-700', sign: 1 },
  EXTRA_FEATURE:    { label: 'Extra Feature', color: 'bg-green-100 text-green-700', sign: 1 },
  EXPENSE:          { label: 'Expense', color: 'bg-orange-100 text-orange-700', sign: -1 },
  PAYMENT_RECEIVED: { label: 'Payment In', color: 'bg-purple-100 text-purple-700', sign: 1 },
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-sky-100 text-sky-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const INVOICE_TYPE_ICONS: Record<string, any> = {
  INVOICE: FileText,
  PURCHASE_ORDER: ShoppingCart,
  WORK_ORDER: Wrench,
};

function fileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('word') || fileType.includes('docx')) return '📝';
  if (fileType.includes('sheet') || fileType.includes('excel') || fileType.includes('csv')) return '📊';
  if (fileType.startsWith('text/')) return '📃';
  return '📎';
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Tab data
  const [tickets, setTickets] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#3b82f6', status: 'ACTIVE', totalBudget: '', currency: 'USD', deadline: '', clientContactId: '' });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Finance state
  const [showAddCost, setShowAddCost] = useState(false);
  const [costForm, setCostForm] = useState({ name: '', type: 'BASE_COST', amount: '', description: '', date: '' });
  const [savingCost, setSavingCost] = useState(false);
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [budgetEdit, setBudgetEdit] = useState({ totalBudget: '', currency: 'USD' });
  const [savingBudget, setSavingBudget] = useState(false);

  // Attachments state
  const [uploading, setUploading] = useState(false);
  const [attachNotes, setAttachNotes] = useState('');

  // Updates state
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [updateForm, setUpdateForm] = useState({ title: '', content: '', sendEmail: false, emailAddresses: '' });
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [expandedUpdate, setExpandedUpdate] = useState<string | null>(null);

  // Join request state (for non-members)
  const [joinMessage, setJoinMessage] = useState('');
  const [joiningProject, setJoiningProject] = useState(false);

  // Invoices state
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    type: 'INVOICE', currency: 'USD', notes: '', dueDate: '', taxRate: '0',
    billingName: '', billingEmail: '', billingAddress: '',
    lineItems: [{ description: '', qty: '1', unitPrice: '' }],
  });
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [orgInvoiceSettings, setOrgInvoiceSettings] = useState<any>(null);
  const [viewInvoice, setViewInvoice] = useState<any>(null);

  // Load project
  useEffect(() => {
    if (!id) return;
    api.getProject(id).then((data: any) => {
      setProject(data);
      setEditForm({
        name: data.name,
        description: data.description || '',
        color: data.color || '#3b82f6',
        status: data.status,
        totalBudget: data.totalBudget ? String(data.totalBudget) : '',
        currency: data.currency || 'USD',
        deadline: data.deadline ? data.deadline.split('T')[0] : '',
        clientContactId: data.clientContactId || '',
      });
      setLoading(false);
    });
  }, [id]);

  // Load tab data
  useEffect(() => {
    if (!id || activeTab === 'overview' || activeTab === 'settings') {
      if (activeTab === 'settings') setShowSettings(true);
      return;
    }
    setTabLoading(true);
    const loaders: Record<string, () => Promise<void>> = {
      tickets:     () => api.getTickets(`projectId=${id}`).then((d: any) => setTickets(d.tickets || [])).catch(() => setTickets([])),
      contacts:    () => api.getContacts(`projectId=${id}`).then((d: any) => setContacts(d.contacts || [])).catch(() => setContacts([])),
      activities:  () => api.getActivities(`projectId=${id}`).then((d: any) => setActivities(d || [])).catch(() => setActivities([])),
      errors:      () => api.getErrorLogs(`projectId=${id}`).then((d: any) => setErrorLogs(d.logs || d || [])).catch(() => setErrorLogs([])),
      finance:     () => api.getProjectCosts(id).then((d: any) => setCosts(d || [])).catch(() => setCosts([])),
      attachments: () => api.getProjectAttachments(id).then((d: any) => setAttachments(d || [])).catch(() => setAttachments([])),
      updates:     () => api.getProjectUpdates(id).then((d: any) => setUpdates(d || [])).catch(() => setUpdates([])),
      invoices:    () => Promise.all([
        api.getProjectInvoices(id).then((d: any) => setInvoices(d || [])).catch(() => setInvoices([])),
        api.getInvoiceOrgSettings().then((d: any) => setOrgInvoiceSettings(d)).catch(() => {}),
      ]).then(() => {}),
    };
    loaders[activeTab]?.().finally(() => setTabLoading(false));
  }, [id, activeTab]);

  // Settings save
  const handleSaveSettings = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated: any = await api.updateProject(id, {
        ...editForm,
        totalBudget: editForm.totalBudget || null,
        deadline: editForm.deadline || null,
        clientContactId: editForm.clientContactId || null,
      });
      setProject((p: any) => ({ ...p, ...updated }));
      toast('Project settings saved');
      setShowSettings(false);
    } catch { toast('Failed to save settings', 'error'); }
    finally { setSaving(false); }
  };

  // ─── Finance helpers ───
  const contractValue = (project?.totalBudget || 0) + costs.filter(c => c.type === 'EXTRA_FEATURE').reduce((s: number, c: any) => s + c.amount, 0);
  const totalReceived = costs.filter(c => c.type === 'PAYMENT_RECEIVED').reduce((s: number, c: any) => s + c.amount, 0);
  const totalExpenses = costs.filter(c => c.type === 'EXPENSE').reduce((s: number, c: any) => s + c.amount, 0);
  const outstanding = contractValue - totalReceived;

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingCost(true);
    try {
      const cost: any = await api.createProjectCost(id, { ...costForm, amount: parseFloat(costForm.amount) });
      setCosts(prev => [cost, ...prev]);
      setShowAddCost(false);
      setCostForm({ name: '', type: 'BASE_COST', amount: '', description: '', date: '' });
      toast('Cost added');
    } catch { toast('Failed to add cost', 'error'); }
    finally { setSavingCost(false); }
  };

  const handleDeleteCost = async (costId: string) => {
    if (!id) return;
    try {
      await api.deleteProjectCost(id, costId);
      setCosts(prev => prev.filter(c => c.id !== costId));
      toast('Cost removed');
    } catch { toast('Failed to remove cost', 'error'); }
  };

  const handleSaveBudget = async () => {
    if (!id) return;
    setSavingBudget(true);
    try {
      const updated: any = await api.updateProject(id, {
        totalBudget: budgetEdit.totalBudget || null,
        currency: budgetEdit.currency,
      });
      setProject((p: any) => ({ ...p, ...updated }));
      setShowBudgetEdit(false);
      toast('Budget saved');
    } catch { toast('Failed to save budget', 'error'); }
    finally { setSavingBudget(false); }
  };

  // ─── Attachments helpers ───
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      const att: any = await api.uploadProjectAttachment(id, file, attachNotes);
      setAttachments(prev => [att, ...prev]);
      setAttachNotes('');
      toast('File uploaded');
    } catch { toast('Upload failed', 'error'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!id) return;
    try {
      await api.deleteProjectAttachment(id, attId);
      setAttachments(prev => prev.filter(a => a.id !== attId));
      toast('Attachment deleted');
    } catch { toast('Failed to delete', 'error'); }
  };

  // ─── Updates helpers ───
  const handleAddUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingUpdate(true);
    try {
      const upd: any = await api.createProjectUpdate(id, updateForm);
      setUpdates(prev => [upd, ...prev]);
      setShowAddUpdate(false);
      setUpdateForm({ title: '', content: '', sendEmail: false, emailAddresses: '' });
      toast(upd.emailSent ? 'Update sent and saved' : 'Update saved');
    } catch { toast('Failed to save update', 'error'); }
    finally { setSavingUpdate(false); }
  };

  const handleDeleteUpdate = async (updId: string) => {
    if (!id) return;
    try {
      await api.deleteProjectUpdate(id, updId);
      setUpdates(prev => prev.filter(u => u.id !== updId));
      toast('Update deleted');
    } catch { toast('Failed to delete', 'error'); }
  };

  // ─── Invoices helpers ───
  const invoiceSubtotal = invoiceForm.lineItems.reduce((s, item) => s + (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0), 0);
  const invoiceTax = invoiceSubtotal * ((parseFloat(invoiceForm.taxRate) || 0) / 100);
  const invoiceTotal = invoiceSubtotal + invoiceTax;

  const addLineItem = () => setInvoiceForm(f => ({ ...f, lineItems: [...f.lineItems, { description: '', qty: '1', unitPrice: '' }] }));
  const removeLineItem = (i: number) => setInvoiceForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }));
  const updateLineItem = (i: number, key: string, value: string) =>
    setInvoiceForm(f => ({ ...f, lineItems: f.lineItems.map((item, idx) => idx === i ? { ...item, [key]: value } : item) }));

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingInvoice(true);
    try {
      const inv: any = await api.createInvoice(id, {
        ...invoiceForm,
        taxRate: parseFloat(invoiceForm.taxRate) || 0,
        lineItems: invoiceForm.lineItems.map(item => ({
          description: item.description,
          qty: parseFloat(item.qty) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
          amount: (parseFloat(item.qty) || 1) * (parseFloat(item.unitPrice) || 0),
        })),
      });
      setInvoices(prev => [inv, ...prev]);
      setShowCreateInvoice(false);
      setInvoiceForm({ type: 'INVOICE', currency: 'USD', notes: '', dueDate: '', taxRate: '0', billingName: '', billingEmail: '', billingAddress: '', lineItems: [{ description: '', qty: '1', unitPrice: '' }] });
      toast(`${inv.invoiceNumber} created`);
    } catch { toast('Failed to create invoice', 'error'); }
    finally { setSavingInvoice(false); }
  };

  const handleMarkInvoicePaid = async (invId: string) => {
    try {
      const updated: any = await api.updateInvoice(invId, { status: 'PAID' });
      setInvoices(prev => prev.map(i => i.id === invId ? { ...i, status: updated.status } : i));
      toast('Marked as paid');
    } catch { toast('Failed to update', 'error'); }
  };

  const handleDeleteInvoice = async (invId: string) => {
    try {
      await api.deleteInvoice(invId);
      setInvoices(prev => prev.filter(i => i.id !== invId));
      toast('Invoice deleted');
    } catch { toast('Failed to delete', 'error'); }
  };

  const printInvoice = (inv: any) => {
    const s = orgInvoiceSettings?.settings;
    const primary = s?.primaryColor || '#1e40af';
    const accent = s?.accentColor || '#dbeafe';
    const companyName = s?.companyName || orgInvoiceSettings?.orgName || 'TechView';
    const companyAddress = s?.companyAddress || '';
    const companyPhone = s?.companyPhone || '';
    const companyEmail = s?.companyEmail || '';
    const companyWebsite = s?.companyWebsite || '';
    const logoUrl = s?.logoUrl || '';
    const paymentTerms = s?.paymentTerms || 'Payment due within 30 days';
    const footerText = s?.footerText || 'Thank you for your business!';
    const bankDetails = s?.bankDetails || '';
    const taxId = s?.taxId || '';

    const typeLabel = inv.type === 'PURCHASE_ORDER' ? 'Purchase Order' : inv.type === 'WORK_ORDER' ? 'Work Order' : 'Invoice';

    const lineItemsHtml = (inv.lineItems || []).map((item: any) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">${item.description || ''}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;white-space:nowrap;">${item.qty || 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;">${inv.currency} ${(item.unitPrice||0).toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;font-weight:600;">${inv.currency} ${(item.amount||0).toFixed(2)}</td>
      </tr>`).join('');

    const billingName = inv.billingName || (inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}` : '');
    const billingEmail = inv.billingEmail || inv.contact?.email || '';
    const billingAddress = inv.billingAddress || '';

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${inv.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }
    .page { max-width: 820px; margin: 0 auto; padding: 48px 48px 64px; }
    /* Header */
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 28px; border-bottom: 3px solid ${primary}; }
    .company-block { flex: 1; }
    .company-logo { max-height: 48px; max-width: 160px; object-fit: contain; margin-bottom: 8px; }
    .company-name { font-size: 22px; font-weight: 800; color: ${primary}; letter-spacing: -0.3px; }
    .company-meta { font-size: 12px; color: #6b7280; margin-top: 4px; line-height: 1.7; }
    .inv-title-block { text-align: right; }
    .inv-type-label { font-size: 28px; font-weight: 800; color: ${primary}; text-transform: uppercase; letter-spacing: 1px; }
    .inv-number { font-size: 14px; color: #6b7280; margin-top: 4px; }
    .inv-status { display: inline-block; margin-top: 6px; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
      background: ${inv.status === 'PAID' ? '#dcfce7' : inv.status === 'SENT' ? accent : '#f3f4f6'};
      color: ${inv.status === 'PAID' ? '#15803d' : inv.status === 'SENT' ? primary : '#6b7280'}; }
    /* Billing section */
    .billing-section { display: flex; gap: 48px; margin-bottom: 32px; }
    .billing-block { flex: 1; }
    .billing-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 6px; }
    .billing-name { font-size: 15px; font-weight: 700; color: #1f2937; }
    .billing-meta { font-size: 13px; color: #6b7280; margin-top: 2px; line-height: 1.6; white-space: pre-line; }
    .dates-block { flex: 1; }
    .dates-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
    .dates-key { font-size: 12px; color: #9ca3af; font-weight: 600; }
    .dates-val { font-size: 12px; color: #1f2937; font-weight: 600; }
    /* Table */
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    .items-table thead tr { background: ${primary}; }
    .items-table thead th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #fff; text-align: left; }
    .items-table thead th:last-child, .items-table thead th:nth-child(2), .items-table thead th:nth-child(3) { text-align: right; }
    .items-table thead th:nth-child(2) { text-align: center; }
    .items-table tbody tr:nth-child(even) { background: #f9fafb; }
    /* Totals */
    .totals-section { display: flex; justify-content: flex-end; margin-top: 0; }
    .totals-box { min-width: 240px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
    .totals-row:last-child { border-bottom: none; }
    .totals-label { color: #6b7280; }
    .totals-val { font-weight: 600; color: #1f2937; }
    .totals-total { background: ${primary}; }
    .totals-total .totals-label, .totals-total .totals-val { color: #fff; font-weight: 800; font-size: 15px; }
    /* Notes + bank */
    .notes-section { margin-top: 32px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid ${primary}; }
    .notes-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 6px; }
    .notes-text { font-size: 13px; color: #4b5563; line-height: 1.6; white-space: pre-line; }
    .bank-section { margin-top: 16px; padding: 16px; background: ${accent}; border-radius: 8px; }
    /* Footer */
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
    .footer-left { font-size: 11px; color: #9ca3af; }
    .footer-right { font-size: 13px; font-weight: 600; color: ${primary}; }
    @media print { .page { padding: 20px; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="inv-header">
    <div class="company-block">
      ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="company-logo"><br>` : ''}
      <div class="company-name">${companyName}</div>
      <div class="company-meta">${[companyAddress, companyPhone, companyEmail, companyWebsite].filter(Boolean).join('<br>')}</div>
      ${taxId ? `<div class="company-meta" style="margin-top:4px">Tax ID: ${taxId}</div>` : ''}
    </div>
    <div class="inv-title-block">
      <div class="inv-type-label">${typeLabel}</div>
      <div class="inv-number"># ${inv.invoiceNumber}</div>
      <div><span class="inv-status">${inv.status}</span></div>
    </div>
  </div>

  <!-- Billing + Dates -->
  <div class="billing-section">
    <div class="billing-block">
      <div class="billing-label">Bill To</div>
      ${billingName ? `<div class="billing-name">${billingName}</div>` : ''}
      <div class="billing-meta">${[billingEmail, billingAddress].filter(Boolean).join('\n')}</div>
    </div>
    <div class="billing-block">
      <div class="billing-label">Project</div>
      <div class="billing-name">${project?.name || ''}</div>
    </div>
    <div class="dates-block">
      <div class="dates-row"><span class="dates-key">Issue Date</span><span class="dates-val">${new Date(inv.issueDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span></div>
      ${inv.dueDate ? `<div class="dates-row"><span class="dates-key">Due Date</span><span class="dates-val" style="color:#dc2626">${new Date(inv.dueDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span></div>` : ''}
      <div class="dates-row"><span class="dates-key">Currency</span><span class="dates-val">${inv.currency}</span></div>
      <div class="dates-row"><span class="dates-key">Payment Terms</span><span class="dates-val">${paymentTerms}</span></div>
    </div>
  </div>

  <!-- Line Items -->
  <table class="items-table">
    <thead><tr>
      <th style="width:50%">Description</th>
      <th style="width:10%;text-align:center">Qty</th>
      <th style="width:20%;text-align:right">Unit Price</th>
      <th style="width:20%;text-align:right">Amount</th>
    </tr></thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>

  <!-- Totals -->
  <div class="totals-section" style="margin-top:16px">
    <div class="totals-box">
      <div class="totals-row"><span class="totals-label">Subtotal</span><span class="totals-val">${inv.currency} ${(inv.subtotal||0).toFixed(2)}</span></div>
      ${inv.taxRate > 0 ? `<div class="totals-row"><span class="totals-label">Tax (${inv.taxRate}%)</span><span class="totals-val">${inv.currency} ${(inv.taxAmount||0).toFixed(2)}</span></div>` : ''}
      <div class="totals-row totals-total"><span class="totals-label">Total Due</span><span class="totals-val">${inv.currency} ${(inv.total||0).toFixed(2)}</span></div>
    </div>
  </div>

  <!-- Notes -->
  ${inv.notes ? `<div class="notes-section"><div class="notes-label">Notes</div><div class="notes-text">${inv.notes}</div></div>` : ''}

  <!-- Bank Details -->
  ${bankDetails ? `<div class="bank-section"><div class="notes-label">Payment Details</div><div class="notes-text">${bankDetails}</div></div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">${inv.invoiceNumber} · Generated ${new Date().toLocaleDateString()}</div>
    <div class="footer-right">${footerText}</div>
  </div>
</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
    w.document.close();
  };

  // ─── Renderers ───

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" /></div>;
  if (!project) return <EmptyState icon={AlertTriangle} title="Project not found" subtitle="This project may have been deleted." />;

  // Access restricted — user can see basic info but must request to join
  if (!project.isMember) {
    const req = project.myJoinRequest;
    const isPending = req?.status === 'PENDING';

    const handleRequestAccess = async () => {
      setJoiningProject(true);
      try {
        await api.requestProjectAccess(project.id, joinMessage || undefined);
        setProject((p: any) => ({ ...p, myJoinRequest: { status: 'PENDING', createdAt: new Date().toISOString() } }));
        toast('Access request sent to admin');
      } catch (e: any) { toast(e.message || 'Failed to send request', 'error'); }
      finally { setJoiningProject(false); }
    };

    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/projects')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center max-w-lg mx-auto mt-8">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-gray-400" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full" style={{ background: project.color }} />
            <h2 className="text-lg font-bold text-gray-900">{project.name}</h2>
          </div>
          {project.description && <p className="text-sm text-gray-500 mb-6">{project.description}</p>}

          <div className="flex justify-center gap-6 text-sm text-gray-400 mb-6">
            <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {project._count?.members || 0} members</span>
            <span className="flex items-center gap-1"><Ticket className="w-4 h-4" /> {project._count?.tickets || 0} tickets</span>
          </div>

          {isPending ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center justify-center gap-2 text-yellow-700 font-medium mb-1">
                <Clock className="w-4 h-4" /> Access Request Pending
              </div>
              <p className="text-sm text-yellow-600">Your request is waiting for admin approval.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">You need access to view and contribute to this project.</p>
              <textarea
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                rows={2}
                placeholder="Optional: why do you need access? (helps admin decide faster)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
              <button
                onClick={handleRequestAccess}
                disabled={joiningProject}
                className="w-full py-2.5 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {joiningProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Request Access
              </button>
              {req?.status === 'REJECTED' && (
                <p className="text-xs text-red-500">Your previous request was declined. You can submit a new one.</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const counts = project._count || {};

  const renderOverview = () => (
    <div className="space-y-6 stagger-children">
      {project.description && <p className="text-gray-600 text-sm leading-relaxed">{project.description}</p>}

      {/* Key info row */}
      <div className="flex flex-wrap gap-3">
        {project.totalBudget && (
          <div className="flex items-center gap-2 bg-sky-50 rounded-lg px-3 py-2">
            <DollarSign className="w-4 h-4 text-sky-600" />
            <span className="text-sm font-medium text-sky-900">Budget: {project.currency} {project.totalBudget.toLocaleString()}</span>
          </div>
        )}
        {project.deadline && (
          <div className="flex items-center gap-2 bg-orange-50 rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-900">Deadline: {formatDate(project.deadline)}</span>
          </div>
        )}
        {project.clientContact && (
          <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
            <UserCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-900">Client: {project.clientContact.firstName} {project.clientContact.lastName}</span>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon: Ticket, label: 'Tickets', value: counts.tickets || 0, tab: 'tickets' as Tab },
          { icon: UserCircle, label: 'Contacts', value: counts.contacts || 0, tab: 'contacts' as Tab },
          { icon: Building2, label: 'Companies', value: counts.companies || 0 },
          { icon: TrendingUp, label: 'Costs', value: counts.costs || 0, tab: 'finance' as Tab },
          { icon: Users, label: 'Members', value: counts.members || project.members?.length || 0 },
        ].map((s) => (
          <button key={s.label} onClick={() => s.tab && setActiveTab(s.tab)}
            className={`bg-white rounded-xl border border-gray-200 p-4 text-center transition-all ${s.tab ? 'cursor-pointer hover:shadow-md' : ''}`}>
            <s.icon className="w-5 h-5 mx-auto text-gray-400 mb-1.5" />
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Finance summary if costs exist */}
      {project.costSummary?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Finance Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Contract Value', value: project.totalBudget || 0, color: 'text-sky-600' },
              ...project.costSummary.map((s: any) => ({
                label: COST_TYPE_META[s.type]?.label || s.type,
                value: s._sum?.amount || 0,
                color: s.type === 'PAYMENT_RECEIVED' ? 'text-green-600' : s.type === 'EXPENSE' ? 'text-red-600' : 'text-gray-900',
              })),
            ].map((item) => (
              <div key={item.label} className="text-center p-3 bg-gray-50 rounded-lg">
                <div className={`text-xl font-bold ${item.color}`}>{project.currency} {(item.value || 0).toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team members */}
      {project.members?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Team Members</h2>
          <div className="stagger-children">
            {project.members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{m.user?.name?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="font-medium text-sm text-gray-900">{m.user?.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{m.user?.email}</span>
                  </div>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderFinance = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    const cur = project.currency || 'USD';
    return (
      <div className="space-y-5">
        {/* Total budget card — prominent, editable inline */}
        <div className="bg-white rounded-xl border-2 border-sky-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-500">Total Project Value</span>
            <button onClick={() => { setBudgetEdit({ totalBudget: project.totalBudget ? String(project.totalBudget) : '', currency: project.currency || 'USD' }); setShowBudgetEdit(true); }}
              className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800">
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
          {project.totalBudget ? (
            <div className="text-3xl font-bold text-sky-700">{cur} {project.totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          ) : (
            <button onClick={() => { setBudgetEdit({ totalBudget: '', currency: project.currency || 'USD' }); setShowBudgetEdit(true); }}
              className="text-sm text-sky-500 hover:text-sky-700 flex items-center gap-1.5 mt-1">
              <Plus className="w-4 h-4" /> Set total project value
            </button>
          )}
          {showBudgetEdit && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <select value={budgetEdit.currency} onChange={(e) => setBudgetEdit(f => ({ ...f, currency: e.target.value }))}
                className="input-field w-20 text-sm py-1.5">
                {['USD','EUR','GBP','INR','CAD','AUD','SGD','AED'].map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={budgetEdit.totalBudget}
                onChange={(e) => setBudgetEdit(f => ({ ...f, totalBudget: e.target.value }))}
                className="input-field flex-1 text-sm py-1.5" placeholder="Total contract value" autoFocus />
              <button onClick={handleSaveBudget} disabled={savingBudget} className="btn-primary text-sm py-1.5 px-3">
                {savingBudget ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowBudgetEdit(false)} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
            </div>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Contract Value', value: contractValue, color: 'text-sky-600', bg: 'bg-sky-50' },
            { label: 'Received', value: totalReceived, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Expenses', value: totalExpenses, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Outstanding', value: outstanding, color: outstanding > 0 ? 'text-red-600' : 'text-green-600', bg: outstanding > 0 ? 'bg-red-50' : 'bg-green-50' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white`}>
              <div className={`text-xl font-bold ${s.color}`}>{cur} {s.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Cost items */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Cost Items</h2>
            <button onClick={() => setShowAddCost(true)} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Cost
            </button>
          </div>
          {costs.length === 0 ? (
            <EmptyState icon={DollarSign} title="No cost items" subtitle="Add base costs, extra features, expenses, or payments received." />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Type</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500">Amount</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 hidden sm:table-cell">Date</th>
                <th className="px-5 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {costs.map((c) => {
                  const meta = COST_TYPE_META[c.type];
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{c.name}</div>
                        {c.description && <div className="text-xs text-gray-400">{c.description}</div>}
                      </td>
                      <td className="px-5 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta?.color}`}>{meta?.label || c.type}</span></td>
                      <td className={`px-5 py-3 text-right font-semibold ${c.type === 'EXPENSE' ? 'text-red-600' : c.type === 'PAYMENT_RECEIVED' ? 'text-green-600' : 'text-gray-900'}`}>
                        {c.type === 'EXPENSE' ? '-' : '+'}{project.currency} {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3 text-gray-400 hidden sm:table-cell">{formatDate(c.date)}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleDeleteCost(c.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Add cost modal */}
        <Modal open={showAddCost} onClose={() => setShowAddCost(false)} title="Add Cost Item">
          <form onSubmit={handleAddCost} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input value={costForm.name} onChange={(e) => setCostForm(f => ({ ...f, name: e.target.value }))} className="input-field" required placeholder="e.g. Design Phase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select value={costForm.type} onChange={(e) => setCostForm(f => ({ ...f, type: e.target.value }))} className="input-field">
                  <option value="BASE_COST">Contract Amount</option>
                  <option value="EXTRA_FEATURE">Extra Feature</option>
                  <option value="EXPENSE">Expense (paid out)</option>
                  <option value="PAYMENT_RECEIVED">Payment Received</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" min="0" step="0.01" value={costForm.amount} onChange={(e) => setCostForm(f => ({ ...f, amount: e.target.value }))} className="input-field" required placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={costForm.date} onChange={(e) => setCostForm(f => ({ ...f, date: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input value={costForm.description} onChange={(e) => setCostForm(f => ({ ...f, description: e.target.value }))} className="input-field" placeholder="Optional details" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowAddCost(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={savingCost} className="btn-primary">{savingCost ? 'Saving...' : 'Add Cost'}</button>
            </div>
          </form>
        </Modal>
      </div>
    );
  };

  const renderAttachments = () => {
    if (tabLoading) return <SkeletonTable rows={4} />;
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-3">Upload documents, images, or any files</p>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="*/*" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="btn-primary text-sm flex items-center gap-2 mx-auto">
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Choose File'}
          </button>
        </div>

        {attachments.length === 0 ? (
          <EmptyState icon={Paperclip} title="No attachments" subtitle="Upload files, images, or documents received from the client." />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">File</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Size</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Uploaded by</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Date</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {attachments.map((att) => (
                  <tr key={att.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{fileIcon(att.fileType)}</span>
                        <div>
                          <div className="font-medium text-gray-900 truncate max-w-[200px]">{att.name}</div>
                          {att.notes && <div className="text-xs text-gray-400">{att.notes}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{formatBytes(att.fileSize)}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{att.uploadedBy?.name || '--'}</td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{formatDate(att.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <a href={api.downloadAttachmentUrl(id!, att.id)} download target="_blank" rel="noreferrer"
                          className="p-1.5 text-gray-400 hover:text-sky-600 rounded transition-colors" title="Download">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => handleDeleteAttachment(att.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderUpdates = () => {
    if (tabLoading) return <SkeletonTable rows={4} />;
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => setShowAddUpdate(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New Update
          </button>
        </div>

        {updates.length === 0 ? (
          <EmptyState icon={Bell} title="No updates" subtitle="Post project updates to keep stakeholders informed." />
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <div key={u.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setExpandedUpdate(expandedUpdate === u.id ? null : u.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                  {expandedUpdate === u.id ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{u.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{u.createdBy?.name}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{formatDate(u.createdAt)}</span>
                      {u.emailSent && (
                        <span className="flex items-center gap-1 text-xs text-sky-600">
                          <Mail className="w-3 h-3" /> Emailed to {u.sentEmails?.length || 0}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteUpdate(u.id); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </button>
                {expandedUpdate === u.id && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{u.content}</p>
                    {u.sentEmails?.length > 0 && (
                      <div className="mt-3 text-xs text-gray-400">Sent to: {u.sentEmails.join(', ')}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Modal open={showAddUpdate} onClose={() => setShowAddUpdate(false)} title="New Project Update" maxWidth="max-w-lg">
          <form onSubmit={handleAddUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input value={updateForm.title} onChange={(e) => setUpdateForm(f => ({ ...f, title: e.target.value }))} className="input-field" required placeholder="e.g. Week 3 Progress Update" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
              <textarea value={updateForm.content} onChange={(e) => setUpdateForm(f => ({ ...f, content: e.target.value }))} className="input-field" rows={6} required placeholder="What was completed, what's next, any blockers..." />
            </div>
            <div className="bg-sky-50 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={updateForm.sendEmail} onChange={(e) => setUpdateForm(f => ({ ...f, sendEmail: e.target.checked }))} className="rounded" />
                <span className="text-sm font-medium text-sky-900 flex items-center gap-1.5"><Mail className="w-4 h-4" /> Email this update</span>
              </label>
              {updateForm.sendEmail && (
                <input value={updateForm.emailAddresses} onChange={(e) => setUpdateForm(f => ({ ...f, emailAddresses: e.target.value }))}
                  className="input-field text-sm" placeholder="client@example.com, pm@example.com" />
              )}
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowAddUpdate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={savingUpdate} className="btn-primary">{savingUpdate ? 'Saving...' : 'Post Update'}</button>
            </div>
          </form>
        </Modal>
      </div>
    );
  };

  const renderInvoices = () => {
    if (tabLoading) return <SkeletonTable rows={4} />;
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => {
            const c = project?.clientContact;
            if (c) {
              setInvoiceForm(f => ({
                ...f,
                currency: project.currency || 'USD',
                billingName: `${c.firstName} ${c.lastName}`,
                billingEmail: c.email || '',
                billingAddress: [c.phone, c.company?.name, c.company?.address].filter(Boolean).join('\n'),
              }));
            }
            setShowCreateInvoice(true);
          }} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Create Invoice / PO / WO
          </button>
        </div>

        {invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices" subtitle="Create invoices, purchase orders, or work orders for this project." />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Number</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Due</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => {
                  const TypeIcon = INVOICE_TYPE_ICONS[inv.type] || FileText;
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TypeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-900">{inv.invoiceNumber}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{inv.type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{inv.currency} {(inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{inv.dueDate ? formatDate(inv.dueDate) : '--'}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} colorMap={INVOICE_STATUS_COLORS} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setViewInvoice(inv); printInvoice(inv); }} title="Print/Download"
                            className="p-1.5 text-gray-400 hover:text-sky-600 rounded transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                            <button onClick={() => handleMarkInvoicePaid(inv.id)}
                              className="text-xs px-2 py-1 text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors">
                              Paid
                            </button>
                          )}
                          <button onClick={() => handleDeleteInvoice(inv.id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Create invoice modal */}
        <Modal open={showCreateInvoice} onClose={() => setShowCreateInvoice(false)} title="Create Invoice / PO / WO" maxWidth="max-w-2xl">
          <form onSubmit={handleCreateInvoice} className="space-y-4">
            {/* Type + Currency + Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={invoiceForm.type} onChange={(e) => setInvoiceForm(f => ({ ...f, type: e.target.value }))} className="input-field">
                  <option value="INVOICE">Invoice</option>
                  <option value="PURCHASE_ORDER">Purchase Order</option>
                  <option value="WORK_ORDER">Work Order</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <select value={invoiceForm.currency} onChange={(e) => setInvoiceForm(f => ({ ...f, currency: e.target.value }))} className="input-field">
                  {['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm(f => ({ ...f, dueDate: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={invoiceForm.taxRate} onChange={(e) => setInvoiceForm(f => ({ ...f, taxRate: e.target.value }))} className="input-field" placeholder="0" />
              </div>
            </div>

            {/* Bill To section */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Bill To</span>
                {project?.clientContact && (
                  <button type="button" onClick={() => {
                    const c = project.clientContact;
                    setInvoiceForm(f => ({
                      ...f,
                      billingName: `${c.firstName} ${c.lastName}`,
                      billingEmail: c.email || '',
                      billingAddress: [c.phone, c.company?.name, c.company?.address].filter(Boolean).join('\n'),
                    }));
                  }} className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1">
                    <UserCircle className="w-3 h-3" /> Fill from {project.clientContact.firstName}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input value={invoiceForm.billingName} onChange={(e) => setInvoiceForm(f => ({ ...f, billingName: e.target.value }))}
                    className="input-field text-sm" placeholder="Client / Company name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={invoiceForm.billingEmail} onChange={(e) => setInvoiceForm(f => ({ ...f, billingEmail: e.target.value }))}
                    className="input-field text-sm" placeholder="client@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
                <textarea value={invoiceForm.billingAddress} onChange={(e) => setInvoiceForm(f => ({ ...f, billingAddress: e.target.value }))}
                  className="input-field text-sm" rows={2} placeholder="Street, City, Country" />
              </div>
            </div>

            {/* Outstanding balance quick-fill */}
            {outstanding > 0 && (
              <div className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-4 py-2.5">
                <span className="text-sm text-orange-700">Outstanding balance: <strong>{project.currency} {outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                <button type="button" onClick={() => setInvoiceForm(f => ({
                  ...f,
                  currency: project.currency || 'USD',
                  lineItems: [{ description: `${project.name} — Outstanding Balance`, qty: '1', unitPrice: outstanding.toFixed(2) }],
                }))} className="text-xs text-orange-700 font-semibold border border-orange-300 rounded px-2 py-1 hover:bg-orange-100">
                  Use this amount
                </button>
              </div>
            )}

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Line Items *</label>
                <button type="button" onClick={addLineItem} className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Row
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-500 w-full">Description</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">Qty</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">Unit Price</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500 w-28">Amount</th>
                    <th className="w-8" />
                  </tr></thead>
                  <tbody>
                    {invoiceForm.lineItems.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-1.5">
                          <input value={item.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} className="w-full text-sm border-0 outline-none bg-transparent px-1" placeholder="Description" required />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="1" value={item.qty} onChange={(e) => updateLineItem(i, 'qty', e.target.value)} className="w-full text-sm border-0 outline-none bg-transparent text-center px-1" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateLineItem(i, 'unitPrice', e.target.value)} className="w-full text-sm border-0 outline-none bg-transparent text-right px-1" placeholder="0.00" />
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700 font-medium">
                          {((parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0)).toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5">
                          {invoiceForm.lineItems.length > 1 && (
                            <button type="button" onClick={() => removeLineItem(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={3} className="px-3 py-2 text-right text-sm text-gray-500">Subtotal</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{invoiceSubtotal.toFixed(2)}</td>
                      <td />
                    </tr>
                    {parseFloat(invoiceForm.taxRate) > 0 && (
                      <tr className="border-t border-gray-100 bg-gray-50">
                        <td colSpan={3} className="px-3 py-2 text-right text-sm text-gray-500">Tax ({invoiceForm.taxRate}%)</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">{invoiceTax.toFixed(2)}</td>
                        <td />
                      </tr>
                    )}
                    <tr className="border-t-2 border-gray-300 bg-sky-50">
                      <td colSpan={3} className="px-3 py-2 text-right text-sm font-bold text-sky-900">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-sky-900">{invoiceForm.currency} {invoiceTotal.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={invoiceForm.notes} onChange={(e) => setInvoiceForm(f => ({ ...f, notes: e.target.value }))} className="input-field" rows={2} placeholder="Additional payment terms, reference numbers, etc." />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowCreateInvoice(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={savingInvoice} className="btn-primary">{savingInvoice ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      </div>
    );
  };

  const renderTickets = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!tickets.length) return <EmptyState icon={Ticket} title="No tickets" subtitle="This project has no tickets yet." />;
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Priority</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Assignee</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Date</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 stagger-children">
            {tickets.map((t) => (
              <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
                <td className="px-4 py-3 hidden md:table-cell"><StatusBadge status={t.priority} colorMap={PRIORITY_COLORS} /></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} colorMap={STATUS_COLORS} /></td>
                <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{t.assignee?.name || '--'}</td>
                <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderContacts = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!contacts.length) return <EmptyState icon={UserCircle} title="No contacts" subtitle="This project has no contacts yet." />;
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Email</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Company</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 stagger-children">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{c.email || '--'}</td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{c.company?.name || '--'}</td>
                <td className="px-4 py-3"><StatusBadge status={c.status || 'ACTIVE'} colorMap={STATUS_COLORS} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderActivities = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!activities.length) return <EmptyState icon={Activity} title="No activities" subtitle="This project has no activities yet." />;
    const active = activities.filter((a) => a.status !== 'DONE' && a.status !== 'CANCELLED');
    const done = activities.filter((a) => a.status === 'DONE' || a.status === 'CANCELLED');
    const renderGroup = (label: string, items: any[]) => items.length > 0 && (
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label} ({items.length})</h3>
        <div className="space-y-2 stagger-children">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              {a.status === 'DONE' ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> : <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">{a.subject}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{a.type}</span>
                  <StatusBadge status={a.status} colorMap={ACTIVITY_STATUS_COLORS} />
                  {a.dueDate && <span className="text-[10px] text-gray-400">{formatDate(a.dueDate)}</span>}
                </div>
              </div>
              {a.assignee && <span className="text-xs text-gray-400 hidden sm:block">{a.assignee.name}</span>}
            </div>
          ))}
        </div>
      </div>
    );
    return <div className="space-y-6">{renderGroup('Active', active)}{renderGroup('Completed', done)}</div>;
  };

  const renderErrors = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!errorLogs.length) return <EmptyState icon={AlertTriangle} title="No error logs" subtitle="No errors have been logged for this project." />;
    return (
      <div className="space-y-2 stagger-children">
        {errorLogs.map((err) => {
          const open = expandedError === err.id;
          return (
            <div key={err.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setExpandedError(open ? null : err.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors">
                {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                <StatusBadge status={err.level} colorMap={LEVEL_COLORS} />
                <span className="font-medium text-sm text-gray-900 truncate flex-1">{err.message}</span>
                {err.source && <span className="text-[10px] text-gray-400 hidden sm:block">{err.source}</span>}
                <span className="text-[10px] text-gray-400">{formatDate(err.createdAt)}</span>
              </button>
              {open && (
                <div className="border-t border-gray-100 p-4 space-y-4">
                  {err.stack && <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto"><pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">{err.stack}</pre></div>}
                  {err.aiAnalysis && <div><h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">AI Analysis</h4><p className="text-sm text-gray-700 whitespace-pre-wrap">{err.aiAnalysis}</p></div>}
                  {err.aiSuggestion && <div className="bg-sky-50 rounded-lg p-3"><h4 className="text-xs font-semibold text-sky-800 mb-1">Suggestion</h4><p className="text-sm text-gray-700">{err.aiSuggestion}</p></div>}
                  <button onClick={() => { api.triggerPipeline({ errorLogId: err.id, errorMessage: err.message, errorStack: err.stack, errorSource: err.source, projectId: id }); navigate('/pipeline'); }}
                    className="btn-primary text-xs flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> Auto-Fix
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const tabContent: Record<Tab, () => React.ReactNode> = {
    overview: renderOverview, finance: renderFinance, attachments: renderAttachments,
    updates: renderUpdates, invoices: renderInvoices, tickets: renderTickets,
    contacts: renderContacts, activities: renderActivities, errors: renderErrors,
    settings: () => null,
  };

  return (
    <div className="animate-page-in -m-4 lg:-m-6">
      {/* Top bar */}
      <div className="px-4 lg:px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-4">
        <button onClick={() => navigate('/projects')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Projects
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
          <h1 className="font-semibold text-gray-900 truncate">{project.name}</h1>
          <StatusBadge status={project.status} colorMap={PROJECT_STATUS_COLORS} />
          {project.deadline && (() => {
            const diff = new Date(project.deadline).getTime() - Date.now();
            const days = Math.ceil(diff / 86400000);
            const cls = days < 0 ? 'text-red-600' : days <= 7 ? 'text-orange-500' : 'text-gray-400';
            return <span className={`text-xs ${cls} flex items-center gap-1 hidden sm:flex`}><Calendar className="w-3 h-3" />{days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}</span>;
          })()}
        </div>
      </div>

      {/* Horizontal tab bar */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); if (tab.key === 'settings') setShowSettings(true); }}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.key ? 'border-sky-600 text-sky-700' : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 lg:p-6 bg-gray-50 min-h-[calc(100vh-170px)]">
        {tabContent[activeTab]()}
      </div>

      {/* Settings Modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Project Settings" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="input-field" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Budget</label>
              <input type="number" min="0" value={editForm.totalBudget} onChange={(e) => setEditForm(f => ({ ...f, totalBudget: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={editForm.currency} onChange={(e) => setEditForm(f => ({ ...f, currency: e.target.value }))} className="input-field">
                {['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
            <input type="date" value={editForm.deadline} onChange={(e) => setEditForm(f => ({ ...f, deadline: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Contact ID</label>
            <input value={editForm.clientContactId} onChange={(e) => setEditForm(f => ({ ...f, clientContactId: e.target.value }))} className="input-field" placeholder="Contact ID from Contacts page" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setEditForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${editForm.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))} className="input-field w-auto">
              {['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button onClick={handleSaveSettings} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {isSuperAdmin && (
              <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger text-sm px-3 py-1.5">
                Delete Project
              </button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          try {
            await api.deleteProject(id!);
            toast('Project deleted');
            navigate('/projects');
          } catch { toast('Failed to delete project', 'error'); }
        }}
        title="Delete Project"
        message={`Are you sure you want to delete "${project.name}"? This will permanently remove all costs, attachments, invoices, updates, tickets, and error logs.`}
        confirmLabel="Delete Project"
        danger
      />
    </div>
  );
}
