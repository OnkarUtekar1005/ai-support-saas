import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X, FolderOpen } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  color?: string;
  status?: string;
}

interface ProjectSelectorProps {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowAll?: boolean;
  allLabel?: string;
}

export function ProjectSelector({ projects, value, onChange, placeholder = 'Select project...', allowAll = false, allLabel = 'All Projects' }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const selected = projects.find(p => p.id === value);
  const filtered = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-sm w-full min-w-[200px]"
      >
        {selected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color || '#6b7280' }} />
            <span className="text-gray-900 truncate flex-1 text-left">{selected.name}</span>
          </>
        ) : value === '' && allowAll ? (
          <span className="text-gray-500 flex-1 text-left">{allLabel}</span>
        ) : (
          <span className="text-gray-400 flex-1 text-left">{placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Clear button for filter mode */}
      {allowAll && value && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
          className="absolute right-8 top-2.5 p-0.5 text-gray-400 hover:text-gray-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] bg-white rounded-xl border border-gray-200 shadow-xl animate-fade-in overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {allowAll && (
              <button
                onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left ${value === '' ? 'bg-blue-50 text-blue-700' : 'text-gray-600'}`}
              >
                <FolderOpen className="w-4 h-4 text-gray-400" />
                {allLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400">No projects found</div>
            ) : (
              filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left ${value === p.id ? 'bg-blue-50 text-blue-700' : 'text-gray-900'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || '#6b7280' }} />
                  <span className="truncate">{p.name}</span>
                  {p.status && <span className="ml-auto text-[10px] text-gray-400">{p.status}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
