import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e2f2f1,_#f8fafc_60%)] px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-slate">Tally</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
            Payroll reconciliation workspace
          </h1>
          <p className="mt-2 text-sm text-slate">
            Secure, audit-ready checks for UK and IE payroll exports.
          </p>
        </div>
        <div className="rounded-2xl border border-slate/20 bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
