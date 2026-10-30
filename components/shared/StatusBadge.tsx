import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@/types/db";

export const STATUS_COLOR_MAP: Record<TaskStatus | "overdue", string> = {
  open: "border-slate-200 bg-slate-100 text-slate-700",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
  blocked: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-zinc-200 bg-zinc-100 text-zinc-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function StatusBadge({ status, isOverdue = false }: { status: TaskStatus; isOverdue?: boolean }) {
  const colorKey = isOverdue ? "overdue" : status;
  return (
    <Badge variant="outline" className={STATUS_COLOR_MAP[colorKey]}>
      {isOverdue ? "Overdue" : STATUS_LABELS[status]}
    </Badge>
  );
}
