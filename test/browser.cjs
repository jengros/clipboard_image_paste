// Headless browser integration tests against the actual Redmine core JS.
// Upload responses are local fixtures; this never contacts the production site.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require(process.env.CBP_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..');
const results = path.join(__dirname, 'results');
fs.mkdirSync(results, { recursive: true });
const cssFixture = path.join(__dirname, 'fixtures/operating-css.json');
const operatingCss = fs.existsSync(cssFixture) ? JSON.parse(fs.readFileSync(cssFixture, 'utf8')) : {};
const cssKeys = ['application.css', 'theme.css'].filter(k => operatingCss[k]);
const cssTags = cssKeys.map((k, i) => `<link rel="stylesheet" href="/operating/${i}.css">`).join('');
let runtime;
const runtimePath = path.join(__dirname, 'fixtures/redmine-7.0.2.json');
if (fs.existsSync(runtimePath)) runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const source = fs.readFileSync(path.join(root, 'assets/javascripts/clipboard_image_paste.js'), 'utf8');
if (runtime) {
  const expected = runtime.source_sha256['assets/javascripts/clipboard_image_paste.js'];
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), expected, 'Runtime fixture must match candidate');
}
const messages = `data-add-label="클립보드 이미지 추가" data-ok-label="확인" data-cancel-label="취소"
data-print-message="이미지 복사 후 Ctrl+V" data-select-message="마우스로 영역 선택"
data-no-image-message="이미지가 없습니다" data-unsupported-message="지원되지 않음"
data-invalid-message="이미지 변환 실패" data-upload-failed-message="업로드 실패" data-uploading-message="업로드 중"`;
const body = runtime ? runtime.body : `<div id="cbp_paste_dlg" title="클립보드 이미지 추가" style="display:none" ${messages}>
<p id="cbp_instructions" aria-live="polite"></p><div id="cbp_panel_box" tabindex="0" role="region"></div></div>`;
const header = runtime ? runtime.header : `<link rel="stylesheet" href="/plugin/jquery.Jcrop-0.9.12.min.css">
<link rel="stylesheet" href="/plugin/clipboard_image_paste.css">
<script src="/plugin/jcrop-0.9.12-p1.js"></script><script src="/plugin/clipboard_image_paste.js" defer></script>`;
function form(id, extra = '') {
  return `<form id="${id}"><div class="box"><textarea class="wiki-edit">원래 본문</textarea>
<span class="attachments_form"><span class="attachments_icons hidden"><svg class="svg-del"></svg><svg class="svg-attachment"></svg></span>
<span class="attachments_fields"></span><span class="add_attachment"><input type="file" class="file_selector filedrop" multiple onchange="addInputFiles(this)"
data-upload-path="/redmine/uploads.js" data-param="attachments" data-description="1" data-description-placeholder="설명"
data-max-file-size="5000000" data-max-file-size-message="크기 초과" data-max-number-of-files-message="개수 초과" data-max-concurrent-uploads="1"></span></span>
${extra}</div><input type="submit" value="저장"><button type="submit">저장 버튼</button></form>`;
}
let browser, page, uploads, mode, delay, alerts, errors, checks = [];
async function check(label, action) {
  await action(); checks.push(label); console.log('PASS: ' + label);
}
async function waitUntil(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 25)); }
  throw new Error('Expected asynchronous browser result did not arrive');
}
async function newPage(options = {}) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: options.viewport || { width: 1100, height: 850 } });
  uploads = []; alerts = []; errors = []; mode = 'success'; delay = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });
  await page.route('https://cbp.test/**', async route => {
    const url = new URL(route.request().url());
    if (/^\/operating\/\d+\.css$/.test(url.pathname)) {
      const index = Number(path.basename(url.pathname, '.css'));
      return route.fulfill({ contentType: 'text/css', body: operatingCss[cssKeys[index]].content });
    }
    if (url.pathname === '/redmine/uploads.js') {
      const data = route.request().postDataBuffer();
      uploads.push({ filename: url.searchParams.get('filename'), id: url.searchParams.get('attachment_id'), data, contentType: route.request().headers()['content-type'] });
      const currentMode = mode;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (currentMode === 'failure') return route.fulfill({ status: 403, contentType: 'text/plain', body: 'Forbidden' });
      const id = url.searchParams.get('attachment_id');
      const js = currentMode === 'invalid' ? `$('#attachments_${id}').hide(); alert('Validation failed');` :
        `$('#attachments_${id} input.token').val('123.fixture');$('#attachments_${id} a.remove-upload').attr({'data-remote':'true','data-method':'delete',href:'/redmine/attachments/123.js'}).off('click');`;
      return route.fulfill({ contentType: 'application/javascript', body: js });
    }
    if (url.pathname === '/redmine/attachments/123.js') return route.fulfill({ contentType: 'application/javascript', body: `$('.attachments_fields > span').last().remove();` });
    if (runtime && runtime.assets[url.pathname]) {
      const contentType = url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'image/gif';
      return route.fulfill({ contentType, body: Buffer.from(runtime.assets[url.pathname], 'base64') });
    }
    if (url.pathname.startsWith('/core/')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'fixtures', path.basename(url.pathname))) });
    if (url.pathname.startsWith('/plugin/')) {
      const name = path.basename(url.pathname);
      const dir = name.endsWith('.js') ? 'javascripts' : 'stylesheets';
      return route.fulfill({ contentType: name.endsWith('.js') ? 'application/javascript' : 'text/css', body: fs.readFileSync(path.join(root, 'assets', dir, name)) });
    }
    if (url.pathname !== '/redmine/test') return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head>
<meta name="csrf-token" content="local-fixture-only"><style>body{font-family:Arial;margin:24px}.box{padding:16px;border:1px solid #ddd}textarea{display:block;width:90%;height:90px}form{margin-bottom:18px}.hidden{display:none}.attachments_fields>span{display:block}.ui-front{z-index:100}.ui-dialog{position:absolute;background:#fff;border:1px solid #aaa;padding:10px}.ui-dialog-titlebar{padding:8px;background:#eee}.ui-dialog-titlebar-close{float:right}.ui-dialog-buttonpane{padding:8px;text-align:right}.ui-widget-overlay{position:fixed;inset:0;background:#0003}.ui-dialog-content{box-sizing:border-box}.ui-dialog-buttonpane button{margin:4px}</style>
${cssTags}<script src="/core/jquery-3.7.1-ui-1.13.3.js"></script>
<script>window.wikiImageMimeTypes=['image/png'];window.updateSVGIcon=function(){};window.randomKey=function(){return 'abcde'};window.blockEventPropagation=function(e){e.preventDefault();e.stopPropagation()};</script>
<script src="/core/attachments.js"></script>${header}</head><body data-text-formatting="common_mark">
${options.empty ? '' : form('issue') + form('second')}${body}</body></html>` });
  });
  await page.goto('https://cbp.test/redmine/test');
  await page.waitForFunction(() => window.cbImagePaste && window.cbImagePaste.initialized);
  if (!options.empty) await page.locator('#issue .cbp-add-image').waitFor();
}
async function open(id = 'issue') { await page.locator('#' + id + ' .cbp-add-image').click(); }
async function paste(kind = 'image') {
  await page.evaluate(async kind => {
    let blob;
    if (kind === 'corrupt') blob = new Blob(['bad image'], { type: 'image/png' });
    else if (kind !== 'text') {
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 120;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#357ab9'; ctx.fillRect(0, 0, 240, 120); ctx.fillStyle = '#f5bc42'; ctx.fillRect(60, 20, 100, 60);
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
    const dt = new DataTransfer();
    if (blob) dt.items.add(new File([blob], 'paste.png', { type: 'image/png' }));
    if (kind === 'text' || kind === 'mixed') dt.setData('text/plain', 'plain text');
    document.querySelector('#cbp_panel_box').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, kind);
  if (kind === 'image' || kind === 'mixed') await page.locator('#cbp_panel_box .jcrop-holder').waitFor();
}
async function ok() { await page.locator('.ui-dialog-buttonpane button').filter({ hasText: /^확인$/ }).click(); }
async function cancel() { await page.locator('.ui-dialog-buttonpane button').filter({ hasText: /^취소$/ }).click(); }
async function settled() { await page.waitForFunction(() => !$('#cbp_paste_dlg').dialog('isOpen') && !document.querySelector('.cbp-pending') && window.ajaxUpload.uploading === 0); }
function pngSize(upload) { return [upload.data.readUInt32BE(16), upload.data.readUInt32BE(20)]; }

(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CBP_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  await newPage();
  await check('one button per attachment form / repeated setup', async () => {
    await page.evaluate(() => { for (let i = 0; i < 5; i++) cbImagePaste.setup(); });
    assert.equal(await page.locator('.cbp-add-image').count(), 2);
  });
  await check('empty clipboard / no premature upload', async () => { await open(); await ok(); assert.equal(uploads.length, 0); assert.match(await page.locator('#cbp_instructions').innerText(), /이미지/); });
  await check('text clipboard is not attached', async () => { await paste('text'); assert.equal(uploads.length, 0); });
  await check('corrupt image is rejected', async () => { await paste('corrupt'); await page.waitForFunction(() => document.querySelector('#cbp_instructions').textContent.includes('변환') || document.querySelector('#cbp_instructions').textContent.includes('읽거나')); assert.equal(await page.locator('#cbp_panel_box canvas').count(), 0); });
  await check('cancel and reopen clears image', async () => { await paste(); await cancel(); await open(); await ok(); assert.equal(uploads.length, 0); assert.equal(await page.locator('#cbp_panel_box canvas').count(), 0); });
  await check('paste mixed text/image then attach without body changes or stale inline target', async () => {
    await page.evaluate(() => { handleFileDropEvent.target = document.querySelector('#issue textarea'); });
    await paste('mixed'); await ok(); await settled();
    assert.equal(uploads.length, 1); assert.deepEqual(pngSize(uploads[0]), [240, 120]);
    assert.equal(uploads[0].contentType, 'application/octet-stream');
    assert.equal(await page.locator('#issue textarea').inputValue(), '원래 본문');
    assert.equal(await page.locator('#issue input.token').inputValue(), '123.fixture');
    assert.equal(await page.locator('#second input.token').count(), 0);
    assert.equal(await page.locator('#issue input.filename').getAttribute('readonly'), null);
  });
  await check('cropping changes uploaded pixels/dimensions', async () => {
    await open(); await paste();
    const box = await page.locator('#cbp_panel_box .jcrop-holder').boundingBox();
    await page.mouse.move(box.x + 60, box.y + 20); await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 80, { steps: 10 }); await page.mouse.up();
    await page.screenshot({ path: path.join(results, 'crop-dialog.png'), fullPage: true });
    await ok(); await settled();
    const size = pngSize(uploads[1]); assert.ok(size[0] >= 95 && size[0] <= 105, size); assert.ok(size[1] >= 55 && size[1] <= 65, size);
    const pixel = await page.evaluate(async encoded => {
      const image = new Image(); image.src = 'data:image/png;base64,' + encoded; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return Array.from(ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data);
    }, uploads[1].data.toString('base64'));
    assert.deepEqual(pixel, [245, 188, 66, 255]);
  });
  await check('ordinary file selection can replace input then clipboard still works', async () => {
    await page.locator('#issue input[type=file]').setInputFiles({ name: 'ordinary.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
    await page.waitForFunction(() => ajaxUpload.uploading === 0); await open(); await paste(); await ok(); await settled();
    assert.equal(await page.locator('#issue input.token').count(), 4);
  });
  await check('independent second form attachments', async () => { await open('second'); await paste(); await ok(); await settled(); assert.equal(await page.locator('#second input.token').inputValue(), '123.fixture'); assert.equal(await page.locator('#second textarea').inputValue(), '원래 본문'); });
  await check('size limit checks actual PNG bytes', async () => {
    await page.locator('#second input[type=file]').evaluate(el => { $(el).data('max-file-size', 1); });
    const before = uploads.length; await open('second'); await paste(); await ok(); await waitUntil(() => alerts.includes('크기 초과')); assert.equal(uploads.length, before); await cancel();
  });
  await check('attachment count limit includes ordinary and pending rows', async () => {
    await page.evaluate(() => { const fields = $('#second .attachments_fields'); for (let i = fields.children().length; i < 10; i++) fields.append('<span>ordinary</span>'); });
    await open('second'); assert.ok(alerts.includes('개수 초과')); assert.equal(await page.locator('.ui-dialog:visible').count(), 0);
  });
  await newPage();
  await check('HTTP failure cleans row/unlocks form and allows retry', async () => {
    mode = 'failure'; await open(); await paste(); await ok(); await settled();
    assert.equal(await page.locator('#issue input.token').count(), 0); assert.equal(await page.locator('#issue input[type=submit]').isDisabled(), false);
    mode = 'success'; await open(); await paste(); await ok(); await settled(); assert.equal(await page.locator('#issue input.token').count(), 1);
  });
  await check('HTTP 200 validation failure without token is not accepted', async () => {
    mode = 'invalid'; await open(); await paste(); await ok(); await settled(); assert.equal(await page.locator('#issue input.token').count(), 1); assert.ok(alerts.some(s => /실패/.test(s))); mode = 'success';
  });
  await check('concurrent core upload and clipboard use shared queue, submission waits', async () => {
    delay = 1500; await page.locator('#issue input[type=file]').setInputFiles({ name: 'queued.txt', mimeType: 'text/plain', buffer: Buffer.from('queued') });
    await open(); await paste(); await ok();
    await page.waitForFunction(() => document.querySelector('.cbp-pending'));
    assert.equal(await page.locator('#issue button[type=submit]').isDisabled(), true);
    await page.locator('#issue textarea').fill('작성 중인 본문'); await settled();
    assert.equal(await page.locator('#issue input.token').count(), 3); assert.equal(await page.locator('#issue textarea').inputValue(), '작성 중인 본문'); assert.equal(await page.locator('#issue button[type=submit]').isDisabled(), false); delay = 0;
  });
  await check('standard textarea clipboard paste still inserts inline markup', async () => {
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 20;
      const blob = await new Promise(r => c.toBlob(r)); const dt = new DataTransfer(); dt.items.add(new File([blob], 'body.png', { type: 'image/png' }));
      document.querySelector('#issue textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('#issue textarea').value.includes('clipboard-'));
  });
  await check('actual PNG image can be renamed/described in standard row', async () => {
    await page.locator('#issue input.filename').first().fill('한글-첨부.png'); await page.locator('#issue input.description').first().fill('설명');
    assert.equal(await page.locator('#issue input.filename').first().inputValue(), '한글-첨부.png');
  });
  await check('no duplicate setup after asynchronous form insertion', async () => {
    await page.evaluate(html => { $('body').append(html); $(document).trigger('ajaxComplete'); }, form('dynamic'));
    assert.equal(await page.locator('#dynamic .cbp-add-image').count(), 1);
  });
  await check('custom file fields do not get clipboard button', async () => {
    await page.evaluate(() => { $('body').append('<form id="custom"><span class="attachments_form"><input type="file" class="custom-field-filedrop"></span></form>'); cbImagePaste.setup(); });
    assert.equal(await page.locator('#custom .cbp-add-image').count(), 0);
  });
  await check('simultaneous forms restore all submit buttons', async () => {
    delay = 1000; await open(); await paste(); await ok();
    await page.waitForFunction(() => document.querySelector('#issue .cbp-pending'));
    await open('second'); await paste(); await ok(); await settled();
    assert.equal(await page.locator('#issue input[type=submit]').isDisabled(), false);
    assert.equal(await page.locator('#second input[type=submit]').isDisabled(), false); delay = 0;
  });
  await check('initially disabled button stays disabled after plugin upload', async () => {
    await page.locator('#second button[type=submit]').evaluate(el => { el.disabled = true; });
    await open('second'); await paste(); await ok(); await settled();
    assert.equal(await page.locator('#second button[type=submit]').isDisabled(), true);
  });
  await check('standard attachment removal metadata is retained', async () => {
    const link = page.locator('#second a.remove-upload').first();
    assert.equal(await link.getAttribute('data-remote'), 'true');
    assert.equal(await link.getAttribute('data-method'), 'delete');
    assert.equal(await link.getAttribute('href'), '/redmine/attachments/123.js');
  });
  await check('missing file input is reported without exception', async () => {
    await page.locator('#dynamic input[type=file]').evaluate(el => el.remove());
    const before = alerts.length; await page.locator('#dynamic .cbp-add-image').click(); await waitUntil(() => alerts.length > before);
    assert.equal(await page.locator('.ui-dialog:visible').count(), 0);
  });
  await check('no browser exceptions', async () => { assert.deepEqual(errors, []); });
  await newPage({ viewport: { width: 390, height: 700 } });
  await check('small viewport / Escape cancellation', async () => {
    await open(); await paste(); const box = await page.locator('.ui-dialog').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 392);
    await page.screenshot({ path: path.join(results, 'mobile-dialog.png'), fullPage: true }); await page.keyboard.press('Escape'); assert.equal(await page.locator('.ui-dialog:visible').count(), 0);
  });
  await newPage({ empty: true });
  await check('pages without attachment form stay unchanged', async () => { assert.equal(await page.locator('.cbp-add-image').count(), 0); assert.deepEqual(errors, []); });
  fs.writeFileSync(path.join(results, 'browser-results.json'), JSON.stringify({ checks, count: checks.length, runtimeFixture: !!runtime, productionUploads: 0 }, null, 2));
  console.log(`TOTAL: ${checks.length} checks; runtime fixture=${!!runtime}; production uploads=0`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
