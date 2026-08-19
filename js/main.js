const MAX_IMAGES = 10;
const MIN_IMAGES = 2;

const state = {
  images: [], // { id, url, img }
  segments: [],
  settings: {
    title: '',
    overlayColor: '#1a1030',
    overlayOpacity: 0.55,
    textColor: '#f4e7c9',
    fontFamily: 'M PLUS Rounded 1c',
  },
};

let nextId = 1;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const uploadMsg = document.getElementById('upload-msg');
const imageCountEl = document.getElementById('image-count');
const imageListEl = document.getElementById('image-list');

const titleInput = document.getElementById('title-input');
const overlayColorInput = document.getElementById('overlay-color');
const overlayOpacityInput = document.getElementById('overlay-opacity');
const overlayOpacityValue = document.getElementById('overlay-opacity-value');
const textColorInput = document.getElementById('text-color');
const fontSelect = document.getElementById('font-select');

const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');

const generateBtn = document.getElementById('generate-btn');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultWrap = document.getElementById('result-wrap');
const resultGif = document.getElementById('result-gif');
const downloadLink = document.getElementById('download-link');

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

    const thumb = document.createElement('img');
    thumb.src = entry.url;
    thumb.alt = `画像 ${index + 1}`;

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

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeImage(entry.id));

    controls.append(upBtn, downBtn, removeBtn);
    li.append(thumb, controls);
    imageListEl.appendChild(li);
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
    img.onload = () => {
      state.images.push({ id: nextId++, url, img });
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
}

function rebuildTimeline() {
  if (state.images.length === 0) {
    state.segments = [];
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.save();
    previewCtx.fillStyle = '#2a2140';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.fillStyle = '#9a8fc2';
    previewCtx.font = '20px sans-serif';
    previewCtx.textAlign = 'center';
    previewCtx.textBaseline = 'middle';
    previewCtx.fillText('画像を追加するとプレビューされます', previewCanvas.width / 2, previewCanvas.height / 2);
    previewCtx.restore();
    return;
  }
  const keyframes = buildKeyframes(state.images.map((e) => e.img), state.settings);
  state.segments = buildSegments(keyframes);
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
fontSelect.addEventListener('change', scheduleRebuild);

function previewLoop(ts) {
  if (state.segments.length > 0) {
    renderAtTime(previewCtx, state.segments, ts);
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

  const frames = buildGifFrames(state.segments);

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
  });

  gif.render();
});

updateImageCount();
rebuildTimeline();
