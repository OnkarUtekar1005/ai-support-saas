import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, CreditCard, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Sparkles, Loader2, X, Globe, Clock,
  ArrowUpRight, Briefcase, RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';

const COUNTRIES = [
  { code: 'IN', label: 'India' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'SG', label: 'Singapore' },
  { code: 'AE', label: 'UAE' },
  { code: 'CA', label: 'Canada' },
  { code: 'PH', label: 'Philippines' },
  { code: 'PK', label: 'Pakistan' },
];
const COMPLEXITY = ['Low', 'Medium', 'High', 'Very High'];

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  INR: 'IN', USD: 'US', GBP: 'GB', AUD: 'AU', EUR: 'DE',
  SGD: 'SG', AED: 'AE', CAD: 'CA', PHP: 'PH', PKR: 'PK',
};

// Format as INR
function inr(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// Format in original currency (small secondary label)
function orig(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function pct(val: number, total: number) {
  if (!total) return 0;
  return Math.round((val / total) * 100);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-sky-100 text-sky-700',
    ON_HOLD: 'bg-yellow-100 text-yellow-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const w = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function FinanceDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showQuote, setShowQuote] = useState(false);

  const [quoteForm, setQuoteForm] = useState({
    projectName: '', description: '', countryCode: 'IN',
    techStack: '', timeline: '', complexity: 'Medium',
  });
  const [quoteProjectId, setQuoteProjectId] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [quoteError, setQuoteError] = useState('');

  const load = () => {
    setLoading(true);
    api.getFinanceDashboard()
      .then((d: any) => setData(d))
      .catch(() => setError('Failed to load finance data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const fillQuoteFromProject = (projectId: string, projectsList: any[]) => {
    setQuoteProjectId(projectId);
    if (!projectId) return;
    const p = projectsList.find((proj: any) => proj.id === projectId);
    if (!p) return;

    let timeline = '';
    if (p.deadline) {
      const months = Math.max(1, Math.round(
        (new Date(p.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
      ));
      timeline = `${months} month${months !== 1 ? 's' : ''}`;
    }

    setQuoteForm((f) => ({
      ...f,
      projectName: p.name || f.projectName,
      description: p.description || f.description,
      techStack: p.techStack || f.techStack,
      countryCode: CURRENCY_TO_COUNTRY[p.currency] || f.countryCode,
      timeline: timeline || f.timeline,
    }));
  };

  const handleGenerateQuote = async () => {
    if (!quoteForm.description.trim()) return;
    setQuoteLoading(true);
    setQuoteError('');
    setQuoteResult(null);
    try {
      const result: any = await api.generateQuote(quoteForm);
      setQuoteResult(result);
    } catch (e: any) {
      setQuoteError(e.message || 'Failed to generate quote');
    } finally {
      setQuoteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
      </div>
    );
  }
  if (error) return <div className="text-red-500 p-4">{error}</div>;

  const { projects, totals, rateSnapshot, ratesDate } = data;

  // Summary cards (all INR)
  const summaryCards = [
    { label: 'Total Contract Value', value: inr(totals.contractValue), icon: Briefcase, color: 'text-sky-600', bg: 'bg-sky-50', sub: `${data.projectCount} projects` },
    { label: 'Total Invoiced', value: inr(totals.totalInvoiced), icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: `${pct(totals.totalInvoiced, totals.contractValue)}% of contract` },
    { label: 'Total Received', value: inr(totals.paymentsReceived), icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', sub: `${pct(totals.paymentsReceived, totals.totalInvoiced)}% of invoiced` },
    {
      label: 'Outstanding', value: inr(totals.outstanding), icon: AlertCircle,
      color: totals.outstanding > 0 ? 'text-orange-600' : 'text-gray-400',
      bg: totals.outstanding > 0 ? 'bg-orange-50' : 'bg-gray-50',
      sub: totals.totalOverdue > 0 ? `${inr(totals.totalOverdue)} overdue` : 'No overdue',
    },
    { label: 'Total Costs', value: inr(totals.totalCosts), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', sub: `${pct(totals.totalCosts, totals.contractValue)}% of contract` },
  ];

  return (
    <div className="space-y-5">
      {/* Actions + rates bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Exchange rates ticker */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Live rates (INR)</span>
          {rateSnapshot && Object.entries(rateSnapshot as Record<string, number>).map(([cur, rate]) => (
            <span key={cur} className="text-[11px] text-gray-500">
              <span className="font-semibold text-gray-700">1 {cur}</span> = ₹{rate.toLocaleString('en-IN')}
            </span>
          ))}
          <button onClick={load} className="p-0.5 text-gray-300 hover:text-sky-500 transition-colors" title="Refresh rates">
            <RefreshCw className="w-3 h-3" />
          </button>
          {ratesDate && <span className="text-[10px] text-gray-300 hidden lg:inline">Updated: {new Date(ratesDate).toLocaleDateString()}</span>}
        </div>

        <button
          onClick={() => { setShowQuote(true); setQuoteResult(null); setQuoteError(''); setQuoteProjectId(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4" /> AI Quote Generator
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <div className="text-base font-bold text-gray-900 leading-tight">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
            <div className="text-[11px] text-gray-400 mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Project Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">Project Financials</h2>
          <span className="text-xs text-gray-400">All amounts in ₹ INR &bull; {projects.length} projects</span>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No projects found.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {projects.map((p: any) => (
              <div key={p.id}>
                <div
                  className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  {/* Name */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                      <div className="text-[11px] text-gray-400">
                        {p.clientName && <span>{p.clientName} &bull; </span>}
                        <span className="font-medium">{p.currency}</span>
                      </div>
                    </div>
                  </div>

                  <StatusBadge status={p.status} />

                  {/* Contract value — INR primary, original secondary */}
                  <div className="hidden sm:block text-right min-w-[110px]">
                    <div className="text-sm font-semibold text-gray-900">{inr(p.inr.contractValue)}</div>
                    {p.currency !== 'INR' && (
                      <div className="text-[10px] text-gray-400">{orig(p.contractValue, p.currency)}</div>
                    )}
                    <div className="text-[10px] text-gray-400">Contract</div>
                  </div>

                  {/* Received */}
                  <div className="hidden md:block text-right min-w-[100px]">
                    <div className="text-sm font-medium text-green-600">{inr(p.inr.paymentsReceived)}</div>
                    {p.currency !== 'INR' && (
                      <div className="text-[10px] text-gray-400">{orig(p.paymentsReceived, p.currency)}</div>
                    )}
                    <div className="text-[10px] text-gray-400">Received</div>
                  </div>

                  {/* Outstanding */}
                  <div className="hidden md:block text-right min-w-[100px]">
                    <div className={`text-sm font-medium ${p.outstanding > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {inr(p.inr.outstanding)}
                    </div>
                    {p.currency !== 'INR' && (
                      <div className="text-[10px] text-gray-400">{orig(p.outstanding, p.currency)}</div>
                    )}
                    <div className="text-[10px] text-gray-400">Outstanding</div>
                  </div>

                  {/* Margin */}
                  <div className="hidden lg:block text-right min-w-[60px]">
                    <div className={`text-sm font-semibold ${p.margin >= 30 ? 'text-green-600' : p.margin >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {p.margin.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-gray-400">Margin</div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/projects/${p.id}`); }}
                      className="p-1 text-gray-400 hover:text-sky-600 transition-colors"
                      title="Open project"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                    {expanded === p.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded === p.id && (
                  <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
                      {[
                        { label: 'Base Budget', inrVal: p.inr.totalBudget, origVal: p.totalBudget, color: 'text-sky-700' },
                        { label: 'Extra Features', inrVal: p.inr.extraFeatures, origVal: p.extraFeatures, color: 'text-indigo-700' },
                        { label: 'Expenses', inrVal: p.inr.expenses, origVal: p.expenses, color: 'text-purple-700' },
                        { label: 'Base Costs', inrVal: p.inr.baseCost, origVal: p.baseCost, color: 'text-gray-700' },
                        { label: 'Total Invoiced', inrVal: p.inr.totalInvoiced, origVal: p.totalInvoiced, color: 'text-gray-700' },
                        { label: 'Overdue', inrVal: p.inr.totalOverdue, origVal: p.totalOverdue, color: p.totalOverdue > 0 ? 'text-red-600' : 'text-gray-400' },
                      ].map((item) => (
                        <div key={item.label} className="bg-white rounded-lg p-3 border border-gray-100">
                          <div className={`text-sm font-semibold ${item.color}`}>{inr(item.inrVal)}</div>
                          {p.currency !== 'INR' && (
                            <div className="text-[10px] text-gray-400">{orig(item.origVal, p.currency)}</div>
                          )}
                          <div className="text-[11px] text-gray-400 mt-0.5">{item.label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="flex justify-between text-[11px] text-gray-500 mb-0.5">
                          <span>Invoiced vs Contract</span>
                          <span>{pct(p.inr.totalInvoiced, p.inr.contractValue)}%</span>
                        </div>
                        <MiniBar value={p.inr.totalInvoiced} total={p.inr.contractValue} color="bg-indigo-400" />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-gray-500 mb-0.5">
                          <span>Received vs Invoiced</span>
                          <span>{pct(p.inr.paymentsReceived, p.inr.totalInvoiced)}%</span>
                        </div>
                        <MiniBar value={p.inr.paymentsReceived} total={p.inr.totalInvoiced} color="bg-green-400" />
                      </div>
                    </div>

                    {p.deadline && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        Deadline: {new Date(p.deadline).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Quote Modal */}
      {showQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!quoteLoading) setShowQuote(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-600" />
                <h2 className="font-bold text-gray-900">AI Quote Generator</h2>
              </div>
              <button onClick={() => setShowQuote(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {!quoteResult ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Describe the project requirements and get an AI-generated quote with country-specific pricing.</p>

                  {/* Load from existing project */}
                  {projects && projects.length > 0 && (
                    <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 space-y-2">
                      <label className="block text-xs font-semibold text-sky-700 uppercase tracking-wide">
                        Load from existing project
                      </label>
                      <div className="flex gap-2 items-center">
                        <select
                          className="flex-1 border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-700"
                          value={quoteProjectId}
                          onChange={(e) => fillQuoteFromProject(e.target.value, projects)}
                        >
                          <option value="">Select a project to pre-fill the form...</option>
                          {projects.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.status !== 'ACTIVE' ? ` (${p.status})` : ''}
                            </option>
                          ))}
                        </select>
                        {quoteProjectId && (
                          <button
                            type="button"
                            onClick={() => { setQuoteProjectId(''); setQuoteForm({ projectName: '', description: '', countryCode: 'IN', techStack: '', timeline: '', complexity: 'Medium' }); }}
                            className="text-xs px-2 py-1.5 text-sky-600 hover:text-sky-800 border border-sky-200 rounded-lg bg-white transition-colors whitespace-nowrap"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {quoteProjectId && (
                        <p className="text-[11px] text-sky-500">
                          Form pre-filled from project — edit any field before generating.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Project Name</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={quoteForm.projectName}
                        onChange={(e) => setQuoteForm({ ...quoteForm, projectName: e.target.value })}
                        placeholder="e.g. E-commerce Platform"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Project Description *</label>
                      <textarea
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                        rows={4}
                        value={quoteForm.description}
                        onChange={(e) => setQuoteForm({ ...quoteForm, description: e.target.value })}
                        placeholder="Describe what needs to be built — features, integrations, user roles, scale, etc."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        <Globe className="inline w-3.5 h-3.5 mr-1" />Country / Market
                      </label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={quoteForm.countryCode}
                        onChange={(e) => setQuoteForm({ ...quoteForm, countryCode: e.target.value })}
                      >
                        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Complexity</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={quoteForm.complexity}
                        onChange={(e) => setQuoteForm({ ...quoteForm, complexity: e.target.value })}
                      >
                        {COMPLEXITY.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tech Stack</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={quoteForm.techStack}
                        onChange={(e) => setQuoteForm({ ...quoteForm, techStack: e.target.value })}
                        placeholder="e.g. React, Node.js, PostgreSQL"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Timeline</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={quoteForm.timeline}
                        onChange={(e) => setQuoteForm({ ...quoteForm, timeline: e.target.value })}
                        placeholder="e.g. 3 months"
                      />
                    </div>
                  </div>

                  {quoteError && (
                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">{quoteError}</div>
                  )}

                  <button
                    onClick={handleGenerateQuote}
                    disabled={quoteLoading || !quoteForm.description.trim()}
                    className="w-full py-2.5 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                  >
                    {quoteLoading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing requirements...</>
                      : <><Sparkles className="w-4 h-4" /> Generate Quote</>}
                  </button>
                </div>
              ) : (
                <QuoteResult result={quoteResult} onReset={() => setQuoteResult(null)} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuoteResult({ result, onReset }: { result: any; onReset: () => void }) {
  const { quote, country } = result;

  const printQuote = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Project Quote</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 32px; color: #1f2937; font-size: 13px; }
  h1 { font-size: 22px; font-weight: 700; color: #1e40af; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #dbeafe; color: #1e40af; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
  .total-row td { background: #1e40af; color: white; font-weight: 700; font-size: 14px; }
  .amounts { text-align: right; }
  ul { margin: 4px 0; padding-left: 18px; } li { margin-bottom: 2px; }
  @media print { body { padding: 16px; } }
</style></head><body>
<h1>Project Quote Estimate</h1>
<div class="meta">Generated ${new Date().toLocaleDateString()} &nbsp;|&nbsp; ${country.label} Rates &nbsp;|&nbsp; ${quote.currency} &nbsp;|&nbsp; ${quote.timelineEstimate}</div>
${quote.teamComposition ? `<div class="section"><div class="section-title">Team Composition</div><p>${quote.teamComposition}</p></div>` : ''}
<div class="section"><div class="section-title">Project Summary</div><p>${quote.summary}</p></div>
<div class="section"><div class="section-title">Assumptions</div><ul>${(quote.assumptions || []).map((a: string) => `<li>${a}</li>`).join('')}</ul></div>
<div class="section"><div class="section-title">Cost Breakdown</div>
<table><thead><tr><th>Phase / Feature</th><th>Role</th><th>Hours</th><th>Rate/hr</th><th class="amounts">Amount</th></tr></thead>
<tbody>${(quote.lineItems || []).map((item: any) => `<tr><td><strong>${item.phase}</strong><br/><span style="color:#6b7280;font-size:12px">${item.description}</span></td><td style="font-size:12px;color:#6b7280">${item.role || '—'}</td><td>${item.hours}h</td><td>${quote.currency} ${(item.rate || 0).toLocaleString()}</td><td class="amounts">${quote.currency} ${(item.amount || 0).toLocaleString()}</td></tr>`).join('')}
<tr><td colspan="4" style="text-align:right;font-weight:600">Subtotal</td><td class="amounts">${quote.currency} ${(quote.subtotal || 0).toLocaleString()}</td></tr>
<tr><td colspan="4" style="text-align:right;color:#6b7280">Contingency (${quote.contingencyPercent}%)</td><td class="amounts">${quote.currency} ${(quote.contingencyAmount || 0).toLocaleString()}</td></tr>
<tr class="total-row"><td colspan="4" style="text-align:right">TOTAL ESTIMATE</td><td class="amounts">${quote.currency} ${(quote.total || 0).toLocaleString()}</td></tr>
</tbody></table></div>
<div class="section"><div class="section-title">Recommendations</div><ul>${(quote.recommendations || []).map((r: string) => `<li>${r}</li>`).join('')}</ul></div>
<div class="section"><div class="section-title">Risk Factors</div><ul>${(quote.riskFactors || []).map((r: string) => `<li>${r}</li>`).join('')}</ul></div>
<script>window.onload=function(){window.print();}</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-gray-900">Quote Estimate</h3>
          <p className="text-xs text-gray-500 mt-0.5">{country.label} rates &bull; {quote.currency} &bull; {quote.timelineEstimate}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onReset} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">New Quote</button>
          <button onClick={printQuote} className="text-xs px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors">Export PDF</button>
        </div>
      </div>

      <div className="bg-sky-50 rounded-lg p-4 text-sm text-sky-800 leading-relaxed">{quote.summary}</div>

      <div className="bg-sky-600 text-white rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-xs opacity-75">Total Project Estimate</div>
          <div className="text-2xl font-bold mt-0.5">{quote.currency} {(quote.total || 0).toLocaleString()}</div>
          {quote.teamComposition && (
            <div className="text-xs opacity-70 mt-1">{quote.teamComposition}</div>
          )}
        </div>
        <div className="text-right text-xs opacity-75 space-y-1">
          <div>Subtotal: {quote.currency} {(quote.subtotal || 0).toLocaleString()}</div>
          <div>Contingency ({quote.contingencyPercent}%): +{quote.currency} {(quote.contingencyAmount || 0).toLocaleString()}</div>
          <div className="font-semibold opacity-100">{quote.timelineEstimate}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Cost Breakdown</div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sky-50 text-sky-800 text-xs">
                <th className="text-left px-3 py-2">Phase / Feature</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Role</th>
                <th className="text-right px-3 py-2">Hrs</th>
                <th className="text-right px-3 py-2 hidden sm:table-cell">Rate/hr</th>
                <th className="text-right px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(quote.lineItems || []).map((item: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium text-gray-900">{item.phase}</div>
                    <div className="text-gray-500 mt-0.5">{item.description}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 hidden md:table-cell">{item.role || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-700 text-xs">{item.hours}h</td>
                  <td className="px-3 py-2 text-right text-gray-500 text-xs hidden sm:table-cell">{quote.currency} {(item.rate || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 text-xs">{quote.currency} {(item.amount || 0).toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 text-xs">
                <td colSpan={3} className="px-3 py-2 text-right font-medium text-gray-600 hidden sm:table-cell">Subtotal</td>
                <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell"></td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">{quote.currency} {(quote.subtotal || 0).toLocaleString()}</td>
              </tr>
              <tr className="bg-gray-50 text-xs">
                <td colSpan={3} className="px-3 py-2 text-right text-gray-400 hidden sm:table-cell">Contingency ({quote.contingencyPercent}%)</td>
                <td className="px-3 py-2 text-right text-gray-400 hidden sm:table-cell"></td>
                <td className="px-3 py-2 text-right text-gray-500">+{quote.currency} {(quote.contingencyAmount || 0).toLocaleString()}</td>
              </tr>
              <tr className="bg-sky-600 text-white text-xs font-bold">
                <td colSpan={3} className="px-3 py-2.5 text-right hidden sm:table-cell">TOTAL</td>
                <td className="px-3 py-2.5 text-right hidden sm:table-cell"></td>
                <td className="px-3 py-2.5 text-right">{quote.currency} {(quote.total || 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: 'Assumptions', items: quote.assumptions, color: 'text-gray-600' },
          { title: 'Recommendations', items: quote.recommendations, color: 'text-sky-700' },
          { title: 'Risk Factors', items: quote.riskFactors, color: 'text-orange-700' },
        ].map(({ title, items, color }) => (
          <div key={title}>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{title}</div>
            <ul className="space-y-1.5">
              {(items || []).map((item: string, i: number) => (
                <li key={i} className={`text-xs ${color} flex items-start gap-1.5`}>
                  <span className="mt-1 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
