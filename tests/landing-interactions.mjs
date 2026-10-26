// Optional browser suite; run against a local Next server. This suite is not run by the managed preview.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: process.env.DISABLE_WEBGL ? ["--disable-webgl"] : [],
});
const url = process.env.LANDING_BASE_URL || "http://localhost:3000";
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => {
    const el = document.querySelector(".vkw-canvas");
    return el?.hasAttribute("data-ready") || el?.hasAttribute("data-fallback");
  });
  const canvas = page.locator(".vkw-canvas");
  if (!process.env.DISABLE_WEBGL) {
    assert.equal(await canvas.getAttribute("data-ready"), "true");
    const initial = Number(await canvas.getAttribute("data-rotation"));
    await page.waitForTimeout(500);
    assert.ok(
      Number(await canvas.getAttribute("data-rotation")) > initial,
      "Idle rotation",
    );
    for (const id of ["tentang", "leaderboard", "fitur", "panduan"]) {
      await page.evaluate((id) => {
        const el = document.getElementById(id);
        window.scrollTo(0, el.getBoundingClientRect().top + scrollY);
      }, id);
      await page.waitForTimeout(100);
      if (id === "leaderboard")
        assert.ok(Number(await canvas.getAttribute("data-opacity")) < 0.1);
      if (id === "fitur")
        assert.ok(Number(await canvas.getAttribute("data-opacity")) > 0.95);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    const rotation = await canvas.getAttribute("data-rotation");
    await page.waitForTimeout(200);
    assert.equal(await canvas.getAttribute("data-rotation"), rotation);
  } else assert.equal(await canvas.getAttribute("data-fallback"), "true");
  await page.goto(url);
  const login = page.getByRole("link", { name: "Login", exact: true });
  await login.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "vkw-identity",
  );
  await page.getByLabel("Password", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Lihat password" }).click();
  assert.equal(
    await page.locator("#vkw-password").getAttribute("type"),
    "text",
  );
  await page.keyboard.press("Escape");
  assert.ok(!(await dialog.isVisible()));
  assert.ok(await login.evaluate((el) => document.activeElement === el));
  await login.click();
  assert.equal(await page.locator("#vkw-password").inputValue(), "");
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByLabel("Email admin").waitFor();
  await page.getByRole("button", { name: "Tutup login" }).click();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("link", { name: "Latihan", exact: true }).click();
    assert.ok(await dialog.isVisible());
    await page.getByRole("button", { name: "Tutup login" }).click();
  }
  assert.equal(await page.locator(".vkw-champion").count(), 3);
  assert.equal(await page.locator(".vkw-feature-card").count(), 4);
  assert.equal(await page.locator(".vkw-steps li").count(), 4);
  const noJS = await browser.newPage({ javaScriptEnabled: false });
  await noJS.goto(url);
  assert.equal(
    await noJS
      .getByRole("link", { name: "Latihan", exact: true })
      .getAttribute("href"),
    "/login?role=student",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: WebGL/fallback, scroll rotation/fade, reduced motion, modal controls/focus, layout and no-JS links.",
  );
} finally {
  await browser.close();
}
