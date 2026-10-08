// Local interactive preview. Clipboard images stay in RAM; no Redmine connection.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const runtime = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/redmine-7.0.2.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'assets/javascripts/clipboard_image_paste.js'));
if (crypto.createHash('sha256').update(source).digest('hex') !== runtime.source_sha256['assets/javascripts/clipboard_image_paste.js']) {
  throw new Error('Runtime fixture must match the plugin source; regenerate the isolated fixture first.');
}
const cssPath = path.join(__dirname, 'fixtures/operating-css.json');
const css = fs.existsSync(cssPath) ? JSON.parse(fs.readFileSync(cssPath, 'utf8')) : {};
const cssKeys = ['application.css', 'theme.css'].filter(key => css[key]);
const attachments = new Map();
let origin;

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'" });
  res.end(body);
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="csrf-token" content="local-preview-only"><title>클립보드 이미지 첨부 시험</title>
${cssKeys.map((key, i) => `<link rel="stylesheet" href="/preview-css/${i}.css">`).join('')}
<script src="/core/jquery-3.7.1-ui-1.13.3.js"></script>
<script>window.wikiImageMimeTypes=['image/png','image/jpeg','image/gif'];window.updateSVGIcon=function(){};window.randomKey=function(){return 'preview'};window.blockEventPropagation=function(e){e.preventDefault();e.stopPropagation()};</script>
<script src="/core/attachments.js"></script>${runtime.header}
<style>
html,body{min-width:0!important}body{margin:0;padding:20px;background:#f5f6fa;font-family:Arial,sans-serif;color:#263245}
main{max-width:960px;margin:auto}h1{font-size:24px}.preview-note,.preview-card{background:white;padding:18px;border:1px solid #d8deea;border-radius:8px;margin:16px 0}
.preview-note{border-left:5px solid #624ca4}.preview-steps{line-height:1.9;padding-left:24px}form.preview-card{display:block}.preview-card textarea{width:100%;box-sizing:border-box;min-height:130px;margin:10px 0}
.attachments_form{display:block}.attachments_fields>span{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0}.attachments_fields .filename{width:260px;max-width:80%}.attachments_fields .description{width:200px}
.attachments_fields svg{width:16px;height:16px}.attachments_fields .remove-upload{width:auto!important;height:auto!important;background:none!important}.attachments_fields .remove-upload:after{content:'삭제';font-size:13px}.preview-actions{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.preview-gallery{display:flex;gap:12px;flex-wrap:wrap}.preview-gallery figure{margin:0;padding:10px;border:1px solid #ddd;max-width:260px;background:white}.preview-gallery img{display:block;max-width:240px;max-height:200px}.preview-gallery figcaption{overflow-wrap:anywhere;margin-top:6px}
#preview-result{white-space:pre-wrap;padding:12px;background:#eef2fa;min-height:24px}.preview-status{font-size:13px;color:#5c6270}.hidden{display:none}
</style></head><body data-text-formatting="common_mark"><main>
<h1>클립보드 이미지 첨부 시험</h1>
<div class="preview-note"><strong>내 PC에서만 실행되는 시험 화면입니다.</strong><p>첨부와 저장은 모의 처리입니다. 운영 Redmine에는 전달되지 않습니다. 첨부 이미지는 이 시험 프로그램의 메모리에만 보관합니다.</p>
<ol class="preview-steps"><li>Win + Shift + S로 화면 일부를 캡처합니다.</li><li>아래 <strong>클립보드 이미지 추가</strong> 버튼을 누르고 열린 창에서 Ctrl + V를 누릅니다.</li><li>필요하면 마우스로 영역을 선택해 자른 뒤 확인을 누릅니다.</li><li>첨부 목록과 아래 미리보기를 보고, 본문에 이미지 문법이 추가되지 않았는지 확인합니다.</li></ol></div>
<form id="preview-form" class="preview-card"><label for="preview-body"><strong>본문</strong></label>
<textarea id="preview-body" class="wiki-edit">본문이 그대로 유지되는지 확인하세요.</textarea>
<span class="attachments_form"><span class="attachments_icons hidden"><svg class="svg-del" viewBox="0 0 16 16"><path d="M3 3L13 13M13 3L3 13" stroke="currentColor" stroke-width="2"/></svg><svg class="svg-attachment" viewBox="0 0 16 16"><path d="M5 10V4a3 3 0 016 0v7a4 4 0 01-8 0V5" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>
<span class="attachments_fields"></span><span class="add_attachment"><input type="file" class="file_selector filedrop" multiple onchange="addInputFiles(this)"
data-upload-path="/redmine/uploads.js" data-param="attachments" data-description="1" data-description-placeholder="설명"
data-max-file-size="5000000" data-max-file-size-message="시험 화면은 파일당 5MB까지 첨부할 수 있습니다." data-max-number-of-files-message="최대 10개까지 첨부할 수 있습니다." data-max-concurrent-uploads="1"></span></span>
<div class="preview-actions"><input type="submit" value="모의 저장"><button type="button" id="preview-reset">처음부터 다시</button><button type="button" id="preview-stop">시험 종료</button></div>
<div id="preview-result" role="status" aria-live="polite">붙여넣기와 자르기를 직접 시험해 보세요.</div></form>
<section class="preview-card"><h2>첨부 미리보기</h2><div id="preview-gallery" class="preview-gallery"></div><p class="preview-status">이 미리보기는 일감에 실제 저장된 결과가 아닙니다.</p></section>
${runtime.body}</main><script>
window.previewGallery=function(){
  var box=$('#preview-gallery').empty();
  $('#preview-form .attachments_fields > span').each(function(){
    var row=$(this),id=row.attr('data-preview-id');if(!id)return;
    var figure=$('<figure>');
    if(row.attr('data-preview-image')==='true')$('<img>',{src:'/preview-image/'+id,alt:'첨부 이미지 미리보기'}).appendTo(figure);
    $('<figcaption>').text(row.find('input.filename').val()).appendTo(figure);box.append(figure);
  });
};
$(function(){
  $('#preview-form').on('input','input.filename',previewGallery).on('submit',function(e){
    e.preventDefault();if($(this).find('.cbp-pending').length||ajaxUpload.uploading){$('#preview-result').text('업로드가 끝난 뒤 다시 눌러주세요.');return;}
    $('#preview-result').text('모의 저장 완료 — 첨부 '+$(this).find('input.token').filter(function(){return this.value;}).length+'개\\n본문: '+$('#preview-body').val());
  });
  $('#preview-reset').on('click',async function(){await fetch('/preview-reset',{method:'POST'});location.reload();});
  $('#preview-stop').on('click',async function(){await fetch('/preview-stop',{method:'POST'});document.querySelector('main').innerHTML='<h1>시험을 종료했습니다.</h1><p>메모리의 시험 첨부를 삭제하고 로컬 프로그램을 종료했습니다.</p>';});
});
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== new URL(origin).host) return send(res, 403, 'text/plain', 'Invalid host');
    const url = new URL(req.url, origin);
    if (req.method === 'POST' && req.headers.origin !== origin) return send(res, 403, 'text/plain', 'Local origin required');
    if (req.method === 'POST' && url.pathname === '/redmine/uploads.js') {
      const id = url.searchParams.get('attachment_id');
      if (!/^\d+$/.test(id || '')) return send(res, 400, 'text/plain', 'Invalid attachment id');
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 5000000) return send(res, 413, 'text/plain', 'Too large'); chunks.push(chunk); }
      if (!bytes) return send(res, 422, 'text/plain', 'Empty file');
      if (!attachments.has(id) && attachments.size >= 10) return send(res, 422, 'text/plain', 'Too many files');
      const buffer = Buffer.concat(chunks);
      // Images are served as PNG only after a real PNG signature check.
      const isImage = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      attachments.set(id, { buffer, isImage });
      const js = `var row=$('#attachments_${id}');row.attr({'data-preview-id':'${id}','data-preview-image':'${isImage}'});row.find('input.token').val('local-preview-${id}');row.find('input.filename').prop('readonly',false).removeClass('readonly');row.find('a.remove-upload').off('click').attr('href','#').on('click',function(e){e.preventDefault();fetch('/preview-delete/${id}',{method:'POST'});row.closest('.attachments_form').find('.add_attachment').show();row.remove();previewGallery();});previewGallery();`;
      return send(res, 200, 'application/javascript; charset=utf-8', js);
    }
    if (req.method === 'POST' && /^\/preview-delete\/\d+$/.test(url.pathname)) { attachments.delete(url.pathname.split('/').pop()); return send(res, 200, 'text/plain', 'deleted'); }
    if (req.method === 'POST' && url.pathname === '/preview-reset') { attachments.clear(); return send(res, 200, 'text/plain', 'reset'); }
    if (req.method === 'POST' && url.pathname === '/preview-stop') { attachments.clear(); send(res, 200, 'text/plain', 'stopped'); server.close(); server.closeIdleConnections(); return; }
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Method not allowed');
    if (url.pathname === '/' || url.pathname === '/redmine/test') return send(res, 200, 'text/html; charset=utf-8', html);
    if (/^\/preview-image\/\d+$/.test(url.pathname)) {
      const item = attachments.get(url.pathname.split('/').pop());
      if (item && item.isImage) return send(res, 200, 'image/png', item.buffer);
      return send(res, 404, 'text/plain', 'Image not found');
    }
    if (/^\/preview-css\/\d+\.css$/.test(url.pathname)) {
      const key = cssKeys[Number(path.basename(url.pathname, '.css'))];
      if (key) return send(res, 200, 'text/css', css[key].content);
    }
    if (runtime.assets[url.pathname]) {
      const type = url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'image/gif';
      return send(res, 200, type, Buffer.from(runtime.assets[url.pathname], 'base64'));
    }
    return send(res, 404, 'text/plain', 'Not found');
  } catch (error) { console.error(error.message); if (!res.headersSent) send(res, 500, 'text/plain', 'Preview request failed'); else res.end(); }
});
server.listen(0, '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  console.log(JSON.stringify({ url: origin + '/redmine/test', pid: process.pid }));
});
// Limit this manually opened preview to one working day, without a scheduler.
setTimeout(() => { attachments.clear(); server.close(); server.closeAllConnections(); }, 8 * 60 * 60 * 1000).unref();
