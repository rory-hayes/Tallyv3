import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type PacksPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

const lockBadgeClasses = {
  locked: "bg-emerald-100 text-emerald-700",
  unlocked: "bg-amber-100 text-amber-700"
};

const parseDate = (value?: string, endOfDay = false) => {
  if (!value) {
    return null;
  }
  const suffix = endOfDay ? "T23:59:59Z" : "T00:00:00Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default async function PacksPage({ searchParams }: PacksPageProps) {
  const { session } = await requireUser();
  const clientId =
    typeof searchParams?.clientId === "string" ? searchParams.clientId : "";
  const locked =
    typeof searchParams?.locked === "string" ? searchParams.locked : "";
  const from = typeof searchParams?.from === "string" ? searchParams.from : "";
  const to = typeof searchParams?.to === "string" ? searchParams.to : "";

  const fromDate = parseDate(from);
  const toDate = parseDate(to, true);

  const payRunFilter = {
    ...(clientId ? { clientId } : {}),
    ...(fromDate ? { periodStart: { gte: fromDate } } : {}),
    ...(toDate ? { periodEnd: { lte: toDate } } : {})
  };

  const packs = await prisma.pack.findMany({
    where: {
      firmId: session.firmId,
      ...(Object.keys(payRunFilter).length > 0 ? { payRun: payRunFilter } : {}),
      ...(locked
        ? locked === "locked"
          ? { lockedAt: { not: null } }
          : { lockedAt: null }
        : {})
    },
    include: {
      payRun: {
        include: {
          client: true
        }
      }
    },
    orderBy: [{ generatedAt: "desc" }]
  });

  const clients = await prisma.client.findMany({
    where: { firmId: session.firmId },
    orderBy: { name: "asc" }
  });

  const packRows = packs.map((pack) => ({
    id: pack.id,
    clientName: pack.payRun.client.name,
    periodLabel: pack.payRun.periodLabel,
    packVersion: pack.packVersion,
    generatedAt: pack.generatedAt,
    lockedAt: pack.lockedAt,
    downloadUrl: `/packs/${pack.id}/download`
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Packs</h1>
        <p className="mt-2 text-sm text-slate">
          Download reconciliation packs by client and period.
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate/20 bg-surface p-4 md:grid-cols-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Client
          </label>
          <select
            name="clientId"
            defaultValue={clientId}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            Locked
          </label>
          <select
            name="locked"
            defaultValue={locked}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          >
            <option value="">All packs</option>
            <option value="locked">Locked only</option>
            <option value="unlocked">Unlocked only</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            From
          </label>
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate">
            To
          </label>
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-4">
          <button
            type="submit"
            className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate/20 text-xs uppercase tracking-[0.2em] text-slate">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Pack</th>
              <th className="px-4 py-3">Generated</th>
              <th className="px-4 py-3">Locked</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {packRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-slate">
                  No packs found for these filters.
                </td>
              </tr>
            ) : (
              packRows.map((pack) => (
                <tr key={pack.id} className="border-b border-slate/10">
                  <td className="px-4 py-3 font-semibold text-ink">
                    {pack.clientName}
                  </td>
                  <td className="px-4 py-3 text-slate">{pack.periodLabel}</td>
                  <td className="px-4 py-3 text-slate">v{pack.packVersion}</td>
                  <td className="px-4 py-3 text-slate">
                    {pack.generatedAt.toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {pack.lockedAt ? (
                      <div className="flex flex-col gap-1">
                        <span className={`${badgeBase} ${lockBadgeClasses.locked}`}>
                          Locked
                        </span>
                        <span className="text-xs text-slate">
                          {pack.lockedAt.toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </span>
                      </div>
                    ) : (
                      <span className={`${badgeBase} ${lockBadgeClasses.unlocked}`}>
                        Unlocked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={pack.downloadUrl}
                      className="text-xs font-semibold uppercase tracking-wide text-accent hover:text-accent-strong"
                    >
                      Download
                    </a>
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
