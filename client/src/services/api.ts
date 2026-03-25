const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');

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
  generateSql: (connId: string, request: string, schemaContext?: string) =>
    api._post(`/db-connections/${connId}/generate-sql`, { request, schemaContext }),

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

  // ─── CRM: Deals ───
  getDeals: (params?: string) => request(`/deals${params ? `?${params}` : ''}`),
  getDealPipeline: (projectId?: string) => request(`/deals/pipeline${projectId ? `?projectId=${projectId}` : ''}`),
  getDeal: (id: string) => request(`/deals/${id}`),
  createDeal: (data: any) => request('/deals', { method: 'POST', body: JSON.stringify(data) }),
  updateDeal: (id: string, data: any) => request(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDeal: (id: string) => request(`/deals/${id}`, { method: 'DELETE' }),

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

  // Helper
  _post: (path: string, data: any) =>
    request(path, { method: 'POST', body: JSON.stringify(data) }),
};
