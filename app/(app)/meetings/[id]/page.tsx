import { MeetingDetail } from "@/app/(app)/meetings/[id]/MeetingDetail";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetingDetail id={id} />;
}
