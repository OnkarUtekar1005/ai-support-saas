// ─── Color Mappings (used across all pages) ───

export const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-700',
  WAITING_CLARIFICATION: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-200 text-gray-500',
};

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export const LEVEL_COLORS: Record<string, string> = {
  INFO: 'bg-sky-100 text-sky-700',
  WARN: 'bg-amber-100 text-amber-700',
  ERROR: 'bg-red-100 text-red-700',
  FATAL: 'bg-red-600 text-white',
};

export const ISSUE_CATEGORY_COLORS: Record<string, string> = {
  TECHNICAL: 'bg-purple-100 text-purple-700',
  FUNCTIONAL: 'bg-teal-100 text-teal-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

export const CONTACT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  LEAD: 'bg-sky-100 text-sky-700',
  CUSTOMER: 'bg-purple-100 text-purple-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
  CHURNED: 'bg-red-100 text-red-700',
};

export const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-sky-100 text-sky-700',
  AGENT: 'bg-green-100 text-green-700',
  VIEWER: 'bg-gray-100 text-gray-600',
};

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-sky-100 text-sky-700',
  ARCHIVED: 'bg-gray-100 text-gray-600',
};

export const ACTIVITY_STATUS_COLORS: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const DEAL_STAGE_COLORS: Record<string, string> = {
  LEAD: 'border-t-gray-400',
  QUALIFIED: 'border-t-sky-500',
  PROPOSAL: 'border-t-purple-500',
  NEGOTIATION: 'border-t-yellow-500',
  CLOSED_WON: 'border-t-green-500',
  CLOSED_LOST: 'border-t-red-500',
};

export const DEAL_STAGE_BG: Record<string, string> = {
  LEAD: 'bg-gray-50',
  QUALIFIED: 'bg-sky-50/50',
  PROPOSAL: 'bg-purple-50/50',
  NEGOTIATION: 'bg-yellow-50/50',
  CLOSED_WON: 'bg-green-50/50',
  CLOSED_LOST: 'bg-red-50/50',
};

// ─── Option Lists ───

export const DEAL_STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CLARIFICATION', 'RESOLVED', 'CLOSED'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const ERROR_LEVELS = ['INFO', 'WARN', 'ERROR', 'FATAL'];
export const ACTIVITY_TYPES = ['TASK', 'CALL', 'EMAIL', 'MEETING', 'NOTE', 'FOLLOW_UP'];
export const ACTIVITY_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
export const CONTACT_STATUSES = ['ACTIVE', 'LEAD', 'CUSTOMER', 'INACTIVE', 'CHURNED'];
export const CONTACT_SOURCES = ['Website', 'Referral', 'Cold Call', 'LinkedIn', 'Event', 'Other'];
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD'];
export const LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'ruby', 'php',
  'csharp', 'cpp', 'c', 'kotlin', 'swift', 'dart', 'scala', 'elixir', 'haskell',
  'lua', 'r', 'perl', 'shell', 'powershell', 'sql', 'html', 'css', 'other',
];
export const ISSUE_CATEGORIES = ['TECHNICAL', 'FUNCTIONAL', 'UNKNOWN'];
export const ERROR_CATEGORIES = ['database', 'api', 'auth', 'cors', 'timeout', 'code', 'network', 'email', 'memory', 'validation', 'frontend', 'disk'];

export const PROJECT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ─── Helpers ───

export function formatStatus(s: string): string {
  return s.replace(/_/g, ' ');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString();
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString();
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '...' : s;
}
