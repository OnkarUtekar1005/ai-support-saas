import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, Ticket, MessageSquare, AlertTriangle, Settings, LogOut,
  FolderOpen, UserCircle, Building2, Receipt, Activity, Plug, Bot, Database,
  Menu, X, Search, ChevronLeft, Bell, ChevronRight, Zap, BookOpen, ClipboardList,
  Check,
} from 'lucide-react';
import { api } from '../../services/api';

interface NavItem {
  to: string;
  icon: any;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: '',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
      { to: '/my-tasks', icon: ClipboardList, label: 'My Tasks' },
    ],
  },
  {
    title: 'SUPPORT',
    items: [
      { to: '/tickets', icon: Ticket, label: 'Tickets' },
      { to: '/chat', icon: MessageSquare, label: 'AI Assistant' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { to: '/projects', icon: FolderOpen, label: 'Projects' },
      { to: '/contacts', icon: UserCircle, label: 'Contacts' },
      { to: '/companies', icon: Building2, label: 'Companies' },
      { to: '/invoices', icon: Receipt, label: 'Invoices' },
      { to: '/activities', icon: Activity, label: 'Activities' },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { to: '/chatbot', icon: Bot, label: 'Chatbot', adminOnly: true },
      { to: '/integrations', icon: Plug, label: 'Integrations', adminOnly: true },
      { to: '/agent-config', icon: Bot, label: 'Agent Config', adminOnly: true },
      { to: '/knowledge-base', icon: BookOpen, label: 'Knowledge Base', adminOnly: true },
      { to: '/pipeline', icon: Zap, label: 'Auto-Fix', adminOnly: true },
      { to: '/db-connect', icon: Database, label: 'Databases', adminOnly: true },
      { to: '/error-logs', icon: AlertTriangle, label: 'Error Logs', adminOnly: true },
      { to: '/settings', icon: Settings, label: 'Settings', adminOnly: true },
    ],
  },
];

const searchablePages = [
  { label: 'Dashboard', path: '/', keywords: 'home overview stats' },
  { label: 'My Tasks', path: '/my-tasks', keywords: 'tasks assigned me todo' },
  { label: 'Tickets', path: '/tickets', keywords: 'support issues bugs' },
  { label: 'AI Assistant', path: '/chat', keywords: 'chat bot ai help' },
  { label: 'Projects', path: '/projects', keywords: 'project team' },
  { label: 'Contacts', path: '/contacts', keywords: 'people customers leads' },
  { label: 'Companies', path: '/companies', keywords: 'accounts organizations' },
  { label: 'Invoices', path: '/invoices', keywords: 'invoice billing po wo revenue payment' },
  { label: 'Activities', path: '/activities', keywords: 'tasks calls meetings' },
  { label: 'Chatbot Config', path: '/chatbot', keywords: 'widget bot configure' },
  { label: 'Integrations', path: '/integrations', keywords: 'api keys sdk connect' },
  { label: 'Databases', path: '/db-connect', keywords: 'sql database connection query' },
  { label: 'Agent Config', path: '/agent-config', keywords: 'agent config technical functional orchestrator' },
  { label: 'Knowledge Base', path: '/knowledge-base', keywords: 'documents upload pdf knowledge base' },
  { label: 'Error Logs', path: '/error-logs', keywords: 'errors monitoring logs' },
  { label: 'Settings', path: '/settings', keywords: 'email team users config' },
];

export function AppLayout() {
  const { user, organization, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    api.getUnreadCount().then((data: any) => setUnreadCount(data.count || 0)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    if (notifOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const openNotifications = () => {
    setNotifOpen(!notifOpen);
    if (!notifOpen) {
      setNotifLoading(true);
      api.getNotifications().then((data: any) => setNotifications(data.notifications || data || [])).catch(() => setNotifications([])).finally(() => setNotifLoading(false));
    }
  };

  const markRead = (id: string, link?: string) => {
    api.markNotificationRead(id).catch(() => {});
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
    if (link) { navigate(link); setNotifOpen(false); }
  };

  const markAllRead = () => {
    api.markAllNotificationsRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const filteredPages = searchQuery.trim()
    ? searchablePages.filter((p) =>
        (p.label + ' ' + p.keywords).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const navigateToSearch = useCallback((path: string) => {
    navigate(path);
    setSearchOpen(false);
    setSearchQuery('');
  }, [navigate]);

  const getPageTitle = () => {
    const flat = navSections.flatMap((s) => s.items);
    const match = flat.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to) && item.to !== '/'
    );
    return match?.label || 'Dashboard';
  };

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className={`h-14 flex items-center border-b border-white/[0.06] ${collapsed && !isMobile ? 'justify-center px-2' : 'gap-2.5 px-4'}`}>
        <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-sky-500/30">
          <span className="text-white font-black text-sm">T</span>
        </div>
        {(!collapsed || isMobile) && (
          <div className="min-w-0">
            <div className="font-bold text-white text-sm tracking-tight truncate">Techview</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest">CRM</div>
          </div>
        )}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto p-1.5 text-gray-500 hover:text-white rounded-md transition-all duration-200 hover:bg-white/[0.07] hover:backdrop-blur-sm hidden lg:block"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto p-1.5 text-gray-400 hover:text-white rounded-md transition-all duration-200 hover:bg-white/[0.07] hover:backdrop-blur-sm">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto overflow-x-hidden">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          const isSectionCollapsed = section.title ? collapsedSections.has(section.title) : false;

          return (
            <div key={section.title || 'main'} className="mb-0.5">
              {/* Titled section header — clickable to collapse when sidebar is expanded */}
              {section.title && (!collapsed || isMobile) && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-3 pt-5 pb-1.5 group"
                >
                  <span className="text-[10px] font-semibold text-gray-500 tracking-widest uppercase group-hover:text-gray-300 transition-colors duration-150">
                    {section.title}
                  </span>
                  <ChevronRight
                    className={`w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-all duration-200 ${
                      isSectionCollapsed ? 'rotate-0' : 'rotate-90'
                    }`}
                  />
                </button>
              )}
              {/* Divider when sidebar is icon-only */}
              {section.title && collapsed && !isMobile && (
                <div className="my-2 mx-2 border-t border-white/[0.06]" />
              )}
              {/* Items — hidden when section is collapsed (only in expanded sidebar) */}
              {(!isSectionCollapsed || collapsed || isMobile) && (
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed && !isMobile ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center rounded-lg transition-all duration-200 ${
                          collapsed && !isMobile
                            ? 'justify-center p-2.5'
                            : 'gap-2.5 px-3 py-2'
                        } text-[13px] font-medium ${
                          isActive
                            ? 'bg-sky-500/[0.18] text-sky-300 ring-1 ring-sky-400/30 shadow-md shadow-sky-900/40 backdrop-blur-sm'
                            : 'text-gray-400 hover:bg-white/[0.07] hover:backdrop-blur-sm hover:text-white hover:ring-1 hover:ring-white/[0.06]'
                        }`
                      }
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className={`flex items-center rounded-lg transition-all duration-200 hover:bg-white/[0.07] hover:backdrop-blur-sm hover:ring-1 hover:ring-white/[0.06] p-1.5 -mx-1.5 cursor-default ${collapsed && !isMobile ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-7 h-7 rounded-full bg-sky-500/20 ring-1 ring-sky-400/30 flex items-center justify-center flex-shrink-0">
            <span className="text-sky-400 text-[11px] font-bold">{user?.name?.charAt(0).toUpperCase()}</span>
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-white truncate leading-tight">{user?.name}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{user?.role}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="Sign out"
            className={`p-1.5 text-gray-500 hover:text-red-400 transition-all duration-200 rounded-md hover:bg-red-500/[0.12] hover:backdrop-blur-sm ${collapsed && !isMobile ? 'mt-2' : ''}`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-gray-950 transition-all duration-200 ease-in-out flex-shrink-0 ${
          collapsed ? 'w-[60px]' : 'w-[220px]'
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-gray-950 flex flex-col shadow-2xl animate-slide-in">
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 lg:px-6 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 text-gray-500 hover:text-gray-900 -ml-1">
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-sm font-semibold text-gray-900 lg:text-base">{getPageTitle()}</h1>

          <div className="flex-1" />

          {/* Search */}
          <button
            onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50); }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden md:inline text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono text-gray-400">Ctrl+K</kbd>
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button onClick={openNotifications} className="p-2 text-gray-400 hover:text-gray-600 relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-sky-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold leading-none">{unreadCount > 99 ? '99+' : unreadCount}</span>
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-full mt-1 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifLoading ? (
                    <div className="p-6 text-center text-sm text-gray-400">Loading...</div>
                  ) : notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-400">No notifications</div>
                  ) : (
                    notifications.slice(0, 20).map((n) => (
                      <button key={n.id} onClick={() => markRead(n.id, n.link)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3 ${!n.read ? 'bg-sky-50/30' : ''}`}>
                        {!n.read && <span className="w-2 h-2 mt-1.5 bg-sky-500 rounded-full flex-shrink-0" />}
                        <div className={`flex-1 min-w-0 ${n.read ? 'ml-5' : ''}`}>
                          <div className="text-sm font-medium text-gray-900 truncate">{n.title}</div>
                          {n.message && <div className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</div>}
                          <div className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar (mobile) */}
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center lg:hidden">
            <span className="text-white text-xs font-bold">{user?.name?.charAt(0).toUpperCase()}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 lg:p-6 max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} />
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 border-b border-gray-100">
              <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pages, features..."
                className="flex-1 py-3.5 text-sm outline-none bg-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredPages.length > 0) {
                    navigateToSearch(filteredPages[0].path);
                  }
                }}
              />
              <kbd className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-400 font-mono">ESC</kbd>
            </div>

            {searchQuery.trim() && (
              <div className="max-h-[300px] overflow-auto">
                {filteredPages.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">No results found</div>
                ) : (
                  <div className="py-2">
                    {filteredPages.map((page) => {
                      const matchedItem = navSections.flatMap((s) => s.items).find((i) => i.to === page.path);
                      const Icon = matchedItem?.icon || Search;
                      return (
                        <button
                          key={page.path}
                          onClick={() => navigateToSearch(page.path)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left"
                        >
                          <Icon className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{page.label}</span>
                          <span className="text-xs text-gray-400 ml-auto">{page.path}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!searchQuery.trim() && (
              <div className="p-4">
                <div className="text-xs text-gray-400 mb-2 font-medium">QUICK NAVIGATION</div>
                <div className="grid grid-cols-2 gap-1">
                  {['/', '/tickets', '/chat', '/contacts', '/invoices', '/error-logs'].map((path) => {
                    const page = searchablePages.find((p) => p.path === path);
                    const matchedItem = navSections.flatMap((s) => s.items).find((i) => i.to === path);
                    const Icon = matchedItem?.icon || Search;
                    return (
                      <button
                        key={path}
                        onClick={() => navigateToSearch(path)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <Icon className="w-4 h-4 text-gray-400" />
                        {page?.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
