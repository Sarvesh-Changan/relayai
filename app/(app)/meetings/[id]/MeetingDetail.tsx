"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Save, X } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { EmptyState, ErrorState } from "@/components/shared/PageState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@/types/db";

type Meeting = {
  id: string; title: string; meeting_date: string; agenda: string | null; raw_notes: string | null; summary: string | null;
  decisions: unknown; risks: unknown; open_questions: unknown; extraction_status: string;
  participants: Array<{ id: string; name: string; role: string }>;
  tasks: Array<{ id: string; display_id: string; title: string; due_date: string | null; priority: string; status: TaskStatus }>;
};

export function MeetingDetail({ id }: { id: string }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""); const [date, setDate] = useState("");
  const [agenda, setAgenda] = useState(""); const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await apiFetch<Meeting>(`/api/meetings/${id}`);
      setMeeting(result); setTitle(result.title); setDate(result.meeting_date.slice(0, 10)); setAgenda(result.agenda ?? ""); setNotes(result.raw_notes ?? "");
    } catch (cause) { setError(cause instanceof ApiClientError ? cause : new ApiClientError("INTERNAL_ERROR", "Meeting could not be loaded.", "unknown")); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true); setError(null);
    try {
      await apiFetch(`/api/meetings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, meeting_date: date, agenda, raw_notes: notes }) });
      setEditing(false); await load();
    } catch (cause) { setError(cause instanceof ApiClientError ? cause : new ApiClientError("INTERNAL_ERROR", "Meeting could not be updated.", "unknown")); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="space-y-4" aria-label="Loading meeting"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></div>;
  if (error && !meeting) return <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void load()} />;
  if (!meeting) return <div className="space-y-4"><EmptyState title="Meeting not found" description="This meeting may have been removed." /><div className="flex justify-center"><Button render={<Link href="/meetings" />}><ArrowLeft aria-hidden="true" />Back to meetings</Button></div></div>;

  const decisions = Array.isArray(meeting.decisions) ? meeting.decisions as Array<{ text: string; rationale?: string | null }> : [];
  const risks = Array.isArray(meeting.risks) ? meeting.risks as Array<{ text: string; severity: string }> : [];
  const questions = Array.isArray(meeting.open_questions) ? meeting.open_questions as string[] : [];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href="/meetings" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />Meetings</Link><h2 className="text-xl font-semibold">{meeting.title}</h2><p className="mt-1 text-sm text-muted-foreground">{new Date(meeting.meeting_date).toLocaleDateString()} · {meeting.participants.map((profile) => profile.name).join(", ") || "No participants"}</p></div><div className="flex gap-2">{editing ? <><Button variant="outline" onClick={() => setEditing(false)}><X aria-hidden="true" />Cancel</Button><Button disabled={busy} onClick={() => void save()}><Save aria-hidden="true" />{busy ? "Saving…" : "Save changes"}</Button></> : <Button variant="outline" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />Edit meeting</Button>}</div></div>
    {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error.message}<p className="font-mono text-xs">Request ID: {error.requestId}</p></div>}
    {editing && <Card><CardHeader><CardTitle>Edit meeting details</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Input aria-label="Meeting title" value={title} onChange={(event) => setTitle(event.target.value)} /><Input aria-label="Meeting date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><Textarea aria-label="Agenda" className="sm:col-span-2" value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder="Agenda" /><Textarea aria-label="Meeting notes" className="sm:col-span-2" rows={8} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Raw notes" /></CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-6">{meeting.summary || "This draft has not been reviewed yet."}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Decisions</CardTitle></CardHeader><CardContent>{decisions.length ? <ul className="list-disc space-y-2 pl-5 text-sm">{decisions.map((decision, index) => <li key={index}>{decision.text}{decision.rationale && <p className="text-muted-foreground">{decision.rationale}</p>}</li>)}</ul> : <p className="text-sm text-muted-foreground">No decisions saved.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Risks and open questions</CardTitle></CardHeader><CardContent className="space-y-4"><div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risks</h3>{risks.length ? <ul className="space-y-2 text-sm">{risks.map((risk, index) => <li key={index} className="flex items-center justify-between gap-3">{risk.text}<Badge variant="outline" className={risk.severity === "high" ? "border-amber-200 bg-amber-50 text-amber-800" : risk.severity === "low" ? "border-slate-200 bg-slate-100 text-slate-700" : "border-blue-200 bg-blue-50 text-blue-700"}>{risk.severity} severity</Badge></li>)}</ul> : <p className="text-sm text-muted-foreground">No risks saved.</p>}</div><div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open questions</h3>{questions.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul> : <p className="text-sm text-muted-foreground">No open questions.</p>}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Action items ({meeting.tasks.length})</CardTitle></CardHeader><CardContent>{meeting.tasks.length ? <div className="space-y-2">{meeting.tasks.map((task) => <Link key={task.id} href={`/tasks/${task.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 hover:bg-slate-50"><span><span className="font-mono text-xs text-muted-foreground">{task.display_id}</span><span className="ml-2 text-sm font-medium">{task.title}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">{task.due_date ?? "No deadline"}<StatusBadge status={task.status} /></span></Link>)}</div> : <p className="text-sm text-muted-foreground">Tasks will appear here after the meeting is reviewed.</p>}</CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader><CardTitle>Meeting notes</CardTitle></CardHeader><CardContent><pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap font-sans text-sm leading-6">{meeting.raw_notes || "No raw notes saved."}</pre></CardContent></Card>
    </div>
  </div>;
}
