export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "admin" | "manager" | "member";
export type AttendanceStatus = "invited" | "attended" | "absent";
export type TaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";
export type HistoryEvent = "created" | "status_changed" | "reassigned" | "due_date_changed" | "carried_forward" | "links_updated" | "note_added";
export type DocCategory = "decision" | "architecture" | "policy" | "runbook" | "notes" | "other";
export type LinkTarget = "meeting" | "document";
export type LinkRelation = "context" | "carried_forward";
export type LinkSource = "ai" | "manual" | "system";
export type HandoverScope = "meeting" | "task" | "person";
export type HandoverStatus = "open" | "acknowledged";

export type ProfileRow = { id: string; name: string; email: string; role: UserRole; created_at: string };
export type MeetingRow = {
  id: string; title: string; meeting_date: string; agenda: string | null; raw_notes: string | null; summary: string | null;
  decisions: Json; risks: Json; open_questions: Json; extraction_status: "none" | "committed"; ai_generated: boolean;
  created_by: string; created_at: string; updated_at: string; search: unknown;
};
export type MeetingParticipantRow = { meeting_id: string; user_id: string; attendance_status: AttendanceStatus };
export type ActionItemRow = {
  id: string; display_id: string; meeting_id: string | null; title: string; description: string | null; owner_id: string | null;
  original_owner_id: string | null; due_date: string | null; priority: TaskPriority; status: TaskStatus; outcome: string | null;
  status_reason: string | null; created_by: string; created_at: string; updated_at: string;
};
export type TaskHistoryRow = {
  id: string; task_id: string; event_type: HistoryEvent; previous_value: Json | null; new_value: Json | null;
  reason: string | null; changed_by: string; created_at: string;
};
export type KnowledgeDocumentRow = { id: string; title: string; content: string; category: DocCategory; uploaded_by: string; created_at: string; search: unknown };
export type TaskLinkRow = {
  id: string; task_id: string; target_type: LinkTarget; target_id: string; relation: LinkRelation; reason: string | null;
  relevance: number | null; source: LinkSource; created_by: string | null; created_at: string;
};
export type HandoverRow = {
  id: string; recipient_id: string; from_user_id: string | null; scope_type: HandoverScope; meeting_id: string | null;
  task_id: string | null; brief: Json; model: string; latency_ms: number | null; status: HandoverStatus;
  created_by: string; created_at: string; acknowledged_at: string | null;
};
export type AppLogRow = {
  id: number; created_at: string; level: string; event: string; request_id: string | null; user_id: string | null;
  message: string | null; duration_ms: number | null; context: Json;
};

type TableShape<Row, Insert = Partial<Row>, Update = Partial<Row>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
type PublicTables = {
  profiles: TableShape<ProfileRow, Pick<ProfileRow, "id" | "name" | "email"> & Partial<ProfileRow>>;
  meetings: TableShape<MeetingRow, Pick<MeetingRow, "title" | "meeting_date" | "created_by"> & Partial<MeetingRow>>;
  meeting_participants: TableShape<MeetingParticipantRow, Pick<MeetingParticipantRow, "meeting_id" | "user_id"> & Partial<MeetingParticipantRow>>;
  action_items: TableShape<ActionItemRow, Pick<ActionItemRow, "title" | "created_by"> & Partial<ActionItemRow>>;
  task_history: TableShape<TaskHistoryRow, Pick<TaskHistoryRow, "task_id" | "event_type" | "changed_by"> & Partial<TaskHistoryRow>>;
  knowledge_documents: TableShape<KnowledgeDocumentRow, Pick<KnowledgeDocumentRow, "title" | "content" | "uploaded_by"> & Partial<KnowledgeDocumentRow>>;
  task_links: TableShape<TaskLinkRow, Pick<TaskLinkRow, "task_id" | "target_type" | "target_id" | "source"> & Partial<TaskLinkRow>>;
  handovers: TableShape<HandoverRow, Pick<HandoverRow, "recipient_id" | "scope_type" | "brief" | "model" | "created_by"> & Partial<HandoverRow>>;
  app_logs: TableShape<AppLogRow, Pick<AppLogRow, "level" | "event"> & Partial<AppLogRow>>;
};

export type Database = {
  public: {
    Tables: PublicTables;
    Views: Record<string, never>;
    Functions: {
      reassign_task: { Args: { p_task_id: string; p_new_owner: string; p_reason: string }; Returns: ActionItemRow };
      change_task_status: { Args: { p_task_id: string; p_status: TaskStatus; p_reason?: string | null; p_outcome?: string | null }; Returns: ActionItemRow };
      carry_forward_task: { Args: { p_task_id: string; p_meeting_id: string; p_new_due: string | null; p_reason: string }; Returns: ActionItemRow };
      commit_meeting_extraction: { Args: { p_meeting_id: string; p_summary: string; p_decisions: Json; p_risks: Json; p_open_questions: Json; p_items: Json; p_ai_generated: boolean }; Returns: Json };
      create_task: { Args: { p_meeting_id: string | null; p_title: string; p_description: string | null; p_owner_id: string | null; p_due_date: string | null; p_priority: TaskPriority }; Returns: ActionItemRow };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRole; attendance_status: AttendanceStatus; task_status: TaskStatus; task_priority: TaskPriority;
      history_event: HistoryEvent; doc_category: DocCategory; link_target: LinkTarget; link_relation: LinkRelation;
      link_source: LinkSource; handover_scope: HandoverScope; handover_status: HandoverStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
