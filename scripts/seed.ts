import { loadEnvConfig } from "@next/env";
import type { createAdminClient } from "@/lib/supabase/admin-client";
import type { DocCategory, Json, ProfileRow, TaskPriority, TaskStatus } from "@/types/db";

loadEnvConfig(process.cwd());

const seedUsers = [
  { name: "Aisha Khan", email: "aisha.khan@relayai.demo", role: "manager" as const },
  { name: "Rahul Sharma", email: "rahul.sharma@relayai.demo", role: "member" as const },
  { name: "Priya Nair", email: "priya.nair@relayai.demo", role: "member" as const },
  { name: "Dev Patel", email: "dev.patel@relayai.demo", role: "member" as const },
];

function required<T>(value: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (value === null) throw new Error("Supabase returned no row for a required seed operation.");
  return value;
}

async function ensureUsers(client: ReturnType<typeof createAdminClient>, password: string): Promise<Map<string, ProfileRow>> {
  const existingUsers = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list auth users: ${error.message}`);
    data.users.forEach((user) => user.email && existingUsers.set(user.email.toLowerCase(), user.id));
    if (data.users.length < 1000) break;
  }

  const profiles = new Map<string, ProfileRow>();
  for (const user of seedUsers) {
    const id = existingUsers.get(user.email.toLowerCase());
    const result = id
      ? await client.auth.admin.updateUserById(id, { password, email_confirm: true, user_metadata: { name: user.name } })
      : await client.auth.admin.createUser({ email: user.email, password, email_confirm: true, user_metadata: { name: user.name } });
    if (result.error) throw new Error(`Could not ensure ${user.name}: ${result.error.message}`);

    const { data, error } = await client.from("profiles").upsert({
      id: result.data.user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }).select("*").single();
    profiles.set(user.name, required(data, error));
  }
  return profiles;
}

async function ensureMeeting(client: ReturnType<typeof createAdminClient>, createdBy: string) {
  const row = {
    title: "Security Review – Project Phoenix",
    meeting_date: "2026-10-27T10:00:00.000Z",
    agenda: "Review authentication security and release readiness.",
    raw_notes: "The team reviewed authentication controls for Project Phoenix. Use JWT access tokens with refresh rotation. Aisha will coordinate the release review. Security testing must happen before each release. Rahul completed the backend authentication work; frontend integration remains in progress. Dev will follow up on payment integration.",
    summary: "The team agreed to use short-lived JWT access tokens with refresh-token rotation and to require security testing before each release. Backend authentication is complete; frontend integration and payment integration remain tracked work.",
    decisions: [
      { text: "Use JWT with 15-minute access tokens and refresh rotation.", rationale: "Short-lived access tokens limit exposure while refresh rotation supports ongoing sessions." },
      { text: "Complete security testing before every release.", rationale: "Release readiness includes a repeatable security check." },
    ] satisfies Json,
    risks: [{ text: "Security testing must be completed before release.", severity: "medium" }] satisfies Json,
    open_questions: [] satisfies Json,
    extraction_status: "committed" as const,
    ai_generated: false,
    created_by: createdBy,
  };
  const { data: existing, error: findError } = await client.from("meetings")
    .select("id").eq("title", row.title).eq("meeting_date", row.meeting_date).maybeSingle();
  if (findError) throw new Error(`Could not find seed meeting: ${findError.message}`);
  const result = existing
    ? await client.from("meetings").update(row).eq("id", existing.id).select("*").single()
    : await client.from("meetings").insert(row).select("*").single();
  return required(result.data, result.error);
}

async function ensureTasks(
  client: ReturnType<typeof createAdminClient>, meetingId: string, createdBy: string, rahulId: string, devId: string,
): Promise<void> {
  const tasks: Array<{
    title: string; description: string; owner: string; dueDate: string | null;
    priority: TaskPriority; status: TaskStatus; outcome: string | null;
  }> = [
    {
      title: "Implement backend authentication",
      description: "Implement Project Phoenix authentication using the agreed JWT and refresh-token approach.",
      owner: rahulId, dueDate: null, priority: "high", status: "completed",
      outcome: "Backend authentication was implemented with JWT access tokens and refresh-token rotation.",
    },
    {
      title: "Payment integration",
      description: "Complete the payment integration for Project Phoenix.",
      owner: devId, dueDate: "2026-10-29", priority: "high", status: "open", outcome: null,
    },
  ];

  for (const task of tasks) {
    const { data: found, error: findError } = await client.from("action_items").select("id")
      .eq("meeting_id", meetingId).eq("title", task.title).maybeSingle();
    if (findError) throw new Error(`Could not find seed task ${task.title}: ${findError.message}`);
    if (found) {
      const { data: history, error: historyLookupError } = await client.from("task_history").select("id")
        .eq("task_id", found.id).eq("event_type", "created").limit(1);
      if (historyLookupError) throw new Error(`Could not verify history for ${task.title}: ${historyLookupError.message}`);
      if (history.length > 0) continue;
      const { error: repairError } = await client.from("task_history").insert({
        task_id: found.id,
        event_type: "created",
        new_value: { owner_id: task.owner, due_date: task.dueDate, meeting_id: meetingId, status: task.status } satisfies Json,
        reason: "Created from hand-written seed meeting notes.",
        changed_by: createdBy,
      });
      if (repairError) throw new Error(`Could not repair task history for ${task.title}: ${repairError.message}`);
      continue;
    }

    const { data, error } = await client.from("action_items").insert({
      meeting_id: meetingId, title: task.title, description: task.description, owner_id: task.owner,
      original_owner_id: task.owner, due_date: task.dueDate, priority: task.priority,
      status: task.status, outcome: task.outcome, created_by: createdBy,
    }).select("id").single();
    const created = required(data, error);
    const newValue = {
      owner_id: task.owner, due_date: task.dueDate, meeting_id: meetingId, status: task.status,
      ...(task.outcome ? { outcome: task.outcome } : {}),
    } satisfies Json;
    const { error: historyError } = await client.from("task_history").insert({
      task_id: created.id, event_type: "created", new_value: newValue,
      reason: "Created from hand-written seed meeting notes.", changed_by: createdBy,
    });
    if (historyError) throw new Error(`Could not create task history for ${task.title}: ${historyError.message}`);
  }
}

async function ensureKnowledge(client: ReturnType<typeof createAdminClient>, uploaderId: string): Promise<void> {
  const documents: Array<{ title: string; content: string; category: DocCategory }> = [
    {
      title: "Auth Security Guidelines", category: "policy",
      content: "Use short-lived JWT access tokens and rotate refresh tokens after use. Store credentials securely, validate authorization on every protected request, and revoke sessions when compromise is suspected. Require security testing before each production release.",
    },
    {
      title: "Project Phoenix Architecture Overview", category: "architecture",
      content: "Project Phoenix uses a web application backed by Supabase Postgres and Supabase Auth. The application stores meeting decisions, tasks, task history, and supporting knowledge documents. Authenticated requests use row-level security, and task lifecycle changes are recorded in append-only history.",
    },
    {
      title: "Release Checklist", category: "runbook",
      content: "Before each release, run typecheck, lint, tests, and the production build. Review authentication changes, complete security testing, confirm database migrations, and verify the health endpoint. Record release decisions and unresolved risks in the project meeting notes.",
    },
  ];
  for (const document of documents) {
    const { data: found, error: findError } = await client.from("knowledge_documents").select("id")
      .eq("title", document.title).maybeSingle();
    if (findError) throw new Error(`Could not find seed document ${document.title}: ${findError.message}`);
    const row = { ...document, uploaded_by: uploaderId };
    const result = found
      ? await client.from("knowledge_documents").update(row).eq("id", found.id)
      : await client.from("knowledge_documents").insert(row);
    if (result.error) throw new Error(`Could not save seed document ${document.title}: ${result.error.message}`);
  }
}

async function seed(): Promise<void> {
  const [{ createAdminClient }, { env }] = await Promise.all([
    import("@/lib/supabase/admin-client"),
    import("@/lib/env"),
  ]);
  if (!env.SEED_PASSWORD) throw new Error("SEED_PASSWORD is required to seed demo accounts.");
  const client = createAdminClient();
  const profiles = await ensureUsers(client, env.SEED_PASSWORD);
  const aisha = profiles.get("Aisha Khan");
  const rahul = profiles.get("Rahul Sharma");
  const priya = profiles.get("Priya Nair");
  const dev = profiles.get("Dev Patel");
  if (!aisha || !rahul || !priya || !dev) throw new Error("Could not resolve all four seeded profiles.");

  const meeting = await ensureMeeting(client, aisha.id);
  const { error: participantError } = await client.from("meeting_participants").upsert(
    [aisha, rahul, priya].map((profile) => ({ meeting_id: meeting.id, user_id: profile.id, attendance_status: "attended" as const })),
    { onConflict: "meeting_id,user_id" },
  );
  if (participantError) throw new Error(`Could not save meeting participants: ${participantError.message}`);
  await ensureTasks(client, meeting.id, aisha.id, rahul.id, dev.id);
  await ensureKnowledge(client, aisha.id);
  process.stdout.write("Seeded 4 demo users, 1 meeting, 2 tasks, and 3 knowledge documents.\n");
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed failure.";
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exitCode = 1;
});
