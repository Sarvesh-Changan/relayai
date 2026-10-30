import { EmptyState } from "@/components/shared/PageState";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="space-y-6">
      <div><h2 className="text-lg font-semibold text-foreground">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      <EmptyState title="Nothing to show yet" description="This workspace view is ready for its next implementation phase." />
    </section>
  );
}
