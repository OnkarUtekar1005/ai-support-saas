import { prisma } from '../../utils/prisma';

export class CrmContextBuilder {
  static async buildContext(organizationId: string, userMessage: string): Promise<string> {
    const parts: string[] = [];

    const msgLower = userMessage.toLowerCase();

    const [ticketCount, errorCount, contactCount, projectCount, invoiceCount] = await Promise.all([
      prisma.ticket.count({ where: { organizationId } }),
      prisma.errorLog.count({ where: { organizationId } }),
      prisma.contact.count({ where: { organizationId } }),
      prisma.project.count({ where: { organizationId } }),
      prisma.invoice.count({ where: { organizationId } }),
    ]);

    parts.push(`CRM STATS: ${ticketCount} tickets, ${errorCount} error logs, ${contactCount} contacts, ${projectCount} projects, ${invoiceCount} invoices.`);

    const needsTickets = /ticket|issue|bug|support|problem|resolve|status|open|closed|progress/i.test(msgLower);
    if (needsTickets || ticketCount <= 20) {
      const tickets = await prisma.ticket.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true, title: true, status: true, priority: true,
          issueType: true, confidence: true, description: true,
          resolution: true, createdAt: true,
          createdBy: { select: { name: true } },
          project: { select: { name: true } },
          contact: { select: { firstName: true, lastName: true, email: true } },
        },
      });

      if (tickets.length > 0) {
        parts.push('\nTICKETS:');
        tickets.forEach((t, i) => {
          parts.push(`${i + 1}. [${t.status}] [${t.priority}] "${t.title}" (ID: ${t.id.slice(0, 8)})`);
          parts.push(`   Project: ${t.project?.name || 'None'} | Created: ${t.createdAt.toISOString().slice(0, 10)} | By: ${t.createdBy?.name || 'Unknown'}`);
          if (t.contact) parts.push(`   Contact: ${t.contact.firstName} ${t.contact.lastName} <${t.contact.email}>`);
          if (t.issueType) parts.push(`   Type: ${t.issueType} | Confidence: ${t.confidence ? Math.round(t.confidence * 100) + '%' : 'N/A'}`);
          if (t.description) parts.push(`   Description: ${t.description.substring(0, 200)}...`);
          if (t.resolution) parts.push(`   Resolution: ${t.resolution.substring(0, 200)}...`);
        });
      }
    }

    const needsErrors = /error|log|crash|fail|fatal|warn|bug|issue|monitor|analysis|gemini/i.test(msgLower);
    if (needsErrors) {
      const errors = await prisma.errorLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, level: true, message: true, source: true,
          endpoint: true, aiAnalysis: true, aiSuggestion: true,
          analyzed: true, emailSent: true, createdAt: true,
        },
      });

      if (errors.length > 0) {
        parts.push('\nRECENT ERROR LOGS:');
        errors.forEach((e, i) => {
          parts.push(`${i + 1}. [${e.level}] ${e.message}`);
          parts.push(`   Source: ${e.source} | Endpoint: ${e.endpoint || 'N/A'} | Time: ${e.createdAt.toISOString()}`);
          if (e.aiAnalysis) parts.push(`   AI Analysis: ${e.aiAnalysis.substring(0, 200)}`);
          if (e.aiSuggestion) parts.push(`   AI Fix: ${e.aiSuggestion.substring(0, 200)}`);
        });
      }
    }

    const needsContacts = /contact|customer|lead|person|email|phone|who/i.test(msgLower);
    if (needsContacts) {
      const contacts = await prisma.contact.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, firstName: true, lastName: true, email: true,
          phone: true, jobTitle: true, status: true, source: true,
          company: { select: { name: true } },
          project: { select: { name: true } },
          _count: { select: { activities: true, tickets: true } },
        },
      });

      if (contacts.length > 0) {
        parts.push('\nCONTACTS:');
        contacts.forEach((c, i) => {
          parts.push(`${i + 1}. ${c.firstName} ${c.lastName} <${c.email || 'no email'}> [${c.status}]`);
          parts.push(`   Title: ${c.jobTitle || 'N/A'} | Company: ${c.company?.name || 'N/A'} | Project: ${c.project?.name || 'N/A'}`);
          parts.push(`   Activities: ${c._count.activities} | Tickets: ${c._count.tickets} | Source: ${c.source || 'N/A'}`);
        });
      }
    }

    const needsProjects = /project|team|member|budget|cost|invoice|finance|billing/i.test(msgLower) || needsTickets;
    if (needsProjects) {
      const projects = await prisma.project.findMany({
        where: { organizationId },
        select: {
          id: true, name: true, status: true, totalBudget: true, currency: true, deadline: true,
          clientContact: { select: { firstName: true, lastName: true } },
          _count: { select: { contacts: true, tickets: true, activities: true, costs: true, invoices: true } },
        },
      });

      if (projects.length > 0) {
        parts.push('\nPROJECTS:');
        projects.forEach((p) => {
          const budget = p.totalBudget ? ` | Budget: ${p.currency} ${p.totalBudget.toLocaleString()}` : '';
          const deadline = p.deadline ? ` | Deadline: ${p.deadline.toISOString().slice(0, 10)}` : '';
          const client = p.clientContact ? ` | Client: ${p.clientContact.firstName} ${p.clientContact.lastName}` : '';
          parts.push(`- ${p.name} [${p.status}]${budget}${deadline}${client}`);
          parts.push(`  Tickets: ${p._count.tickets} | Contacts: ${p._count.contacts} | Invoices: ${p._count.invoices} | Cost items: ${p._count.costs}`);
        });
      }
    }

    const needsInvoices = /invoice|billing|payment|paid|due|po|purchase.?order|work.?order/i.test(msgLower);
    if (needsInvoices) {
      const invoices = await prisma.invoice.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          invoiceNumber: true, type: true, status: true, total: true, currency: true, dueDate: true,
          project: { select: { name: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
      });

      if (invoices.length > 0) {
        parts.push('\nINVOICES:');
        invoices.forEach((inv, i) => {
          parts.push(`${i + 1}. ${inv.invoiceNumber} [${inv.type}] [${inv.status}] — ${inv.currency} ${inv.total.toLocaleString()}`);
          parts.push(`   Project: ${inv.project?.name || 'N/A'} | Contact: ${inv.contact ? inv.contact.firstName + ' ' + inv.contact.lastName : 'N/A'}`);
          if (inv.dueDate) parts.push(`   Due: ${inv.dueDate.toISOString().slice(0, 10)}`);
        });
      }
    }

    // Search by keyword
    const searchTerms = msgLower.match(/["']([^"']+)["']|(?:about|for|named?|called?|from|regarding)\s+(\w[\w\s]{2,})/i);
    if (searchTerms) {
      const term = (searchTerms[1] || searchTerms[2] || '').trim();
      if (term.length >= 2) {
        const [matchTickets, matchContacts, matchCompanies] = await Promise.all([
          prisma.ticket.findMany({
            where: {
              organizationId,
              OR: [
                { title: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
              ],
            },
            take: 5,
            select: { id: true, title: true, status: true, priority: true, description: true, resolution: true },
          }),
          prisma.contact.findMany({
            where: {
              organizationId,
              OR: [
                { firstName: { contains: term, mode: 'insensitive' } },
                { lastName: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
              ],
            },
            take: 5,
            select: { firstName: true, lastName: true, email: true, status: true, company: { select: { name: true } } },
          }),
          prisma.company.findMany({
            where: { organizationId, name: { contains: term, mode: 'insensitive' } },
            take: 5,
            select: { name: true, industry: true, _count: { select: { contacts: true } } },
          }),
        ]);

        if (matchTickets.length > 0 || matchContacts.length > 0 || matchCompanies.length > 0) {
          parts.push(`\nSEARCH RESULTS for "${term}":`);
          matchTickets.forEach((t) => {
            parts.push(`  Ticket: [${t.status}] "${t.title}" — ${t.description?.substring(0, 150)}`);
            if (t.resolution) parts.push(`    Resolution: ${t.resolution.substring(0, 200)}`);
          });
          matchContacts.forEach((c) => parts.push(`  Contact: ${c.firstName} ${c.lastName} <${c.email}> [${c.status}] Company: ${c.company?.name || 'N/A'}`));
          matchCompanies.forEach((c) => parts.push(`  Company: ${c.name} (${c.industry}) — ${c._count.contacts} contacts`));
        }
      }
    }

    return parts.join('\n');
  }
}
