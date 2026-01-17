import "server-only";

import {
  prisma,
  type MappingTemplateStatus,
  type SourceType
} from "@tally/db";
import { recordAuditEvent } from "./audit";
import { NotFoundError, ValidationError } from "./errors";
import { transitionPayRunStatus } from "./pay-runs";
import {
  detectColumnDrift,
  areColumnMapsEquivalent,
  mappingFieldConfigs,
  type ColumnMap,
  validateColumnMap
} from "./mapping-utils";

type ActorContext = {
  firmId: string;
  userId: string;
  role: "ADMIN" | "PREPARER" | "REVIEWER";
};

export type ApplyTemplateInput = {
  importId: string;
  templateId?: string;
  templateName?: string;
  sourceColumns: string[];
  columnMap: ColumnMap;
  headerRowIndex?: number;
  sheetName?: string | null;
  createNewVersion?: boolean;
  publish?: boolean;
};

const requiredSources: SourceType[] = ["REGISTER", "BANK", "GL"];

const ensureImportForMapping = async (firmId: string, importId: string) => {
  const importRecord = await prisma.import.findFirst({
    where: {
      id: importId,
      firmId
    },
    include: {
      payRun: true,
      client: true
    }
  });

  if (!importRecord) {
    throw new NotFoundError("Import not found.");
  }

  if (importRecord.payRun.status === "LOCKED" || importRecord.payRun.status === "ARCHIVED") {
    throw new ValidationError("Locked pay runs cannot accept template changes.");
  }

  return importRecord;
};

const sanitizeSourceColumns = (columns: string[]) =>
  Array.from(
    new Set(
      columns
        .map((column) => column.trim())
        .filter(Boolean)
    )
  );

const sanitizeColumnMap = (sourceType: SourceType, columnMap: ColumnMap) => {
  const allowedKeys = mappingFieldConfigs[sourceType].fields.map((field) => field.key);
  const sanitized: ColumnMap = {};
  for (const key of allowedKeys) {
    const value = columnMap[key];
    if (value) {
      sanitized[key] = value.trim();
    }
  }
  return sanitized;
};

const createTemplate = async ({
  firmId,
  clientId,
  sourceType,
  templateName,
  columnMap,
  sourceColumns,
  headerRowIndex,
  sheetName,
  createdByUserId,
  status,
  baseTemplate
}: {
  firmId: string;
  clientId: string;
  sourceType: SourceType;
  templateName: string;
  columnMap: ColumnMap;
  sourceColumns: string[];
  headerRowIndex?: number;
  sheetName?: string | null;
  createdByUserId: string;
  status: MappingTemplateStatus;
  baseTemplate?: Awaited<ReturnType<typeof prisma.mappingTemplate.findFirst>> | null;
}) => {
  const latest = await prisma.mappingTemplate.findFirst({
    where: {
      firmId,
      clientId,
      sourceType,
      name: templateName
    },
    orderBy: { version: "desc" }
  });

  const nextVersion = latest ? latest.version + 1 : 1;

  const result = await prisma.$transaction(async (tx) => {
    if (
      status === "ACTIVE" &&
      baseTemplate &&
      baseTemplate.status === "ACTIVE" &&
      baseTemplate.clientId === clientId
    ) {
      await tx.mappingTemplate.update({
        where: { id: baseTemplate.id },
        data: { status: "DEPRECATED" }
      });
    }

    return tx.mappingTemplate.create({
      data: {
        firmId,
        clientId,
        sourceType,
        name: templateName,
        version: nextVersion,
        status,
        sourceColumns,
        columnMap,
        headerRowIndex,
        sheetName: sheetName ?? null,
        createdByUserId
      }
    });
  });

  const action = latest ? "TEMPLATE_VERSION_CREATED" : "TEMPLATE_CREATED";
  const baseTemplateId = baseTemplate?.id ?? latest?.id;
  await recordAuditEvent(
    {
      action,
      entityType: "TEMPLATE",
      entityId: result.id,
      metadata: {
        sourceType,
        version: result.version,
        clientId,
        baseTemplateId
      }
    },
    {
      firmId,
      actorUserId: createdByUserId
    }
  );

  if (status === "ACTIVE") {
    await recordAuditEvent(
      {
        action: "TEMPLATE_PUBLISHED",
        entityType: "TEMPLATE",
        entityId: result.id,
        metadata: {
          sourceType,
          version: result.version,
          clientId
        }
      },
      {
        firmId,
        actorUserId: createdByUserId
      }
    );
  }

  return result;
};

const maybeTransitionToMapped = async (context: ActorContext, payRunId: string) => {
  if (context.role === "REVIEWER") {
    return;
  }

  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId: context.firmId
    }
  });

  if (!payRun || payRun.status !== "IMPORTED") {
    return;
  }

  const imports = await prisma.import.findMany({
    where: {
      payRunId,
      firmId: context.firmId,
      sourceType: { in: requiredSources }
    },
    orderBy: [{ sourceType: "asc" }, { version: "desc" }]
  });

  const latestBySource = new Map<SourceType, typeof imports[number]>();
  for (const entry of imports) {
    if (!latestBySource.has(entry.sourceType)) {
      latestBySource.set(entry.sourceType, entry);
    }
  }

  const allMapped = requiredSources.every((source) => {
    const latest = latestBySource.get(source);
    return latest && latest.mappingTemplateVersionId;
  });

  if (allMapped) {
    await transitionPayRunStatus(
      {
        firmId: context.firmId,
        userId: context.userId,
        role: context.role
      },
      payRunId,
      "MAPPED"
    );
  }
};

export const applyMappingTemplate = async (
  context: ActorContext,
  input: ApplyTemplateInput
) => {
  const importRecord = await ensureImportForMapping(context.firmId, input.importId);
  const sourceColumns = sanitizeSourceColumns(input.sourceColumns);
  const columnMap = sanitizeColumnMap(importRecord.sourceType, input.columnMap);

  const validation = validateColumnMap(importRecord.sourceType, columnMap, sourceColumns);
  if (!validation.valid) {
    throw new ValidationError(validation.errors.join(" "));
  }

  const publish = input.publish ?? true;

  if (input.templateId) {
    const template = await prisma.mappingTemplate.findFirst({
      where: {
        id: input.templateId,
        firmId: context.firmId
      }
    });

    if (!template) {
      throw new NotFoundError("Template not found.");
    }

    if (template.clientId && template.clientId !== importRecord.clientId) {
      throw new NotFoundError("Template not available for this client.");
    }

    const drift = detectColumnDrift(
      template.sourceColumns as string[],
      sourceColumns
    );
    const mappingChanged = !areColumnMapsEquivalent(
      columnMap,
      template.columnMap as ColumnMap
    );

    if ((drift.drifted || mappingChanged) && !input.createNewVersion) {
      throw new ValidationError(
        "Template drift detected. Create a new version to continue."
      );
    }

    if (!drift.drifted && !mappingChanged && !input.createNewVersion) {
      await prisma.import.update({
        where: { id: importRecord.id },
        data: { mappingTemplateVersionId: template.id }
      });
      await maybeTransitionToMapped(context, importRecord.payRunId);
      return {
        templateId: template.id,
        version: template.version,
        appliedExisting: true,
        drift
      };
    }

    const created = await createTemplate({
      firmId: context.firmId,
      clientId: importRecord.clientId,
      sourceType: importRecord.sourceType,
      templateName: template.name,
      columnMap,
      sourceColumns,
      headerRowIndex: input.headerRowIndex,
      sheetName: input.sheetName,
      createdByUserId: context.userId,
      status: publish ? "ACTIVE" : "DRAFT",
      baseTemplate: template
    });

    await prisma.import.update({
      where: { id: importRecord.id },
      data: { mappingTemplateVersionId: created.id }
    });

    await maybeTransitionToMapped(context, importRecord.payRunId);
    return {
      templateId: created.id,
      version: created.version,
      appliedExisting: false,
      drift
    };
  }

  if (!input.templateName) {
    throw new ValidationError("Template name is required.");
  }

  const created = await createTemplate({
    firmId: context.firmId,
    clientId: importRecord.clientId,
    sourceType: importRecord.sourceType,
    templateName: input.templateName,
    columnMap,
    sourceColumns,
    headerRowIndex: input.headerRowIndex,
    sheetName: input.sheetName,
    createdByUserId: context.userId,
    status: publish ? "ACTIVE" : "DRAFT"
  });

  await prisma.import.update({
    where: { id: importRecord.id },
    data: { mappingTemplateVersionId: created.id }
  });

  await maybeTransitionToMapped(context, importRecord.payRunId);
  return {
    templateId: created.id,
    version: created.version,
    appliedExisting: false,
    drift: { drifted: false, missing: [], added: [] }
  };
};

export const updateTemplateStatus = async (
  context: ActorContext,
  templateId: string,
  status: MappingTemplateStatus
) => {
  const template = await prisma.mappingTemplate.findFirst({
    where: {
      id: templateId,
      firmId: context.firmId
    }
  });

  if (!template) {
    throw new NotFoundError("Template not found.");
  }

  if (template.status === status) {
    return template;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (status === "ACTIVE") {
      await tx.mappingTemplate.updateMany({
        where: {
          firmId: context.firmId,
          clientId: template.clientId,
          sourceType: template.sourceType,
          name: template.name,
          status: "ACTIVE",
          NOT: { id: template.id }
        },
        data: { status: "DEPRECATED" }
      });
    }

    return tx.mappingTemplate.update({
      where: { id: template.id },
      data: { status }
    });
  });

  if (status === "ACTIVE") {
    await recordAuditEvent(
      {
        action: "TEMPLATE_PUBLISHED",
        entityType: "TEMPLATE",
        entityId: updated.id,
        metadata: {
          sourceType: updated.sourceType,
          version: updated.version,
          clientId: updated.clientId
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );
  }

  if (status === "DEPRECATED") {
    await recordAuditEvent(
      {
        action: "TEMPLATE_DEPRECATED",
        entityType: "TEMPLATE",
        entityId: updated.id,
        metadata: {
          sourceType: updated.sourceType,
          version: updated.version,
          clientId: updated.clientId
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );
  }

  return updated;
};
