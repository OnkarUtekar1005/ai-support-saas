import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('===========================================');
  console.log('  AI Support + CRM SaaS — Database Seeder');
  console.log('===========================================\n');

  // ─────────────────────────────────────────
  // 1. ORGANIZATION
  // ─────────────────────────────────────────
  console.log('[1/10] Creating organization...');
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      plan: 'PRO',
    },
  });

  // ─────────────────────────────────────────
  // 2. USERS
  // ─────────────────────────────────────────
  console.log('[2/10] Creating users...');
  const adminHash = await bcrypt.hash('admin123', 12);
  const agentHash = await bcrypt.hash('agent123', 12);
  const viewerHash = await bcrypt.hash('viewer123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      email: 'admin@acme.com',
      name: 'Onkar Patil',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      organizationId: org.id,
    },
  });

  // Project Admin — manages Billing & CRM projects only
  const agent1 = await prisma.user.upsert({
    where: { email: 'priya@acme.com' },
    update: {},
    create: {
      email: 'priya@acme.com',
      name: 'Priya Sharma',
      passwordHash: agentHash,
      role: 'ADMIN',
      organizationId: org.id,
    },
  });

  // Agent — assigned to specific projects
  const agent2 = await prisma.user.upsert({
    where: { email: 'rahul@acme.com' },
    update: {},
    create: {
      email: 'rahul@acme.com',
      name: 'Rahul Mehta',
      passwordHash: agentHash,
      role: 'AGENT',
      organizationId: org.id,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@acme.com' },
    update: {},
    create: {
      email: 'viewer@acme.com',
      name: 'Demo Viewer',
      passwordHash: viewerHash,
      role: 'VIEWER',
      organizationId: org.id,
    },
  });

  // ─────────────────────────────────────────
  // 3. PROJECTS
  // ─────────────────────────────────────────
  console.log('[3/10] Creating projects...');
  const projectBilling = await prisma.project.create({
    data: {
      name: 'APAC Billing Platform',
      description: 'Billing and invoicing system for the Asia-Pacific region. Handles multi-currency invoicing, payment reconciliation, and tenant billing cycles.',
      status: 'ACTIVE',
      color: '#3b82f6',
      organizationId: org.id,
      members: {
        createMany: {
          data: [
            { userId: admin.id, role: 'OWNER' },
            { userId: agent1.id, role: 'MANAGER' },
            { userId: agent2.id, role: 'MEMBER' },
          ],
        },
      },
    },
  });

  const projectCRM = await prisma.project.create({
    data: {
      name: 'Enterprise CRM Migration',
      description: 'Migrating legacy CRM to new cloud-native platform. Phase 1: Data migration. Phase 2: UI rollout. Phase 3: Training.',
      status: 'ACTIVE',
      color: '#10b981',
      organizationId: org.id,
      members: {
        createMany: {
          data: [
            { userId: admin.id, role: 'OWNER' },
            { userId: agent1.id, role: 'MEMBER' },
          ],
        },
      },
    },
  });

  const projectMobile = await prisma.project.create({
    data: {
      name: 'Mobile App v3',
      description: 'Next-generation mobile app with offline support, push notifications, and biometric authentication.',
      status: 'ACTIVE',
      color: '#f59e0b',
      organizationId: org.id,
      members: {
        createMany: {
          data: [
            { userId: agent2.id, role: 'OWNER' },
            { userId: admin.id, role: 'MANAGER' },
          ],
        },
      },
    },
  });

  // ─────────────────────────────────────────
  // 4. COMPANIES
  // ─────────────────────────────────────────
  console.log('[4/10] Creating companies...');
  const companies = await Promise.all([
    prisma.company.create({
      data: {
        name: 'TechNova Solutions',
        domain: 'technova.io',
        industry: 'SaaS / Technology',
        size: '51-200',
        phone: '+91-22-4000-1234',
        address: 'Tower B, Mindspace, Airoli, Navi Mumbai 400708',
        notes: 'Key enterprise client. Evaluating our billing platform for their APAC expansion.',
        projectId: projectBilling.id,
        organizationId: org.id,
      },
    }),
    prisma.company.create({
      data: {
        name: 'GlobalRetail Inc.',
        domain: 'globalretail.com',
        industry: 'E-Commerce / Retail',
        size: '201-500',
        phone: '+1-555-0100',
        address: '456 Market St, San Francisco, CA 94105',
        notes: 'Large retail chain. Interested in CRM migration for 200+ stores.',
        projectId: projectCRM.id,
        organizationId: org.id,
      },
    }),
    prisma.company.create({
      data: {
        name: 'FinServ Partners',
        domain: 'finserv.co.in',
        industry: 'Financial Services',
        size: '11-50',
        phone: '+91-80-2500-5678',
        address: '3rd Floor, Prestige Tower, MG Road, Bangalore 560001',
        notes: 'Financial advisory firm. Needs mobile app for client portfolio tracking.',
        projectId: projectMobile.id,
        organizationId: org.id,
      },
    }),
    prisma.company.create({
      data: {
        name: 'MediCare Health',
        domain: 'medicare-health.com',
        industry: 'Healthcare',
        size: '500+',
        phone: '+91-11-4500-9999',
        address: 'Sector 44, Gurugram, Haryana 122003',
        notes: 'Hospital chain exploring billing automation.',
        projectId: projectBilling.id,
        organizationId: org.id,
      },
    }),
    prisma.company.create({
      data: {
        name: 'EduLearn Academy',
        domain: 'edulearn.in',
        industry: 'Education / EdTech',
        size: '11-50',
        phone: '+91-20-3200-4567',
        address: 'Hinjewadi Phase 2, Pune 411057',
        notes: 'Online education platform. Early stage discussions.',
        organizationId: org.id,
      },
    }),
  ]);

  // ─────────────────────────────────────────
  // 5. CONTACTS
  // ─────────────────────────────────────────
  console.log('[5/10] Creating contacts...');
  const contacts = await Promise.all([
    prisma.contact.create({
      data: {
        firstName: 'Anita', lastName: 'Desai',
        email: 'anita.desai@technova.io', phone: '+91-98765-43210',
        jobTitle: 'VP of Engineering', status: 'CUSTOMER',
        source: 'referral', notes: 'Decision maker for billing platform deal. Very technical, prefers detailed proposals.',
        companyId: companies[0].id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Vikram', lastName: 'Singh',
        email: 'vikram@technova.io', phone: '+91-98765-11111',
        jobTitle: 'CTO', status: 'CUSTOMER',
        source: 'referral',
        companyId: companies[0].id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Sarah', lastName: 'Chen',
        email: 'sarah.chen@globalretail.com', phone: '+1-555-0201',
        jobTitle: 'Director of IT', status: 'ACTIVE',
        source: 'website', notes: 'Driving the CRM migration internally. Budget approved for Q2.',
        companyId: companies[1].id, projectId: projectCRM.id, organizationId: org.id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Rajesh', lastName: 'Kumar',
        email: 'rajesh@finserv.co.in', phone: '+91-98765-22222',
        jobTitle: 'Managing Director', status: 'LEAD',
        source: 'cold-call', notes: 'Met at FinTech Summit. Interested in mobile portfolio app.',
        companyId: companies[2].id, projectId: projectMobile.id, organizationId: org.id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Dr. Meena', lastName: 'Kapoor',
        email: 'meena.kapoor@medicare-health.com', phone: '+91-98765-33333',
        jobTitle: 'Head of Operations', status: 'ACTIVE',
        source: 'linkedin',
        companyId: companies[3].id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Amit', lastName: 'Joshi',
        email: 'amit@edulearn.in', phone: '+91-98765-44444',
        jobTitle: 'Founder & CEO', status: 'LEAD',
        source: 'website', notes: 'Submitted inquiry via website. Small budget, high potential.',
        companyId: companies[4].id, organizationId: org.id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Lisa', lastName: 'Wang',
        email: 'lisa.wang@globalretail.com', phone: '+1-555-0301',
        jobTitle: 'CFO', status: 'ACTIVE',
        source: 'referral',
        companyId: companies[1].id, projectId: projectCRM.id, organizationId: org.id,
      },
    }),
    prisma.contact.create({
      data: {
        firstName: 'Deepak', lastName: 'Nair',
        email: 'deepak.nair@technova.io', phone: '+91-98765-55555',
        jobTitle: 'Product Manager', status: 'CUSTOMER',
        source: 'referral',
        companyId: companies[0].id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
  ]);

  // ─────────────────────────────────────────
  // 6. DEALS
  // ─────────────────────────────────────────
  console.log('[6/10] Creating deals...');
  const deals = await Promise.all([
    prisma.deal.create({
      data: {
        title: 'TechNova Billing Platform License',
        value: 120000, currency: 'USD', stage: 'NEGOTIATION', probability: 75,
        expectedClose: new Date('2026-04-15'),
        notes: 'Annual license for 50 tenants. Negotiating volume discount.',
        contactId: contacts[0].id, companyId: companies[0].id,
        ownerId: admin.id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'GlobalRetail CRM Migration',
        value: 250000, currency: 'USD', stage: 'PROPOSAL', probability: 60,
        expectedClose: new Date('2026-06-01'),
        notes: 'Full CRM migration for 200+ stores. Includes data migration, training, 1yr support.',
        contactId: contacts[2].id, companyId: companies[1].id,
        ownerId: agent1.id, projectId: projectCRM.id, organizationId: org.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'FinServ Mobile Portfolio App',
        value: 45000, currency: 'USD', stage: 'QUALIFIED', probability: 40,
        expectedClose: new Date('2026-05-30'),
        notes: 'Custom mobile app for client portfolio management.',
        contactId: contacts[3].id, companyId: companies[2].id,
        ownerId: agent2.id, projectId: projectMobile.id, organizationId: org.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'MediCare Billing Automation',
        value: 85000, currency: 'USD', stage: 'LEAD', probability: 20,
        expectedClose: new Date('2026-07-01'),
        notes: 'Early stage. Hospital billing automation for 12 locations.',
        contactId: contacts[4].id, companyId: companies[3].id,
        ownerId: admin.id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'TechNova Support Add-on',
        value: 30000, currency: 'USD', stage: 'CLOSED_WON', probability: 100,
        expectedClose: new Date('2026-03-01'), closedAt: new Date('2026-02-28'),
        notes: 'Premium support tier. 24/7 coverage with dedicated engineer.',
        contactId: contacts[1].id, companyId: companies[0].id,
        ownerId: admin.id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'EduLearn Starter Package',
        value: 8000, currency: 'USD', stage: 'LEAD', probability: 15,
        notes: 'Small starter deal. Could grow if they scale.',
        contactId: contacts[5].id, companyId: companies[4].id,
        ownerId: agent1.id, organizationId: org.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'GlobalRetail Analytics Dashboard',
        value: 65000, currency: 'USD', stage: 'QUALIFIED', probability: 50,
        expectedClose: new Date('2026-08-15'),
        notes: 'Add-on analytics for their CRM. Depends on migration deal closing first.',
        contactId: contacts[6].id, companyId: companies[1].id,
        ownerId: agent1.id, projectId: projectCRM.id, organizationId: org.id,
      },
    }),
    prisma.deal.create({
      data: {
        title: 'TechNova API Integration',
        value: 18000, currency: 'USD', stage: 'CLOSED_LOST', probability: 0,
        closedAt: new Date('2026-03-10'),
        notes: 'Lost to competitor. They went with in-house solution.',
        contactId: contacts[7].id, companyId: companies[0].id,
        ownerId: agent2.id, projectId: projectBilling.id, organizationId: org.id,
      },
    }),
  ]);

  // ─────────────────────────────────────────
  // 7. ACTIVITIES
  // ─────────────────────────────────────────
  console.log('[7/10] Creating activities...');
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  await Promise.all([
    prisma.activity.create({
      data: {
        type: 'CALL', subject: 'Follow up call with Anita on pricing',
        description: 'Discuss volume discount structure and multi-year commitment options.',
        status: 'TODO', dueDate: tomorrow,
        contactId: contacts[0].id, dealId: deals[0].id,
        assigneeId: admin.id, createdById: admin.id,
        projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'EMAIL', subject: 'Send proposal document to Sarah',
        description: 'Final proposal with pricing, timeline, and SLA details for CRM migration.',
        status: 'IN_PROGRESS', dueDate: now,
        contactId: contacts[2].id, dealId: deals[1].id,
        assigneeId: agent1.id, createdById: admin.id,
        projectId: projectCRM.id, organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'MEETING', subject: 'Demo session with FinServ team',
        description: 'Show prototype of portfolio tracking mobile app. Prepare demo account with sample data.',
        status: 'TODO', dueDate: nextWeek,
        contactId: contacts[3].id, dealId: deals[2].id,
        assigneeId: agent2.id, createdById: agent2.id,
        projectId: projectMobile.id, organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'NOTE', subject: 'Competitive intelligence update',
        description: 'TechNova mentioned competitor X is also pitching to MediCare. Need to accelerate our proposal.',
        status: 'DONE', completedAt: yesterday,
        companyId: companies[3].id, dealId: deals[3].id,
        assigneeId: admin.id, createdById: admin.id,
        projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'TASK', subject: 'Prepare Q2 pipeline review deck',
        description: 'Summarize all active deals, win/loss analysis, forecast for Q2.',
        status: 'TODO', dueDate: nextWeek,
        assigneeId: admin.id, createdById: admin.id,
        organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'FOLLOW_UP', subject: 'Check in with Amit from EduLearn',
        description: 'They went quiet after initial call. Send a value-add email with case study.',
        status: 'TODO', dueDate: yesterday, // overdue
        contactId: contacts[5].id, dealId: deals[5].id,
        assigneeId: agent1.id, createdById: admin.id,
        organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'CALL', subject: 'Contract review call with GlobalRetail CFO',
        description: 'Lisa wants to discuss payment terms before signing.',
        status: 'TODO', dueDate: tomorrow,
        contactId: contacts[6].id, dealId: deals[1].id,
        assigneeId: agent1.id, createdById: agent1.id,
        projectId: projectCRM.id, organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'MEETING', subject: 'Weekly standup — Billing team',
        description: 'Review open tickets, deployment status, customer feedback.',
        status: 'DONE', completedAt: twoDaysAgo, dueDate: twoDaysAgo,
        assigneeId: admin.id, createdById: admin.id,
        projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'EMAIL', subject: 'Send onboarding docs to TechNova support team',
        description: 'Premium support onboarding pack: SLA doc, escalation matrix, Slack channel invite.',
        status: 'DONE', completedAt: twoDaysAgo,
        contactId: contacts[1].id, dealId: deals[4].id,
        assigneeId: agent2.id, createdById: admin.id,
        projectId: projectBilling.id, organizationId: org.id,
      },
    }),
    prisma.activity.create({
      data: {
        type: 'TASK', subject: 'Update knowledge base with Q1 resolved tickets',
        description: 'Extract resolutions from Q1 tickets and add to knowledge base for AI training.',
        status: 'TODO', dueDate: nextWeek,
        assigneeId: agent1.id, createdById: admin.id,
        organizationId: org.id,
      },
    }),
  ]);

  // ─────────────────────────────────────────
  // 8. SUPPORT TICKETS
  // ─────────────────────────────────────────
  console.log('[8/10] Creating support tickets...');
  await Promise.all([
    prisma.ticket.create({
      data: {
        title: 'Invoice generation timeout for large tenants',
        description: 'When generating invoices for tenants with more than 5000 line items, the batch job times out after 120 seconds. Error: "SqlException: Execution Timeout Expired". This affects 3 enterprise tenants in APAC region. The issue started after the March deployment.',
        status: 'RESOLVED', priority: 'HIGH',
        issueType: 'Performance', confidence: 0.92,
        resolution: '## Root Cause\nThe batch invoice query was doing a full table scan on the InvoiceLineItems table without utilizing the tenant partition index.\n\n## Fix Steps\n1. Added composite index on (TenantId, InvoiceDate) to InvoiceLineItems\n2. Increased query timeout to 300s as a safety net\n3. Implemented batch processing — 500 items per chunk instead of all at once\n\n## Prevention\n- Added query execution plan monitoring alert for queries > 30s\n- Added unit test to verify batch processing with 10K line items',
        analysis: { issueType: 'Performance', confidence: 0.92, entities: { errorMessages: ['SqlException: Execution Timeout Expired'], modules: ['InvoiceBatchJob', 'BillingEngine'], systems: ['Azure SQL', 'Billing API'] }, summary: 'Invoice batch job timeout due to unoptimized query on large tenant datasets', suggestedPriority: 'HIGH', sqlNeeded: true },
        projectId: projectBilling.id, contactId: contacts[0].id,
        createdById: admin.id, organizationId: org.id,
      },
    }),
    prisma.ticket.create({
      data: {
        title: 'Payment reconciliation showing wrong currency conversion',
        description: 'Payments received in JPY are being converted to USD using yesterdays exchange rate instead of the rate at transaction time. This causes a ¥50,000-100,000 discrepancy per day across APAC tenants.',
        status: 'IN_PROGRESS', priority: 'CRITICAL',
        issueType: 'Data Integrity', confidence: 0.88,
        analysis: { issueType: 'Data Integrity', confidence: 0.88, entities: { errorMessages: [], modules: ['PaymentReconciliation', 'CurrencyService'], systems: ['Payment Gateway', 'Exchange Rate API'] }, summary: 'Currency conversion using stale exchange rates causing daily discrepancies', suggestedPriority: 'CRITICAL', sqlNeeded: true },
        projectId: projectBilling.id, contactId: contacts[1].id,
        createdById: agent1.id, organizationId: org.id,
      },
    }),
    prisma.ticket.create({
      data: {
        title: 'User unable to login after password reset',
        description: 'Customer reports that after using the "Forgot Password" flow, the new password is not accepted. They get "Invalid credentials" error. Tried 3 times with different passwords. Browser: Chrome 120, OS: Windows 11.',
        status: 'OPEN', priority: 'MEDIUM',
        issueType: 'Authentication', confidence: 0.65,
        analysis: { issueType: 'Authentication', confidence: 0.65, entities: { errorMessages: ['Invalid credentials'], modules: ['AuthService', 'PasswordReset'], systems: ['Identity Provider'] }, summary: 'Password reset flow may not be properly updating the credential store', suggestedPriority: 'MEDIUM', sqlNeeded: false },
        projectId: projectCRM.id, contactId: contacts[2].id,
        createdById: agent1.id, organizationId: org.id,
      },
    }),
    prisma.ticket.create({
      data: {
        title: 'Mobile app crashes on startup after OS update',
        description: 'Multiple users reporting app crash immediately on launch after updating to iOS 18.2. Crash log shows EXC_BAD_ACCESS in the biometric authentication module. Affects approximately 15% of iOS users.',
        status: 'IN_PROGRESS', priority: 'HIGH',
        issueType: 'Crash', confidence: 0.95,
        analysis: { issueType: 'Crash', confidence: 0.95, entities: { errorMessages: ['EXC_BAD_ACCESS'], modules: ['BiometricAuth', 'AppDelegate'], systems: ['iOS 18.2', 'LocalAuthentication framework'] }, summary: 'iOS 18.2 compatibility issue with biometric authentication causing startup crash', suggestedPriority: 'HIGH', sqlNeeded: false },
        projectId: projectMobile.id,
        createdById: agent2.id, organizationId: org.id,
      },
    }),
    prisma.ticket.create({
      data: {
        title: 'API rate limiting blocking legitimate webhook calls',
        description: 'Our Stripe webhook endpoint is getting rate-limited during high-volume periods (Black Friday sale). We received 2000+ webhooks in 5 minutes and our rate limiter blocked about 40% of them, causing missed payment confirmations.',
        status: 'OPEN', priority: 'HIGH',
        issueType: 'Configuration', confidence: 0.85,
        analysis: { issueType: 'Configuration', confidence: 0.85, entities: { errorMessages: ['429 Too Many Requests'], modules: ['WebhookHandler', 'RateLimiter'], systems: ['Stripe', 'API Gateway'] }, summary: 'Rate limiter configuration too aggressive for webhook traffic spikes', suggestedPriority: 'HIGH', sqlNeeded: false },
        projectId: projectBilling.id,
        createdById: admin.id, organizationId: org.id,
      },
    }),
  ]);

  // ─────────────────────────────────────────
  // 9. SYSTEM CONFIG
  // ─────────────────────────────────────────
  console.log('[9/10] Creating system configs...');
  await prisma.systemConfig.upsert({
    where: { id: 'apac-billing-config' },
    update: {},
    create: {
      id: 'apac-billing-config',
      name: 'APAC Billing System',
      description: 'Configuration for the Asia-Pacific billing platform',
      isDefault: true,
      organizationId: org.id,
      config: {
        techStack: {
          languages: ['T-SQL', 'C#', 'TypeScript'],
          frameworks: ['.NET 8', 'ASP.NET Core', 'React'],
          databases: [
            { name: 'BillingDB', type: 'mssql', description: 'Main billing database' },
            { name: 'AnalyticsDB', type: 'postgresql', description: 'Reporting and analytics' },
          ],
          infrastructure: ['Azure App Service', 'Azure SQL', 'Azure Redis Cache', 'Azure Service Bus'],
          integrations: ['Stripe', 'Xero', 'QuickBooks', 'SendGrid'],
        },
        schema: [
          { table: 'Tenants', columns: ['TenantId', 'Name', 'Plan', 'Currency', 'Region', 'CreatedAt'], description: 'Multi-tenant customer accounts' },
          { table: 'Invoices', columns: ['InvoiceId', 'TenantId', 'Amount', 'Currency', 'Status', 'DueDate', 'PaidAt'], description: 'Generated invoices' },
          { table: 'InvoiceLineItems', columns: ['LineItemId', 'InvoiceId', 'Description', 'Quantity', 'UnitPrice', 'Amount'], description: 'Line items per invoice' },
          { table: 'Payments', columns: ['PaymentId', 'InvoiceId', 'Amount', 'Currency', 'Gateway', 'ExchangeRate', 'ProcessedAt'], description: 'Payment transactions' },
          { table: 'Subscriptions', columns: ['SubscriptionId', 'TenantId', 'PlanId', 'Status', 'StartDate', 'EndDate', 'MRR'], description: 'Active subscriptions' },
        ],
        knownIssues: [
          { id: 'KI-001', title: 'Invoice generation timeout', symptoms: ['Timeout error during batch invoice run', 'Incomplete invoices'], rootCause: 'Large tenant datasets causing query timeout', fix: 'Add composite index and implement batch processing' },
          { id: 'KI-002', title: 'Payment reconciliation mismatch', symptoms: ['Balance discrepancy', 'Missing payments in reports'], rootCause: 'Timezone mismatch between payment gateway and billing system', fix: 'Normalize all timestamps to UTC before comparison' },
          { id: 'KI-003', title: 'Duplicate invoice emails', symptoms: ['Customers receiving 2-3 copies of same invoice'], rootCause: 'Email queue retry logic not checking for already-sent emails', fix: 'Add idempotency key to email dispatch' },
        ],
        glossary: {
          MRR: 'Monthly Recurring Revenue',
          ARR: 'Annual Recurring Revenue',
          Churn: 'Customer cancellation rate',
          'Tenant': 'A customer organization in the multi-tenant system',
          'Reconciliation': 'Process of matching payments to invoices',
        },
        severityLevels: [
          { level: 1, name: 'Critical', responseTime: '15 minutes', description: 'System down, data loss, security breach' },
          { level: 2, name: 'High', responseTime: '1 hour', description: 'Major feature broken, affecting multiple tenants' },
          { level: 3, name: 'Medium', responseTime: '4 hours', description: 'Feature degraded, workaround available' },
          { level: 4, name: 'Low', responseTime: '24 hours', description: 'Minor issue, cosmetic, enhancement request' },
        ],
      },
    },
  });

  // ─────────────────────────────────────────
  // 10. ERROR LOGS (sample errors)
  // ─────────────────────────────────────────
  console.log('[10/10] Creating sample error logs (all categories)...');
  const t = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

  const pBilling = projectBilling.id;
  const pCRM = projectCRM.id;
  const pMobile = projectMobile.id;

  const errorLogs = [
    // ─── DATABASE ERRORS ───
    { level: 'FATAL' as const, category: 'database', projectId: pBilling, message: 'Database connection pool exhausted — all 50 connections in use', stack: 'Error: Pool is exhausted. Max: 50, Active: 50, Idle: 0\n    at ConnectionPool.acquire (node_modules/mssql/lib/pool.js:89:15)', source: 'SqlConnector', endpoint: 'POST /api/db-connections/query', aiAnalysis: 'All 50 connections occupied. Long-running queries or connection leaks.', aiSuggestion: '1. Add 30s query timeout\n2. Release in `finally` blocks\n3. Increase pool to 100\n4. Add pool monitoring', analyzed: true, emailSent: true, createdAt: t(1) },
    { level: 'ERROR' as const, category: 'database', projectId: pBilling, message: 'Prisma query timeout: SELECT on KnowledgeEntry exceeded 10s', stack: 'PrismaClientKnownRequestError: Query engine timed out\n    at VectorStore.search (src/services/rag/VectorStore.ts:31:28)', source: 'VectorStore', endpoint: 'POST /api/system-config/knowledge/search', analyzed: false, emailSent: false, createdAt: t(3) },
    { level: 'ERROR' as const, category: 'database', projectId: pCRM, message: 'UNIQUE constraint violation: duplicate key "Contact_email_key"', stack: 'PrismaClientKnownRequestError: Unique constraint failed on (`email`)\n    at POST /api/contacts', source: 'PrismaORM', endpoint: 'POST /api/contacts', aiAnalysis: 'Duplicate email. Unique constraint prevents creation.', aiSuggestion: '1. Check existing before create\n2. Use upsert\n3. Return friendly error', analyzed: true, emailSent: false, createdAt: t(5) },
    { level: 'ERROR' as const, category: 'database', message: 'PostgreSQL: relation "AuditLog" does not exist', source: 'PostgreSQL', endpoint: 'GET /api/admin/audit', aiAnalysis: 'Table missing. Migration not run or table dropped.', aiSuggestion: '1. Run prisma migrate dev\n2. Check schema.prisma\n3. Verify DATABASE_URL', analyzed: true, emailSent: false, createdAt: t(28) },

    // ─── API / HTTP ERRORS ───
    { level: 'ERROR' as const, category: 'api', projectId: pBilling, message: 'API rate limit exceeded: 429 Too Many Requests from IP 203.0.113.42', source: 'RateLimiter', endpoint: 'POST /api/tickets', analyzed: false, emailSent: false, createdAt: t(2) },
    { level: 'ERROR' as const, category: 'api', projectId: pBilling, message: 'Gemini API rate limit exceeded: 429 Resource exhausted', stack: 'GoogleGenerativeAIError: [429] Resource exhausted\n    at GeminiClient.callWithRetry', source: 'GeminiClient', endpoint: 'POST /api/tickets', aiAnalysis: 'Free tier limit hit (15 RPM).', aiSuggestion: '1. Wait 60s\n2. Queue requests\n3. Upgrade to paid tier\n4. Cache responses', analyzed: true, emailSent: false, createdAt: t(4) },
    { level: 'ERROR' as const, category: 'api', projectId: pCRM, message: 'Webhook delivery failed: ECONNREFUSED https://client-app.example.com/webhook', source: 'WebhookService', endpoint: 'POST /internal/webhook-dispatch', analyzed: false, emailSent: false, createdAt: t(8) },
    { level: 'WARN' as const, category: 'api', projectId: pCRM, message: 'Slow API response: GET /api/deals/pipeline took 4.8s (threshold: 3s)', source: 'PerformanceMonitor', endpoint: 'GET /api/deals/pipeline', analyzed: false, emailSent: false, createdAt: t(6) },

    // ─── AUTHENTICATION / SECURITY ERRORS ───
    { level: 'WARN' as const, category: 'auth', message: 'JWT token expired for user priya@acme.com — forcing re-auth', source: 'AuthMiddleware', endpoint: 'GET /api/tickets', analyzed: false, emailSent: false, createdAt: t(12) },
    { level: 'ERROR' as const, category: 'auth', message: 'Invalid API key: sk_live_expired123... — deactivated', source: 'ApiKeyAuth', endpoint: 'POST /api/sdk/identify', aiAnalysis: 'External app used a deactivated key.', aiSuggestion: '1. Check Integrations for disabled keys\n2. Generate new key\n3. Update external app', analyzed: true, emailSent: false, createdAt: t(9) },
    { level: 'WARN' as const, category: 'auth', message: 'Brute force detected: 15 failed logins for admin@acme.com from IP 198.51.100.7', source: 'AuthService', endpoint: 'POST /api/auth/login', aiAnalysis: 'Multiple failed login attempts. Possible brute force.', aiSuggestion: '1. Block IP 30 min\n2. Alert user\n3. Add CAPTCHA\n4. IP rate limit on login', analyzed: true, emailSent: true, createdAt: t(15) },

    // ─── CORS ERRORS ───
    { level: 'ERROR' as const, category: 'cors', message: 'CORS blocked: Origin https://malicious-site.com not in allowed origins', source: 'CorsMiddleware', endpoint: 'POST /api/sdk/track', aiAnalysis: 'Origin not in API key allowed list. Expected security behavior.', aiSuggestion: '1. Add domain to API key allowed origins if legitimate\n2. Investigate if suspicious\n3. Rotate API key if compromised', analyzed: true, emailSent: false, createdAt: t(10) },

    // ─── TIMEOUT ERRORS ───
    { level: 'ERROR' as const, category: 'timeout', projectId: pBilling, message: 'Request timeout: POST /api/chat/sessions/abc123/messages exceeded 30s', stack: 'TimeoutError: Operation timed out after 30000ms', source: 'TimeoutMiddleware', endpoint: 'POST /api/chat', aiAnalysis: 'AI response exceeded 30s timeout. Gemini slow or CRM context too heavy.', aiSuggestion: '1. Increase timeout to 60s for AI\n2. Optimize context builder\n3. Add streaming\n4. Show loading state', analyzed: true, emailSent: false, createdAt: t(7) },
    { level: 'ERROR' as const, category: 'timeout', message: 'Socket.IO handshake timeout: client did not connect within 10s', source: 'SocketIO', endpoint: 'ws://localhost:3001/socket.io', analyzed: false, emailSent: false, createdAt: t(14) },

    // ─── CODE / SYNTAX / RUNTIME ERRORS ───
    { level: 'ERROR' as const, category: 'code', message: "TypeError: Cannot read properties of undefined (reading 'organizationId')", stack: "TypeError: Cannot read properties of undefined (reading 'organizationId')\n    at GET /api/tickets (src/routes/tickets.ts:22:48)", source: 'TicketsRoute', endpoint: 'GET /api/tickets', aiAnalysis: 'req.user is undefined. Auth middleware missing or bypassed.', aiSuggestion: '1. Verify authenticate middleware\n2. Check JWT validity\n3. Add null check', analyzed: true, emailSent: false, createdAt: t(11) },
    { level: 'ERROR' as const, category: 'code', projectId: pBilling, message: 'SyntaxError: Unexpected token < in JSON at position 0', stack: 'SyntaxError: Unexpected token <\n    at JSON.parse\n    at GeminiClient.generateContent', source: 'GeminiClient', endpoint: 'POST /api/tickets', aiAnalysis: 'Gemini returned HTML instead of JSON. Likely a 503 error page.', aiSuggestion: '1. Check status code before JSON.parse\n2. Validate content-type\n3. Log raw response\n4. Handle HTML errors', analyzed: true, emailSent: false, createdAt: t(20) },
    { level: 'ERROR' as const, category: 'code', message: 'RangeError: Maximum call stack size exceeded', stack: 'RangeError: Maximum call stack size exceeded\n    at ResolutionEngine.generateResolution (recursive call)', source: 'ResolutionEngine', endpoint: 'POST /api/tickets', analyzed: false, emailSent: false, createdAt: t(36) },

    // ─── NETWORK / CONNECTION ERRORS ───
    { level: 'ERROR' as const, category: 'network', projectId: pBilling, message: 'ECONNREFUSED: Redis cache failed at 10.0.1.50:6379', stack: 'Error: connect ECONNREFUSED 10.0.1.50:6379', source: 'CacheService', endpoint: 'GET /api/tickets', aiAnalysis: 'Redis unreachable. Service down or firewall.', aiSuggestion: '1. Check Redis: systemctl status redis\n2. Test: telnet 10.0.1.50 6379\n3. Add cache fallback', analyzed: true, emailSent: true, createdAt: t(2) },
    { level: 'ERROR' as const, category: 'network', projectId: pBilling, message: 'ETIMEDOUT: Payment gateway connection timed out after 15s', source: 'PaymentService', endpoint: 'POST /api/payments/refund', analyzed: false, emailSent: false, createdAt: t(16) },
    { level: 'ERROR' as const, category: 'network', projectId: pBilling, message: 'DNS failed: getaddrinfo ENOTFOUND api.exchangerate.invalid', source: 'CurrencyService', endpoint: 'GET /api/billing/convert', analyzed: false, emailSent: false, createdAt: t(22) },

    // ─── EMAIL / SMTP ERRORS ───
    { level: 'ERROR' as const, category: 'email', message: 'SMTP auth failed: EAUTH Invalid login credentials', stack: 'Error: 535-5.7.8 Username and Password not accepted', source: 'EmailService', aiAnalysis: 'App password expired or 2FA disabled.', aiSuggestion: '1. New App Password\n2. Update SMTP_PASS\n3. Verify 2FA', analyzed: true, emailSent: false, createdAt: t(18) },
    { level: 'WARN' as const, category: 'email', message: 'Email throttled by Gmail: too many messages per minute', source: 'EmailService', endpoint: 'POST /internal/send-digest', analyzed: false, emailSent: false, createdAt: t(25) },

    // ─── MEMORY / RESOURCE ERRORS ───
    { level: 'FATAL' as const, category: 'memory', message: 'JavaScript heap out of memory — Allocation failed', stack: 'FATAL ERROR: Reached heap limit\n    at VectorStore.embedBatch — processing 50K entries', source: 'VectorStore', aiAnalysis: 'OOM processing 50K knowledge entries at once.', aiSuggestion: '1. Batch 100-500 at a time\n2. node --max-old-space-size=4096\n3. Use streaming\n4. Paginate embedding pipeline', analyzed: true, emailSent: true, createdAt: t(30) },

    // ─── VALIDATION ERRORS ───
    { level: 'WARN' as const, category: 'validation', projectId: pCRM, message: 'Validation: deal.value must be positive, received: -500', source: 'ValidationMiddleware', endpoint: 'POST /api/deals', analyzed: false, emailSent: false, createdAt: t(13) },
    { level: 'WARN' as const, category: 'validation', message: 'Missing required field "title" in ticket creation', source: 'ValidationMiddleware', endpoint: 'POST /api/tickets', analyzed: false, emailSent: false, createdAt: t(17) },

    // ─── FRONTEND / SDK ERRORS ───
    { level: 'ERROR' as const, category: 'frontend', projectId: pMobile, message: "Uncaught TypeError: null.addEventListener — widget init failed", stack: "TypeError at initializeWidget (widget.js:145:22)", source: 'sdk-web', endpoint: 'https://client-website.com/checkout', aiAnalysis: 'Widget script loaded before DOM ready. Target element null.', aiSuggestion: '1. Wrap in DOMContentLoaded\n2. Add null check\n3. Use MutationObserver', analyzed: true, emailSent: false, createdAt: t(4) },
    { level: 'ERROR' as const, category: 'frontend', projectId: pMobile, message: 'Unhandled Promise Rejection: NetworkError fetching resource', source: 'sdk-web', endpoint: 'https://client-website.com/dashboard', analyzed: false, emailSent: false, createdAt: t(6) },

    // ─── FILE / DISK ERRORS ───
    { level: 'ERROR' as const, category: 'disk', message: 'ENOSPC: no space left on device — logs/error.log', stack: 'Error: ENOSPC\n    at WriteStream.fs.write', source: 'WinstonLogger', aiAnalysis: 'Disk full. Log files consumed all space.', aiSuggestion: '1. Clear old logs\n2. Set up log rotation\n3. Centralized logging\n4. Disk 80% alert', analyzed: true, emailSent: true, createdAt: t(40) },

    // ─── INFO / OPERATIONAL ───
    { level: 'INFO' as const, category: 'database', message: 'Migration completed: 20260320_add_crm_tables', source: 'PrismaMigrate', analyzed: false, emailSent: false, createdAt: t(48) },
    { level: 'INFO' as const, category: 'api', message: 'Server started on port 3001 — environment: production', source: 'ServerInit', analyzed: false, emailSent: false, createdAt: t(49) },
    { level: 'INFO' as const, category: 'network', message: 'SSL certificate renewed — expires 2026-06-22', source: 'CertManager', analyzed: false, emailSent: false, createdAt: t(72) },
  ];

  await Promise.all(errorLogs.map((log) => prisma.errorLog.create({
    data: { ...log, organizationId: org.id },
  })));

  // ─────────────────────────────────────────
  // EMAIL SETTINGS
  // ─────────────────────────────────────────
  await prisma.emailSettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: 'alerts@acme.com',
      smtpPassEnc: '',
      adminEmails: ['admin@acme.com', 'oncall@acme.com'],
      notifyOnError: true,
      notifyOnFatal: true,
      digestEnabled: true,
      digestCron: '0 9 * * *',
    },
  });

  // ─────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────
  console.log('\n===========================================');
  console.log('  SEED COMPLETE');
  console.log('===========================================');
  console.log('');
  console.log('  Organization : Acme Corporation (PRO plan)');
  console.log('');
  console.log('  Users:');
  console.log('    admin@acme.com  / admin123  (SUPER_ADMIN)');
  console.log('    priya@acme.com  / agent123  (ADMIN — Billing & CRM projects)');
  console.log('    rahul@acme.com  / agent123  (AGENT)');
  console.log('    viewer@acme.com / viewer123 (VIEWER)');
  console.log('');
  console.log('  CRM Data:');
  console.log('    3 Projects (Billing, CRM Migration, Mobile App)');
  console.log('    5 Companies');
  console.log('    8 Contacts');
  console.log('    8 Deals (across all pipeline stages)');
  console.log('    10 Activities (calls, emails, meetings, tasks)');
  console.log('');
  console.log('  Support Data:');
  console.log('    5 Tickets (resolved, in-progress, open)');
  console.log('    1 System Config (APAC Billing with schema + known issues)');
  console.log('');
  console.log('  Monitoring:');
  console.log('    30 Error Logs (Database, API, Auth, CORS, Timeout, Code, Network, Email, Memory, Frontend, Disk)');
  console.log('    3 with AI analysis, 4 unanalyzed');
  console.log('    Email settings configured');
  console.log('');
  console.log('  Open: http://localhost:5173');
  console.log('  Login: admin@acme.com / admin123');
  console.log('===========================================\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
