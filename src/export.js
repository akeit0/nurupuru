import { GLRenderer } from './renderer.js';
import { t } from './i18n.js';
import { createModal } from './modal.js';

// Own the export canvas, preview and recorder together. The editor supplies
// its current document on demand; replacing a document invalidates this renderer.
export function initExport({ getState, flushMask, requestRedraw, toast, download, baseName, syncPlayback, beforeOpen }) {
  const $ = id => document.getElementById(id);
  let format = 'webm', canvas = null, renderer = null;
  let recording = null, recorder = null, previousAuto = false;
  let previewRaf = 0, pngBusy = false;
  const modal = createModal({ id: 'exportModal', closeButton: 'closeExport', opener: 'btnExport',
    beforeOpen() { beforeOpen(); syncLanguage(); requestPreview(); },
    beforeClose() { stopRecording(); cancelPreview(); }, afterClose: requestRedraw });

  function cancelPreview() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = 0;
  }
  function resizeCanvas(w, h) {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    }
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    if (!renderer) {
      const state = getState();
      renderer = new GLRenderer(canvas, true);
      renderer.updateImage(state.image, state.mask, state.mesh, state.maskRevision);
    }
  }
  function bounds() {
    const { imageW, imageH, background, backgroundPosition } = getState();
    if ($('exportFrame').value === 'background' && background) {
      const scale = Math.max(imageW / background.width, imageH / background.height) * backgroundPosition.scale;
      const w = background.width * scale, h = background.height * scale;
      return { x: (imageW - w) / 2 + backgroundPosition.x, y: (imageH - h) / 2 + backgroundPosition.y, w, h };
    }
    return { x: 0, y: 0, w: imageW, h: imageH };
  }
  function resolution(frame) {
    const value = $('exportSize').value, cap = value === 'original' ? 2800 : +value;
    const scale = Math.min(1, cap / Math.max(frame.w, frame.h));
    return [Math.max(2, Math.round(frame.w * scale / 2) * 2), Math.max(2, Math.round(frame.h * scale / 2) * 2)];
  }
  function draw() {
    if (!renderer || !canvas) return;
    flushMask();
    const { mesh, mask, maskRevision, lastMaskRect, imageW, imageH, background, backgroundPosition, params } = getState();
    if (!mesh) return;
    renderer.ensureMask(mask, maskRevision, lastMaskRect);
    mesh.buildVertices();
    const w = canvas.width, h = canvas.height, frame = recording?.frame || bounds();
    const scale = Math.min(w / frame.w, h / frame.h);
    const x = (imageW / 2 - frame.x - frame.w / 2) * scale;
    const y = (imageH / 2 - frame.y - frame.h / 2) * scale;
    if ($('exportBg').value === 'image') renderer.updateBackground(background);
    renderer.draw(mesh, w, h, scale, x, y, false, $('exportBg').value, params, backgroundPosition);
  }
  function copyPreview() {
    if (!canvas) return;
    const preview = $('exportPreview'), scale = Math.min(320 / canvas.width, 180 / canvas.height, 1);
    const w = Math.max(1, Math.round(canvas.width * scale)), h = Math.max(1, Math.round(canvas.height * scale));
    if (preview.width !== w) preview.width = w;
    if (preview.height !== h) preview.height = h;
    const ctx = preview.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
  }
  function refreshPreview() {
    if (!modal.open || !getState().mesh || recording || pngBusy) return;
    const [w, h] = resolution(bounds()), scale = Math.min(320 / w, 180 / h, 1), label = `${w} × ${h} px`;
    if ($('exportDimensions').textContent !== label) $('exportDimensions').textContent = label;
    resizeCanvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    draw();
    copyPreview();
  }
  function requestPreview() {
    if (!previewRaf) previewRaf = requestAnimationFrame(() => { previewRaf = 0; refreshPreview(); });
  }
  function lockControls(lock) {
    for (const el of document.querySelectorAll('#exportFrame,#exportSize,#exportDuration,#exportBg,[data-export-format]')) el.disabled = lock;
  }
  function syncLanguage() {
    $('startExport').textContent = t(recording ? '録画を停止' : '書き出しを開始');
    if (!recording) $('recordStatus').textContent = t('プレビューの範囲と背景で保存します。');
  }
  function setFormat(value) {
    format = value === 'png' ? 'png' : 'webm';
    for (const button of document.querySelectorAll('[data-export-format]')) button.classList.toggle('active', button.dataset.exportFormat === format);
    $('durationGroup').classList.toggle('hidden', format === 'png');
    syncLanguage();
  }
  function settings() {
    return { format, frame: $('exportFrame').value, size: $('exportSize').value, background: $('exportBg').value, duration: $('exportDuration').value };
  }
  function restoreSettings(saved) {
    const background = getState().background;
    for (const [id, key] of [['exportFrame', 'frame'], ['exportSize', 'size'], ['exportBg', 'background'], ['exportDuration', 'duration']]) {
      const value = saved?.[key];
      if ([...$(id).options].some(option => option.value === value && !option.disabled)) $(id).value = value;
      else if (id === 'exportFrame') $(id).value = 'foreground';
      else if (id === 'exportBg') $(id).value = background ? 'image' : 'white';
    }
    setFormat(saved?.format);
  }
  function stopRecording() {
    if (!recording) return;
    recording = null;
    getState().params.autoPlaying = previousAuto;
    syncPlayback();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    lockControls(false);
    $('recBadge').classList.remove('show');
    syncLanguage();
    $('recordStatus').textContent = t('録画が終了しました。');
    requestRedraw();
  }
  function begin() {
    if (recording) { stopRecording(); return; }
    if (pngBusy) return;
    cancelPreview();
    const frame = bounds(), [w, h] = resolution(frame), filename = baseName();
    try { resizeCanvas(w, h); } catch (error) { toast(error.message); return; }
    $('exportDimensions').textContent = `${w} × ${h} px`;
    if (format === 'png') {
      pngBusy = true;
      try {
        draw(); copyPreview();
        canvas.toBlob(blob => {
          pngBusy = false;
          if (blob) { download(blob, filename + '-frame.png'); toast('PNGを書き出しました'); }
          else toast('PNGの作成に失敗しました');
        }, 'image/png');
      } catch (error) { pngBusy = false; toast(error.message); }
      return;
    }
    if (!window.MediaRecorder || !canvas.captureStream) { toast('このブラウザは動画録画に対応していません。PNGをお試しください'); return; }
    const mime = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) { toast('対応する動画エンコーダが見つかりません'); return; }
    let stream = null;
    try {
      stream = canvas.captureStream(30);
      const chunks = [], currentRecorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      recorder = currentRecorder;
      recording = { started: performance.now(), until: +$('exportDuration').value * 1000, lastDraw: 0, frame };
      currentRecorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
      currentRecorder.onerror = event => { console.error(event); toast('録画エラーが発生しました'); stopRecording(); };
      currentRecorder.onstop = () => {
        if (chunks.length) {
          download(new Blob(chunks, { type: mime }), filename + '-animation.' + (mime.includes('mp4') ? 'mp4' : 'webm'));
          toast('動画を書き出しました');
        } else toast('録画データがありませんでした');
        stream.getTracks().forEach(track => track.stop());
        if (recorder === currentRecorder) recorder = null;
      };
      previousAuto = getState().params.autoPlaying;
      getState().params.autoPlaying = true;
      syncPlayback(); draw(); currentRecorder.start(200);
      lockControls(true); copyPreview();
      $('recBadge').classList.add('show');
      $('startExport').textContent = t('録画を停止');
      $('recordStatus').textContent = t('{size} px · 録画中…', { size: `${w} × ${h}` });
      requestRedraw();
    } catch (error) {
      console.error(error); stopRecording();
      stream?.getTracks().forEach(track => track.stop());
      recorder = null;
      toast(t('録画を開始できませんでした: {error}', { error: error.message }));
    }
  }
  function update(now, didRender) {
    if (recording) {
      if (!recording.lastDraw || now - recording.lastDraw >= 33) { draw(); copyPreview(); recording.lastDraw = now; }
      $('recordStatus').textContent = t('録画中 {elapsed} / {duration} 秒', { elapsed: ((now - recording.started) / 1000).toFixed(1), duration: (recording.until / 1000).toFixed(1) });
      if (now - recording.started >= recording.until) stopRecording();
    } else if (didRender) refreshPreview();
  }

  $('btnExport').onclick = () => modal.show(true);
  $('startExport').onclick = begin;
  for (const button of document.querySelectorAll('[data-export-format]')) button.onclick = () => {
    if (recording) return;
    setFormat(button.dataset.exportFormat);
    $('exportSize').value = format === 'png' ? 'original' : '720';
    const { stageBackground, background } = getState();
    $('exportBg').value = stageBackground === 'image' && background ? 'image' : format === 'png' ? 'transparent' : 'white';
    requestPreview();
  };
  for (const id of ['exportFrame', 'exportSize', 'exportBg']) $(id).addEventListener('change', requestPreview);

  return { modal, settings, restoreSettings, syncLanguage, update, stopRecording,
    get recording() { return !!recording; }, get format() { return format; },
    updateMesh(mesh) { renderer?.updateMesh(mesh); },
    removeBackground() { renderer?.updateBackground(null); },
    invalidateDocument() { renderer?.dispose(); renderer = null; } };
}
