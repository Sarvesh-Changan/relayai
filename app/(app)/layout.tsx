import { redirect } from "next/navigation";

import { AppShell } from "@/app/(app)/AppShell";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("name,role").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login");
  return <AppShell profile={profile}>{children}</AppShell>;
}
