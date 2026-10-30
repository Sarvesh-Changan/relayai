import { AlertCircle, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white px-6 py-12 text-center">
      <Inbox aria-hidden="true" className="mb-3 size-8 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ErrorState({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{message}</p>
        {requestId && <p className="mt-1 font-mono text-xs text-red-800">Request ID: {requestId}</p>}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-label="Loading dashboard" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}
      </div>
      <Skeleton className="h-48 rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72 rounded-lg" /><Skeleton className="h-72 rounded-lg" /></div>
    </div>
  );
}
