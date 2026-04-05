interface EmptyStateProps {
  icon: any;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="card-static text-center py-16 animate-page-in">
      <Icon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">{subtitle}</p>}
      {action && (
        <button onClick={action.onClick} className="btn-primary inline-flex items-center gap-2">
          {action.label}
        </button>
      )}
    </div>
  );
}
