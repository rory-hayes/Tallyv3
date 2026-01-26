import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { buildAuditCsv, getAuditExportRows } from "@/lib/audit-export";

const parseDate = (value: string | null, boundary: "start" | "end") => {
  if (!value) {
    return null;
  }
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const parsed = new Date(`${value}${suffix}`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export const GET = async (request: Request) => {
  const { session, user } = await requireUser();
  requirePermission(user.role, "audit:view");

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const clientId = url.searchParams.get("clientId");

  const from = parseDate(fromParam, "start");
  if (fromParam && !from) {
    return NextResponse.json({ error: "Invalid from date." }, { status: 400 });
  }
  const to = parseDate(toParam, "end");
  if (toParam && !to) {
    return NextResponse.json({ error: "Invalid to date." }, { status: 400 });
  }

  const rows = await getAuditExportRows({
    firmId: session.firmId,
    clientId: clientId && clientId.length > 0 ? clientId : null,
    from,
    to
  });

  const csv = buildAuditCsv(rows);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `audit-log-${timestamp}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
};
