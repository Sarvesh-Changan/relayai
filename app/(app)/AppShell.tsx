"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpenText, ChevronDown, ClipboardList, LayoutDashboard, LogOut, Menu, Users, Video, WandSparkles } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/browser";
import type { UserRole } from "@/types/db";

type ShellProfile = { name: string; role: UserRole };
type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };

const WORKSPACE: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Action Items", href: "/tasks", icon: ClipboardList },
  { label: "AI Handover", href: "/handover", icon: WandSparkles },
  { label: "Knowledge Base", href: "/knowledge", icon: BookOpenText },
];
const MANAGEMENT: NavItem[] = [{ label: "Team", href: "/team", icon: Users }];

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/meetings")) return "Meetings";
  if (pathname.startsWith("/tasks")) return "Action Items";
  if (pathname.startsWith("/handover")) return "AI Handover";
  if (pathname.startsWith("/knowledge")) return "Knowledge Base";
  if (pathname.startsWith("/team")) return "Team";
  return "Overview";
}

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  const section = (title: string, items: NavItem[]) => (
    <div className="space-y-1">
      <p className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.map(({ label, href, icon: Icon }) => {
        const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} onClick={close} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-border bg-white font-medium text-foreground" : "border-transparent text-slate-600 hover:bg-white/70 hover:text-foreground"}`}>
            <Icon aria-hidden="true" className="size-4 shrink-0" />{label}
          </Link>
        );
      })}
    </div>
  );

  return <nav aria-label="Main navigation" className="px-3">{section("Workspace", WORKSPACE)}{section("Management", MANAGEMENT)}</nav>;
}

function UserMenu({ profile }: { profile: ShellProfile }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const initials = profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  async function signOut() {
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) {
      setError("Could not sign out. Please try again.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Account menu for ${profile.name}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{initials}</span>
          <span className="hidden min-w-0 sm:block"><span className="block max-w-40 truncate text-sm font-medium text-foreground">{profile.name}</span><span className="block text-xs capitalize text-muted-foreground">{profile.role}</span></span>
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <div className="px-2 py-1.5 sm:hidden"><p className="text-sm font-medium">{profile.name}</p><p className="text-xs capitalize text-muted-foreground">{profile.role}</p></div>
          <DropdownMenuItem onClick={() => { void signOut(); }}><LogOut aria-hidden="true" />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p role="alert" className="absolute right-0 top-full z-20 mt-2 w-56 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</p>}
    </div>
  );
}

export function AppShell({ children, profile }: { children: React.ReactNode; profile: ShellProfile }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
        <div className="flex h-16 items-center gap-3 px-6"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">R</span><span className="text-sm font-bold tracking-[0.08em] text-foreground">RELAYAI</span></div>
        <Navigation />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-white/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger aria-label="Open navigation" className="flex size-9 items-center justify-center rounded-md hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"><Menu aria-hidden="true" className="size-5" /></SheetTrigger>
              <SheetContent side="left" className="w-72 bg-surface p-0">
                <SheetTitle className="flex h-16 items-center gap-3 px-6"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">R</span>RELAYAI</SheetTitle>
                <Navigation close={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <h1 className="text-base font-semibold text-foreground sm:text-xl">{pageTitle(pathname)}</h1>
          </div>
          <UserMenu profile={profile} />
        </header>
        <main className="mx-auto w-full max-w-[1248px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
