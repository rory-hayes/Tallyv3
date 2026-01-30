import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

type MappingInput = {
  label: RegExp;
  column: string;
};

const createUniqueId = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createFirm = async (page: Page) => {
  const id = createUniqueId();
  const email = `${id}@example.com`;
  const password = `StrongPass-${id}-1234`;

  await page.goto("/create-firm");
  await page.locator('input[name="firmName"]').fill(`Tally ${id}`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /Create workspace/i }).click();
  await page.waitForURL("**/dashboard");

  return { email, password };
};

const enableSelfApproval = async (page: Page) => {
  await page.goto("/settings/approvals");
  const checkbox = page.getByRole("checkbox", {
    name: /Allow self-approval/i
  });
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
  await page
    .getByRole("button", { name: /Save approval settings/i })
    .click();
  await page.waitForLoadState("networkidle");
};

const createClient = async (
  page: Page,
  name: string
) => {
  await page.goto("/clients/new");
  await page.locator('input[name="name"]').fill(name);
  await page
    .locator('select[name="payrollSystem"]')
    .selectOption({ label: "BrightPay" });
  await page
    .locator('select[name="payrollFrequency"]')
    .selectOption({ label: "Monthly" });
  await page.getByRole("button", { name: /Create client/i }).click();
  await page.waitForURL(/\/clients\//);
};

const createPayRun = async (
  page: Page,
  clientName: string,
  periodStart: string,
  periodEnd: string
) => {
  await page.goto("/pay-runs/new");
  await page.locator('select[name="clientId"]').selectOption({ label: clientName });
  await page.locator('input[name="periodStart"]').fill(periodStart);
  await page.locator('input[name="periodEnd"]').fill(periodEnd);
  await page.getByRole("button", { name: /Create pay run/i }).click();
  await page.waitForURL((url) => {
    return url.pathname.startsWith("/pay-runs/") && url.pathname !== "/pay-runs/new";
  });
  const url = new URL(page.url());
  return url.pathname.split("/")[2];
};

const getUploadCard = (page: Page, label: string) => {
  const labelLocator = page.getByText(label, { exact: true }).first();
  return labelLocator.locator(
    'xpath=ancestor::div[.//input[@type="file"]][1]'
  );
};

const uploadCsv = async (
  page: Page,
  label: string,
  fileName: string,
  content: string
) => {
  const card = getUploadCard(page, label);
  const fileInput = card.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: "text/csv",
    buffer: Buffer.from(content)
  });

  const uploadedPattern = new RegExp(
    `Uploaded ${escapeRegExp(label)}|Duplicate detected`,
    "i"
  );
  await expect(card.getByText(uploadedPattern)).toBeVisible({ timeout: 20000 });

  const mapLink = card.getByRole("link", { name: /Map columns/i });
  await expect(mapLink).toBeVisible({ timeout: 20000 });
  const href = await mapLink.getAttribute("href");
  if (!href) {
    throw new Error(`Missing mapping link for ${label}`);
  }
  const [, , importId] = href.split("/");
  return importId;
};

const parseImport = async (
  page: Page,
  importId: string
) => {
  const response = await page.request.post("/api/imports/preview", {
    data: { importId }
  });
  if (!response.ok()) {
    throw new Error(`Preview failed for ${importId}: ${await response.text()}`);
  }
};

const mapImport = async (
  page: Page,
  importId: string,
  mappings: MappingInput[]
) => {
  await page.goto(`/imports/${importId}/mapping`);
  await expect(page.getByRole("heading", { name: /Field mapping/i })).toBeVisible();

  for (const mapping of mappings) {
    await page.getByLabel(mapping.label).selectOption(mapping.column);
  }

  const saveButton = page.getByRole("button", { name: /Save template/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await page.waitForURL(/\/pay-runs\//);
};

test("happy path: upload, map, reconcile, resolve, approve, pack, lock", async ({
  page
}) => {
  await createFirm(page);
  await enableSelfApproval(page);

  const clientName = `Acme ${createUniqueId()}`;
  await createClient(page, clientName);

  const payRunId = await createPayRun(page, clientName, "2026-01-01", "2026-01-31");

  const registerCsv = "Employee,Net,Tax\nAlice,100,10\nBob,200,20\n";
  const bankCsv = "Payee,Amount\nAlice,100\nBob,150\n";
  const glCsv = "Account,Debit,Credit\nPayroll,300,0\nClearing,0,300\n";

  const registerId = await uploadCsv(
    page,
    "Register",
    "register.csv",
    registerCsv
  );
  const bankId = await uploadCsv(
    page,
    "Bank / Payments",
    "bank.csv",
    bankCsv
  );
  const glId = await uploadCsv(page, "GL Journal", "gl.csv", glCsv);

  await parseImport(page, registerId);
  await parseImport(page, bankId);
  await parseImport(page, glId);

  await mapImport(page, registerId, [
    { label: /Employee name/i, column: "Employee" },
    { label: /Net pay/i, column: "Net" },
    { label: /Tax \(PAYE\/USC\)/i, column: "Tax" }
  ]);

  await mapImport(page, bankId, [
    { label: /Payee name/i, column: "Payee" },
    { label: /Payment amount/i, column: "Amount" }
  ]);

  await mapImport(page, glId, [
    { label: /Account code\/name/i, column: "Account" },
    { label: /Debit amount/i, column: "Debit" },
    { label: /Credit amount/i, column: "Credit" }
  ]);

  await page.getByRole("button", { name: /Run reconciliation/i }).click();
  await expect(page.getByText(/Reconciliation completed/i)).toBeVisible({
    timeout: 30000
  });
  await expect(page.getByText(/exceptions created/i)).toBeVisible();

  await page.locator(`a[href="/pay-runs/${payRunId}/exceptions"]`).click();
  await page.waitForURL(`/pay-runs/${payRunId}/exceptions`);
  const viewLink = page.getByRole("link", { name: /^View$/i }).first();
  await expect(viewLink).toBeVisible({ timeout: 20000 });
  await viewLink.click();
  await page.waitForURL(/\/exceptions\//);
  await page
    .getByPlaceholder(/Add a short resolution note/i)
    .fill("Resolved for test run.");
  await page.getByRole("button", { name: /Resolve/i }).click();
  await expect(page.getByText(/Exception resolved/i)).toBeVisible();

  await page.getByRole("link", { name: /View pay run/i }).click();
  await page.waitForURL(`/pay-runs/${payRunId}`);

  await page.getByRole("button", { name: /Submit for review/i }).click();
  await expect(page.getByText(/Submitted for review/i)).toBeVisible();

  await expect(page.getByRole("button", { name: /Approve/i })).toBeVisible();
  await page.getByLabel(/No comment for approval/i).check();
  await page.getByRole("button", { name: /Approve/i }).click();
  await expect(page.getByText(/Pay run approved/i)).toBeVisible();

  const generateButton = page.getByRole("button", { name: /Generate pack/i });
  await expect(generateButton).toBeEnabled({ timeout: 20000 });
  await generateButton.click();
  await expect(page.getByText(/Pack generated/i)).toBeVisible({ timeout: 20000 });

  const lockButton = page.getByRole("button", { name: /Lock pack/i });
  await expect(lockButton).toBeEnabled({ timeout: 20000 });
  await lockButton.click();
  await expect(page.getByText(/Pack locked/i)).toBeVisible({ timeout: 20000 });

  await expect(
    page.getByText(/Uploads are disabled for locked runs/i).first()
  ).toBeVisible();
});

test("sad path: missing sources, invalid upload, mapping validation", async ({
  page
}) => {
  await createFirm(page);

  const clientName = `Bravo ${createUniqueId()}`;
  await createClient(page, clientName);

  await createPayRun(page, clientName, "2026-02-01", "2026-02-28");

  await expect(page.getByText(/Review gate not met/i)).toBeVisible();
  await expect(page.getByText(/Missing sources:/i)).toBeVisible();

  const registerCard = getUploadCard(page, "Register");
  await registerCard.locator('input[type="file"]').setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not csv")
  });
  await expect(registerCard.getByText(/Unsupported file type/i)).toBeVisible();

  const registerCsv = "Employee,Net\nAlice,100\n";
  const registerId = await uploadCsv(
    page,
    "Register",
    "register-missing-tax.csv",
    registerCsv
  );
  await parseImport(page, registerId);

  await page.goto(`/imports/${registerId}/mapping`);
  await page.getByLabel(/Employee name/i).selectOption("Employee");
  await page.getByLabel(/Net pay/i).selectOption("Net");
  await expect(page.getByText(/Missing required field: Tax/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save template/i })).toBeDisabled();
});
