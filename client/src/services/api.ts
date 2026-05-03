import { useAuthStore } from '../store/authStore';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || 'Request failed');
  }

  return res.json();
}

export const api = {
  // Auth
  register: (data: { orgName: string; email: string; password: string; name: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/auth/me'),
  refreshToken: () => request('/auth/refresh', { method: 'POST', credentials: 'include' }),
  logout: () => request('/auth/logout', { method: 'POST', credentials: 'include' }),
  inviteUser: (data: { email: string; name: string; role: string; password: string }) =>
    request('/auth/invite', { method: 'POST', body: JSON.stringify(data) }),

  // Tickets
  getTickets: (params?: string) => request(`/tickets${params ? `?${params}` : ''}`),
  getTicket: (id: string) => request(`/tickets/${id}`),
  createTicket: (data: { title: string; description: string; priority?: string }) =>
    request('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  updateTicket: (id: string, data: any) =>
    request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Chat
  createSession: (ticketId?: string) =>
    request('/chat/sessions', { method: 'POST', body: JSON.stringify({ ticketId }) }),
  getSessions: () => request('/chat/sessions'),
  getMessages: (sessionId: string) => request(`/chat/sessions/${sessionId}/messages`),
  sendMessage: (sessionId: string, content: string) =>
    request(`/chat/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),

  // Database
  getConnections: () => request('/db-connections'),
  addConnection: (data: any) =>
    request('/db-connections', { method: 'POST', body: JSON.stringify(data) }),
  executeQuery: (connId: string, query: string) =>
    request(`/db-connections/${connId}/query`, { method: 'POST', body: JSON.stringify({ query }) }),
  generateSql: (connId: string, req: string, schemaContext?: string) =>
    api._post(`/db-connections/${connId}/generate-sql`, { request: req, schemaContext }),

  // Error Logs
  getErrorLogs: (params?: string) => request(`/error-logs${params ? `?${params}` : ''}`),
  getErrorLogStats: () => request('/error-logs/stats'),
  getErrorLog: (id: string) => request(`/error-logs/${id}`),
  reanalyzeError: (id: string) => request(`/error-logs/${id}/reanalyze`, { method: 'POST' }),
  trendAnalysis: (hours?: number) =>
    request('/error-logs/trend-analysis', { method: 'POST', body: JSON.stringify({ hours }) }),

  // Admin
  getUsers: () => request('/admin/users'),
  updateUserRole: (id: string, role: string) =>
    request(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  getEmailSettings: () => request('/admin/email-settings'),
  updateEmailSettings: (data: any) =>
    request('/admin/email-settings', { method: 'PUT', body: JSON.stringify(data) }),
  getDashboard: () => request('/admin/dashboard'),

  // System Config
  getSystemConfigs: () => request('/system-config'),
  getSystemConfig: (id: string) => request(`/system-config/${id}`),
  createSystemConfig: (data: any) =>
    request('/system-config', { method: 'POST', body: JSON.stringify(data) }),
  searchKnowledge: (query: string) =>
    request('/system-config/knowledge/search', { method: 'POST', body: JSON.stringify({ query }) }),

  // ─── CRM: Projects ───
  getProjects: () => request('/projects'),
  getProject: (id: string) => request(`/projects/${id}`),
  createProject: (data: any) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: any) => request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request(`/projects/${id}`, { method: 'DELETE' }),
  addProjectMember: (id: string, data: any) => request(`/projects/${id}/members`, { method: 'POST', body: JSON.stringify(data) }),
  removeProjectMember: (id: string, userId: string) => request(`/projects/${id}/members/${userId}`, { method: 'DELETE' }),
  requestProjectAccess: (id: string, message?: string) => request(`/projects/${id}/join-request`, { method: 'POST', body: JSON.stringify({ message }) }),
  getJoinRequests: () => request('/projects/join-requests'),
  resolveJoinRequest: (requestId: string, status: 'APPROVED' | 'REJECTED') => request(`/projects/join-requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // ─── Project Finance: Costs ───
  getProjectCosts: (projectId: string) => request(`/projects/${projectId}/costs`),
  createProjectCost: (projectId: string, data: any) =>
    request(`/projects/${projectId}/costs`, { method: 'POST', body: JSON.stringify(data) }),
  updateProjectCost: (projectId: string, costId: string, data: any) =>
    request(`/projects/${projectId}/costs/${costId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProjectCost: (projectId: string, costId: string) =>
    request(`/projects/${projectId}/costs/${costId}`, { method: 'DELETE' }),

  // ─── Project Attachments ───
  getProjectAttachments: (projectId: string) => request(`/projects/${projectId}/attachments`),
  uploadProjectAttachment: async (projectId: string, file: File, notes?: string) => {
    const token = useAuthStore.getState().token;
    const formData = new FormData();
    formData.append('file', file);
    if (notes) formData.append('notes', notes);
    const res = await fetch(`${API_BASE}/projects/${projectId}/attachments`, {
      method: 'POST',
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
  updateProjectAttachment: (projectId: string, attachmentId: string, data: any) =>
    request(`/projects/${projectId}/attachments/${attachmentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProjectAttachment: (projectId: string, attachmentId: string) =>
    request(`/projects/${projectId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  downloadAttachmentUrl: (projectId: string, attachmentId: string) =>
    `${API_BASE}/projects/${projectId}/attachments/${attachmentId}/download`,

  // ─── Project Updates ───
  getProjectUpdates: (projectId: string) => request(`/projects/${projectId}/updates`),
  createProjectUpdate: (projectId: string, data: any) =>
    request(`/projects/${projectId}/updates`, { method: 'POST', body: JSON.stringify(data) }),
  deleteProjectUpdate: (projectId: string, updateId: string) =>
    request(`/projects/${projectId}/updates/${updateId}`, { method: 'DELETE' }),

  // ─── Invoices ───
  getInvoices: (params?: string) => request(`/invoices${params ? `?${params}` : ''}`),
  getProjectInvoices: (projectId: string) => request(`/invoices/project/${projectId}`),
  getInvoice: (id: string) => request(`/invoices/${id}`),
  createInvoice: (projectId: string, data: any) =>
    request(`/invoices/project/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id: string, data: any) =>
    request(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInvoice: (id: string) => request(`/invoices/${id}`, { method: 'DELETE' }),
  getInvoiceOrgSettings: () => request('/invoices/org-settings'),

  // ─── Invoice Settings (branding) ───
  getInvoiceSettings: () => request('/invoice-settings'),
  updateInvoiceSettings: (data: any) => request('/invoice-settings', { method: 'PUT', body: JSON.stringify(data) }),

  // ─── CRM: Contacts ───
  getContacts: (params?: string) => request(`/contacts${params ? `?${params}` : ''}`),
  getContact: (id: string) => request(`/contacts/${id}`),
  createContact: (data: any) => request('/contacts', { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id: string, data: any) => request(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteContact: (id: string) => request(`/contacts/${id}`, { method: 'DELETE' }),

  // ─── CRM: Companies ───
  getCompanies: (params?: string) => request(`/companies${params ? `?${params}` : ''}`),
  getCompany: (id: string) => request(`/companies/${id}`),
  createCompany: (data: any) => request('/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateCompany: (id: string, data: any) => request(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCompany: (id: string) => request(`/companies/${id}`, { method: 'DELETE' }),

  // ─── Chatbot Config ───
  getChatbotConfig: (projectId: string) => request(`/chatbot-config/${projectId}`),
  saveChatbotConfig: (projectId: string, data: any) =>
    request(`/chatbot-config/${projectId}`, { method: 'PUT', body: JSON.stringify(data) }),
  getChatbotSessions: (projectId: string) => request(`/chatbot-config/${projectId}/sessions`),
  getChatbotSession: (projectId: string, sessionId: string) =>
    request(`/chatbot-config/${projectId}/sessions/${sessionId}`),

  // ─── Pipeline ───
  getPipelines: (params?: string) => request(`/pipeline${params ? `?${params}` : ''}`),
  getPipeline: (id: string) => request(`/pipeline/${id}`),
  triggerPipeline: (data: any) => request('/pipeline/trigger', { method: 'POST', body: JSON.stringify(data) }),
  approvePipeline: (id: string) => request(`/pipeline/${id}/approve`, { method: 'POST' }),
  retryPipeline: (id: string) => request(`/pipeline/${id}/retry`, { method: 'POST' }),
  deletePipeline: (id: string) => request(`/pipeline/${id}`, { method: 'DELETE' }),
  rejectPipeline: (id: string, reason?: string) => request(`/pipeline/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getVpsAgents: () => request('/pipeline/agents/list'),
  createVpsAgent: (data: any) => request('/pipeline/agents', { method: 'POST', body: JSON.stringify(data) }),
  deleteVpsAgent: (id: string) => request(`/pipeline/agents/${id}`, { method: 'DELETE' }),

  // ─── API Keys / Integrations ───
  getApiKeys: () => request('/api-keys'),
  createApiKey: (data: any) => request('/api-keys', { method: 'POST', body: JSON.stringify(data) }),
  updateApiKey: (id: string, data: any) => request(`/api-keys/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteApiKey: (id: string) => request(`/api-keys/${id}`, { method: 'DELETE' }),
  getApiKeyStats: (id: string) => request(`/api-keys/${id}/stats`),

  // ─── CRM: Activities ───
  getActivities: (params?: string) => request(`/activities${params ? `?${params}` : ''}`),
  createActivity: (data: any) => request('/activities', { method: 'POST', body: JSON.stringify(data) }),
  updateActivity: (id: string, data: any) => request(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteActivity: (id: string) => request(`/activities/${id}`, { method: 'DELETE' }),

  // ─── Agent Config ───
  getAgentConfig: (projectId: string) => request(`/agent-config/${projectId}`),
  saveAgentConfigTechnical: (projectId: string, data: any) =>
    request(`/agent-config/${projectId}/technical`, { method: 'PUT', body: JSON.stringify(data) }),
  saveAgentConfigFunctional: (projectId: string, data: any) =>
    request(`/agent-config/${projectId}/functional`, { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Documents / Knowledge Base ───
  getDocuments: (projectId: string) => request(`/documents/${projectId}`),
  uploadDocument: async (projectId: string, file: File) => {
    const token = useAuthStore.getState().token;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/documents/${projectId}/upload`, {
      method: 'POST',
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      body: formData,
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
  deleteDocument: (id: string) => request(`/documents/${id}`, { method: 'DELETE' }),

  // ─── Functional Agent ───
  resolveFunctional: (data: { ticketId?: string; query: string; projectId: string }) =>
    request('/functional-agent/resolve', { method: 'POST', body: JSON.stringify(data) }),
  getFunctionalResolutions: (projectId: string) => request(`/functional-agent/resolutions/${projectId}`),
  submitResolutionFeedback: (id: string, feedback: string) =>
    request(`/functional-agent/resolution/${id}/feedback`, { method: 'POST', body: JSON.stringify({ feedback }) }),

  // ─── Notifications ───
  getNotifications: () => request('/notifications'),
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),

  // ─── Reminder Config ───
  getReminderConfig: (projectId: string) => request(`/reminder-config/${projectId}`),
  saveReminderConfig: (projectId: string, data: any) => request(`/reminder-config/${projectId}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Finance Dashboard & AI Quote ───
  getFinanceDashboard: () => request('/finance/dashboard'),
  generateQuote: (data: { projectName?: string; description: string; countryCode: string; techStack?: string; timeline?: string; complexity?: string }) =>
    request('/finance/quote', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Ticket Assignment ───
  assignTicket: (ticketId: string, assigneeId: string) => request(`/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ assigneeId }) }),

  // Helper
  _post: (path: string, data: any) =>
    request(path, { method: 'POST', body: JSON.stringify(data) }),
};
