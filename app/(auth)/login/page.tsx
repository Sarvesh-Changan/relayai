import { LockKeyhole } from "lucide-react";

import { LoginForm } from "@/app/(auth)/login/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold tracking-tight text-white">R</span>
          <div>
            <p className="text-lg font-semibold tracking-tight text-foreground">RELAYAI</p>
            <p className="text-sm text-muted-foreground">Team knowledge, carried forward.</p>
          </div>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
        </div>
        <LoginForm />
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole aria-hidden="true" className="size-3.5" />Your workspace is available to team members only.</p>
      </div>
    </main>
  );
}
