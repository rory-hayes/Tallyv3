import "server-only";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedDownloadUrl } from "@tally/storage";
import { prisma, type Pack, type PayRunStatus } from "@/lib/prisma";
import { storageBucket, storageClient } from "./storage";
import { recordAuditEvent } from "./audit";
import { NotFoundError, ValidationError } from "./errors";
import { assertPayRunTransition, type ActorRole } from "./pay-run-state";
import { startSpan, withRetry } from "./logger";

type ActorContext = {
  firmId: string;
  userId: string;
  role: ActorRole;
};

const buildPackStorageKey = (
  firmId: string,
  payRunId: string,
  packVersion: number
): string => {
  return `firm/${firmId}/pay-run/${payRunId}/pack/pack-v${packVersion}.pdf`;
};

const buildStorageUri = (key: string): string => `s3://${storageBucket}/${key}`;

const getStorageKeyFromUri = (uri: string): string => {
  const prefix = `s3://${storageBucket}/`;
  if (!uri.startsWith(prefix)) {
    throw new ValidationError("Invalid storage URI.");
  }
  return uri.slice(prefix.length);
};

const escapePdfText = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const parseRedactionSettings = (defaults: unknown) => {
  if (!defaults || typeof defaults !== "object") {
    return {
      maskEmployeeNames: false,
      maskBankDetails: false,
      maskNiNumbers: false
    };
  }

  const redaction = (defaults as { redaction?: Record<string, unknown> }).redaction;
  return {
    maskEmployeeNames: redaction?.maskEmployeeNames === true,
    maskBankDetails: redaction?.maskBankDetails === true,
    maskNiNumbers: redaction?.maskNiNumbers === true
  };
};

const maskTrailing = (value: string, visibleCount: number) => {
  if (value.length <= visibleCount) {
    return value;
  }
  return `${"*".repeat(value.length - visibleCount)}${value.slice(-visibleCount)}`;
};

const maskDigitsPreservingSeparators = (value: string, visibleCount: number) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= visibleCount) {
    return value;
  }
  const maskedDigits = `${"*".repeat(digits.length - visibleCount)}${digits.slice(
    -visibleCount
  )}`;
  let index = 0;
  return value.replace(/\d/g, () => maskedDigits[index++] ?? "");
};

const maskEmployeeNamesInText = (text: string) => {
  const namePart = "[A-Za-z'\\u2019-]*[a-z][A-Za-z'\\u2019-]*";
  const namePattern = new RegExp(
    `\\b(Employee|Payee|Name)(:)?\\s+(${namePart}(?:\\s+${namePart})+)\\b`,
    "g"
  );
  return text.replace(namePattern, (_match, label, colon, names) => {
    const maskedNames = String(names)
      .split(/\s+/)
      .map((part) => (part.length <= 1 ? part : `${part[0]}${"*".repeat(part.length - 1)}`))
      .join(" ");
    return `${label}${colon ?? ""} ${maskedNames}`;
  });
};

const maskBankDetailsInText = (text: string) => {
  const bankPattern = /\b(?:\d[ -]?){7,}\d\b/g;
  return text.replace(bankPattern, (match) =>
    maskDigitsPreservingSeparators(match, 4)
  );
};

const maskNiNumbersInText = (text: string) => {
  const niPattern = /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/gi;
  return text.replace(niPattern, (match) => maskTrailing(match, 2));
};

const applyRedactionToLine = (
  line: string,
  redaction: {
    maskEmployeeNames: boolean;
    maskBankDetails: boolean;
    maskNiNumbers: boolean;
  }
) => {
  let redacted = line;
  if (redaction.maskEmployeeNames) {
    redacted = maskEmployeeNamesInText(redacted);
  }
  if (redaction.maskBankDetails) {
    redacted = maskBankDetailsInText(redacted);
  }
  if (redaction.maskNiNumbers) {
    redacted = maskNiNumbersInText(redacted);
  }
  return redacted;
};

const buildPdfFromLines = (lines: string[]): Buffer => {
  const contentLines: string[] = ["BT", "/F1 12 Tf", "72 720 Td"];
  lines.forEach((line, index) => {
    if (index > 0) {
      contentLines.push("0 -16 Td");
    }
    contentLines.push(`(${escapePdfText(line)}) Tj`);
  });
  contentLines.push("ET");

  const content = contentLines.join("\n");
  const contentLength = Buffer.byteLength(content, "utf8");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${contentLength} >>\nstream\n${content}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  ];

  const header = "%PDF-1.4\n";
  let offset = Buffer.byteLength(header, "utf8");
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(offset);
    offset += Buffer.byteLength(object, "utf8");
  }

  const xrefOffset = offset;
  const xrefLines = [
    `xref`,
    `0 ${objects.length + 1}`,
    "0000000000 65535 f "
  ];
  offsets.slice(1).forEach((value) => {
    xrefLines.push(`${String(value).padStart(10, "0")} 00000 n `);
  });
  const xref = `${xrefLines.join("\n")}\n`;

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + objects.join("") + xref + trailer, "utf8");
};

const buildPackLines = ({
  clientName,
  periodLabel,
  revision,
  packVersion,
  runNumber,
  bundleId,
  bundleVersion,
  generatedAt,
  generatedByEmail,
  approvedByEmail,
  approvedAt,
  redaction,
  imports,
  checks,
  exceptions
}: {
  clientName: string;
  periodLabel: string;
  revision: number;
  packVersion: number;
  runNumber: number;
  bundleId: string;
  bundleVersion: string;
  generatedAt: Date;
  generatedByEmail: string;
  approvedByEmail?: string | null;
  approvedAt?: Date | null;
  redaction: {
    maskEmployeeNames: boolean;
    maskBankDetails: boolean;
    maskNiNumbers: boolean;
  };
  imports: Array<{
    sourceType: string;
    version: number;
    fileHashSha256: string;
    templateVersionId?: string | null;
  }>;
  checks: Array<{
    checkType: string;
    status: string;
    severity: string;
    deltaValue?: number | null;
  }>;
  exceptions: Array<{
    title: string;
    status: string;
    severity: string;
    evidence?: Array<{ rowNumbers: number[] }> | null;
  }>;
}): string[] => {
  const lines: string[] = [];
  lines.push("Tally Reconciliation Pack");
  lines.push(`Client: ${clientName}`);
  lines.push(`Period: ${periodLabel}`);
  lines.push(`Revision: ${revision}`);
  lines.push(`Pack version: v${packVersion}`);
  lines.push(`Reconciliation run: #${runNumber} (${bundleId} ${bundleVersion})`);
  lines.push(`Generated: ${generatedAt.toISOString()}`);
  lines.push(`Generated by: ${generatedByEmail}`);
  if (approvedByEmail) {
    lines.push(
      `Approved by: ${approvedByEmail} at ${
        approvedAt ? approvedAt.toISOString() : "unknown"
      }`
    );
  }
  lines.push(
    `Redaction: names ${redaction.maskEmployeeNames ? "masked" : "visible"}, bank ${
      redaction.maskBankDetails ? "masked" : "visible"
    }, NI ${redaction.maskNiNumbers ? "masked" : "visible"}`
  );
  lines.push("");
  lines.push("Imports:");
  if (imports.length === 0) {
    lines.push("- None");
  } else {
    imports.forEach((entry) => {
      const templateLabel = entry.templateVersionId ? "template applied" : "template missing";
      lines.push(
        `- ${entry.sourceType} v${entry.version} hash ${entry.fileHashSha256} (${templateLabel})`
      );
    });
  }
  lines.push("");
  lines.push("Checks:");
  if (checks.length === 0) {
    lines.push("- None");
  } else {
    checks.forEach((check) => {
      const deltaValue =
        typeof check.deltaValue === "number"
          ? ` delta ${check.deltaValue.toFixed(2)}`
          : "";
      lines.push(
        `- ${check.checkType} ${check.status} ${check.severity}${deltaValue}`
      );
    });
  }
  lines.push("");
  lines.push("Exceptions:");
  if (exceptions.length === 0) {
    lines.push("- None");
  } else {
    exceptions.forEach((exception) => {
      const evidenceRows =
        exception.evidence?.flatMap((entry) => entry.rowNumbers ?? []) ?? [];
      const evidenceText =
        evidenceRows.length > 0 ? ` rows ${evidenceRows.join(", ")}` : "";
      lines.push(
        `- ${exception.severity} ${exception.status} ${exception.title}${evidenceText}`
      );
    });
  }

  if (
    redaction.maskEmployeeNames ||
    redaction.maskBankDetails ||
    redaction.maskNiNumbers
  ) {
    return lines.map((line) => applyRedactionToLine(line, redaction));
  }

  return lines;
};

const ensurePackablePayRun = async (
  firmId: string,
  payRunId: string,
  expectedStatus: PayRunStatus
) => {
  const payRun = await prisma.payRun.findFirst({
    where: {
      id: payRunId,
      firmId
    },
    include: {
      client: true,
      firm: true
    }
  });

  if (!payRun) {
    throw new NotFoundError("Pay run not found.");
  }

  if (payRun.status !== expectedStatus) {
    throw new ValidationError(`Pay run must be ${expectedStatus.toLowerCase()}.`);
  }

  return payRun;
};

export const generatePack = async (context: ActorContext, payRunId: string) => {
  assertPayRunTransition("APPROVED", "PACKED", context.role);
  const payRun = await ensurePackablePayRun(context.firmId, payRunId, "APPROVED");

  const generatedByUser = await prisma.user.findFirst({
    where: {
      id: context.userId,
      firmId: context.firmId
    }
  });

  if (!generatedByUser) {
    throw new ValidationError("Generated by user not found.");
  }

  const run = await prisma.reconciliationRun.findFirst({
    where: {
      firmId: context.firmId,
      payRunId,
      supersededAt: null
    },
    include: {
      checkResults: true
    },
    orderBy: { runNumber: "desc" }
  });

  if (!run) {
    throw new ValidationError("Reconciliation run is required before packing.");
  }

  const latestPack = await prisma.pack.findFirst({
    where: {
      firmId: context.firmId,
      payRunId
    },
    orderBy: { packVersion: "desc" }
  });

  const packVersion = latestPack ? latestPack.packVersion + 1 : 1;
  const redaction = parseRedactionSettings(payRun.firm.defaults);
  const span = startSpan("PACK_GENERATION", {
    firmId: context.firmId,
    payRunId: payRun.id,
    packVersion
  });

  const approval = await prisma.approval.findFirst({
    where: {
      firmId: context.firmId,
      payRunId
    },
    include: {
      reviewerUser: true
    },
    orderBy: { createdAt: "desc" }
  });

  const importSummary = (run.inputSummary as {
    imports?: Record<string, { importId?: string }>;
  })?.imports;
  const importIds =
    importSummary && typeof importSummary === "object"
      ? Object.values(importSummary)
          .map((value) => value?.importId)
          .filter((value): value is string => Boolean(value))
      : [];

  const imports =
    importIds.length > 0
      ? await prisma.import.findMany({
          where: {
            firmId: context.firmId,
            id: { in: importIds }
          }
        })
      : await prisma.import.findMany({
          where: {
            firmId: context.firmId,
            payRunId
          },
          orderBy: [{ sourceType: "asc" }, { version: "desc" }]
        });

  const exceptions = await prisma.exception.findMany({
    where: {
      firmId: context.firmId,
      reconciliationRunId: run.id,
      supersededAt: null
    }
  });

  const checkSummaries = run.checkResults.map((check) => {
    const details = check.details as { deltaValue?: number };
    return {
      checkType: check.checkType,
      status: check.status,
      severity: check.severity,
      deltaValue: details?.deltaValue ?? null
    };
  });

  try {
    const packLines = buildPackLines({
      clientName: payRun.client.name,
      periodLabel: payRun.periodLabel,
      revision: payRun.revision,
      packVersion,
      runNumber: run.runNumber,
      bundleId: run.bundleId,
      bundleVersion: run.bundleVersion,
      generatedAt: new Date(),
      generatedByEmail: generatedByUser.email,
      approvedByEmail: approval?.reviewerUser.email ?? null,
      approvedAt: approval?.createdAt ?? null,
      redaction,
      imports: imports.map((entry) => ({
        sourceType: entry.sourceType,
        version: entry.version,
        fileHashSha256: entry.fileHashSha256,
        templateVersionId: entry.mappingTemplateVersionId
      })),
      checks: checkSummaries,
      exceptions: exceptions.map((exception) => ({
        title: exception.title,
        status: exception.status,
        severity: exception.severity,
        evidence: Array.isArray(exception.evidence)
          ? (exception.evidence as Array<{ rowNumbers: number[] }>)
          : null
      }))
    });

    const pdf = buildPdfFromLines(packLines);
    const storageKey = buildPackStorageKey(context.firmId, payRun.id, packVersion);
    const storageUriPdf = buildStorageUri(storageKey);
    const uploadContext = {
      firmId: context.firmId,
      payRunId: payRun.id,
      packVersion
    };

    await withRetry(
      () =>
        storageClient.send(
          new PutObjectCommand({
            Bucket: storageBucket,
            Key: storageKey,
            Body: pdf,
            ContentType: "application/pdf"
          })
        ),
      {
        event: "PACK_UPLOAD",
        context: uploadContext,
        attempts: 3,
        delayMs: 250
      }
    );

    const metadata = {
      runId: run.id,
      runNumber: run.runNumber,
      bundleId: run.bundleId,
      bundleVersion: run.bundleVersion,
      redaction,
      imports: imports.map((entry) => ({
        id: entry.id,
        sourceType: entry.sourceType,
        version: entry.version,
        fileHashSha256: entry.fileHashSha256,
        mappingTemplateVersionId: entry.mappingTemplateVersionId ?? null
      })),
      checks: run.checkResults.map((check) => ({
        checkType: check.checkType,
        checkVersion: check.checkVersion,
        status: check.status,
        severity: check.severity
      })),
      exceptionCount: exceptions.length,
      approvalId: approval?.id ?? null
    };

    const [pack] = await prisma.$transaction([
      prisma.pack.create({
        data: {
          firmId: context.firmId,
          payRunId: payRun.id,
          reconciliationRunId: run.id,
          packVersion,
          storageUriPdf,
          metadata,
          generatedByUserId: generatedByUser.id
        }
      }),
      prisma.payRun.update({
        where: { id: payRun.id },
        data: { status: "PACKED" }
      })
    ]);

    await recordAuditEvent(
      {
        action: "PACK_GENERATED",
        entityType: "PACK",
        entityId: pack.id,
        metadata: {
          payRunId: payRun.id,
          packVersion
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );

    await recordAuditEvent(
      {
        action: "PAY_RUN_STATE_CHANGED",
        entityType: "PAY_RUN",
        entityId: payRun.id,
        metadata: {
          from: payRun.status,
          to: "PACKED"
        }
      },
      {
        firmId: context.firmId,
        actorUserId: context.userId
      }
    );

    span.end({ packId: pack.id });
    return pack;
  } catch (error) {
    span.fail(error);
    throw error;
  }
};

export const lockPack = async (context: ActorContext, payRunId: string) => {
  assertPayRunTransition("PACKED", "LOCKED", context.role);
  const payRun = await ensurePackablePayRun(context.firmId, payRunId, "PACKED");

  const pack = await prisma.pack.findFirst({
    where: {
      firmId: context.firmId,
      payRunId
    },
    orderBy: { packVersion: "desc" }
  });

  if (!pack) {
    throw new NotFoundError("Pack not found.");
  }

  if (pack.lockedAt) {
    throw new ValidationError("Pack is already locked.");
  }

  const lockedAt = new Date();
  const [updatedPack] = await prisma.$transaction([
    prisma.pack.update({
      where: { id: pack.id },
      data: {
        lockedAt,
        lockedByUserId: context.userId
      }
    }),
    prisma.payRun.update({
      where: { id: payRun.id },
      data: { status: "LOCKED" }
    })
  ]);

  await recordAuditEvent(
    {
      action: "PACK_LOCKED",
      entityType: "PACK",
      entityId: updatedPack.id,
      metadata: {
        payRunId: payRun.id
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  await recordAuditEvent(
    {
      action: "PAY_RUN_STATE_CHANGED",
      entityType: "PAY_RUN",
      entityId: payRun.id,
      metadata: {
        from: payRun.status,
        to: "LOCKED"
      }
    },
    {
      firmId: context.firmId,
      actorUserId: context.userId
    }
  );

  return updatedPack;
};

export const getPackDownloadUrl = async (pack: Pack): Promise<string> => {
  const key = getStorageKeyFromUri(pack.storageUriPdf);
  return getSignedDownloadUrl(storageClient, storageBucket, { key });
};
