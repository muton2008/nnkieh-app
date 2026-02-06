export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-sm ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-sm p-4 space-y-3">
      <SkeletonBlock className="h-4 w-3/4" />
      <SkeletonBlock className="h-3 w-full" />
      <SkeletonBlock className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonTimetableRow() {
  return (
    <div className="flex gap-2">
      <SkeletonBlock className="h-16 w-10 flex-shrink-0" />
      <SkeletonBlock className="h-16 flex-1" />
    </div>
  );
}
