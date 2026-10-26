import { expect, test } from "@playwright/test";
import {
  addImage,
  addText,
  createPod,
  savedLabels,
  solidPng,
  textboxes,
  widgets,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await createPod(page);
});

test("widgets and their independent text survive a page refresh", async ({ page }) => {
  await addText(page);
  await textboxes(page).nth(0).fill("Welcome to your pod");
  await addText(page);
  await textboxes(page).nth(1).fill("Pricing details go here");

  await expect(savedLabels(page)).toHaveCount(2);
  await page.reload();

  await expect(textboxes(page)).toHaveCount(2);
  await expect(textboxes(page).nth(0)).toHaveValue("Welcome to your pod");
  await expect(textboxes(page).nth(1)).toHaveValue("Pricing details go here");
});

test("refreshing immediately after typing does not lose text", async ({ page }) => {
  await addText(page);
  await expect(textboxes(page)).toHaveCount(1);
  await textboxes(page).first().pressSequentially("typed then refreshed");

  await page.reload(); // well inside the 800ms autosave debounce

  await expect(textboxes(page).first()).toHaveValue("typed then refreshed");
});

test("stores large text (1,000+ characters)", async ({ page }) => {
  const large = "Trumpet pods are digital sales rooms. ".repeat(30); // 1,140 chars
  await addText(page);
  await textboxes(page).first().fill(large);
  await expect(page.getByText("1,140 / 10,000")).toBeVisible();
  await expect(savedLabels(page)).toBeVisible();

  await page.reload();
  await expect(textboxes(page).first()).toHaveValue(large);
});

test("deletes a widget, supports undo, and persists the delete", async ({ page }) => {
  await addText(page);
  await textboxes(page).first().fill("keep");
  await addText(page);
  await textboxes(page).nth(1).fill("remove");
  await expect(savedLabels(page)).toHaveCount(2);

  const deleteSecond = () =>
    widgets(page).nth(1).getByRole("button", { name: "Delete widget" }).click();

  await deleteSecond();
  await expect(widgets(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(textboxes(page).nth(1)).toHaveValue("remove");

  await deleteSecond();
  await expect(page.getByRole("button", { name: "Undo" })).toBeHidden({ timeout: 10_000 });
  await page.reload();
  await expect(textboxes(page)).toHaveCount(1);
  await expect(textboxes(page).first()).toHaveValue("keep");
});

test("uploads an image, describes it, and keeps it after refresh", async ({ page }) => {
  await addImage(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "banner.png",
    mimeType: "image/png",
    buffer: solidPng(),
  });

  const image = widgets(page).locator("img");
  await expect(image).toHaveAttribute("src", /\/api\/images\/[0-9a-f-]{36}$/);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(64);

  await page.getByRole("textbox", { name: "Alt text" }).fill("Brand banner");
  await expect(savedLabels(page)).toBeVisible();
  await page.reload();

  await expect(page.getByRole("img", { name: "Brand banner" })).toBeVisible();
});

test("rejects files that are not images", async ({ page }) => {
  await addImage(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(widgets(page).getByRole("alert")).toContainText("PNG, JPEG, GIF or WebP");
});

test("reorders widgets by dragging and by keyboard, and the order persists", async ({ page }) => {
  for (const text of ["First", "Second", "Third"]) {
    await addText(page);
    await textboxes(page).last().fill(text);
  }
  await expect(savedLabels(page)).toHaveCount(3);
  const order = () =>
    textboxes(page).evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

  // Pointer drag: "Third" onto the top of the list.
  const handle = page.getByRole("button", { name: "Drag to reorder text widget" }).nth(2);
  const target = widgets(page).first();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect.poll(order).toEqual(["Third", "First", "Second"]);
  // dnd-kit swallows clicks for 50ms after a drop (so the drop is not also a
  // click). A person cannot click that fast; Playwright can, so pause briefly.
  await page.waitForTimeout(100);

  // Keyboard-friendly alternative: move "Second" up with its move button.
  await widgets(page).nth(2).getByRole("button", { name: "Move widget up" }).click();
  await expect.poll(order).toEqual(["Third", "Second", "First"]);

  // The new order is persisted (position saves are asynchronous, so poll).
  await expect
    .poll(async () => {
      await page.reload();
      await expect(textboxes(page)).toHaveCount(3);
      return order();
    })
    .toEqual(["Third", "Second", "First"]);
});

test("previews the pod as a buyer would see it", async ({ page }) => {
  await addText(page);
  await textboxes(page).first().fill("Hi Acme team, here is everything in one place.");
  await addText(page); // left empty on purpose

  await page.getByRole("button", { name: "Preview as buyer" }).click();

  const preview = page.getByLabel("Pod content");
  await expect(preview.getByText("Hi Acme team, here is everything in one place.")).toBeVisible();
  await expect(textboxes(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete widget" })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(textboxes(page)).toHaveCount(2);
});
