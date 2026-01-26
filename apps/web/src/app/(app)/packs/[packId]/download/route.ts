import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { getPackDownloadUrl } from "@/lib/packs";
import { logServerError } from "@/lib/server-errors";

type PackDownloadRouteProps = {
  params: { packId: string };
};

const textError = (status: number, message: string) =>
  new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });

export const GET = async (
  _request: Request,
  { params }: PackDownloadRouteProps
) => {
  const { session, user } = await requireUser();

  try {
    requirePermission(user.role, "pack:download");
  } catch (error) {
    if (error instanceof PermissionError) {
      return textError(403, "Permission denied.");
    }
    throw error;
  }

  const pack = await prisma.pack.findFirst({
    where: {
      id: params.packId,
      firmId: session.firmId
    }
  });

  if (!pack) {
    return textError(404, "Pack not found.");
  }

  try {
    const downloadUrl = await getPackDownloadUrl(pack);
    await recordAuditEvent(
      {
        action: "PACK_DOWNLOADED",
        entityType: "PACK",
        entityId: pack.id,
        metadata: {
          payRunId: pack.payRunId
        }
      },
      {
        firmId: session.firmId,
        actorUserId: session.userId
      }
    );
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    logServerError({ scope: "pack_download" }, error);
    await recordAuditEvent(
      {
        action: "PACK_DOWNLOAD_FAILED",
        entityType: "PACK",
        entityId: pack.id,
        metadata: {
          payRunId: pack.payRunId,
          errorName: error instanceof Error ? error.name : "UnknownError"
        }
      },
      {
        firmId: session.firmId,
        actorUserId: session.userId
      }
    );
    return textError(500, "Unable to prepare pack download.");
  }
};
