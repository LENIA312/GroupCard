const MAX_IMAGES = 10;
const MIN_IMAGES = 2;
const SHARE_HASHTAGS = '#FFXIV #FF14 #FF14グループカード';
const SHARE_TEXT = `${SHARE_HASHTAGS}\n${location.origin}`;

const state = {
  images: [], // { id, url, img }
  segments: [],
  orientation: 'landscape',
  settings: {
    title: '',
    overlayColor: '#1a1030',
    overlayOpacity: 0.55,
    textColor: '#f4e7c9',
    fontFamily: 'M PLUS Rounded 1c',
    transitionType: 'fade',
    textAnimStyle: 'fade',
    imageHoldMs: 900,
  },
};

let nextId = 1;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const uploadMsg = document.getElementById('upload-msg');
const imageCountEl = document.getElementById('image-count');
const imageListEl = document.getElementById('image-list');

const orientationLandscapeBtn = document.getElementById('orientation-landscape');
const orientationPortraitBtn = document.getElementById('orientation-portrait');
const titleInput = document.getElementById('title-input');
const overlayColorInput = document.getElementById('overlay-color');
const overlayOpacityInput = document.getElementById('overlay-opacity');
const overlayOpacityValue = document.getElementById('overlay-opacity-value');
const textColorInput = document.getElementById('text-color');
const fontSelect = document.getElementById('font-select');
const transitionSelect = document.getElementById('transition-select');
const textAnimSelect = document.getElementById('text-anim-select');
const imageDurationInput = document.getElementById('image-duration');
const imageDurationValue = document.getElementById('image-duration-value');

const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');

const generateBtn = document.getElementById('generate-btn');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultWrap = document.getElementById('result-wrap');
const resultGif = document.getElementById('result-gif');
const downloadLink = document.getElementById('download-link');
const shareBtn = document.getElementById('share-btn');
const copyHashtagBtn = document.getElementById('copy-hashtag-btn');
const hashtagTextEl = document.getElementById('hashtag-text');
hashtagTextEl.textContent = SHARE_TEXT;

let lastGifBlob = null;
let lastGifFilename = '';

function setUploadMsg(text) {
  uploadMsg.textContent = text || '';
}

function updateImageCount() {
  imageCountEl.textContent = `${state.images.length} / ${MAX_IMAGES} 枚`;
  generateBtn.disabled = state.images.length < MIN_IMAGES;
}

function renderThumbnails() {
  imageListEl.innerHTML = '';
  state.images.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'image-item';
    li.dataset.id = String(entry.id);

    const thumb = document.createElement('img');
    thumb.src = entry.url;
    thumb.alt = `画像 ${index + 1}`;
    thumb.draggable = false;

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-label', '並び替え（ドラッグ）');

    const controls = document.createElement('div');
    controls.className = 'image-item-controls';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.textContent = '▲';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => moveImage(entry.id, -1));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.textContent = '▼';
    downBtn.disabled = index === state.images.length - 1;
    downBtn.addEventListener('click', () => moveImage(entry.id, 1));

    const adjustBtn = document.createElement('button');
    adjustBtn.type = 'button';
    adjustBtn.textContent = '⛶';
    adjustBtn.setAttribute('aria-label', '位置とサイズを調整');
    adjustBtn.addEventListener('click', () => openAdjustModal(entry.id));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeImage(entry.id));

    controls.append(upBtn, downBtn, adjustBtn, removeBtn);
    li.append(thumb, handle, controls);
    imageListEl.appendChild(li);
    attachDragHandlers(li, handle);
  });
  updateImageCount();
}

function moveImage(id, delta) {
  const index = state.images.findIndex((e) => e.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.images.length) return;
  const [entry] = state.images.splice(index, 1);
  state.images.splice(target, 0, entry);
  renderThumbnails();
  rebuildTimeline();
}

function removeImage(id) {
  const index = state.images.findIndex((e) => e.id === id);
  if (index === -1) return;
  URL.revokeObjectURL(state.images[index].url);
  state.images.splice(index, 1);
  renderThumbnails();
  rebuildTimeline();
}

// Pointer-based drag reorder (works for mouse + touch, unlike native HTML5 DnD).
let dragState = null;

function attachDragHandlers(li, handle) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragState = { pointerId: e.pointerId };
    li.classList.add('dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const overLi = target && target.closest('.image-item');
    if (overLi && overLi !== li && imageListEl.contains(overLi)) {
      const items = [...imageListEl.children];
      const fromIndex = items.indexOf(li);
      const toIndex = items.indexOf(overLi);
      if (fromIndex < toIndex) {
        imageListEl.insertBefore(li, overLi.nextSibling);
      } else {
        imageListEl.insertBefore(li, overLi);
      }
    }
  });

  const endDrag = (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    dragState = null;
    li.classList.remove('dragging');
    const orderedIds = [...imageListEl.children].map((el) => Number(el.dataset.id));
    state.images.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
    renderThumbnails();
    rebuildTimeline();
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}

function addFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  if (files.length === 0) return;

  const remaining = MAX_IMAGES - state.images.length;
  if (remaining <= 0) {
    setUploadMsg(`最大${MAX_IMAGES}枚までです。`);
    return;
  }

  const toAdd = files.slice(0, remaining);
  if (files.length > toAdd.length) {
    setUploadMsg(`最大${MAX_IMAGES}枚までのため、一部の画像は追加されませんでした。`);
  } else {
    setUploadMsg('');
  }

  toAdd.forEach((file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const id = nextId++; // assigned synchronously so selection order survives out-of-order decode/load
    img.onload = () => {
      state.images.push({ id, url, img, transform: defaultTransform() });
      state.images.sort((a, b) => a.id - b.id);
      renderThumbnails();
      rebuildTimeline();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setUploadMsg('画像の読み込みに失敗したファイルがあります。');
    };
    img.src = url;
  });
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});
dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
});

async function ensureFont(family) {
  try {
    await document.fonts.load(`700 32px "${family}"`);
    await document.fonts.ready;
  } catch (e) {
    // fall back silently to default font stack
  }
}

function readSettings() {
  state.settings.title = titleInput.value;
  state.settings.overlayColor = overlayColorInput.value;
  state.settings.overlayOpacity = Number(overlayOpacityInput.value) / 100;
  state.settings.textColor = textColorInput.value;
  state.settings.fontFamily = fontSelect.value;
  state.settings.transitionType = transitionSelect.value;
  state.settings.textAnimStyle = textAnimSelect.value;
  state.settings.imageHoldMs = Math.round(Number(imageDurationInput.value) * 1000);
}

function rebuildTimeline() {
  if (state.images.length === 0) {
    state.segments = [];
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.save();
    previewCtx.fillStyle = '#fff0f6';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.fillStyle = '#d6598c';
    previewCtx.font = '20px sans-serif';
    previewCtx.textAlign = 'center';
    previewCtx.textBaseline = 'middle';
    previewCtx.fillText('画像を追加するとプレビューされます', previewCanvas.width / 2, previewCanvas.height / 2);
    previewCtx.restore();
    return;
  }
  state.segments = buildTimeline(state.images, state.settings);
}

let debounceHandle = null;
function scheduleRebuild() {
  readSettings();
  clearTimeout(debounceHandle);
  debounceHandle = setTimeout(async () => {
    await ensureFont(state.settings.fontFamily);
    rebuildTimeline();
  }, 120);
}

[titleInput, overlayColorInput, textColorInput].forEach((el) => {
  el.addEventListener('input', scheduleRebuild);
});
overlayOpacityInput.addEventListener('input', () => {
  overlayOpacityValue.textContent = `${overlayOpacityInput.value}%`;
  scheduleRebuild();
});
[fontSelect, transitionSelect, textAnimSelect].forEach((el) => {
  el.addEventListener('change', scheduleRebuild);
});
imageDurationInput.addEventListener('input', () => {
  imageDurationValue.textContent = `${Number(imageDurationInput.value).toFixed(1)}秒`;
  scheduleRebuild();
});

function setOrientation(mode) {
  if (mode === state.orientation) return;
  state.orientation = mode;
  setCanvasOrientation(mode);
  previewCanvas.width = CANVAS_W;
  previewCanvas.height = CANVAS_H;
  adjustCanvas.width = CANVAS_W;
  adjustCanvas.height = CANVAS_H;
  document.body.classList.toggle('orientation-portrait', mode === 'portrait');
  orientationLandscapeBtn.classList.toggle('is-active', mode === 'landscape');
  orientationPortraitBtn.classList.toggle('is-active', mode === 'portrait');
  rebuildTimeline();
  if (adjustingId != null) renderAdjustPreview();
}

orientationLandscapeBtn.addEventListener('click', () => setOrientation('landscape'));
orientationPortraitBtn.addEventListener('click', () => setOrientation('portrait'));

function previewLoop(ts) {
  if (state.segments.length > 0) {
    renderAtTime(previewCtx, state.segments, ts, state.settings);
  }
  requestAnimationFrame(previewLoop);
}
requestAnimationFrame(previewLoop);

function buildFilename(title) {
  const clean = (title || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
  const base = clean || 'groupcard';
  return `${base}.gif`;
}

generateBtn.addEventListener('click', async () => {
  if (state.images.length < MIN_IMAGES) return;

  readSettings();
  await ensureFont(state.settings.fontFamily);
  rebuildTimeline();

  generateBtn.disabled = true;
  resultWrap.hidden = true;
  progressWrap.hidden = false;
  progressBar.value = 0;
  progressText.textContent = '0%';

  const frames = buildGifFrames(state.segments, state.settings);

  const gif = new GIF({
    workers: Math.min(4, navigator.hardwareConcurrency || 2),
    quality: 10,
    width: CANVAS_W,
    height: CANVAS_H,
    workerScript: 'js/vendor/gif.worker.js',
  });

  frames.forEach((f) => gif.addFrame(f.canvas, { delay: f.delay, copy: true }));

  gif.on('progress', (p) => {
    progressBar.value = p;
    progressText.textContent = `${Math.round(p * 100)}%`;
  });

  gif.on('finished', (blob) => {
    const url = URL.createObjectURL(blob);
    resultGif.src = url;
    downloadLink.href = url;
    downloadLink.download = buildFilename(state.settings.title);
    resultWrap.hidden = false;
    progressWrap.hidden = true;
    generateBtn.disabled = state.images.length < MIN_IMAGES;

    lastGifBlob = blob;
    lastGifFilename = downloadLink.download;
    updateShareButtonVisibility();
  });

  gif.render();
});

function updateShareButtonVisibility() {
  if (!lastGifBlob) {
    shareBtn.hidden = true;
    return;
  }
  const file = new File([lastGifBlob], lastGifFilename, { type: 'image/gif' });
  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  shareBtn.hidden = !canShareFiles;
}

shareBtn.addEventListener('click', async () => {
  if (!lastGifBlob) return;
  const file = new File([lastGifBlob], lastGifFilename, { type: 'image/gif' });
  try {
    await navigator.share({ files: [file], text: SHARE_TEXT });
  } catch (e) {
    // user cancelled the share sheet, or the browser rejected it — nothing to do
  }
});

copyHashtagBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(SHARE_TEXT);
    const original = copyHashtagBtn.textContent;
    copyHashtagBtn.textContent = 'コピーしました';
    setTimeout(() => {
      copyHashtagBtn.textContent = original;
    }, 1500);
  } catch (e) {
    // clipboard API unavailable — the hashtag text is still visible to copy manually
  }
});

// ---- per-image position / zoom adjustment modal ----
const adjustModal = document.getElementById('adjust-modal');
const adjustBackdrop = document.getElementById('adjust-backdrop');
const adjustCanvas = document.getElementById('adjust-canvas');
const adjustCtx = adjustCanvas.getContext('2d');
const adjustZoomInput = document.getElementById('adjust-zoom');
const adjustZoomValue = document.getElementById('adjust-zoom-value');
const adjustResetBtn = document.getElementById('adjust-reset-btn');
const adjustCloseBtn = document.getElementById('adjust-close-btn');

let adjustingId = null;

function getAdjustingEntry() {
  return state.images.find((e) => e.id === adjustingId) || null;
}

function renderAdjustPreview() {
  const entry = getAdjustingEntry();
  if (!entry) return;
  adjustCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawCover(adjustCtx, entry.img, 0, 0, CANVAS_W, CANVAS_H, entry.transform);
}

function openAdjustModal(id) {
  const entry = state.images.find((e) => e.id === id);
  if (!entry) return;
  adjustingId = id;
  const zoomPercent = Math.round(entry.transform.scale * 100);
  adjustZoomInput.value = String(zoomPercent);
  adjustZoomValue.textContent = `${zoomPercent}%`;
  adjustModal.hidden = false;
  renderAdjustPreview();
}

function closeAdjustModal() {
  adjustModal.hidden = true;
  adjustingId = null;
  rebuildTimeline();
}

adjustZoomInput.addEventListener('input', () => {
  const entry = getAdjustingEntry();
  if (!entry) return;
  entry.transform.scale = Number(adjustZoomInput.value) / 100;
  adjustZoomValue.textContent = `${adjustZoomInput.value}%`;
  renderAdjustPreview();
});

adjustResetBtn.addEventListener('click', () => {
  const entry = getAdjustingEntry();
  if (!entry) return;
  entry.transform = defaultTransform();
  adjustZoomInput.value = '100';
  adjustZoomValue.textContent = '100%';
  renderAdjustPreview();
});

adjustCloseBtn.addEventListener('click', closeAdjustModal);
adjustBackdrop.addEventListener('click', closeAdjustModal);

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

let panState = null;
adjustCanvas.addEventListener('pointerdown', (e) => {
  if (!getAdjustingEntry()) return;
  adjustCanvas.setPointerCapture(e.pointerId);
  panState = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
});

adjustCanvas.addEventListener('pointermove', (e) => {
  if (!panState || panState.pointerId !== e.pointerId) return;
  const entry = getAdjustingEntry();
  if (!entry) return;

  const rect = adjustCanvas.getBoundingClientRect();
  const dxCanvas = (e.clientX - panState.lastX) * (CANVAS_W / rect.width);
  const dyCanvas = (e.clientY - panState.lastY) * (CANVAS_H / rect.height);
  panState.lastX = e.clientX;
  panState.lastY = e.clientY;

  const iw = entry.img.naturalWidth;
  const ih = entry.img.naturalHeight;
  const baseScale = Math.max(CANVAS_W / iw, CANVAS_H / ih);
  const effScale = baseScale * Math.max(1, entry.transform.scale || 1);

  entry.transform.cx = clamp01(entry.transform.cx - dxCanvas / effScale / iw);
  entry.transform.cy = clamp01(entry.transform.cy - dyCanvas / effScale / ih);
  renderAdjustPreview();
});

function endPan(e) {
  if (!panState || panState.pointerId !== e.pointerId) return;
  panState = null;
}
adjustCanvas.addEventListener('pointerup', endPan);
adjustCanvas.addEventListener('pointercancel', endPan);

updateImageCount();
rebuildTimeline();
