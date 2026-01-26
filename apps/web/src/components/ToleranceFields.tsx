import { toleranceDefinitions, type ToleranceSettings } from "@/lib/tolerances";

const formatCurrency = (cents: number) => (cents / 100).toFixed(2);

const formatPercent = (value: number) => {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
};

type ToleranceFieldsProps = {
  tolerances: ToleranceSettings;
  currencySymbol: string;
  disabled?: boolean;
};

export const ToleranceFields = ({
  tolerances,
  currencySymbol,
  disabled = false
}: ToleranceFieldsProps) => {
  return (
    <>
      {toleranceDefinitions.map((definition) => {
        const key = definition.key;
        if (definition.type === "amountPercent") {
          const value =
            key === "registerNetToBank"
              ? tolerances.registerNetToBank
              : key === "journalBalance"
                ? tolerances.journalBalance
                : key === "statutoryTotals"
                  ? tolerances.statutoryTotals
                  : tolerances.journalTieOut;
          return (
            <div key={definition.key} className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">{definition.label}</p>
                <p className="mt-1 text-xs text-slate">{definition.description}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate">
                  Absolute tolerance ({currencySymbol})
                  <input
                    name={`${definition.key}Absolute`}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={formatCurrency(value.absoluteCents)}
                    disabled={disabled}
                    className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate">
                  Percent tolerance (%)
                  <input
                    name={`${definition.key}Percent`}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={formatPercent(value.percent)}
                    disabled={disabled}
                    className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>
              </div>
            </div>
          );
        }

        return (
          <div key={definition.key} className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-ink">{definition.label}</p>
              <p className="mt-1 text-xs text-slate">{definition.description}</p>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate">
              Percent tolerance (%)
              <input
                name={definition.key}
                type="number"
                min="0"
                step="0.1"
                defaultValue={formatPercent(tolerances.bankCountMismatchPercent)}
                disabled={disabled}
                className="mt-2 w-full rounded-lg border border-slate/30 bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>
          </div>
        );
      })}
    </>
  );
};
