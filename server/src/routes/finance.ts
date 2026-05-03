import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { GeminiClient } from '../services/ai/GeminiClient';

export const financeRoutes = Router();
financeRoutes.use(authenticate);

const gemini = new GeminiClient();

// ─── Exchange Rate Cache ───────────────────────────────────────────────────
interface RateCache {
  rates: Record<string, number>; // rates relative to USD (1 USD = X currency)
  fetchedAt: number;
  date: string;
}
let rateCache: RateCache | null = null;
const RATE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — rates update once daily

async function getUsdRates(): Promise<{ rates: Record<string, number>; date: string }> {
  if (rateCache && Date.now() - rateCache.fetchedAt < RATE_TTL_MS) {
    return { rates: rateCache.rates, date: rateCache.date };
  }
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: any = await resp.json();
    rateCache = { rates: data.rates, fetchedAt: Date.now(), date: data.time_last_update_utc || new Date().toUTCString() };
    return { rates: rateCache.rates, date: rateCache.date };
  } catch (err) {
    console.warn('Exchange rate fetch failed, using fallback rates:', err);
    // Fallback approximate rates (1 USD = X)
    const fallback: Record<string, number> = {
      INR: 83.5, EUR: 0.92, GBP: 0.79, AUD: 1.54, SGD: 1.34,
      AED: 3.67, CAD: 1.36, JPY: 149.5, CNY: 7.24,
    };
    const date = rateCache?.date || 'fallback rates';
    if (!rateCache) rateCache = { rates: { USD: 1, ...fallback }, fetchedAt: Date.now() - RATE_TTL_MS + 300_000, date };
    return { rates: rateCache.rates, date };
  }
}

function toINR(amount: number, fromCurrency: string, rates: Record<string, number>): number {
  const cur = fromCurrency?.toUpperCase() || 'USD';
  if (cur === 'INR') return amount;
  const inrPerUsd = rates['INR'] || 83.5;
  const curPerUsd = rates[cur] || 1;
  return (amount / curPerUsd) * inrPerUsd;
}

// GET /api/finance/dashboard — aggregate financial data across all projects in INR
financeRoutes.get('/dashboard', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;

  const [projects, { rates, date: ratesDate }] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        status: true,
        currency: true,
        totalBudget: true,
        deadline: true,
        clientContact: { select: { firstName: true, lastName: true } },
        autoFixConfig: { select: { language: true, framework: true } },
        costs: { select: { type: true, amount: true } },
        invoices: { select: { status: true, total: true, currency: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    getUsdRates(),
  ]);

  const projectSummaries = projects.map((p) => {
    const cur = p.currency || 'USD';

    const baseCost = p.costs.filter((c) => c.type === 'BASE_COST').reduce((s, c) => s + c.amount, 0);
    const extraFeatures = p.costs.filter((c) => c.type === 'EXTRA_FEATURE').reduce((s, c) => s + c.amount, 0);
    const expenses = p.costs.filter((c) => c.type === 'EXPENSE').reduce((s, c) => s + c.amount, 0);
    const paymentsReceived = p.costs.filter((c) => c.type === 'PAYMENT_RECEIVED').reduce((s, c) => s + c.amount, 0);

    const contractValue = (p.totalBudget || 0) + extraFeatures;
    const totalCosts = baseCost + expenses;

    const totalInvoiced = p.invoices.filter((i) => i.type === 'INVOICE').reduce((s, i) => s + i.total, 0);
    const totalPaid = p.invoices.filter((i) => i.type === 'INVOICE' && i.status === 'PAID').reduce((s, i) => s + i.total, 0);
    const totalOverdue = p.invoices.filter((i) => i.status === 'OVERDUE').reduce((s, i) => s + i.total, 0);
    const outstanding = contractValue - paymentsReceived;
    const margin = contractValue > 0 ? ((contractValue - totalCosts) / contractValue) * 100 : 0;

    return {
      id: p.id,
      name: p.name,
      description: p.description || '',
      color: p.color,
      status: p.status,
      currency: cur,
      deadline: p.deadline,
      clientName: p.clientContact ? `${p.clientContact.firstName} ${p.clientContact.lastName}` : null,
      techStack: [p.autoFixConfig?.framework, p.autoFixConfig?.language].filter(Boolean).join(', '),
      // Original amounts (in project currency)
      totalBudget: p.totalBudget || 0,
      contractValue,
      baseCost,
      extraFeatures,
      expenses,
      totalCosts,
      paymentsReceived,
      outstanding,
      totalInvoiced,
      totalPaid,
      totalOverdue,
      margin: Math.round(margin * 10) / 10,
      invoiceCount: p.invoices.length,
      // INR-converted amounts
      inr: {
        contractValue: Math.round(toINR(contractValue, cur, rates)),
        totalCosts: Math.round(toINR(totalCosts, cur, rates)),
        paymentsReceived: Math.round(toINR(paymentsReceived, cur, rates)),
        outstanding: Math.round(toINR(outstanding, cur, rates)),
        totalInvoiced: Math.round(toINR(totalInvoiced, cur, rates)),
        totalPaid: Math.round(toINR(totalPaid, cur, rates)),
        totalOverdue: Math.round(toINR(totalOverdue, cur, rates)),
        totalBudget: Math.round(toINR(p.totalBudget || 0, cur, rates)),
        extraFeatures: Math.round(toINR(extraFeatures, cur, rates)),
        expenses: Math.round(toINR(expenses, cur, rates)),
        baseCost: Math.round(toINR(baseCost, cur, rates)),
      },
    };
  });

  // INR totals across all projects
  const totals = projectSummaries.reduce(
    (acc, p) => ({
      contractValue: acc.contractValue + p.inr.contractValue,
      totalCosts: acc.totalCosts + p.inr.totalCosts,
      paymentsReceived: acc.paymentsReceived + p.inr.paymentsReceived,
      outstanding: acc.outstanding + p.inr.outstanding,
      totalInvoiced: acc.totalInvoiced + p.inr.totalInvoiced,
      totalPaid: acc.totalPaid + p.inr.totalPaid,
      totalOverdue: acc.totalOverdue + p.inr.totalOverdue,
    }),
    { contractValue: 0, totalCosts: 0, paymentsReceived: 0, outstanding: 0, totalInvoiced: 0, totalPaid: 0, totalOverdue: 0 }
  );

  // Exchange rate snapshot to show on frontend
  const rateSnapshot: Record<string, number> = {};
  for (const cur of ['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'AED', 'CAD']) {
    const inrPerUsd = rates['INR'] || 83.5;
    const curPerUsd = rates[cur] || 1;
    rateSnapshot[cur] = Math.round((inrPerUsd / curPerUsd) * 100) / 100;
  }

  res.json({ projects: projectSummaries, totals, projectCount: projects.length, ratesDate, rateSnapshot });
});

// ─── Country rate cards ────────────────────────────────────────────────────
interface RateCard {
  label: string;
  currency: string;
  symbol: string;
  roles: {
    backend:    [number, number, number]; // [junior, mid, senior] per hour
    frontend:   [number, number, number];
    fullstack:  [number, number, number];
    qa:         [number, number, number];
    designer:   [number, number, number];
    devops:     [number, number];         // [mid, senior]
    pm:         [number, number];
    techLead:   number;
  };
  marketNote: string;
}

const RATE_CARDS: Record<string, RateCard> = {
  IN: {
    label: 'India', currency: 'INR', symbol: '₹',
    roles: {
      backend:   [800, 1500, 2800],
      frontend:  [700, 1300, 2500],
      fullstack: [900, 1700, 3200],
      qa:        [600, 1100, 2000],
      designer:  [700, 1400, 2600],
      devops:    [1500, 2800],
      pm:        [1200, 2500],
      techLead:  3500,
    },
    marketNote: 'Indian domestic market rates (INR/hour). Strong talent pool — Bangalore, Hyderabad, Pune hubs.',
  },
  US: {
    label: 'United States', currency: 'USD', symbol: '$',
    roles: {
      backend:   [85, 130, 200],
      frontend:  [80, 120, 185],
      fullstack: [90, 140, 210],
      qa:        [65, 100, 150],
      designer:  [75, 120, 180],
      devops:    [120, 190],
      pm:        [100, 160],
      techLead:  230,
    },
    marketNote: 'US domestic market. Highly competitive — Silicon Valley rates at top end, midwest/remote ~20% lower.',
  },
  GB: {
    label: 'United Kingdom', currency: 'GBP', symbol: '£',
    roles: {
      backend:   [55, 85, 130],
      frontend:  [50, 80, 120],
      fullstack: [60, 90, 140],
      qa:        [40, 65, 100],
      designer:  [50, 80, 125],
      devops:    [80, 130],
      pm:        [70, 115],
      techLead:  155,
    },
    marketNote: 'UK market. London rates at the top end — regional offices ~15-25% lower.',
  },
  AU: {
    label: 'Australia', currency: 'AUD', symbol: 'A$',
    roles: {
      backend:   [90, 135, 200],
      frontend:  [85, 125, 190],
      fullstack: [95, 145, 210],
      qa:        [70, 105, 160],
      designer:  [80, 125, 185],
      devops:    [125, 200],
      pm:        [110, 175],
      techLead:  230,
    },
    marketNote: 'Australian market. Sydney/Melbourne at top end — Perth/Brisbane ~10% lower.',
  },
  DE: {
    label: 'Germany', currency: 'EUR', symbol: '€',
    roles: {
      backend:   [65, 95, 145],
      frontend:  [60, 90, 135],
      fullstack: [70, 100, 155],
      qa:        [50, 75, 115],
      designer:  [55, 90, 135],
      devops:    [90, 145],
      pm:        [80, 130],
      techLead:  170,
    },
    marketNote: 'German market. Munich/Berlin at top end.',
  },
  SG: {
    label: 'Singapore', currency: 'SGD', symbol: 'S$',
    roles: {
      backend:   [70, 110, 165],
      frontend:  [65, 105, 155],
      fullstack: [75, 120, 175],
      qa:        [55, 85, 130],
      designer:  [65, 110, 160],
      devops:    [110, 170],
      pm:        [95, 155],
      techLead:  195,
    },
    marketNote: 'Singapore tech hub. Regional APAC hub — tight talent market.',
  },
  AE: {
    label: 'UAE', currency: 'AED', symbol: 'AED',
    roles: {
      backend:   [200, 320, 500],
      frontend:  [190, 300, 470],
      fullstack: [220, 350, 530],
      qa:        [160, 250, 390],
      designer:  [190, 310, 475],
      devops:    [320, 520],
      pm:        [280, 460],
      techLead:  600,
    },
    marketNote: 'UAE/Dubai market. Tax-free salaries — competitive with Europe.',
  },
  CA: {
    label: 'Canada', currency: 'CAD', symbol: 'C$',
    roles: {
      backend:   [80, 120, 185],
      frontend:  [75, 115, 175],
      fullstack: [85, 130, 195],
      qa:        [60, 95, 145],
      designer:  [70, 115, 170],
      devops:    [115, 185],
      pm:        [100, 160],
      techLead:  215,
    },
    marketNote: 'Canadian market. Toronto/Vancouver at top end — Ottawa/Montreal ~10-15% lower.',
  },
  PH: {
    label: 'Philippines', currency: 'PHP', symbol: '₱',
    roles: {
      backend:   [700, 1200, 2000],
      frontend:  [650, 1100, 1800],
      fullstack: [800, 1400, 2200],
      qa:        [500, 900, 1500],
      designer:  [600, 1100, 1900],
      devops:    [1200, 2000],
      pm:        [1000, 1800],
      techLead:  2500,
    },
    marketNote: 'Philippine market. Strong BPO/tech offshore hub. Manila/Cebu rates.',
  },
  PK: {
    label: 'Pakistan', currency: 'PKR', symbol: '₨',
    roles: {
      backend:   [2500, 4500, 8000],
      frontend:  [2200, 4000, 7000],
      fullstack: [2800, 5000, 9000],
      qa:        [2000, 3500, 6000],
      designer:  [2300, 4200, 7500],
      devops:    [4500, 8000],
      pm:        [3800, 7000],
      techLead:  10000,
    },
    marketNote: 'Pakistan market. Karachi/Lahore/Islamabad tech clusters.',
  },
};

const COMPLEXITY_MULTIPLIERS: Record<string, number> = {
  Low: 0.75, Medium: 1.0, High: 1.6, 'Very High': 2.5,
};

// POST /api/finance/quote — AI-powered project quote generation
financeRoutes.post('/quote', async (req: AuthRequest, res: Response) => {
  const { projectName, description, countryCode, techStack, timeline, complexity } = req.body;

  if (!description) return res.status(400).json({ error: 'Project description is required' });

  const card = RATE_CARDS[countryCode?.toUpperCase()] || RATE_CARDS['IN'];
  const complexityMultiplier = COMPLEXITY_MULTIPLIERS[complexity] || 1.0;
  const r = card.roles;

  const prompt = `You are a senior software project estimator with 15+ years experience quoting projects commercially. Your job is to produce a quote that is ACCURATE and would win real business — not too cheap (losing money) and not inflated (losing the deal).

PROJECT BRIEF:
- Name: ${projectName || 'Unnamed Project'}
- Description: ${description}
- Tech Stack: ${techStack || 'Choose appropriate stack'}
- Requested Timeline: ${timeline || 'Determine from scope'}
- Complexity: ${complexity || 'Medium'} (multiplier: ${complexityMultiplier}x applied to base hours)
- Market: ${card.label}

RATE CARD FOR ${card.label.toUpperCase()} (${card.currency}/hour):
| Role                | Junior | Mid    | Senior | Lead   |
|---------------------|--------|--------|--------|--------|
| Backend Developer   | ${card.symbol}${r.backend[0]}   | ${card.symbol}${r.backend[1]}  | ${card.symbol}${r.backend[2]} | —      |
| Frontend Developer  | ${card.symbol}${r.frontend[0]}   | ${card.symbol}${r.frontend[1]}  | ${card.symbol}${r.frontend[2]} | —      |
| Full Stack Dev      | ${card.symbol}${r.fullstack[0]}   | ${card.symbol}${r.fullstack[1]}  | ${card.symbol}${r.fullstack[2]} | —      |
| QA / Test Engineer  | ${card.symbol}${r.qa[0]}   | ${card.symbol}${r.qa[1]}  | ${card.symbol}${r.qa[2]} | —      |
| UI/UX Designer      | ${card.symbol}${r.designer[0]}   | ${card.symbol}${r.designer[1]}  | ${card.symbol}${r.designer[2]} | —      |
| DevOps / Infra      | —      | ${card.symbol}${r.devops[0]}  | ${card.symbol}${r.devops[1]} | —      |
| Project Manager     | —      | ${card.symbol}${r.pm[0]}  | ${card.symbol}${r.pm[1]} | —      |
| Tech Lead/Architect | —      | —      | —      | ${card.symbol}${r.techLead}   |
Market note: ${card.marketNote}

FEATURE HOUR BENCHMARKS (base hours at Medium complexity — scale by ${complexityMultiplier}x for ${complexity}):
- User authentication (register/login/JWT/password reset): 24–40h backend + 16–24h frontend
- Role-based access control (RBAC): 16–32h
- CRUD for one resource with list/detail/create/edit/delete: 12–20h backend + 10–16h frontend
- Admin dashboard (management panel): 40–80h
- Dashboard with charts/analytics: 32–60h
- File upload + cloud storage (S3/GCS): 16–28h
- Email notifications (templates + sending): 12–20h
- SMS/push notifications: 16–28h
- Payment integration (Stripe/Razorpay/PayPal): 24–48h
- Subscription & billing management: 40–72h
- REST API design & documentation: 16–24h
- Third-party API integration (per integration): 16–40h
- Real-time features (WebSocket/Socket.io): 32–56h
- Search with filters and pagination: 20–36h
- Multi-language / i18n: 24–40h
- Export (PDF/Excel reports): 16–32h
- Maps / geolocation features: 24–48h
- AI/ML integration (API call): 24–40h; (custom model): 80–200h
- Mobile-responsive UI: add 25–35% to frontend hours
- Database design & migrations: 16–32h
- Infrastructure / CI/CD setup: 24–48h
- Unit + integration testing: 20–25% of total dev hours
- Project management overhead: 10–15% of total

PHASE STRUCTURE (use this as your breakdown framework):
1. Discovery & Architecture (5–8% of total)
2. UI/UX Design (10–20% depending on UI complexity)
3. Backend Development (30–45%)
4. Frontend Development (25–35%)
5. Integrations & APIs (0–20% based on scope)
6. QA & Testing (15–20%)
7. DevOps, Deployment & Infrastructure (5–10%)
8. Post-launch support buffer (5%)

ESTIMATION RULES (follow these strictly):
1. Read the description carefully. Identify EVERY feature explicitly or implicitly mentioned.
2. For each feature, use the benchmark hours above as your starting point, then scale by the complexity multiplier (${complexityMultiplier}x).
3. Do NOT round everything to neat numbers — use realistic figures like 34h, 52h, 87h.
4. Use a MIXED team: senior for architecture and core modules, mid for most work, junior for repetitive/boilerplate tasks.
5. amount = hours × rate. Compute this correctly. Double-check your math.
6. subtotal = sum of all lineItem amounts (verify this).
7. Contingency: Low=10%, Medium=15%, High=20%, VeryHigh=25%.
8. contingencyAmount = subtotal × (contingencyPercent/100). Round to nearest 100.
9. total = subtotal + contingencyAmount.
10. timelineEstimate must be realistic: 160h = 1 month (1 dev), but parallel team compresses this.

Respond with ONLY a valid JSON object — no markdown fences, no explanation outside JSON:
{
  "summary": "3-4 sentences covering scope, team, key risks, and what's included",
  "assumptions": [
    "assumption about what is included",
    "assumption about what is excluded",
    "assumption about client responsibilities",
    "assumption about deployment target",
    "assumption about design assets / content"
  ],
  "lineItems": [
    {
      "phase": "Phase name (e.g. Backend Development)",
      "description": "Specific feature or work item (e.g. User authentication — register, login, JWT, password reset, email verification)",
      "hours": 52,
      "role": "Mid Backend Developer",
      "rate": ${r.backend[1]},
      "amount": ${r.backend[1] * 52}
    }
  ],
  "subtotal": 0,
  "contingencyPercent": 15,
  "contingencyAmount": 0,
  "total": 0,
  "currency": "${card.currency}",
  "timelineEstimate": "e.g. 4–5 months with a team of 3",
  "teamComposition": "e.g. 1 Tech Lead, 2 Senior Backend, 1 Mid Frontend, 1 QA, 1 UI Designer",
  "recommendations": [
    "Specific actionable recommendation for this project",
    "Another specific recommendation"
  ],
  "riskFactors": [
    "Specific risk for this project with mitigation hint",
    "Another specific risk"
  ]
}`;

  try {
    const raw = await gemini.generateContent(prompt, { useCache: false, traceName: 'finance-quote' });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    // Server-side arithmetic verification — recalculate to correct any model errors
    const subtotal = (parsed.lineItems || []).reduce((s: number, li: any) => {
      const amount = (li.hours || 0) * (li.rate || 0);
      li.amount = amount; // enforce correct amount per line
      return s + amount;
    }, 0);
    const pct = parsed.contingencyPercent || 15;
    const contingencyAmount = Math.round(subtotal * pct / 100);
    parsed.subtotal = subtotal;
    parsed.contingencyAmount = contingencyAmount;
    parsed.total = subtotal + contingencyAmount;

    res.json({ quote: parsed, country: { code: countryCode, label: card.label, currency: card.currency, symbol: card.symbol } });
  } catch (err: any) {
    console.error('Quote generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate quote. Please try again.' });
  }
});
