import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Prisma } from "@/lib/prisma";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { applyMappingTemplate } from "@/lib/mapping-templates";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";

const applySchema = z.object({
  importId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  templateName: z.string().min(2).optional(),
  sourceColumns: z.array(z.string().min(1)),
  columnMap: z.record(z.string(), z.string().nullable().optional()),
  normalizationRules: z.record(z.string(), z.unknown()).optional().nullable(),
  headerRowIndex: z.number().int().nonnegative().optional(),
  sheetName: z.string().optional().nullable(),
  createNewVersion: z.boolean().optional(),
  publish: z.boolean().optional()
});

const errorResponse = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export const POST = async (request: Request) => {
  const { session, user } = await requireUser();

  try {
    requirePermission(user.role, "template:write");
  } catch (error) {
    if (error instanceof PermissionError) {
      return errorResponse(403, "Permission denied.");
    }
    throw error;
  }

  const body = await request.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid template request.");
  }

  try {
    const result = await applyMappingTemplate(
      {
        firmId: session.firmId,
        userId: session.userId,
        role: user.role
      },
      {
        ...parsed.data,
        normalizationRules: parsed.data.normalizationRules as Prisma.InputJsonValue | null
      }
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, error.message);
    }
    if (error instanceof ConflictError) {
      return errorResponse(409, error.message);
    }
    if (error instanceof NotFoundError) {
      return errorResponse(404, error.message);
    }
    throw error;
  }
};
