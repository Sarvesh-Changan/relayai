import { TeamDirectory } from "@/app/(app)/team/TeamDirectory";

export default function TeamPage() {
  return <section className="space-y-6"><div><h2 className="text-lg font-semibold text-foreground">Team directory</h2><p className="mt-1 text-sm text-muted-foreground">People in the shared RelayAI workspace.</p></div><TeamDirectory /></section>;
}
