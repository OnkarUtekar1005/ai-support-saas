import { prisma } from '../../utils/prisma';

/**
 * Builds rich CRM context for the AI so it can answer questions
 * about tickets, errors, contacts, deals, projects, etc.
 */
export class CrmContextBuilder {
  /**
   * Build full context for admin AI chat.
   * Fetches recent tickets, errors, contacts, deals, projects from the org.
   */
  static async buildContext(organizationId: string, userMessage: string): Promise<string> {
    const parts: string[] = [];

    // Detect what the user is asking about and fetch relevant data
    const msgLower = userMessage.toLowerCase();

    // Always include summary stats
    const [ticketCount, errorCount, contactCount, dealCount, projectCount] = await Promise.all([
      prisma.ticket.count({ where: { organizationId } }),
      prisma.errorLog.count({ where: { organizationId } }),
      prisma.contact.count({ where: { organizationId } }),
      prisma.deal.count({ where: { organizationId } }),
      prisma.project.count({ where: { organizationId } }),
    ]);

    parts.push(`CRM STATS: ${ticketCount} tickets, ${errorCount} error logs, ${contactCount} contacts, ${dealCount} deals, ${projectCount} projects.`);

    // Fetch tickets if relevant
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

    // Fetch errors if relevant
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
          if (!e.analyzed) parts.push(`   ⚠ Not yet analyzed by AI`);
        });
      }
    }

    // Fetch contacts if relevant
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
          _count: { select: { deals: true, tickets: true } },
        },
      });

      if (contacts.length > 0) {
        parts.push('\nCONTACTS:');
        contacts.forEach((c, i) => {
          parts.push(`${i + 1}. ${c.firstName} ${c.lastName} <${c.email || 'no email'}> [${c.status}]`);
          parts.push(`   Title: ${c.jobTitle || 'N/A'} | Company: ${c.company?.name || 'N/A'} | Project: ${c.project?.name || 'N/A'}`);
          parts.push(`   Deals: ${c._count.deals} | Tickets: ${c._count.tickets} | Source: ${c.source || 'N/A'}`);
        });
      }
    }

    // Fetch deals if relevant
    const needsDeals = /deal|pipeline|revenue|sale|won|lost|proposal|qualified|negotiat|value|money/i.test(msgLower);
    if (needsDeals) {
      const deals = await prisma.deal.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, title: true, value: true, currency: true,
          stage: true, probability: true, expectedClose: true,
          contact: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
          owner: { select: { name: true } },
          project: { select: { name: true } },
        },
      });

      if (deals.length > 0) {
        parts.push('\nDEALS:');
        deals.forEach((d, i) => {
          parts.push(`${i + 1}. "${d.title}" — $${d.value.toLocaleString()} ${d.currency} [${d.stage}] ${d.probability}% probability`);
          parts.push(`   Contact: ${d.contact ? d.contact.firstName + ' ' + d.contact.lastName : 'N/A'} | Company: ${d.company?.name || 'N/A'}`);
          parts.push(`   Owner: ${d.owner?.name || 'N/A'} | Project: ${d.project?.name || 'N/A'}`);
          if (d.expectedClose) parts.push(`   Expected close: ${d.expectedClose.toISOString().slice(0, 10)}`);
        });
      }
    }

    // Fetch projects if relevant
    const needsProjects = /project|team|member/i.test(msgLower) || needsTickets || needsDeals;
    if (needsProjects) {
      const projects = await prisma.project.findMany({
        where: { organizationId },
        select: {
          id: true, name: true, status: true,
          _count: { select: { contacts: true, deals: true, tickets: true, activities: true } },
        },
      });

      if (projects.length > 0) {
        parts.push('\nPROJECTS:');
        projects.forEach((p) => {
          parts.push(`- ${p.name} [${p.status}] — ${p._count.tickets} tickets, ${p._count.deals} deals, ${p._count.contacts} contacts, ${p._count.activities} activities`);
        });
      }
    }

    // Search by name/keyword if user seems to be looking for something specific
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
            select: { name: true, industry: true, _count: { select: { contacts: true, deals: true } } },
          }),
        ]);

        if (matchTickets.length > 0 || matchContacts.length > 0 || matchCompanies.length > 0) {
          parts.push(`\nSEARCH RESULTS for "${term}":`);
          matchTickets.forEach((t) => {
            parts.push(`  Ticket: [${t.status}] "${t.title}" — ${t.description?.substring(0, 150)}`);
            if (t.resolution) parts.push(`    Resolution: ${t.resolution.substring(0, 200)}`);
          });
          matchContacts.forEach((c) => parts.push(`  Contact: ${c.firstName} ${c.lastName} <${c.email}> [${c.status}] Company: ${c.company?.name || 'N/A'}`));
          matchCompanies.forEach((c) => parts.push(`  Company: ${c.name} (${c.industry}) — ${c._count.contacts} contacts, ${c._count.deals} deals`));
        }
      }
    }

    return parts.join('\n');
  }
}
