import { NextResponse } from "next/server";
import { z } from "zod";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";
import {
  assertStorageKeyMatches,
  createImport,
  isAllowedUpload
} from "@/lib/imports";
import {
  ConflictError,
  ImportFileInvalidError,
  ImportParseError,
  NotFoundError,
  ValidationError
} from "@/lib/errors";
import {
  formatBytes,
  importValidationLimits,
  validateImportBufferForUpload
} from "@/lib/import-validation";
import { storageBucket, storageClient } from "@/lib/storage";

const finalizeSchema = z.object({
  payRunId: z.string().uuid(),
  sourceType: z.enum(["REGISTER", "BANK", "GL", "STATUTORY", "PENSION_SCHEDULE"]),
  storageKey: z.string().min(1),
  fileHashSha256: z.string().min(32),
  originalFilename: z.string().min(1),
  mimeType: z.string().optional().default("application/octet-stream"),
  sizeBytes: z.number().int().positive()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

const bodyToBuffer = async (body: unknown): Promise<Buffer> => {
  if (!body) {
    throw new ValidationError("File contents are unavailable.");
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  if (typeof (body as { pipe?: unknown }).pipe === "function") {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }
  throw new ValidationError("Unable to read the uploaded file.");
};

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

    let validationError: ImportFileInvalidError | ImportParseError | null = null;
    try {
      const object = await storageClient.send(
        new GetObjectCommand({
          Bucket: storageBucket,
          Key: storageKey
        })
      );
      const buffer = await bodyToBuffer(object.Body);
      validateImportBufferForUpload({
        buffer,
        fileName: originalFilename,
        mimeType,
        sizeBytes
      });
    } catch (error) {
      if (error instanceof ImportFileInvalidError || error instanceof ImportParseError) {
        validationError = error;
      } else {
        throw error;
      }
    }

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
        sizeBytes,
        parseStatus: validationError?.code ?? "UPLOADED",
        errorCode: validationError?.code ?? null,
        errorMessage: validationError?.message ?? null
      }
    );

    if (validationError) {
      return NextResponse.json(
        {
          error: validationError.message,
          importId: result.importRecord.id,
          status: result.importRecord.parseStatus
        },
        { status: 400 }
      );
    }

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
