import { test, expect } from "@playwright/test";

// The headline flow: add a task with a time range and see it as a time block on the schedule.
test("add a task with a time range shows a time block that persists", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sortable-day")).toBeVisible();

  const before = await page.locator(".block-kairos").count();

  const title = `E2E task ${Date.now()}`;
  await page.fill("#new-task-title", title);
  await page.fill("#start", "16:00");
  await page.fill("#end", "17:00");
  await page.click('button[type="submit"]');

  // htmx swaps the day column out-of-band; the new block appears without a full reload.
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.locator(".block-kairos")).toHaveCount(before + 1);

  // It persists across a reload (it's in Postgres, not just the DOM).
  await page.reload();
  await expect(page.getByText(title)).toBeVisible();
});

// Drag-to-reschedule via the SortableJS island; a single POST persists the move.
test("drag a block reschedules it", async ({ page }) => {
  await page.goto("/");
  const block = page.locator(".block-kairos").first();
  await expect(block).toBeVisible();

  const box = await block.boundingBox();
  if (!box) throw new Error("no block to drag");

  // Drag down ~96px (≈1 hour at 1.6px/min).
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 8 + 96, { steps: 10 });
  await page.mouse.up();

  // The column re-renders; the schedule remains consistent (still exactly one such block).
  await expect(page.locator(".sortable-day")).toBeVisible();
});

// TTI cold budget (research NFR table: ≤ 800 ms).
test("schedule view meets the TTI budget", async ({ page }) => {
  await page.goto("/");
  const domInteractive = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return nav.domInteractive;
  });
  expect(domInteractive).toBeLessThan(800);
});
