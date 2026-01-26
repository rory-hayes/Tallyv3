import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AccountClassificationForm } from "./AccountClassificationForm";
import { deleteAccountClassificationAction } from "./actions";

type AccountClassificationsPageProps = {
  params: { clientId: string };
};

const classificationLabels: Record<string, string> = {
  EXPENSE: "Expense",
  NET_PAYABLE: "Net wages payable",
  TAX_PAYABLE: "Tax payable",
  NI_PRSI_PAYABLE: "NI/PRSI payable",
  PENSION_PAYABLE: "Pension payable",
  CASH: "Cash/Bank",
  OTHER: "Other"
};

export default async function AccountClassificationsPage({
  params
}: AccountClassificationsPageProps) {
  const { session } = await requireUser();
  const client = await prisma.client.findFirst({
    where: {
      id: params.clientId,
      firmId: session.firmId
    }
  });

  if (!client) {
    notFound();
  }

  const classifications = await prisma.accountClassification.findMany({
    where: {
      firmId: session.firmId,
      clientId: client.id
    },
    orderBy: [{ accountCode: "asc" }]
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate">
            Account classifications
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {client.name}
          </h1>
          <p className="mt-2 text-sm text-slate">
            Classify journal accounts to enable register vs GL reconciliation.
          </p>
        </div>
        <Link
          href={`/clients/${client.id}` as Route}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          Back to client
        </Link>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Add account mapping</h2>
        <p className="mt-2 text-sm text-slate">
          Use the GL account code to map to a reconciliation class.
        </p>
        <div className="mt-4">
          <AccountClassificationForm clientId={client.id} />
        </div>
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Current mappings</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Account code</th>
              <th className="px-4 py-3">Account name</th>
              <th className="px-4 py-3">Classification</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {classifications.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-slate">
                  No account classifications yet. Add a mapping to enable GL checks.
                </td>
              </tr>
            ) : (
              classifications.map((entry) => (
                <tr key={entry.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {entry.accountCode}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {entry.accountName || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {classificationLabels[entry.classification] ?? entry.classification}
                  </td>
                  <td className="px-4 py-3">
                    <form action={deleteAccountClassificationAction}>
                      <input
                        type="hidden"
                        name="classificationId"
                        value={entry.id}
                      />
                      <input type="hidden" name="clientId" value={client.id} />
                      <button
                        type="submit"
                        className="text-xs font-semibold uppercase tracking-wide text-rose-600 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
