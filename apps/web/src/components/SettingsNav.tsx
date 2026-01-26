"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const settingsTabs: Array<{ label: string; href: string }> = [
  { label: "Users", href: "/settings/users" },
  { label: "Audit log", href: "/settings/audit-log" },
  { label: "Tolerances", href: "/settings/tolerances" },
  { label: "Approvals", href: "/settings/approvals" },
  { label: "Redaction", href: "/settings/redaction" }
];

export const SettingsNav = () => {
  const pathname = usePathname();

  return (
    <div className="flex gap-3 border-b border-slate/20 pb-4">
      {settingsTabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href as Route}
            className={clsx(
              "rounded-full px-4 py-1.5 text-sm font-semibold",
              isActive
                ? "bg-accent text-white"
                : "border border-slate/30 text-slate"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
};
