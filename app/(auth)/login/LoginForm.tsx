"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/browser";

const LoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type LoginValues = z.infer<typeof LoginSchema>;

const DEMO_EMAILS = [
  "aisha.khan@relayai.demo",
  "rahul.sharma@relayai.demo",
  "priya.nair@relayai.demo",
  "dev.patel@relayai.demo",
];

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) {
        setServerError("We couldn’t sign you in. Check your email and password, then try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setServerError("We couldn’t sign you in. Check your email and password, then try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {serverError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{serverError}</div>}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} {...register("email")} />
        {errors.email && <p id="email-error" className="text-sm text-red-700">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
        {errors.password && <p id="password-error" className="text-sm text-red-700">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      {process.env.NEXT_PUBLIC_DEMO_HINTS === "true" && (
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo accounts</p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {DEMO_EMAILS.map((demoEmail) => <li key={demoEmail} className="font-mono text-xs">{demoEmail}</li>)}
          </ul>
        </div>
      )}
    </form>
  );
}
