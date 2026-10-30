"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Sparkles, Trash2 } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { AiBadge } from "@/components/shared/AiBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { TaskPriority } from "@/types/db";

type Profile = { id: string; name: string; email: string; role: string };
type MeetingDraft = { id: string };
type ReviewTask = { title: string; description: string; owner_id: string; due_date: string; priority: TaskPriority; needs_review: boolean; review_reasons: string[] };
type Extracted = {
  summary: string; decisions: Array<{ text: string; rationale: string | null }>;
  action_items: Array<ReviewTask & { owner_name: string | null; confidence: number; source_quote: string | null }>;
  risks: Array<{ text: string; severity: "low" | "medium" | "high" }>; open_questions: string[];
  meta: { model: string; latencyMs: number };
};
type Risk = { text: string; severity: "low" | "medium" | "high" };

const blankTask = (): ReviewTask => ({ title: "", description: "", owner_id: "", due_date: "", priority: "medium", needs_review: false, review_reasons: [] });
const defaultDate = new Date().toISOString().slice(0, 10);

export function MeetingForm({ demoHints }: { demoHints: boolean }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(defaultDate);
  const [agenda, setAgenda] = useState("");
  const [notes, setNotes] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [step, setStep] = useState<"details" | "review">("details");
  const [extraction, setExtraction] = useState<Extracted | null>(null);
  const [summary, setSummary] = useState("");
  const [decisions, setDecisions] = useState<string[]>([]);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [aiError, setAiError] = useState<ApiClientError | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void apiFetch<Profile[]>("/api/team").then(setProfiles).catch(() => setProfiles([])); }, []);

  function body() { return { title, meeting_date: meetingDate, agenda, raw_notes: notes, participant_ids: participantIds }; }
  async function saveDraft(): Promise<string> {
    if (meetingId) return meetingId;
    const meeting = await apiFetch<MeetingDraft>("/api/meetings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body()) });
    setMeetingId(meeting.id);
    return meeting.id;
  }
  function clientError(cause: unknown, fallback: string): ApiClientError {
    return cause instanceof ApiClientError ? cause : new ApiClientError("INTERNAL_ERROR", fallback, "unknown");
  }
  async function saveOnly() {
    if (!title.trim() || !meetingDate) { setError(new ApiClientError("VALIDATION_ERROR", "Enter a meeting title and date.", "")); return; }
    setBusy(true); setError(null);
    try { const id = await saveDraft(); router.push(`/meetings/${id}`); }
    catch (cause) { setError(clientError(cause, "Meeting could not be saved.")); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!title.trim() || !meetingDate || notes.trim().length < 20) { setError(new ApiClientError("VALIDATION_ERROR", "Enter a meeting title, date, and at least 20 characters of notes.", "")); return; }
    setBusy(true); setError(null); setAiError(null);
    try {
      const id = await saveDraft();
      try {
        const result = await apiFetch<Extracted>("/api/ai/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meeting_id: id, meeting_date: meetingDate, title, raw_notes: notes, participant_ids: participantIds }) });
        setExtraction(result); setSummary(result.summary); setDecisions(result.decisions.map((decision) => decision.text));
        setTasks(result.action_items.map((item) => ({ title: item.title, description: item.description ?? "", owner_id: item.owner_id, due_date: item.due_date, priority: item.priority, needs_review: item.needs_review, review_reasons: item.review_reasons })));
        setRisks(result.risks); setQuestions(result.open_questions); setStep("review");
      } catch (cause) {
        setAiError(clientError(cause, "AI extraction failed.")); setExtraction(null); setSummary("");
        setDecisions([]); setTasks([]); setRisks([]); setQuestions([]); setStep("review");
      }
    } catch (cause) { setError(clientError(cause, "Meeting could not be saved.")); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!meetingId || !summary.trim()) { setError(new ApiClientError("VALIDATION_ERROR", "Add a summary before saving.", "")); return; }
    setBusy(true); setError(null);
    try {
      await apiFetch(`/api/meetings/${meetingId}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        summary, decisions: decisions.map((text) => ({ text: text.trim(), rationale: null })).filter((decision) => decision.text),
        risks: risks.filter((risk) => risk.text.trim()), open_questions: questions.filter((question) => question.trim()),
        action_items: tasks.filter((task) => task.title.trim()).map((task) => ({ title: task.title.trim(), description: task.description.trim() || null, owner_id: task.owner_id || null, due_date: task.due_date || null, priority: task.priority })),
        ai_generated: extraction !== null,
      }) });
      router.push(`/meetings/${meetingId}`);
    } catch (cause) { setError(clientError(cause, "Meeting could not be committed.")); }
    finally { setBusy(false); }
  }
  function updateTask(index: number, update: Partial<ReviewTask>) { setTasks((current) => current.map((item, i) => i === index ? { ...item, ...update } : item)); }
  function updateTaskOwner(index: number, ownerId: string) {
    setTasks((current) => current.map((item, i) => {
      if (i !== index) return item;
      const review_reasons = item.review_reasons.filter((reason) => !reason.startsWith("Owner") && reason !== "Owner not identified");
      return { ...item, owner_id: ownerId, review_reasons, needs_review: review_reasons.length > 0 };
    }));
  }
  function updateTaskDueDate(index: number, dueDate: string) {
    setTasks((current) => current.map((item, i) => {
      if (i !== index) return item;
      const review_reasons = item.review_reasons.filter((reason) => reason !== "Due date is earlier than the meeting date" && reason !== "Invalid due date" && reason !== "No deadline stated");
      if (!dueDate) review_reasons.push("No deadline stated");
      return { ...item, due_date: dueDate, review_reasons, needs_review: review_reasons.length > 0 };
    }));
  }

  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Step {step === "details" ? "1 of 2 · Meeting details" : "2 of 2 · AI review"}</p><h2 className="mt-1 text-lg font-semibold">{step === "details" ? "Capture meeting notes" : "Review meeting outcomes"}</h2></div><Link href="/meetings" className="text-sm text-muted-foreground hover:text-foreground">Cancel</Link></div>
    {step === "details" ? <div className="space-y-5">
      <Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="meeting-title">Title</Label><Input id="meeting-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /></div>
        <div className="space-y-2"><Label htmlFor="meeting-date">Date</Label><Input id="meeting-date" type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="meeting-agenda">Agenda</Label><Textarea id="meeting-agenda" rows={2} value={agenda} onChange={(event) => setAgenda(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Participants</Label>{profiles === null ? <Skeleton className="h-16 w-full" /> : profiles.length === 0 ? <p className="text-sm text-muted-foreground">Team members could not be loaded. You can still continue.</p> : <div className="grid gap-2 sm:grid-cols-2">{profiles.map((profile) => <label key={profile.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"><Checkbox checked={participantIds.includes(profile.id)} onCheckedChange={(checked) => setParticipantIds(checked ? [...participantIds, profile.id] : participantIds.filter((id) => id !== profile.id))} />{profile.name}<span className="ml-auto text-xs text-muted-foreground">{profile.role}</span></label>)}</div>}</div>
        <div className="space-y-2 sm:col-span-2"><div className="flex justify-between"><Label htmlFor="meeting-notes">Raw notes</Label><span className="text-xs text-muted-foreground">{notes.length}/20,000</span></div><Textarea id="meeting-notes" rows={12} maxLength={20000} placeholder="Paste meeting notes here…" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
      </CardContent></Card>
      {demoHints && <Button variant="outline" onClick={() => { setTitle("Sprint Planning – Project Phoenix"); setMeetingDate("2026-10-30"); setNotes("Rahul completed backend authentication but frontend integration is pending.\nPriya will handle testing after integration.\n\nWe decided to use JWT authentication.\nSecurity testing is required before release.\n\nDeadline for authentication is Nov 2.\nRahul will be unavailable from Nov 1."); }}>Load sample notes</Button>}
      {error && <ErrorMessage error={error} />}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => void saveOnly()}>Save draft</Button><Button disabled={busy} onClick={() => void generate()}>{busy ? "Analysing notes…" : <><Sparkles aria-hidden="true" />Generate with AI</>}</Button></div>
    </div> : <div className="space-y-5">
      {aiError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-medium">{aiError.message}</p><p className="mt-1 font-mono text-xs">Request ID: {aiError.requestId}</p><p className="mt-2">Your notes remain available below. Add tasks manually or save without tasks.</p></div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]"><Card><CardHeader><CardTitle>Meeting notes</CardTitle></CardHeader><CardContent><div className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 text-sm leading-6">{notes || "No notes provided."}</div></CardContent></Card>
        <div className="space-y-4"><div className="flex items-center justify-between"><AiBadge /><span className="text-xs text-muted-foreground">{extraction ? "AI-generated · review before saving" : "Manual entry"}</span></div>
          <Card><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent><Textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={2000} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Decisions</CardTitle></CardHeader><CardContent className="space-y-2">{decisions.map((value, index) => <div key={index} className="flex gap-2"><Input value={value} aria-label={`Decision ${index + 1}`} onChange={(event) => setDecisions((items) => items.map((item, i) => i === index ? event.target.value : item))} /><Button size="icon" variant="ghost" aria-label="Remove decision" onClick={() => setDecisions((items) => items.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" /></Button></div>)}<Button variant="outline" size="sm" onClick={() => setDecisions((items) => [...items, ""])}><Plus aria-hidden="true" />Add decision</Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Action items ({tasks.length})</CardTitle></CardHeader><CardContent className="space-y-3">{tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet. Add them manually or save the meeting without tasks.</p>}{tasks.map((task, index) => <div key={index} className={`space-y-3 rounded-lg border p-3 ${task.needs_review ? "border-amber-300 bg-amber-50/70" : "border-border"}`}>
            <div className="flex items-center justify-between">{task.needs_review ? <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">Needs review</Badge> : <span className="text-xs text-muted-foreground">Action item {index + 1}</span>}<Button size="icon" variant="ghost" aria-label="Remove action item" onClick={() => setTasks((items) => items.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" /></Button></div>
            {task.review_reasons.length > 0 && <p className="text-xs text-amber-900">{task.review_reasons.join(" · ")}</p>}
            <Input aria-label="Task title" placeholder="Task title" maxLength={200} value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} /><Textarea aria-label="Task description" placeholder="Description" rows={2} value={task.description} onChange={(event) => updateTask(index, { description: event.target.value })} />
            <div className="grid gap-2 sm:grid-cols-3"><select aria-label="Task owner" className="h-9 rounded-md border border-border bg-white px-2 text-sm" value={task.owner_id} onChange={(event) => updateTaskOwner(index, event.target.value)}><option value="">Unassigned</option>{(profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><Input aria-label="Due date" type="date" value={task.due_date} onChange={(event) => updateTaskDueDate(index, event.target.value)} /><select aria-label="Task priority" className="h-9 rounded-md border border-border bg-white px-2 text-sm" value={task.priority} onChange={(event) => updateTask(index, { priority: event.target.value as TaskPriority })}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select></div>
          </div>)}<Button variant="outline" size="sm" onClick={() => setTasks((items) => [...items, blankTask()])}><Plus aria-hidden="true" />Add task manually</Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Risks</CardTitle></CardHeader><CardContent className="space-y-2">{risks.map((risk, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_150px]"><Input aria-label="Risk" value={risk.text} onChange={(event) => setRisks((items) => items.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /><select aria-label="Risk severity" className="h-9 rounded-md border border-border bg-white px-2 text-sm" value={risk.severity} onChange={(event) => setRisks((items) => items.map((item, i) => i === index ? { ...item, severity: event.target.value as Risk["severity"] } : item))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>)}<Button variant="outline" size="sm" onClick={() => setRisks((items) => [...items, { text: "", severity: "medium" }])}><Plus aria-hidden="true" />Add risk</Button></CardContent></Card>
          <Card><CardHeader><CardTitle>Open questions</CardTitle></CardHeader><CardContent className="space-y-2">{questions.map((question, index) => <Input key={index} aria-label="Open question" value={question} onChange={(event) => setQuestions((items) => items.map((item, i) => i === index ? event.target.value : item))} />)}<Button variant="outline" size="sm" onClick={() => setQuestions((items) => [...items, ""])}><Plus aria-hidden="true" />Add question</Button></CardContent></Card>
        </div>
      </div>
      {error && <ErrorMessage error={error} />}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-white/95 py-3 backdrop-blur"><Button variant="outline" disabled={busy} onClick={() => { setStep("details"); setAiError(null); }}><ArrowLeft aria-hidden="true" />Back</Button><Button disabled={busy || !meetingId} onClick={() => void commit()}>{busy ? "Saving…" : `Save meeting & create ${tasks.filter((task) => task.title.trim()).length} tasks`}</Button></div>
    </div>}
  </div>;
}

function ErrorMessage({ error }: { error: ApiClientError }) {
  return <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"><p>{error.message}</p>{error.requestId && <p className="mt-1 font-mono text-xs">Request ID: {error.requestId}</p>}</div>;
}
