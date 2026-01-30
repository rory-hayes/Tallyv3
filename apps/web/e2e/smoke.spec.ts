import { expect, test } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Sign in" })
  ).toBeVisible();

  await expect(page.locator("input[name=\"email\"]")).toBeVisible();
  await expect(page.locator("input[name=\"password\"]")).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Create a workspace" })
  ).toBeVisible();
});
