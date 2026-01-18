import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { SettingsNav } from "@/components/SettingsNav";

const formatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});

export default async function AuditLogPage() {
  const { session, user } = await requireUser();
  requirePermission(user.role, "audit:view");

  const events = await prisma.auditEvent.findMany({
    where: {
      firmId: session.firmId
    },
    orderBy: {
      timestamp: "desc"
    },
    take: 50,
    include: {
      actorUser: {
        select: {
          email: true
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Audit log</h1>
        <p className="mt-2 text-sm text-slate">
          Sensitive actions across the workspace are recorded here.
        </p>
      </div>
      <SettingsNav />

      <div className="rounded-xl border border-slate/20 bg-surface p-5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate">
                <th className="pb-3">Time</th>
                <th className="pb-3">Action</th>
                <th className="pb-3">Entity</th>
                <th className="pb-3">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {events.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate" colSpan={4}>
                    No audit events yet.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td className="py-3 text-slate">
                      {formatter.format(event.timestamp)}
                    </td>
                    <td className="py-3 text-ink">{event.action}</td>
                    <td className="py-3 text-slate">
                      {event.entityType}
                      {event.entityId ? ` - ${event.entityId}` : ""}
                    </td>
                    <td className="py-3 text-slate">
                      {event.actorUser?.email ?? "System"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
