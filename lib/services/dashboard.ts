import { AppError } from "@/lib/api/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, HistoryEvent, TaskStatus } from "@/types/db";

const ACTIVE_STATUSES: TaskStatus[] = ["open", "in_progress", "blocked"];

export type DashboardSignal = {
  ref: string;
  kind: "overdue" | "blocked" | "unassigned" | "reassigned_multiple" | "due_soon";
  task_id: string;
  display_id: string;
  title: string;
  detail: string;
};

export type DashboardData = {
  stats: { totalMeetings: number; activeTasks: number; overdueTasks: number; openHandovers: number };
  recentActivity: Array<{
    id: string;
    kind: "task" | "meeting";
    title: string;
    description: string;
    actorName: string;
    createdAt: string;
    href: string;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    displayId: string;
    title: string;
    ownerName: string | null;
    dueDate: string;
    status: TaskStatus;
    isOverdue: boolean;
  }>;
  signals: DashboardSignal[];
};

function failOnDatabaseError(error: { message: string } | null): void {
  if (error) throw new AppError("DB_ERROR", "Dashboard data could not be loaded.", { cause: error });
}

function localDate(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function describeEvent(event: HistoryEvent): string {
  const descriptions: Record<HistoryEvent, string> = {
    created: "created an action item",
    status_changed: "changed an action item’s status",
    reassigned: "reassigned an action item",
    due_date_changed: "changed an action item’s due date",
    carried_forward: "carried an action item forward",
    links_updated: "updated an action item’s links",
    note_added: "added a note to an action item",
  };
  return descriptions[event];
}

export async function getDashboardData(
  supabase: SupabaseClient<Database>,
  timeZone: string,
): Promise<DashboardData> {
  const today = localDate(timeZone);
  const [meetingsCount, handoversCount, tasksResult, historyResult, meetingsResult] = await Promise.all([
    supabase.from("meetings").select("id", { count: "exact", head: true }),
    supabase.from("handovers").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("action_items")
      .select("id,display_id,meeting_id,title,owner_id,due_date,status,updated_at")
      .in("status", ACTIVE_STATUSES)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("task_history").select("id,task_id,event_type,changed_by,created_at,reason")
      .order("created_at", { ascending: false }).limit(10),
    supabase.from("meetings").select("id,title,created_by,created_at")
      .order("created_at", { ascending: false }).limit(10),
  ]);

  failOnDatabaseError(meetingsCount.error);
  failOnDatabaseError(handoversCount.error);
  failOnDatabaseError(tasksResult.error);
  failOnDatabaseError(historyResult.error);
  failOnDatabaseError(meetingsResult.error);

  const tasks = tasksResult.data ?? [];
  const history = historyResult.data ?? [];
  const meetings = meetingsResult.data ?? [];
  const taskIds = [...new Set([...tasks.map((task) => task.id), ...history.map((item) => item.task_id)])];
  const profileIds = [...new Set([
    ...tasks.flatMap((task) => task.owner_id ? [task.owner_id] : []),
    ...history.map((item) => item.changed_by),
    ...meetings.map((meeting) => meeting.created_by),
  ])];

  const [taskDetailsResult, profilesResult, reassignmentResult] = await Promise.all([
    taskIds.length > 0
      ? supabase.from("action_items").select("id,display_id,title").in("id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length > 0
      ? supabase.from("profiles").select("id,name").in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    tasks.length > 0
      ? supabase.from("task_history").select("task_id").in("task_id", tasks.map((task) => task.id)).eq("event_type", "reassigned")
      : Promise.resolve({ data: [], error: null }),
  ]);
  failOnDatabaseError(taskDetailsResult.error);
  failOnDatabaseError(profilesResult.error);
  failOnDatabaseError(reassignmentResult.error);

  const taskDetails = new Map((taskDetailsResult.data ?? []).map((task) => [task.id, task]));
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.name]));
  const reassignmentCounts = new Map<string, number>();
  (reassignmentResult.data ?? []).forEach(({ task_id }) => reassignmentCounts.set(task_id, (reassignmentCounts.get(task_id) ?? 0) + 1));
  const isOverdue = (dueDate: string | null) => dueDate !== null && dueDate < today;
  const overdueTasks = tasks.filter((task) => isOverdue(task.due_date));
  const deadlineLimit = addDays(today, 7);

  const upcomingDeadlines = tasks
    .filter((task) => task.due_date !== null && task.due_date <= deadlineLimit)
    .slice(0, 8)
    .map((task) => ({
      id: task.id,
      displayId: task.display_id,
      title: task.title,
      ownerName: task.owner_id ? profiles.get(task.owner_id) ?? null : null,
      dueDate: task.due_date as string,
      status: task.status,
      isOverdue: isOverdue(task.due_date),
    }));

  const recentActivity = [
    ...history.map((item) => {
      const task = taskDetails.get(item.task_id);
      const title = task ? `${task.display_id} · ${task.title}` : "Action item";
      return {
        id: item.id,
        kind: "task" as const,
        title,
        description: `${profiles.get(item.changed_by) ?? "A team member"} ${describeEvent(item.event_type)}`,
        actorName: profiles.get(item.changed_by) ?? "Team member",
        createdAt: item.created_at,
        href: task ? `/tasks/${task.id}` : "/tasks",
      };
    }),
    ...meetings.map((meeting) => ({
      id: `meeting-${meeting.id}`,
      kind: "meeting" as const,
      title: meeting.title,
      description: `${profiles.get(meeting.created_by) ?? "A team member"} created a meeting`,
      actorName: profiles.get(meeting.created_by) ?? "Team member",
      createdAt: meeting.created_at,
      href: `/meetings/${meeting.id}`,
    })),
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 10);

  const signals: DashboardSignal[] = [];
  const addSignal = (task: (typeof tasks)[number], kind: DashboardSignal["kind"], detail: string) => {
    signals.push({
      ref: `S${signals.length + 1}`,
      kind,
      task_id: task.id,
      display_id: task.display_id,
      title: task.title,
      detail,
    });
  };
  for (const task of tasks) {
    if (isOverdue(task.due_date)) addSignal(task, "overdue", `Due ${task.due_date}; now overdue.`);
    if (task.status === "blocked") addSignal(task, "blocked", "This action item is blocked.");
    if (!task.owner_id) addSignal(task, "unassigned", "No owner is assigned.");
    if ((reassignmentCounts.get(task.id) ?? 0) >= 2) addSignal(task, "reassigned_multiple", "Reassigned at least twice; ownership context may need review.");
    if (task.due_date && task.due_date <= addDays(today, 3) && task.status !== "in_progress") {
      addSignal(task, "due_soon", `Due ${task.due_date}; due within three days or overdue.`);
    }
  }

  return {
    stats: {
      totalMeetings: meetingsCount.count ?? 0,
      activeTasks: tasks.length,
      overdueTasks: overdueTasks.length,
      openHandovers: handoversCount.count ?? 0,
    },
    recentActivity,
    upcomingDeadlines,
    signals,
  };
}
