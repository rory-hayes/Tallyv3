import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ClientForm } from "../ClientForm";
import { createClientAction } from "../actions";

export default async function NewClientPage() {
  const { session } = await requireUser();
  const reviewers = await prisma.user.findMany({
    where: {
      firmId: session.firmId,
      status: "ACTIVE",
      role: { in: ["REVIEWER", "ADMIN"] }
    },
    select: {
      id: true,
      email: true,
      role: true
    },
    orderBy: { email: "asc" }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">New client</h1>
        <p className="mt-2 text-sm text-slate">
          Capture payroll system details and set a default reviewer.
        </p>
      </div>
      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <ClientForm reviewers={reviewers} action={createClientAction} submitLabel="Create client" />
      </div>
    </div>
  );
}
