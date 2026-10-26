// Optional browser suite: run against a separately started Next server.
// LANDING_BASE_URL=http://localhost:3000 node tests/landing-interactions.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
  args: ['--no-sandbox', ...(process.env.DISABLE_WEBGL ? ['--disable-webgl'] : [])] });
const baseURL = process.env.LANDING_BASE_URL || 'http://localhost:3000';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByRole('heading', { name: 'VOKASI', exact: true }).waitFor();
  const canvas = page.locator('.vkw-canvas');
  await page.waitForFunction(() => document.querySelector('.vkw-canvas')?.hasAttribute('data-ready') || document.querySelector('.vkw-canvas')?.hasAttribute('data-fallback'));
  if (process.env.DISABLE_WEBGL) assert.equal(await canvas.getAttribute('data-fallback'), 'true');
  else {
    assert.equal(await canvas.getAttribute('data-ready'), 'true', 'Actual WebGL and logo texture loaded');
    await page.getByRole('button', { name: 'Jeda animasi' }).click();
    assert.equal(await page.getByRole('button', { name: 'Putar animasi' }).getAttribute('aria-pressed'), 'true');
    const before = await canvas.screenshot(); await page.waitForTimeout(200);
    assert.deepEqual(await canvas.screenshot(), before, 'Paused image is stable');
    await page.locator('#tentang').scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    assert.ok(Number(await canvas.getAttribute('data-progress')) > .25, 'Scroll advances scene even while paused');
    assert.ok(Number(await canvas.getAttribute('data-logo-x')) < 0, 'Crest accompanies About on left');
    await page.locator('#peringkat').scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    assert.ok(Number(await canvas.getAttribute('data-logo-x')) > 0, 'Crest accompanies ranking on right');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    const reduced = await canvas.screenshot(); await page.waitForTimeout(200);
    assert.deepEqual(await canvas.screenshot(), reduced, 'Reduced motion is static');
  }
  for (const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
  }
  await page.getByText('Apa itu VOKASI?', { exact:true }).click();
  assert.equal(await page.locator('details').first().getAttribute('open'), '');
  for (const [name, role] of [['Mulai Belajar','student'],['Masuk sebagai Admin','admin']]) {
    await page.goto(baseURL); await page.getByRole('link',{name}).click();
    await page.waitForURL(`**/login?role=${role}`);
    assert.ok(await page.locator('input').count() >= 2);
  }
  const noJS = await browser.newPage({javaScriptEnabled:false}); await noJS.goto(baseURL);
  await noJS.getByRole('heading',{name:'VOKASI',exact:true}).waitFor();
  assert.equal(await noJS.getByRole('link',{name:'Mulai Belajar'}).getAttribute('href'),'/login?role=student');
  assert.deepEqual(errors,[]);
  console.log('PASS: scene readiness/fallback, scroll, pause, reduced motion, responsive layout, FAQ, login routes, no-JS.');
} finally { await browser.close(); }
