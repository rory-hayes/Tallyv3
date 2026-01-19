import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getPackDownloadUrl } from "@/lib/packs";

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
    return NextResponse.redirect(downloadUrl);
  } catch {
    return textError(500, "Unable to prepare pack download.");
  }
};
