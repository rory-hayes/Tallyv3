import { NextResponse } from "next/server";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { assertStorageKeyMatches, isAllowedUpload } from "@/lib/imports";
import { storageBucket, storageClient } from "@/lib/storage";
import { logServerError } from "@/lib/server-errors";
import { validateImportBuffer } from "@/lib/import-validation";
import { ValidationError } from "@/lib/errors";

const uploadSchema = z.object({
  payRunId: z.string().uuid(),
  sourceType: z.enum(["REGISTER", "BANK", "GL", "STATUTORY"]),
  storageKey: z.string().min(1),
  originalFilename: z.string().min(1),
  mimeType: z.string().optional().default("application/octet-stream")
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

  const formData = await request.formData();
  const file = formData.get("file");
  const parsed = uploadSchema.safeParse({
    payRunId: formData.get("payRunId"),
    sourceType: formData.get("sourceType"),
    storageKey: formData.get("storageKey"),
    originalFilename: formData.get("originalFilename"),
    mimeType: formData.get("mimeType")
  });

  if (!parsed.success || !(file instanceof File)) {
    return errorResponse(400, "Invalid upload request.");
  }

  const { payRunId, storageKey, originalFilename, mimeType } = parsed.data;

  if (!isAllowedUpload(originalFilename, mimeType)) {
    return errorResponse(400, "Unsupported file type.");
  }

  try {
    assertStorageKeyMatches(session.firmId, payRunId, storageKey);

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      validateImportBuffer({
        buffer,
        fileName: originalFilename,
        mimeType,
        sizeBytes: file.size
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return errorResponse(400, error.message);
      }
      throw error;
    }

    const command = new PutObjectCommand({
      Bucket: storageBucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType
    });

    await storageClient.send(command);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError({ scope: "import_upload" }, error);
    return errorResponse(500, "Upload failed.");
  }
};
