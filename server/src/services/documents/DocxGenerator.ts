import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, Header, Footer, PageNumber,
  NumberFormat,
} from 'docx';
import fs from 'fs';
import path from 'path';

export interface DocSection {
  title: string;
  content: string;
}

export interface ScopeData {
  projectTitle: string;
  client?: string;
  preparedBy?: string;
  date?: string;
  executiveSummary: string;
  objectives: string[];
  inScope: string[];
  outOfScope: string[];
  deliverables: { name: string; description: string }[];
  timeline?: string;
  assumptions?: string[];
  risks?: string[];
  budget?: string;
}

export interface ProjectPlanData {
  projectTitle: string;
  phases: { name: string; duration: string; tasks: string[]; milestone?: string }[];
  teamRoles?: { role: string; responsibilities: string }[];
  totalDuration?: string;
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text, heading: level, spacing: { before: 300, after: 100 } });
}

function body(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 100 },
  });
}

function bullet(text: string, level = 0) {
  return new Paragraph({
    text,
    bullet: { level },
    spacing: { after: 60 },
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
    spacing: { before: 200, after: 200 },
  });
}

export class DocxGenerator {
  private uploadsDir: string;

  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads', 'document-agent');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async generateScopeOfWork(data: ScopeData, sessionId: string): Promise<string> {
    const sections: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: 'SCOPE OF WORK', bold: true, size: 40, color: '1E3A5F' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: data.projectTitle, bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
    ];

    if (data.client || data.preparedBy || data.date) {
      const meta = [
        data.client     && `Client: ${data.client}`,
        data.preparedBy && `Prepared by: ${data.preparedBy}`,
        data.date       && `Date: ${data.date}`,
      ].filter(Boolean) as string[];
      for (const m of meta) {
        sections.push(new Paragraph({ children: [new TextRun({ text: m, size: 20, color: '555555' })], alignment: AlignmentType.CENTER }));
      }
    }

    sections.push(divider());

    // Executive Summary
    sections.push(heading('1. Executive Summary', HeadingLevel.HEADING_1));
    sections.push(body(data.executiveSummary));

    // Objectives
    sections.push(heading('2. Objectives', HeadingLevel.HEADING_1));
    for (const obj of data.objectives) sections.push(bullet(obj));

    // Scope
    sections.push(heading('3. Scope', HeadingLevel.HEADING_1));
    sections.push(heading('3.1 In Scope', HeadingLevel.HEADING_2));
    for (const item of data.inScope) sections.push(bullet(item));
    sections.push(heading('3.2 Out of Scope', HeadingLevel.HEADING_2));
    for (const item of data.outOfScope) sections.push(bullet(item));

    // Deliverables
    sections.push(heading('4. Deliverables', HeadingLevel.HEADING_1));
    for (const d of data.deliverables) {
      sections.push(new Paragraph({ children: [new TextRun({ text: d.name, bold: true, size: 22 })], spacing: { after: 40 } }));
      sections.push(body(d.description));
    }

    // Timeline
    if (data.timeline) {
      sections.push(heading('5. Timeline', HeadingLevel.HEADING_1));
      sections.push(body(data.timeline));
    }

    // Assumptions
    if (data.assumptions?.length) {
      sections.push(heading('6. Assumptions', HeadingLevel.HEADING_1));
      for (const a of data.assumptions) sections.push(bullet(a));
    }

    // Risks
    if (data.risks?.length) {
      sections.push(heading('7. Risks & Mitigation', HeadingLevel.HEADING_1));
      for (const r of data.risks) sections.push(bullet(r));
    }

    // Budget
    if (data.budget) {
      sections.push(heading('8. Budget', HeadingLevel.HEADING_1));
      sections.push(body(data.budget));
    }

    const doc = new Document({
      sections: [{ children: sections }],
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            run: { font: 'Calibri', size: 22 },
          },
        ],
      },
    });

    const filename = `scope-of-work-${sessionId}.docx`;
    const filePath = path.join(this.uploadsDir, filename);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  async generateProjectPlan(data: ProjectPlanData, sessionId: string): Promise<string> {
    const sections: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: 'PROJECT PLAN', bold: true, size: 40, color: '1E3A5F' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: data.projectTitle, bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
    ];

    if (data.totalDuration) {
      sections.push(body(`Total Duration: ${data.totalDuration}`));
    }

    sections.push(divider());
    sections.push(heading('Project Phases', HeadingLevel.HEADING_1));

    data.phases.forEach((phase, i) => {
      sections.push(heading(`Phase ${i + 1}: ${phase.name} (${phase.duration})`, HeadingLevel.HEADING_2));
      for (const task of phase.tasks) sections.push(bullet(task));
      if (phase.milestone) {
        sections.push(new Paragraph({
          children: [new TextRun({ text: `✓ Milestone: ${phase.milestone}`, bold: true, color: '2E7D32', size: 22 })],
          spacing: { before: 80, after: 60 },
        }));
      }
    });

    if (data.teamRoles?.length) {
      sections.push(divider());
      sections.push(heading('Team & Responsibilities', HeadingLevel.HEADING_1));
      for (const tr of data.teamRoles) {
        sections.push(new Paragraph({ children: [new TextRun({ text: tr.role, bold: true, size: 22 })], spacing: { after: 40 } }));
        sections.push(body(tr.responsibilities));
      }
    }

    const doc = new Document({ sections: [{ children: sections }] });
    const filename = `project-plan-${sessionId}.docx`;
    const filePath = path.join(this.uploadsDir, filename);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  getFileUrl(filePath: string): string {
    const filename = path.basename(filePath);
    return `/api/document-agent/download/${filename}`;
  }
}
