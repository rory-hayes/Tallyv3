import { NextResponse } from "next/server";
import { z } from "zod";
import { getSignedUploadUrl } from "@tally/storage";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { buildStorageKey, isAllowedUpload } from "@/lib/imports";
import { storageBucket, storageClient } from "@/lib/storage";
import { prisma } from "@tally/db";

const prepareSchema = z.object({
  payRunId: z.string().uuid(),
  sourceType: z.enum(["REGISTER", "BANK", "GL", "STATUTORY"]),
  originalFilename: z.string().min(1),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().positive()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();

  try {
    requirePermission(user.role, "import:upload");
  } catch (error) {
    if (error instanceof PermissionError) {
      return errorResponse(403, "Permission denied.");
    }
    throw error;
  }

  const body = await request.json();
  const parsed = prepareSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid upload request.");
  }

  const { payRunId, sourceType, originalFilename, mimeType } = parsed.data;

  if (!isAllowedUpload(originalFilename, mimeType)) {
    return errorResponse(400, "Unsupported file type.");
  }

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: session.firmId
    }
  });

  if (!payRun) {
    return errorResponse(404, "Pay run not found.");
  }

  if (payRun.status === "LOCKED" || payRun.status === "ARCHIVED") {
    return errorResponse(400, "Locked pay runs cannot accept new imports.");
  }

  const storageKey = buildStorageKey(
    session.firmId,
    payRunId,
    sourceType,
    originalFilename
  );

  const uploadUrl = await getSignedUploadUrl(storageClient, storageBucket, {
    key: storageKey,
    contentType: mimeType
  });

  return NextResponse.json({ uploadUrl, storageKey });
};
