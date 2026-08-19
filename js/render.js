const CANVAS_W = 640;
const CANVAS_H = 360;
const HOLD_OVERLAY_MS = 1600;
const HOLD_IMAGE_MS = 900;
const TRANSITION_MS = 500;
const TRANSITION_STEPS = 8;

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function defaultTransform() {
  return { scale: 1, cx: 0.5, cy: 0.5 };
}

// transform.scale (>=1): 1 fills the frame with no gaps (minimum cover scale),
// higher values zoom in. transform.cx/cy (0..1): normalized focus point within
// the source image that stays centered in the frame.
function drawCover(ctx, img, x, y, w, h, transform) {
  const t = transform || defaultTransform();
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const baseScale = Math.max(w / iw, h / ih);
  const scale = baseScale * Math.max(1, t.scale || 1);
  const cropW = w / scale;
  const cropH = h / scale;
  const cx = iw * (t.cx != null ? t.cx : 0.5);
  const cy = ih * (t.cy != null ? t.cy : 0.5);
  const sx = Math.min(Math.max(cx - cropW / 2, 0), Math.max(0, iw - cropW));
  const sy = Math.min(Math.max(cy - cropH / 2, 0), Math.max(0, ih - cropH));
  ctx.drawImage(img, sx, sy, cropW, cropH, x, y, w, h);
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function wrapLines(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  let current = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    const test = current + ch;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function applyTextAnimStyle(ctx, w, h, style, progress) {
  switch (style) {
    case 'slide': {
      ctx.globalAlpha = progress;
      ctx.translate(0, (1 - progress) * h * 0.22);
      break;
    }
    case 'pop': {
      ctx.globalAlpha = progress;
      const scale = 0.55 + 0.45 * progress;
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-w / 2, -h / 2);
      break;
    }
    case 'blur': {
      ctx.globalAlpha = progress;
      const blurPx = (1 - progress) * 14;
      if (blurPx > 0.05) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      break;
    }
    case 'fade':
    default: {
      ctx.globalAlpha = progress;
      break;
    }
  }
}

// progress: 0 = fully hidden, 1 = fully shown. Draws the text backdrop + title
// on top of whatever is already on the canvas (the cover-fit photo).
function drawTitleOverlay(ctx, w, h, settings, progress) {
  ctx.save();
  const backdropAlpha = settings.overlayOpacity * progress;
  ctx.fillStyle = hexToRgba(settings.overlayColor, backdropAlpha);
  ctx.fillRect(0, 0, w, h);

  const pad = Math.round(h * 0.09);
  ctx.strokeStyle = hexToRgba(settings.textColor, 0.55 * progress);
  ctx.lineWidth = Math.max(1, h * 0.004);
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  const title = (settings.title || '').trim();
  if (title && progress > 0.001) {
    ctx.save();
    applyTextAnimStyle(ctx, w, h, settings.textAnimStyle, progress);

    const fontSize = Math.round(h * 0.15);
    ctx.font = `${fontSize}px "${settings.fontFamily}"`;
    ctx.fillStyle = settings.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = h * 0.02;

    const maxWidth = w * 0.76;
    const lines = wrapLines(ctx, title, maxWidth);
    const lineHeight = fontSize * 1.25;
    const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineHeight);
    });

    const ruleWidth = Math.min(w * 0.3, maxWidth * 0.5);
    ctx.shadowBlur = 0;
    ctx.filter = 'none';
    ctx.strokeStyle = hexToRgba(settings.textColor, 0.7);
    ctx.lineWidth = Math.max(1, h * 0.006);
    const ruleY1 = startY - lineHeight * 0.75;
    const ruleY2 = startY + (lines.length - 1) * lineHeight + lineHeight * 0.75;
    [ruleY1, ruleY2].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(w / 2 - ruleWidth / 2, y);
      ctx.lineTo(w / 2 + ruleWidth / 2, y);
      ctx.stroke();
    });
    ctx.restore();
  }
  ctx.restore();
}

function drawWatermark(ctx, w, h) {
  const text = '© SQUARE ENIX © FINAL FANTASY XIV';
  const fontSize = Math.max(9, Math.round(h * 0.032));
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const paddingX = w * 0.02;
  const paddingY = h * 0.025;
  const metrics = ctx.measureText(text);
  const boxPadX = 6;
  const boxPadY = 3;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(
    w - paddingX - metrics.width - boxPadX * 2,
    h - paddingY - fontSize - boxPadY,
    metrics.width + boxPadX * 2,
    fontSize + boxPadY * 2
  );
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(text, w - paddingX, h - paddingY);
  ctx.restore();
}

// These cached per-image canvases stay watermark-free: they also serve as the
// source/target for image-transitions, and baking the watermark in here would
// make it slide/zoom/flip along with the transition instead of staying put.
function renderPlainCanvas(entry) {
  const c = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = c.getContext('2d');
  drawCover(ctx, entry.img, 0, 0, CANVAS_W, CANVAS_H, entry.transform);
  return c;
}

function renderOverlayCanvas(entry, settings) {
  const c = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = c.getContext('2d');
  drawCover(ctx, entry.img, 0, 0, CANVAS_W, CANVAS_H, entry.transform);
  drawTitleOverlay(ctx, CANVAS_W, CANVAS_H, settings, 1);
  return c;
}

// Renders one frame of an image-to-image transition (p: 0..1) into ctx.
function drawTransitionFrame(ctx, from, to, p, type) {
  ctx.save();
  ctx.globalAlpha = 1;
  switch (type) {
    case 'slide': {
      const dx = CANVAS_W * p;
      ctx.drawImage(from, -dx, 0);
      ctx.drawImage(to, CANVAS_W - dx, 0);
      break;
    }
    case 'wipe': {
      ctx.drawImage(from, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, CANVAS_W * p, CANVAS_H);
      ctx.clip();
      ctx.drawImage(to, 0, 0);
      break;
    }
    case 'zoom': {
      ctx.drawImage(from, 0, 0);
      ctx.globalAlpha = p;
      const scale = 1.15 - 0.15 * p;
      const sw = CANVAS_W * scale;
      const sh = CANVAS_H * scale;
      ctx.drawImage(to, (CANVAS_W - sw) / 2, (CANVAS_H - sh) / 2, sw, sh);
      break;
    }
    case 'flip': {
      const half = p < 0.5;
      const s = Math.max(0.02, half ? 1 - p / 0.5 : (p - 0.5) / 0.5);
      ctx.translate(CANVAS_W / 2, 0);
      ctx.scale(s, 1);
      ctx.translate(-CANVAS_W / 2, 0);
      ctx.drawImage(half ? from : to, 0, 0);
      break;
    }
    case 'iris': {
      ctx.drawImage(from, 0, 0);
      const maxR = Math.hypot(CANVAS_W / 2, CANVAS_H / 2);
      ctx.beginPath();
      ctx.arc(CANVAS_W / 2, CANVAS_H / 2, maxR * p, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(to, 0, 0);
      break;
    }
    case 'fade':
    default: {
      ctx.drawImage(from, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(to, 0, 0);
      break;
    }
  }
  ctx.restore();
}

// Builds the full animation timeline as a list of segments:
//  - { type:'hold', canvas, duration }
//  - { type:'image-transition', from, to, duration, transitionType }
//  - { type:'title-transition', entry, direction:'in'|'out', duration }
// `entries` is a list of { img, transform } objects.
function buildTimeline(entries, settings) {
  const plainCanvases = entries.map((entry) => renderPlainCanvas(entry));
  const titleStartCanvas = renderOverlayCanvas(entries[0], settings);
  const imageHoldMs = settings.imageHoldMs || HOLD_IMAGE_MS;

  const segments = [];
  segments.push({ type: 'hold', canvas: titleStartCanvas, duration: HOLD_OVERLAY_MS });
  segments.push({ type: 'title-transition', entry: entries[0], direction: 'out', duration: TRANSITION_MS });
  segments.push({ type: 'hold', canvas: plainCanvases[0], duration: imageHoldMs });

  for (let i = 1; i < entries.length; i++) {
    segments.push({
      type: 'image-transition',
      from: plainCanvases[i - 1],
      to: plainCanvases[i],
      duration: TRANSITION_MS,
      transitionType: settings.transitionType,
    });
    segments.push({ type: 'hold', canvas: plainCanvases[i], duration: imageHoldMs });
  }

  return segments;
}

function totalDuration(segments) {
  return segments.reduce((sum, s) => sum + s.duration, 0);
}

function renderAtTime(ctx, segments, tMs, settings) {
  const total = totalDuration(segments);
  if (total <= 0) return;
  const t = tMs % total;
  let accum = 0;
  for (const seg of segments) {
    if (t < accum + seg.duration) {
      const local = t - accum;
      if (seg.type === 'hold') {
        ctx.drawImage(seg.canvas, 0, 0);
      } else if (seg.type === 'image-transition') {
        drawTransitionFrame(ctx, seg.from, seg.to, local / seg.duration, seg.transitionType);
      } else if (seg.type === 'title-transition') {
        const raw = local / seg.duration;
        const progress = seg.direction === 'in' ? raw : 1 - raw;
        drawCover(ctx, seg.entry.img, 0, 0, CANVAS_W, CANVAS_H, seg.entry.transform);
        drawTitleOverlay(ctx, CANVAS_W, CANVAS_H, settings, progress);
      }
      // Drawn last, outside any transition's transform/clip, so the credit
      // stays fixed in place instead of animating with the image beneath it.
      drawWatermark(ctx, CANVAS_W, CANVAS_H);
      return;
    }
    accum += seg.duration;
  }
}

function buildGifFrames(segments, settings) {
  const frames = [];
  for (const seg of segments) {
    if (seg.type === 'hold') {
      // Copy onto a fresh canvas rather than drawing on seg.canvas directly —
      // that cached canvas is also reused as an image-transition endpoint, so
      // baking the watermark into it would carry the watermark into the
      // transition's slide/zoom/flip math too.
      const canvas = createCanvas(CANVAS_W, CANVAS_H);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(seg.canvas, 0, 0);
      drawWatermark(ctx, CANVAS_W, CANVAS_H);
      frames.push({ canvas, delay: seg.duration });
      continue;
    }
    const delay = Math.round(seg.duration / TRANSITION_STEPS);
    for (let s = 1; s < TRANSITION_STEPS; s++) {
      const canvas = createCanvas(CANVAS_W, CANVAS_H);
      const ctx = canvas.getContext('2d');
      if (seg.type === 'image-transition') {
        drawTransitionFrame(ctx, seg.from, seg.to, s / TRANSITION_STEPS, seg.transitionType);
      } else if (seg.type === 'title-transition') {
        const raw = s / TRANSITION_STEPS;
        const progress = seg.direction === 'in' ? raw : 1 - raw;
        drawCover(ctx, seg.entry.img, 0, 0, CANVAS_W, CANVAS_H, seg.entry.transform);
        drawTitleOverlay(ctx, CANVAS_W, CANVAS_H, settings, progress);
      }
      drawWatermark(ctx, CANVAS_W, CANVAS_H);
      frames.push({ canvas, delay });
    }
  }
  return frames;
}
