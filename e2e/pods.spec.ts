import { expect, test } from "@playwright/test";
import { addText, createPod, savedLabels, textboxes } from "./fixtures";

test("the buyer link shows the pod read-only and counts the view", async ({ page, browser }) => {
  const editorUrl = await createPod(page, { title: "Acme renewal", buyer: "Acme Inc." });
  await addText(page);
  await textboxes(page).first().fill("Everything for your renewal, in one place.");
  await expect(savedLabels(page)).toBeVisible();
  const shareHref = await page.getByRole("link", { name: "Open" }).getAttribute("href");
  expect(shareHref).toMatch(/^\/share\/[0-9a-f-]{36}$/);
  expect(shareHref).not.toContain(editorUrl.split("/").pop()); // never exposes the edit id

  // A buyer in a separate browser context, with no session of any kind.
  const buyer = await browser.newPage();
  await buyer.goto(shareHref!);
  await expect(buyer.getByText("Prepared for Acme Inc.")).toBeVisible();
  await expect(buyer.getByRole("heading", { name: "Acme renewal" })).toBeVisible();
  await expect(buyer.getByText("Everything for your renewal, in one place.")).toBeVisible();
  await expect(buyer.getByRole("textbox")).toHaveCount(0);
  await expect(buyer.getByRole("button")).toHaveCount(0);
  await expect(buyer.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await buyer.close();

  await expect
    .poll(async () => {
      await page.reload();
      return page.getByText(/1 view/).count();
    })
    .toBeGreaterThan(0);
});

test("the dashboard lists pods and supports duplicate and delete", async ({ page }) => {
  const title = `Template ${crypto.randomUUID().slice(0, 8)}`;
  await createPod(page, { title, buyer: "Globex" });
  await addText(page);
  await textboxes(page).first().fill("Reusable intro");
  await expect(savedLabels(page)).toBeVisible();

  await page.getByRole("link", { name: "← All pods" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toContainText("For Globex");
  await expect(row).toContainText("1 widget");

  await row.getByRole("button", { name: "Duplicate" }).click();
  await expect(page).toHaveURL(/\/pods\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Pod title" })).toHaveValue(`Copy of ${title}`);
  await expect(textboxes(page).first()).toHaveValue("Reusable intro");

  await page.getByRole("link", { name: "← All pods" }).click();
  const copyRow = page.getByRole("listitem").filter({ hasText: `Copy of ${title}` });
  await copyRow.getByRole("button", { name: "Delete" }).click();
  await copyRow.getByRole("button", { name: "Delete forever?" }).click();
  await expect(copyRow).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(1);
});

test("unknown pods and buyer links return a real 404", async ({ page }) => {
  for (const path of [
    `/pods/${crypto.randomUUID()}`,
    `/share/${crypto.randomUUID()}`,
    "/pods/nope",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});
