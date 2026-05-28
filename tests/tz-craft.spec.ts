import { test, expect, type Page } from "@playwright/test";

/**
 * Covers the time-zone toggle, Monday-anchored week view, initial-scroll
 * positioning, and the block-aligns-with-gutter bug fix. The block-creation
 * test writes to whichever Supabase project `.env.local` points at and cleans
 * up after itself; orphan blocks from a failed teardown are titled
 * `pw-test-{epoch-ms}` and can be SQL-deleted (see TESTING.md).
 */

const PKT = "Asia/Karachi";
const PX_PER_MIN = 1.6;
const HOUR_PX = 96; // 60 * PX_PER_MIN

async function forceTz(page: Page, tz: string) {
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: "kairos-tz", value: tz, url: "http://localhost:3000" },
  ]);
}

test.describe("Kairos craft", () => {
  test.beforeEach(async ({ page }) => {
    await forceTz(page, PKT);
  });

  test("chip defaults to PKT and toolbar mirrors it", async ({ page }) => {
    await page.goto("/");
    const chip = page.locator(".tz-chip");
    await expect(chip).toHaveText("PKT");
    // The day-title's quiet TZ suffix should also say PKT.
    const tzSuffix = page.locator("header p span.num").last();
    await expect(tzSuffix).toHaveText("PKT");
  });

  test("clicking the chip cycles PKT → UTC → PKT and writes the cookie", async ({ page }) => {
    await page.goto("/");
    const chip = page.locator(".tz-chip");
    await expect(chip).toHaveText("PKT");

    await chip.click();
    await expect(chip).toHaveText("UTC");
    await expect(page.locator("header p span.num").last()).toHaveText("UTC");

    await chip.click();
    await expect(chip).toHaveText("PKT");

    const cookies = await page.context().cookies();
    const tz = cookies.find((c) => c.name === "kairos-tz");
    // Decode defensively so this passes whether the cookie went through
    // encodeURIComponent or not — only the semantic value matters.
    expect(tz?.value && decodeURIComponent(tz.value)).toBe("Asia/Karachi");
  });

  test("hour gutter is full 24 hours, '10' label sits at 960px", async ({ page }) => {
    await page.goto("/");
    const labels = page.locator(".hour-label");
    await expect(labels).toHaveCount(24);
    const ten = page.locator(".hour-label", { hasText: /^10$/ });
    const top = await ten.evaluate((el) => parseFloat(getComputedStyle(el).top));
    expect(Math.round(top)).toBe(10 * HOUR_PX);
  });

  test("week view shows seven Mon → Sun columns, today highlighted if in this week", async ({ page }) => {
    await page.goto("/?view=week");
    const headers = page.locator(".week-col-header");
    await expect(headers).toHaveCount(7);
    await expect(headers.first().locator(".week-col-day")).toHaveText("Mon");
    await expect(headers.last().locator(".week-col-day")).toHaveText("Sun");
    // At least one column should be today (this is always true since week
    // view defaults to the week containing today).
    const todayCol = page.locator('.week-col-header[data-today="true"]');
    await expect(todayCol).toHaveCount(1);
  });

  test("initial scroll on today places the now-line ~1 hour below the scroll top", async ({ page }) => {
    await page.goto("/");
    const nowLine = page.locator(".now-line");
    await expect(nowLine).toBeVisible();

    // Wait for the mount-scroll effect to settle.
    await page.waitForTimeout(150);

    const { scrollTop, nowTop } = await page.evaluate(() => {
      const scroller = document.querySelector(".scroll-area") as HTMLElement | null;
      const line = document.querySelector(".now-line") as HTMLElement | null;
      return {
        scrollTop: scroller?.scrollTop ?? -1,
        nowTop: line ? parseFloat(getComputedStyle(line).top) : -1,
      };
    });

    // 1 hour = 96px. Allow a small band for clamp behavior near 00:00 / 23:00.
    const offset = nowTop - scrollTop;
    expect(offset).toBeGreaterThan(60);
    expect(offset).toBeLessThan(140);
  });

  test("created block's CSS top equals its hour-label position (alignment bug fix)", async ({ page }) => {
    await page.goto("/");

    // Wait for hydration — the now-line is rendered by a useEffect on mount,
    // so its presence guarantees React has taken over from SSR.
    await expect(page.locator(".now-line")).toBeVisible();

    const title = `pw-test-${Date.now()}`;

    // Open the composer via the status-line's "next free" button — UI-level
    // interaction; more robust than the keyboard shortcut for a Playwright run.
    const nextFreeBtn = page.locator(".status-line button").first();
    await expect(nextFreeBtn).toBeVisible();
    await nextFreeBtn.click();

    const composer = page.locator(".composer");
    await expect(composer).toBeVisible();

    // Read the auto-filled start time so we can compute the expected top.
    const startInput = composer.locator(".composer-time-input").first();
    const startStr = await startInput.inputValue(); // "HH:MM"
    const [sh, sm] = startStr.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const expectedTopPx = Math.round(startMin * PX_PER_MIN);

    // Submit.
    await composer.locator(".composer-title").fill(title);
    await page.keyboard.press("Enter");

    // Wait for the saved block, then assert its CSS top.
    const block = page.locator(".block", { hasText: title });
    await expect(block).toBeVisible({ timeout: 8_000 });

    const blockTop = await block.evaluate((el) => Math.round(parseFloat(getComputedStyle(el).top)));
    expect(blockTop).toBe(expectedTopPx);

    // Sanity: the block's displayed start time also matches startStr.
    await expect(block.locator(".block-time")).toContainText(startStr);

    // Cleanup: hover to reveal the delete glyph, click it.
    await block.hover();
    await block.locator(".block-del").click();
    await expect(page.locator(".block", { hasText: title })).toHaveCount(0, { timeout: 8_000 });
  });
});
