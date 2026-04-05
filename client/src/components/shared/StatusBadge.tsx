import { formatStatus } from '../../constants';

interface StatusBadgeProps {
  status: string;
  colorMap: Record<string, string>;
  size?: 'xs' | 'sm';
  dot?: boolean;
}

export function StatusBadge({ status, colorMap, size = 'xs', dot }: StatusBadgeProps) {
  const colors = colorMap[status] || 'bg-gray-100 text-gray-600';
  const sizeClass = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  if (dot) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <span className={`w-2 h-2 rounded-full ${colors.split(' ')[0]}`} />
        {formatStatus(status)}
      </span>
    );
  }

  return (
    <span className={`inline-block ${sizeClass} rounded-full font-medium ${colors}`}>
      {formatStatus(status)}
    </span>
  );
}
