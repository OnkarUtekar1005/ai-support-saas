import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { TicketsPage } from './pages/TicketsPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { ErrorLogsPage } from './pages/ErrorLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ContactsPage } from './pages/ContactsPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { ChatbotConfigPage } from './pages/ChatbotConfigPage';
import { DatabasesPage } from './pages/DatabasesPage';
import { PipelinePage } from './pages/PipelinePage';
import { AgentConfigPage } from './pages/AgentConfigPage';
import { AgentConfigDetailPage } from './pages/AgentConfigDetailPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { MyTasksPage } from './pages/MyTasksPage';
import { DocumentAgentPage } from './pages/DocumentAgentPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        {/* Support */}
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        {/* CRM */}
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="activities" element={<ActivitiesPage />} />
        {/* Admin */}
        <Route path="chatbot" element={<ChatbotConfigPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="db-connect" element={<DatabasesPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="agent-config" element={<AgentConfigPage />} />
        <Route path="agent-config/:id" element={<AgentConfigDetailPage />} />
        <Route path="knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="document-agent" element={<DocumentAgentPage />} />
        <Route path="error-logs" element={<ErrorLogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  );
}
