import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import {
  assertStorageKeyMatches,
  createImport,
  isAllowedUpload
} from "@/lib/imports";
import { ValidationError, NotFoundError, ConflictError } from "@/lib/errors";
import { formatBytes, importValidationLimits } from "@/lib/import-validation";

const finalizeSchema = z.object({
  payRunId: z.string().uuid(),
  sourceType: z.enum(["REGISTER", "BANK", "GL", "STATUTORY"]),
  storageKey: z.string().min(1),
  fileHashSha256: z.string().min(32),
  originalFilename: z.string().min(1),
  mimeType: z.string().optional().default("application/octet-stream"),
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
  const parsed = finalizeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid finalize request.");
  }

  const {
    payRunId,
    sourceType,
    storageKey,
    fileHashSha256,
    originalFilename,
    mimeType,
    sizeBytes
  } = parsed.data;

  if (!isAllowedUpload(originalFilename, mimeType)) {
    return errorResponse(400, "Unsupported file type.");
  }

  if (sizeBytes > importValidationLimits.maxBytes) {
    return errorResponse(
      400,
      `File exceeds the ${formatBytes(importValidationLimits.maxBytes)} limit.`
    );
  }

  try {
    assertStorageKeyMatches(session.firmId, payRunId, storageKey);
    const result = await createImport(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      {
        payRunId,
        sourceType,
        storageKey,
        fileHashSha256,
        originalFilename,
        mimeType,
        sizeBytes
      }
    );

    return NextResponse.json({
      importId: result.importRecord.id,
      version: result.importRecord.version,
      duplicate: result.duplicate
    });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      return errorResponse(400, error.message);
    }
    throw error;
  }
};
