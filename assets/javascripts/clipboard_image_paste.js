// clipboard_image_paste, based on Richard Pecl's original plugin (GPL-2.0).
// Redmine 7: retain the paste/canvas/Jcrop workflow, use standard upload tokens.
(function (cbImagePaste, $) {
  'use strict';
  var dialog, inputEl, inputForm, pastedImage, jcropApi, cropCoords, objectUrl;
  var generation = 0, converting = false;
  if (cbImagePaste.initialized) { return; }
  cbImagePaste.initialized = true;

  function message(key) { return $('#cbp_paste_dlg').attr('data-' + key); }
  function tell(key) { $('#cbp_instructions').text(message(key)); }
  function releaseImage() {
    generation++;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    if (jcropApi) { jcropApi.destroy(); jcropApi = null; }
    pastedImage = null;
    cropCoords = null;
    $('#cbp_panel_box').empty();
  }
  function currentInput(form) {
    return $(form).find('input:file.filedrop').filter(function () {
      return !$(this).hasClass('custom-field-filedrop');
    }).first()[0];
  }
  function maximum(input) { return input.multiple ? 10 : 1; }
  function count(input) {
    return $(input).closest('.attachments_form').find('.attachments_fields').children().length;
  }
  function hasCapacity(input) {
    if (count(input) < maximum(input)) { return true; }
    window.alert($(input).data('max-number-of-files-message'));
    return false;
  }

  cbImagePaste.showPasteDialog = function (input) {
    if (!input || !document.documentElement.contains(input) || !window.File || !window.URL || !HTMLCanvasElement.prototype.toBlob ||
        !$.fn.dialog || !$.fn.Jcrop || typeof window.addFile !== 'function' ||
        typeof window.uploadBlob !== 'function' || !window.ajaxUpload) {
      window.alert(message('unsupported-message'));
      return;
    }
    inputEl = input;
    inputForm = $(input).closest('form')[0];
    if (!hasCapacity(inputEl)) { return; }
    if (!dialog) {
      dialog = $('#cbp_paste_dlg').dialog({
        autoOpen: false, modal: true, resizable: false,
        closeText: message('cancel-label'),
        classes: { 'ui-dialog': 'cbp-dialog' },
        buttons: [
          { text: message('ok-label'), click: insertAttachment },
          { text: message('cancel-label'), click: function () { dialog.dialog('close'); } }
        ],
        open: function () {
          releaseImage();
          converting = false;
          $('#cbp_instructions').text(message('print-message'));
          $(window).off('resize.cbp').on('resize.cbp', resizePanel);
          this.addEventListener('paste', pasteHandler);
          resizePanel();
          $('#cbp_panel_box').trigger('focus');
        },
        close: function () {
          this.removeEventListener('paste', pasteHandler);
          $(window).off('resize.cbp');
          releaseImage();
          converting = false;
        }
      });
    }
    dialog.dialog('open');
  };

  function resizePanel() {
    var width = Math.max(240, Math.min(1000, window.innerWidth - 32));
    var height = Math.max(180, Math.min(760, window.innerHeight - 32));
    dialog.dialog('option', {
      width: width, height: height, minWidth: Math.min(240, width),
      minHeight: Math.min(180, height),
      position: { my: 'center', at: 'center', of: window }
    });
    $('#cbp_panel_box').height(Math.max(50, height - 175));
    if (pastedImage) { createPanel(); }
  }

  // Original canvas scaling and Jcrop trueSize behavior, with scoped lifecycle.
  function createPanel() {
    var selection = cropCoords;
    if (jcropApi) { jcropApi.destroy(); jcropApi = null; }
    var box = $('#cbp_panel_box').empty();
    var scale = Math.min(1, Math.max(1, box.width()) / pastedImage.width,
      Math.max(1, box.height()) / pastedImage.height);
    var panel = document.createElement('canvas');
    panel.width = Math.max(1, Math.round(pastedImage.width * scale));
    panel.height = Math.max(1, Math.round(pastedImage.height * scale));
    panel.getContext('2d').drawImage(pastedImage, 0, 0, panel.width, panel.height);
    box.append(panel);
    $(panel).Jcrop({
      onChange: showPreview, onSelect: showPreview, onRelease: function () { showPreview(); },
      trueSize: [pastedImage.width, pastedImage.height]
    }, function () {
      jcropApi = this;
      if (selection && selection.selected) {
        this.setSelect([selection.x, selection.y,
          selection.x + selection.w, selection.y + selection.h]);
      } else { showPreview(); }
    });
  }

  function showPreview(coords) {
    if (!pastedImage) { return; }
    if (coords && coords.w > 0 && coords.h > 0) {
      cropCoords = { x: Math.round(coords.x), y: Math.round(coords.y),
        w: Math.round(coords.w), h: Math.round(coords.h), selected: true };
      $('#cbp_instructions').text(message('select-message') + ' (' +
        cropCoords.w + ' × ' + cropCoords.h + ')');
    } else {
      cropCoords = { x: 0, y: 0, w: pastedImage.width, h: pastedImage.height };
      tell('select-message');
    }
  }

  function pasteHandler(e) {
    if (converting) { return; }
    var data = e.clipboardData;
    var items = data && (data.items || data.files);
    var file;
    if (items) {
      for (var i = 0; i < items.length; i++) {
        if (/^image\//.test(items[i].type)) {
          file = items[i].getAsFile ? items[i].getAsFile() : items[i];
          if (file) { break; }
        }
      }
    }
    e.preventDefault();
    e.stopPropagation();
    if (!file) { tell('no-image-message'); return; }
    releaseImage();
    var imageGeneration = generation;
    var image = new Image();
    objectUrl = URL.createObjectURL(file);
    var imageUrl = objectUrl;
    image.onload = function () {
      URL.revokeObjectURL(imageUrl);
      if (imageGeneration !== generation) { return; }
      objectUrl = null;
      if (!image.width || !image.height) { tell('invalid-message'); return; }
      pastedImage = image;
      createPanel();
    };
    image.onerror = function () {
      URL.revokeObjectURL(imageUrl);
      if (imageGeneration === generation) { releaseImage(); tell('invalid-message'); }
    };
    image.src = imageUrl;
  }

  function uniqueFilename(input) {
    var fields = $(input).closest('.attachments_form').find('input.filename');
    var name;
    do {
      name = 'clipboard-' + Date.now() + '-' +
        Math.random().toString(36).slice(2, 10) + '.png';
    } while (fields.filter(function () { return this.value === name; }).length);
    return name;
  }

  function insertAttachment() {
    if (converting) { return; }
    if (!pastedImage || !cropCoords) { tell('no-image-message'); return; }
    // Redmine replaces the file input after ordinary file selection.
    inputEl = currentInput(inputForm);
    if (!inputEl || !hasCapacity(inputEl)) { return; }
    var destination = inputEl;
    var output = document.createElement('canvas');
    output.width = Math.max(1, Math.min(cropCoords.w, pastedImage.width - cropCoords.x));
    output.height = Math.max(1, Math.min(cropCoords.h, pastedImage.height - cropCoords.y));
    output.getContext('2d').drawImage(pastedImage, cropCoords.x, cropCoords.y,
      output.width, output.height, 0, 0, output.width, output.height);
    converting = true;
    var conversionGeneration = generation;
    output.toBlob(function (blob) {
      if (conversionGeneration !== generation) { return; }
      converting = false;
      if (!blob || !blob.size) { tell('invalid-message'); return; }
      if (!document.documentElement.contains(destination)) { tell('upload-failed-message'); return; }
      if (!hasCapacity(destination)) { return; }
      var maxSize = $(destination).data('max-file-size');
      if (maxSize != null && blob.size > parseInt(maxSize, 10)) {
        window.alert($(destination).data('max-file-size-message'));
        return;
      }
      var file = new File([blob], uniqueFilename(destination), { type: 'image/png' });
      attachImage(file, destination);
      dialog.dialog('close');
    }, 'image/png');
  }

  // Reuse Redmine's row/token/CSRF/upload URL contract without calling
  // ajaxUpload's addInlineAttachmentMarkup (which remembers the last textarea).
  function attachImage(file, input) {
    var id = window.addFile(input, file, false);
    if (id == null) { return; }
    var row = $('#attachments_' + id).addClass('cbp-pending');
    var form = row.closest('form');
    var status = $('<span>', { 'class': 'cbp-upload-status', role: 'status' })
      .text(message('uploading-message')).appendTo(row);
    row.find('input.description, a.remove-upload').hide();
    var lock = function () {
      form.addClass('cbp-upload-locked').find('input:submit, button:submit').each(function () {
        if ($(this).data('cbp-was-disabled') == null) {
          $(this).data('cbp-was-disabled', this.disabled && !window.ajaxUpload.uploading && !form.queue('upload').length);
        }
        this.disabled = true;
      });
    };
    lock();
    form.off('submit.cbp').on('submit.cbp', function (e) {
      if (form.find('.cbp-pending').length) { e.preventDefault(); lock(); }
    });

    function actualUpload() {
      window.ajaxUpload.uploading++;
      lock();
      window.uploadBlob(file, $(input).data('upload-path'), id, {})
        .done(function () {
          // A JS HTTP 200 response can still be a validation failure.
          if (!row.find('input.token').val()) {
            row.remove();
            window.alert(message('upload-failed-message'));
            return;
          }
          status.remove();
          row.find('input.description, a.remove-upload').css('display', 'inline-flex');
          row.find('input.filename').prop('readonly', false).removeClass('readonly');
        })
        .fail(function () {
          row.remove();
          window.alert(message('upload-failed-message'));
        })
        .always(function () {
          window.ajaxUpload.uploading--;
          row.removeClass('cbp-pending');
          var container = $(input).closest('.attachments_form');
          container.find('.add_attachment').toggle(count(input) < maximum(input));
          form.dequeue('upload');
          drainQueues();
          unlockForms();
        });
    }
    var maxConcurrent = $(input).data('max-concurrent-uploads');
    if (!maxConcurrent || window.ajaxUpload.uploading < maxConcurrent) { actualUpload(); }
    else { form.queue('upload', actualUpload); }
  }

  // Core dequeues only the form that just completed. Clipboard queues can
  // belong to another form, so wake them when a shared upload slot is free.
  function drainQueues() {
    if (!window.ajaxUpload) { return; }
    $('form.cbp-upload-locked').each(function () {
      var form = $(this);
      var input = currentInput(this);
      if (!input) { return; }
      var maxConcurrent = $(input).data('max-concurrent-uploads');
      if (form.queue('upload').length && (!maxConcurrent || window.ajaxUpload.uploading < maxConcurrent)) {
        form.dequeue('upload');
      }
    });
  }

  function unlockForms() {
    if (!window.ajaxUpload || window.ajaxUpload.uploading !== 0) { return; }
    $('form.cbp-upload-locked').each(function () {
      var form = $(this);
      if (form.queue('upload').length || form.find('.cbp-pending').length) { return; }
      form.find('input:submit, button:submit').each(function () {
        var disabled = $(this).data('cbp-was-disabled');
        if (disabled != null) { this.disabled = disabled; $(this).removeData('cbp-was-disabled'); }
      });
      form.removeClass('cbp-upload-locked');
    });
  }

  function setup() {
    if (!$('#cbp_paste_dlg').length) { return; }
    $('.attachments_form').each(function () {
      var container = $(this);
      var input = container.find('input:file.filedrop').not('.custom-field-filedrop').first();
      if (!input.length || container.find('.cbp-add-image').length) { return; }
      $('<button>', { type: 'button', 'class': 'cbp-add-image' })
        .text(message('add-label')).appendTo(container)
        .on('click', function () {
          cbImagePaste.showPasteDialog(currentInput(container.closest('form')));
        });
    });
  }
  cbImagePaste.setup = setup;
  $(setup);
  $(document).on('ajaxComplete.cbp', function () { setup(); drainQueues(); unlockForms(); });
}(window.cbImagePaste = window.cbImagePaste || {}, jQuery));
