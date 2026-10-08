// Verify the interactive local server with real HTTP, without production access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.CBP_PLAYWRIGHT || 'playwright');
let server, browser;
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log('PASS: ' + name); }
(async () => {
  server = spawn(process.execPath, [path.join(__dirname, 'preview.cjs')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const info = await new Promise((resolve, reject) => {
    let data = '';
    const timeout = setTimeout(() => reject(new Error('Preview startup timeout')), 15000);
    server.once('error', reject); server.stderr.on('data', value => process.stderr.write(value));
    server.stdout.on('data', value => { data += value; if (data.includes('\n')) { clearTimeout(timeout); resolve(JSON.parse(data.trim())); } });
    server.once('exit', code => { if (!data) { clearTimeout(timeout); reject(new Error('Preview exited ' + code)); } });
  });
  const origin = new URL(info.url).origin;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CBP_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors = []; const external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto(info.url);
  await check('local UI loads actual candidate and no external requests', async () => {
    await page.locator('.cbp-add-image').waitFor(); assert.equal(await page.locator('.cbp-add-image').count(), 1); assert.deepEqual(external, []);
  });
  await check('real local HTTP PNG upload keeps body and displays preview', async () => {
    await page.locator('#preview-body').fill('내가 입력한 본문'); await page.locator('.cbp-add-image').click();
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#624ca4'; ctx.fillRect(0, 0, 120, 80);
      const blob = await new Promise(resolve => canvas.toBlob(resolve)); const dt = new DataTransfer(); dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
      document.querySelector('#cbp_panel_box').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.locator('#cbp_panel_box .jcrop-holder').waitFor();
    await page.locator('.ui-dialog-buttonpane button').filter({ hasText: /^확인$/ }).click();
    await page.waitForFunction(() => {
      const token = document.querySelector('input.token');
      return token && token.value && !document.querySelector('.cbp-pending');
    });
    assert.equal(await page.locator('#preview-body').inputValue(), '내가 입력한 본문');
    await page.waitForFunction(() => document.querySelector('#preview-gallery img').naturalWidth === 120);
    const response = await fetch(origin + '/preview-image/1'); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  });
  await check('rename and mock save report current attachment/body', async () => {
    await page.locator('input.filename').fill('내-첨부.png'); await page.locator('input[type=submit]').click();
    assert.match(await page.locator('#preview-result').innerText(), /모의 저장 완료 — 첨부 1개/);
    assert.match(await page.locator('#preview-gallery').innerText(), /내-첨부.png/);
    const folder = path.join(__dirname, 'results'); fs.mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, 'interactive-preview.png'), fullPage: true });
  });
  await check('delete removes row, preview and in-memory attachment', async () => {
    await page.locator('a.remove-upload').click(); await page.waitForFunction(() => !document.querySelector('input.token'));
    for (let n = 0; n < 20; n++) { if ((await fetch(origin + '/preview-image/1')).status === 404) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.fail('Deleted image still exists');
  });
  await check('reset clears form and origin guard rejects cross-site changes', async () => {
    assert.equal((await fetch(origin + '/preview-reset', { method: 'POST', headers: { Origin: 'https://example.invalid' } })).status, 403);
    await page.locator('#preview-reset').click(); await page.waitForFunction(() => document.querySelector('#preview-body').value.includes('본문이 그대로'));
    assert.equal(await page.locator('.cbp-add-image').count(), 1);
  });
  await check('no browser exceptions or external requests', async () => { assert.deepEqual(errors, []); assert.deepEqual(external, []); });
  await check('finish button stops the local process', async () => {
    const exited = new Promise(resolve => server.once('exit', resolve));
    await page.locator('#preview-stop').click(); await page.getByRole('heading', { name: '시험을 종료했습니다.' }).waitFor();
    await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Preview did not stop')), 10000); timer.unref(); })]);
  });
  fs.writeFileSync(path.join(__dirname, 'results/preview-results.json'), JSON.stringify({ count: checks.length, checks, productionRequests: 0 }, null, 2));
  console.log('TOTAL: ' + checks.length + ' interactive preview checks; production requests=0');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server && server.exitCode === null) server.kill();
});
