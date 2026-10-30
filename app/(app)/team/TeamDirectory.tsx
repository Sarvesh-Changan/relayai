"use client";

import { useEffect, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { EmptyState, ErrorState } from "@/components/shared/PageState";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRole } from "@/types/db";

type TeamMember = { id: string; name: string; email: string; role: UserRole };
type LoadError = { message: string; requestId?: string };

export function TeamDirectory() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<TeamMember[]>("/api/team")
      .then((data) => { if (active) setMembers(data); })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof ApiClientError ? { message: cause.message, requestId: cause.requestId } : { message: "Team directory could not be loaded." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryKey]);

  if (loading) return <div aria-label="Loading team directory" className="space-y-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)}</div>;
  if (error) return <ErrorState message={error.message} requestId={error.requestId} onRetry={() => { setLoading(true); setRetryKey((key) => key + 1); }} />;
  if (!members?.length) return <EmptyState title="No team members" description="Team profiles will appear here when accounts are added." />;

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-white">
      {members.map((member) => (
        <li key={member.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-xs capitalize text-slate-700">{member.role}</span>
        </li>
      ))}
    </ul>
  );
}
