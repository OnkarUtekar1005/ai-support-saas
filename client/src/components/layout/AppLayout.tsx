import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, Ticket, MessageSquare, AlertTriangle, Settings, LogOut,
  FolderOpen, UserCircle, Building2, DollarSign, Activity, Plug, Bot, Database,
  Menu, X, Search, ChevronLeft, Bell, ChevronRight, Zap,
} from 'lucide-react';

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
      { to: '/deals', icon: DollarSign, label: 'Deals' },
      { to: '/activities', icon: Activity, label: 'Activities' },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { to: '/chatbot', icon: Bot, label: 'Chatbot', adminOnly: true },
      { to: '/integrations', icon: Plug, label: 'Integrations', adminOnly: true },
      { to: '/pipeline', icon: Zap, label: 'Auto-Fix', adminOnly: true },
      { to: '/db-connect', icon: Database, label: 'Databases', adminOnly: true },
      { to: '/error-logs', icon: AlertTriangle, label: 'Error Logs', adminOnly: true },
      { to: '/settings', icon: Settings, label: 'Settings', adminOnly: true },
    ],
  },
];

// All searchable pages for quick nav
const searchablePages = [
  { label: 'Dashboard', path: '/', keywords: 'home overview stats' },
  { label: 'Tickets', path: '/tickets', keywords: 'support issues bugs' },
  { label: 'AI Assistant', path: '/chat', keywords: 'chat bot ai help' },
  { label: 'Projects', path: '/projects', keywords: 'project team' },
  { label: 'Contacts', path: '/contacts', keywords: 'people customers leads' },
  { label: 'Companies', path: '/companies', keywords: 'accounts organizations' },
  { label: 'Deals', path: '/deals', keywords: 'pipeline sales revenue' },
  { label: 'Activities', path: '/activities', keywords: 'tasks calls meetings' },
  { label: 'Chatbot Config', path: '/chatbot', keywords: 'widget bot configure' },
  { label: 'Integrations', path: '/integrations', keywords: 'api keys sdk connect' },
  { label: 'Databases', path: '/db-connect', keywords: 'sql database connection query' },
  { label: 'Error Logs', path: '/error-logs', keywords: 'errors monitoring logs' },
  { label: 'Settings', path: '/settings', keywords: 'email team users config' },
];

export function AppLayout() {
  const { user, organization, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Keyboard shortcut: Ctrl+K for search
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

  // Get page title from path
  const getPageTitle = () => {
    const flat = navSections.flatMap((s) => s.items);
    const match = flat.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to) && item.to !== '/'
    );
    return match?.label || 'Dashboard';
  };

  // Sidebar content (shared between desktop and mobile)
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className={`h-14 flex items-center border-b border-gray-800/50 ${collapsed && !isMobile ? 'justify-center px-2' : 'gap-2.5 px-4'}`}>
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
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
            className="ml-auto p-1 text-gray-500 hover:text-white rounded transition-colors hidden lg:block"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto overflow-x-hidden">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title || 'main'} className="mb-0.5">
              {section.title && (!collapsed || isMobile) && (
                <div className="px-3 pt-5 pb-1.5 text-[10px] font-semibold text-gray-600 tracking-widest uppercase select-none">
                  {section.title}
                </div>
              )}
              {section.title && collapsed && !isMobile && (
                <div className="my-2 mx-2 border-t border-gray-800" />
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={collapsed && !isMobile ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center rounded-md transition-all duration-150 ${
                        collapsed && !isMobile
                          ? 'justify-center p-2.5'
                          : 'gap-2.5 px-3 py-2'
                      } text-[13px] font-medium ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                    {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-800/50">
        <div className={`flex items-center ${collapsed && !isMobile ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-xs font-bold">{user?.name?.charAt(0).toUpperCase()}</span>
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-[10px] text-gray-500 uppercase">{user?.role}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="Sign out"
            className={`p-1.5 text-gray-600 hover:text-red-400 transition-colors ${collapsed && !isMobile ? 'mt-2' : ''}`}
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
          {/* Mobile menu button */}
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 text-gray-500 hover:text-gray-900 -ml-1">
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title */}
          <h1 className="text-sm font-semibold text-gray-900 lg:text-base">{getPageTitle()}</h1>

          {/* Spacer */}
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

          {/* Notifications placeholder */}
          <button className="p-2 text-gray-400 hover:text-gray-600 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full" />
          </button>

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
                  {['/', '/tickets', '/chat', '/contacts', '/deals', '/error-logs'].map((path) => {
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
