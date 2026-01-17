"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceType } from "@tally/db";
import {
  areColumnMapsEquivalent,
  detectColumnDrift,
  mappingFieldConfigs,
  normalizeColumnName,
  type ColumnMap,
  validateColumnMap
} from "@/lib/mapping-utils";

type TemplateOption = {
  id: string;
  name: string;
  version: number;
  status: string;
  clientId: string | null;
  sourceColumns: string[];
  columnMap: ColumnMap;
};

type MappingWizardProps = {
  importId: string;
  payRunId: string;
  sourceType: SourceType;
  defaultTemplateName: string;
  templates: TemplateOption[];
};

type PreviewResponse = {
  rows: string[][];
  sheetNames: string[];
  sheetName: string | null;
};

const formatNumber = (value: number) =>
  value.toLocaleString("en-GB", { maximumFractionDigits: 2 });

const parseNumber = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
};

export const MappingWizard = ({
  importId,
  payRunId,
  sourceType,
  defaultTemplateName,
  templates
}: MappingWizardProps) => {
  const router = useRouter();
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [columns, setColumns] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("new");
  const [templateName, setTemplateName] = useState(defaultTemplateName);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [createNewVersion, setCreateNewVersion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const templateOptions = useMemo(() => templates, [templates]);
  const selectedTemplate =
    selectedTemplateId === "new"
      ? null
      : templateOptions.find((template) => template.id === selectedTemplateId) ??
        null;

  const config = mappingFieldConfigs[sourceType];
  const groupRequiredFields = useMemo(() => {
    return new Set(
      (config.requiredGroups ?? []).flatMap((group) => group.fields)
    );
  }, [config.requiredGroups]);

  const columnsNormalized = useMemo(() => {
    return new Set(columns.map(normalizeColumnName).filter(Boolean));
  }, [columns]);

  const drift = useMemo(() => {
    if (!selectedTemplate || columns.length === 0) {
      return null;
    }
    return detectColumnDrift(selectedTemplate.sourceColumns, columns);
  }, [selectedTemplate, columns]);

  const mappingChanged = useMemo(() => {
    if (!selectedTemplate) {
      return false;
    }
    return !areColumnMapsEquivalent(columnMap, selectedTemplate.columnMap);
  }, [columnMap, selectedTemplate]);

  const autoNewVersion = Boolean(drift?.drifted || mappingChanged);

  useEffect(() => {
    if (autoNewVersion) {
      setCreateNewVersion(true);
    }
    if (!autoNewVersion && selectedTemplateId !== "new") {
      setCreateNewVersion(false);
    }
  }, [autoNewVersion, selectedTemplateId]);

  const validation = useMemo(() => {
    if (columns.length === 0) {
      return { valid: false, errors: ["Select a header row to load columns."] };
    }
    const baseValidation = validateColumnMap(sourceType, columnMap, columns);
    const errors = [...baseValidation.errors];
    if (selectedTemplateId === "new" && templateName.trim().length < 2) {
      errors.push("Template name is required.");
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }, [columns, columnMap, sourceType, selectedTemplateId, templateName]);

  const mappedFields = useMemo(() => {
    return config.fields.filter((field) => columnMap[field.key]);
  }, [config.fields, columnMap]);

  const previewDataRows = useMemo(() => {
    if (previewRows.length === 0) {
      return [];
    }
    return previewRows.slice(headerRowIndex + 1, headerRowIndex + 6);
  }, [previewRows, headerRowIndex]);

  const normalizedPreview = useMemo(() => {
    if (previewDataRows.length === 0 || columns.length === 0) {
      return [];
    }

    const indexByColumn = new Map<string, number>();
    columns.forEach((column, index) => {
      const normalized = normalizeColumnName(column);
      if (normalized) {
        indexByColumn.set(normalized, index);
      }
    });

    return previewDataRows.map((row) => {
      const output: Record<string, string> = {};
      for (const field of mappedFields) {
        const mappedColumn = columnMap[field.key];
        if (!mappedColumn) {
          output[field.key] = "";
          continue;
        }
        const columnIndex = indexByColumn.get(normalizeColumnName(mappedColumn));
        output[field.key] = columnIndex === undefined ? "" : row[columnIndex] ?? "";
      }
      return output;
    });
  }, [previewDataRows, columns, columnMap, mappedFields]);

  const numericTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const row of normalizedPreview) {
      for (const field of mappedFields) {
        if (field.kind !== "number") {
          continue;
        }
        const parsed = parseNumber(row[field.key]);
        if (parsed === null) {
          continue;
        }
        totals[field.key] = (totals[field.key] ?? 0) + parsed;
      }
    }
    return totals;
  }, [normalizedPreview, mappedFields]);

  const loadPreview = useCallback(async (nextSheetName?: string | null) => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId,
          sheetName: nextSheetName ?? null
        })
      });
      const data: PreviewResponse | { error: string } = await response.json();
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Preview failed.");
      }
      setPreviewRows(data.rows);
      setSheetNames(data.sheetNames);
      if (data.sheetName && data.sheetName !== nextSheetName) {
        setSheetName(data.sheetName);
      }
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "Preview failed."
      );
    } finally {
      setLoadingPreview(false);
    }
  }, [importId]);

  useEffect(() => {
    void loadPreview(sheetName);
  }, [sheetName, loadPreview]);

  useEffect(() => {
    const [firstTemplate] = templateOptions;
    if (firstTemplate) {
      setSelectedTemplateId(firstTemplate.id);
    }
  }, [templateOptions]);

  useEffect(() => {
    if (selectedTemplateId === "new") {
      setTemplateName(defaultTemplateName);
      setColumnMap({});
      setCreateNewVersion(false);
      return;
    }
    const selected =
      templateOptions.find((template) => template.id === selectedTemplateId) ?? null;
    if (selected) {
      setTemplateName(selected.name);
      setColumnMap(selected.columnMap ?? {});
    }
  }, [selectedTemplateId, templateOptions, defaultTemplateName]);

  useEffect(() => {
    if (previewRows.length === 0) {
      setColumns([]);
      return;
    }
    setHeaderRowIndex(0);
    setColumns(previewRows[0] ?? []);
  }, [previewRows]);

  useEffect(() => {
    if (previewRows.length === 0) {
      return;
    }
    const nextColumns = previewRows[headerRowIndex] ?? [];
    setColumns(nextColumns);
  }, [headerRowIndex, previewRows]);

  useEffect(() => {
    if (columns.length === 0) {
      return;
    }
    setColumnMap((current) => {
      const filtered: ColumnMap = {};
      for (const [key, value] of Object.entries(current)) {
        if (value && columnsNormalized.has(normalizeColumnName(value))) {
          filtered[key] = value;
        }
      }
      return filtered;
    });
  }, [columns, columnsNormalized]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId,
          templateId: selectedTemplateId === "new" ? undefined : selectedTemplateId,
          templateName: selectedTemplateId === "new" ? templateName : undefined,
          sourceColumns: columns,
          columnMap,
          headerRowIndex,
          sheetName,
          createNewVersion: selectedTemplateId === "new" ? undefined : createNewVersion,
          publish: true
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to save template.");
      }
      router.push(`/pay-runs/${payRunId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Template</h2>
        <p className="mt-2 text-sm text-slate">
          Choose an existing template or create a new one for this import.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate">
            Template
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm text-ink"
            >
              <option value="new">Create new template</option>
              {templateOptions.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · v{template.version}
                  {template.clientId ? "" : " · firm"}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplateId === "new" ? (
            <label className="text-sm text-slate">
              Template name
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
          ) : (
            <div className="rounded-lg border border-slate/20 bg-surface-muted p-3 text-xs text-slate">
              {selectedTemplate ? (
                <>
                  Using {selectedTemplate.name} v{selectedTemplate.version}.{" "}
                  {autoNewVersion
                    ? "Changes will create a new version."
                    : "Apply without changes to reuse the template."}
                </>
              ) : null}
            </div>
          )}
        </div>

        {drift?.drifted ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Template drift detected. Missing:{" "}
            {drift.missing.length === 0 ? "none" : drift.missing.join(", ")}. Added:{" "}
            {drift.added.length === 0 ? "none" : drift.added.join(", ")}.
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Header selection</h2>
            <p className="mt-1 text-sm text-slate">
              Select the worksheet and header row that contains column names.
            </p>
          </div>
          {loadingPreview ? (
            <span className="text-xs text-slate">Loading preview…</span>
          ) : null}
        </div>

        {previewError ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {previewError}
          </div>
        ) : null}

        {sheetNames.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate">
              Worksheet
              <select
                value={sheetName ?? ""}
                onChange={(event) =>
                  setSheetName(event.target.value || null)
                }
                className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm text-ink"
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {previewRows.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate">
              Header row
              <select
                value={headerRowIndex}
                onChange={(event) => setHeaderRowIndex(Number(event.target.value))}
                className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm text-ink"
              >
                {previewRows.slice(0, 5).map((row, index) => (
                  <option key={index} value={index}>
                    Row {index + 1} · {row.filter(Boolean).slice(0, 3).join(", ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <h2 className="text-sm font-semibold text-ink">Field mapping</h2>
        <p className="mt-2 text-sm text-slate">
          Map the required fields for this source. Columns are detected from the
          selected header row.
        </p>

        {columns.length === 0 ? (
          <div className="mt-4 rounded-lg border border-slate/20 bg-surface-muted px-4 py-3 text-xs text-slate">
            Select a header row to load columns.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {config.fields.map((field) => (
              <label key={field.key} className="text-sm text-slate">
                {field.label}
                {field.required || groupRequiredFields.has(field.key) ? (
                  <span className="ml-1 text-rose-500">*</span>
                ) : null}
                <select
                  value={columnMap[field.key] ?? ""}
                  onChange={(event) =>
                    setColumnMap((current) => ({
                      ...current,
                      [field.key]: event.target.value || null
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm text-ink"
                >
                  <option value="">Unmapped</option>
                  {columns.map((column, index) => (
                    <option key={`${column}-${index}`} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate/20 bg-surface">
        <div className="border-b border-slate/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Preview</h2>
          <p className="mt-1 text-xs text-slate">
            Normalized preview from the first few rows.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate/20 text-[10px] uppercase tracking-[0.2em] text-slate">
              <tr>
                {mappedFields.map((field) => (
                  <th key={field.key} className="px-4 py-3">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalizedPreview.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-6 text-xs text-slate"
                    colSpan={Math.max(mappedFields.length, 1)}
                  >
                    Map at least one column to see a preview.
                  </td>
                </tr>
              ) : (
                normalizedPreview.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate/10">
                    {mappedFields.map((field) => (
                      <td key={field.key} className="px-4 py-3 text-slate">
                        {row[field.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
              {normalizedPreview.length > 0 ? (
                <tr className="border-t border-slate/20 bg-surface-muted">
                  {mappedFields.map((field) => {
                    const total = numericTotals[field.key];
                    return (
                      <td key={field.key} className="px-4 py-3 text-xs text-slate">
                        {field.kind === "number" && total !== undefined
                          ? formatNumber(total)
                          : ""}
                      </td>
                    );
                  })}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {saveError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {saveError}
        </div>
      ) : null}

      {!validation.valid ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {validation.errors.join(" ")}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(`/pay-runs/${payRunId}`)}
          className="rounded-lg border border-slate/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate hover:border-slate/60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !validation.valid || columns.length === 0}
          className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save template"}
        </button>
      </div>
    </div>
  );
};
