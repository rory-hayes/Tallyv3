import { describe, expect, it } from "vitest";
import { resolveTolerances } from "@/lib/tolerances";

describe("tolerances", () => {
  it("uses bundle defaults when no overrides exist", () => {
    const result = resolveTolerances({ region: "UK" });
    expect(result.registerNetToBank.absoluteCents).toBe(100);
    expect(result.registerNetToBank.percent).toBe(0.05);
    expect(result.bankCountMismatchPercent).toBe(5);
  });

  it("merges firm, client, and pay run overrides", () => {
    const result = resolveTolerances({
      region: "UK",
      firmDefaults: {
        tolerances: {
          registerNetToBank: { absoluteCents: 200, percent: 0.4 },
          bankCountMismatchPercent: 4
        }
      },
      clientSettings: {
        tolerances: {
          registerNetToBank: { percent: 0.2 }
        }
      },
      payRunSettings: {
        tolerances: {
          registerNetToBank: { absoluteCents: 50 },
          bankCountMismatchPercent: 1
        }
      }
    });

    expect(result.registerNetToBank.absoluteCents).toBe(50);
    expect(result.registerNetToBank.percent).toBe(0.2);
    expect(result.bankCountMismatchPercent).toBe(1);
  });

  it("ignores invalid overrides and clamps negative values", () => {
    const result = resolveTolerances({
      region: "UK",
      firmDefaults: "invalid",
      clientSettings: {
        tolerances: {
          registerNetToBank: { absoluteCents: "bad" as unknown as number },
          bankCountMismatchPercent: -2
        }
      },
      payRunSettings: {
        tolerances: "invalid"
      }
    });

    expect(result.registerNetToBank.absoluteCents).toBe(100);
    expect(result.registerNetToBank.percent).toBe(0.05);
    expect(result.bankCountMismatchPercent).toBe(0);
  });

  it("applies additional override buckets", () => {
    const result = resolveTolerances({
      region: "UK",
      clientSettings: {
        tolerances: {
          journalBalance: { absoluteCents: 250 },
          statutoryTotals: { percent: 0.3 },
          journalTieOut: { absoluteCents: 150, percent: 0.2 }
        }
      }
    });

    expect(result.journalBalance.absoluteCents).toBe(250);
    expect(result.statutoryTotals.percent).toBe(0.3);
    expect(result.journalTieOut.absoluteCents).toBe(150);
  });
});
