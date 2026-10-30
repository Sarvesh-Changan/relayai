"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Search } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/PageState";

type Meeting = { id: string; title: string; meeting_date: string; agenda: string | null; summary: string | null; extraction_status: string };

export function MeetingsList() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  const load = useCallback(async (search = query) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (search.trim()) params.set("q", search.trim());
      setMeetings(await apiFetch<Meeting[]>(`/api/meetings?${params}`));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause : new ApiClientError("INTERNAL_ERROR", "Meetings could not be loaded.", "unknown"));
    } finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(""); }, [load]);

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">Capture decisions, notes, and action items.</p><Button render={<Link href="/meetings/new" />}><Plus aria-hidden="true" />New meeting</Button></div>
    <form className="relative max-w-md" onSubmit={(event) => { event.preventDefault(); void load(); }}><Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meetings" className="pl-9" aria-label="Search meetings" /></form>
    {loading ? <div className="space-y-3" aria-label="Loading meetings">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 w-full" />)}</div>
      : error ? <ErrorState message={error.message} requestId={error.requestId} onRetry={() => void load()} />
      : meetings.length === 0 ? <div className="space-y-4"><EmptyState title="No meetings yet" description="Create a meeting to capture notes and review its outcomes." /><div className="flex justify-center"><Button render={<Link href="/meetings/new" />}><Plus aria-hidden="true" />Create meeting</Button></div></div>
      : <div className="grid gap-3">{meetings.map((meeting) => <Link key={meeting.id} href={`/meetings/${meeting.id}`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="transition-colors hover:bg-slate-50"><CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="font-semibold text-foreground">{meeting.title}</h2><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{meeting.summary || meeting.agenda || "Meeting notes are ready for review."}</p></div><div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><CalendarDays aria-hidden="true" className="size-4" />{new Date(meeting.meeting_date).toLocaleDateString()}<span className="rounded-full bg-slate-100 px-2 py-1 capitalize">{meeting.extraction_status === "committed" ? "Reviewed" : "Draft"}</span></div></CardContent></Card></Link>)}</div>}
  </div>;
}
