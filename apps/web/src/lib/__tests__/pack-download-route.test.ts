import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser } = vi.hoisted(() => ({
  requireUser: vi.fn()
}));

const { requirePermission } = vi.hoisted(() => ({
  requirePermission: vi.fn()
}));

const { getPackDownloadUrl } = vi.hoisted(() => ({
  getPackDownloadUrl: vi.fn()
}));

const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>(
    "@/lib/permissions"
  );
  return { ...actual, requirePermission };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pack: {
      findFirst
    }
  }
}));
vi.mock("@/lib/packs", () => ({ getPackDownloadUrl }));

import { PermissionError } from "@/lib/permissions";
import { GET } from "@/app/(app)/packs/[packId]/download/route";

describe("pack download route", () => {
  beforeEach(() => {
    requireUser.mockResolvedValue({
      session: { firmId: "firm-1", userId: "user-1" },
      user: { id: "user-1", firmId: "firm-1", role: "ADMIN" }
    });
    requirePermission.mockReset();
    getPackDownloadUrl.mockReset();
    findFirst.mockReset();
  });

  it("denies access when permission check fails", async () => {
    requirePermission.mockImplementation(() => {
      throw new PermissionError();
    });

    const response = await GET(new Request("http://localhost"), {
      params: { packId: "pack-1" }
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Permission denied.");
    expect(findFirst).not.toHaveBeenCalled();
    expect(getPackDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns 404 when the pack is outside the firm scope", async () => {
    requirePermission.mockReturnValue(undefined);
    findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: { packId: "pack-2" }
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Pack not found.");
  });

  it("returns 404 when the pack exists in another firm", async () => {
    requirePermission.mockReturnValue(undefined);
    const otherFirmPack = { id: "pack-5", firmId: "firm-2" };
    findFirst.mockImplementation(async (args: { where: { firmId: string } }) => {
      return args.where.firmId === otherFirmPack.firmId ? otherFirmPack : null;
    });

    const response = await GET(new Request("http://localhost"), {
      params: { packId: otherFirmPack.id }
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Pack not found.");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ firmId: "firm-1", id: otherFirmPack.id })
      })
    );
  });

  it("redirects to a signed download URL when the pack is found", async () => {
    requirePermission.mockReturnValue(undefined);
    findFirst.mockResolvedValue({ id: "pack-3", firmId: "firm-1" });
    getPackDownloadUrl.mockResolvedValue("https://files.example.com/pack.pdf");

    const response = await GET(new Request("http://localhost"), {
      params: { packId: "pack-3" }
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://files.example.com/pack.pdf"
    );
  });

  it("returns 500 when the download URL cannot be generated", async () => {
    requirePermission.mockReturnValue(undefined);
    findFirst.mockResolvedValue({ id: "pack-4", firmId: "firm-1" });
    getPackDownloadUrl.mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost"), {
      params: { packId: "pack-4" }
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Unable to prepare pack download.");
  });
});
