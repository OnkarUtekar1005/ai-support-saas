interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = 'h-4 w-32' }: SkeletonProps) {
  return <div className={`skeleton-shimmer rounded ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="card-static space-y-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-56" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="card-static flex items-center gap-4">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card-static p-0 overflow-hidden">
      <div className="h-11 bg-gray-50/80 border-b border-gray-100" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}
