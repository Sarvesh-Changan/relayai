"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { AlertTriangle, ArrowRight, CalendarDays, CheckSquare2, CircleDot, ClipboardList, Video } from "lucide-react";

import { AiBadge } from "@/components/shared/AiBadge";
import { ErrorState, EmptyState, DashboardSkeleton } from "@/components/shared/PageState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import type { DashboardData } from "@/lib/services/dashboard";

type LoadError = { message: string; requestId?: string };
const SIGNAL_LABELS = {
  overdue: "Overdue",
  blocked: "Blocked",
  unassigned: "Unassigned",
  reassigned_multiple: "Repeated reassignment",
  due_soon: "Due soon",
} as const;

function displayDate(date: string): string {
  return format(parseISO(`${date}T00:00:00`), "MMM d, yyyy");
}

export function DashboardView() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<DashboardData>("/api/dashboard")
      .then((data) => { if (active) setDashboard(data); })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof ApiClientError
          ? { message: cause.message, requestId: cause.requestId }
          : { message: "Dashboard data could not be loaded." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryKey]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error.message} requestId={error.requestId} onRetry={() => { setLoading(true); setRetryKey((key) => key + 1); }} />;
  if (!dashboard) return <EmptyState title="Dashboard unavailable" description="There is no dashboard response to show." />;

  const stats = [
    { label: "Active tasks", value: dashboard.stats.activeTasks, icon: CheckSquare2, tone: "text-foreground" },
    { label: "Overdue", value: dashboard.stats.overdueTasks, icon: AlertTriangle, tone: dashboard.stats.overdueTasks > 0 ? "text-red-700" : "text-foreground" },
    { label: "Meetings", value: dashboard.stats.totalMeetings, icon: Video, tone: "text-foreground" },
    { label: "Open handovers", value: dashboard.stats.openHandovers, icon: ClipboardList, tone: "text-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="border-border shadow-none">
            <CardContent className="flex items-center justify-between p-5">
              <div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p></div>
              <span className="flex size-10 items-center justify-center rounded-lg bg-surface text-muted-foreground"><Icon aria-hidden="true" className="size-5" /></span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-l-4 border-l-ai border-y-border border-r-border shadow-none">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">AI Workspace Insights</CardTitle>
          <AiBadge />
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">AI summary coming in a later phase. These signals are calculated from current workspace data.</p>
          {dashboard.signals.length === 0 ? (
            <p className="rounded-md bg-ai-soft px-3 py-2 text-sm text-slate-700">No current signals from tracked tasks.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {dashboard.signals.map((signal) => (
                <li key={signal.ref} className="flex min-w-0 items-start gap-3 rounded-md bg-ai-soft p-3">
                  <CircleDot aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ai" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-violet-900">{SIGNAL_LABELS[signal.kind]}</span><Link className="font-mono text-xs text-ai underline-offset-2 hover:underline" href={`/tasks/${signal.task_id}`}>{signal.display_id}</Link></div>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{signal.title}</p>
                    <p className="mt-0.5 text-xs text-slate-700">{signal.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border shadow-none">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm font-semibold">Recent activity</CardTitle><Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">Action items<ArrowRight aria-hidden="true" className="size-3.5" /></Link></CardHeader>
          <CardContent>
            {dashboard.recentActivity.length === 0 ? <EmptyState title="No recent activity" description="New meeting and action item activity will appear here." /> : (
              <ul className="divide-y divide-border">
                {dashboard.recentActivity.map((activity) => (
                  <li key={activity.id}>
                    <Link href={activity.href} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex min-w-0 items-start gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground">{activity.kind === "meeting" ? <Video aria-hidden="true" className="size-4" /> : <CheckSquare2 aria-hidden="true" className="size-4" />}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{activity.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{activity.description}</span></span></span>
                      <time dateTime={activity.createdAt} className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNowStrict(parseISO(activity.createdAt), { addSuffix: true })}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm font-semibold">Upcoming deadlines</CardTitle><CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" /></CardHeader>
          <CardContent>
            {dashboard.upcomingDeadlines.length === 0 ? <EmptyState title="No upcoming deadlines" description="Active tasks with due dates in the next seven days will appear here." /> : (
              <ul className="divide-y divide-border">
                {dashboard.upcomingDeadlines.map((task) => (
                  <li key={task.id}>
                    <Link href={`/tasks/${task.id}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{task.title}</span><span className="mt-1 flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{task.displayId}</span><span className="text-xs text-muted-foreground">{task.ownerName ?? "Unassigned"}</span></span></span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5"><time dateTime={task.dueDate} className={`text-xs font-medium ${task.isOverdue ? "text-red-700" : "text-slate-600"}`}>{task.isOverdue ? `Overdue · ${displayDate(task.dueDate)}` : displayDate(task.dueDate)}</time><StatusBadge status={task.status} isOverdue={task.isOverdue} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
