"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceType } from "@/lib/prisma";
import { sha256Hex } from "@/lib/hash";
import { resolveUploadStrategy } from "@/lib/upload-strategy";

type ImportUploaderProps = {
  payRunId: string;
  sourceType: SourceType;
  disabled?: boolean;
};

const sourceLabels: Record<SourceType, string> = {
  REGISTER: "Register",
  BANK: "Bank / Payments",
  GL: "GL Journal",
  STATUTORY: "Statutory Totals",
  PENSION_SCHEDULE: "Pension Schedule"
};

const toReadableSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const ImportUploader = ({ payRunId, sourceType, disabled }: ImportUploaderProps) => {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setStatus(null);
    setUploading(true);

    try {
      const mimeType = file.type || "application/octet-stream";
      const buffer = await file.arrayBuffer();
      const hash = await sha256Hex(buffer);

      const prepareResponse = await fetch("/api/imports/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payRunId,
          sourceType,
          originalFilename: file.name,
          mimeType,
          sizeBytes: file.size
        })
      });

      const prepareBody = await prepareResponse.json();
      if (!prepareResponse.ok) {
        throw new Error(prepareBody.error || "Unable to prepare upload.");
      }

      const strategy = resolveUploadStrategy({
        mode: process.env.NEXT_PUBLIC_UPLOAD_MODE,
        hasSignedUrl: Boolean(prepareBody.uploadUrl)
      });

      if (strategy === "direct") {
        const uploadResponse = await fetch(prepareBody.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType
          },
          body: file
        });

        if (!uploadResponse.ok) {
          throw new Error("Direct upload failed. Please retry.");
        }
      } else {
        const uploadForm = new FormData();
        uploadForm.append("file", file);
        uploadForm.append("payRunId", payRunId);
        uploadForm.append("sourceType", sourceType);
        uploadForm.append("storageKey", prepareBody.storageKey);
        uploadForm.append("originalFilename", file.name);
        uploadForm.append("mimeType", mimeType);

        const uploadResponse = await fetch("/api/imports/upload", {
          method: "POST",
          body: uploadForm
        });

        if (!uploadResponse.ok) {
          const uploadBody = await uploadResponse.json().catch(() => ({}));
          throw new Error(uploadBody.error || "Upload failed. Please try again.");
        }
      }

      const finalizeResponse = await fetch("/api/imports/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payRunId,
          sourceType,
          storageKey: prepareBody.storageKey,
          fileHashSha256: hash,
          originalFilename: file.name,
          mimeType,
          sizeBytes: file.size
        })
      });

      const finalizeBody = await finalizeResponse.json().catch(() => ({}));
      if (!finalizeResponse.ok) {
        if (finalizeBody.importId) {
          router.refresh();
        }
        throw new Error(finalizeBody.error || "Finalize failed.");
      }

      if (finalizeBody.duplicate) {
        setStatus(
          `Duplicate detected. Existing version ${finalizeBody.version} kept.`
        );
      } else {
        setStatus(
          `Uploaded ${sourceLabels[sourceType]} (${toReadableSize(file.size)}).`
        );
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm the file and retry.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">{sourceLabels[sourceType]}</p>
          <p className="text-xs text-slate">CSV or XLSX</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate transition hover:border-slate/60">
          <input
            type="file"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
              event.target.value = "";
            }}
          />
          {uploading ? "Uploading..." : "Upload"}
        </label>
      </div>
      {disabled ? (
        <p className="text-xs text-rose-600">Uploads are disabled for locked runs.</p>
      ) : null}
      {status ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
};
