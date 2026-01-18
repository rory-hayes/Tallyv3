import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import type { Role } from "@/lib/prisma";
import { logoutAction } from "@/app/(app)/actions";

const navItems: Array<{
  label: string;
  href?: string;
  disabled?: boolean;
}> = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Clients", href: "/clients" },
  { label: "Pay Runs", href: "/pay-runs" },
  { label: "Exceptions", href: "/exceptions" },
  { label: "Packs", href: "/packs" },
  { label: "Templates", href: "/templates" },
  { label: "Settings", href: "/settings/users" }
];

type AppShellProps = {
  children: ReactNode;
  user: {
    email: string;
    role: Role;
  };
};

export const AppShell = ({ children, user }: AppShellProps) => {
  return (
    <div className="min-h-screen bg-mist">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-slate/20 bg-surface px-6 py-8">
          <div className="text-sm uppercase tracking-[0.2em] text-slate">
            Tally
          </div>
          <nav className="mt-8 space-y-2">
            {navItems.map((item) =>
              item.disabled || !item.href ? (
                <div
                  key={item.label}
                  className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm font-medium text-slate"
                >
                  {item.label}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>
        </aside>
        <div className="flex-1">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate/20 bg-surface px-8 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate">
                Workspace
              </p>
              <p className="mt-1 text-sm font-medium text-ink">{user.email}</p>
              <p className="text-xs text-slate">{user.role}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <form action="/search" method="get" className="flex items-center gap-2">
                <label className="sr-only" htmlFor="global-search">
                  Search
                </label>
                <input
                  id="global-search"
                  name="q"
                  type="search"
                  placeholder="Search clients or periods"
                  className="w-56 rounded-lg border border-slate/30 bg-surface px-3 py-2 text-xs text-slate placeholder:text-slate/60"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-slate/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
                >
                  Search
                </button>
              </form>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-slate/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
                >
                  Sign out
                </button>
              </form>
            </div>
          </header>
          <main className="px-8 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
};
