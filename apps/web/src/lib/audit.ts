import "server-only";
import {
  prisma,
  type AuditAction,
  type AuditEntityType
} from "@tally/db";
import { sanitizeAuditMetadata, type AuditMetadata } from "./audit-metadata";

type AuditEventInput = {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  metadata?: AuditMetadata;
};

type AuditContext = {
  firmId: string;
  actorUserId?: string | null;
};

export const recordAuditEvent = async (
  input: AuditEventInput,
  context: AuditContext
) => {
  const metadata = sanitizeAuditMetadata(input.metadata);

  return prisma.auditEvent.create({
    data: {
      firmId: context.firmId,
      actorUserId: context.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: metadata ?? undefined
    }
  });
};
