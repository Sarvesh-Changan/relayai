import { MeetingForm } from "@/app/(app)/meetings/new/MeetingForm";
import { env } from "@/lib/env";

export default function NewMeetingPage() {
  return <MeetingForm demoHints={env.NEXT_PUBLIC_DEMO_HINTS} />;
}
