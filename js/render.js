const CANVAS_W = 640;
const CANVAS_H = 360;
const HOLD_OVERLAY_MS = 1600;
const HOLD_IMAGE_MS = 900;
const TRANSITION_MS = 450;
const TRANSITION_STEPS = 8;

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.naturalWidth / img.naturalHeight;
  const tr = w / h;
  let sx, sy, sw, sh;
  if (ir > tr) {
    sh = img.naturalHeight;
    sw = sh * tr;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / tr;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
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

function drawOverlayText(ctx, w, h, settings) {
  ctx.save();
  ctx.fillStyle = hexToRgba(settings.overlayColor, settings.overlayOpacity);
  ctx.fillRect(0, 0, w, h);

  const pad = Math.round(h * 0.09);
  ctx.strokeStyle = hexToRgba(settings.textColor, 0.55);
  ctx.lineWidth = Math.max(1, h * 0.004);
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  const title = (settings.title || '').trim();
  if (title) {
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
  }
  ctx.restore();
}

function renderPlainCanvas(img) {
  const c = createCanvas(CANVAS_W, CANVAS_H);
  drawCover(c.getContext('2d'), img, 0, 0, CANVAS_W, CANVAS_H);
  return c;
}

function renderOverlayCanvas(img, settings) {
  const c = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = c.getContext('2d');
  drawCover(ctx, img, 0, 0, CANVAS_W, CANVAS_H);
  drawOverlayText(ctx, CANVAS_W, CANVAS_H, settings);
  return c;
}

function buildKeyframes(images, settings) {
  const frames = [];
  frames.push(renderOverlayCanvas(images[0], settings));
  images.forEach((img) => frames.push(renderPlainCanvas(img)));
  frames.push(renderOverlayCanvas(images[images.length - 1], settings));
  return frames;
}

function buildSegments(keyframes) {
  const segments = [];
  segments.push({ type: 'hold', canvas: keyframes[0], duration: HOLD_OVERLAY_MS });
  for (let i = 1; i < keyframes.length; i++) {
    segments.push({ type: 'transition', from: keyframes[i - 1], to: keyframes[i], duration: TRANSITION_MS });
    const isEdge = i === keyframes.length - 1;
    segments.push({ type: 'hold', canvas: keyframes[i], duration: isEdge ? HOLD_OVERLAY_MS : HOLD_IMAGE_MS });
  }
  return segments;
}

function totalDuration(segments) {
  return segments.reduce((sum, s) => sum + s.duration, 0);
}

function renderAtTime(ctx, segments, tMs) {
  const total = totalDuration(segments);
  if (total <= 0) return;
  const t = tMs % total;
  let accum = 0;
  for (const seg of segments) {
    if (t < accum + seg.duration) {
      const local = t - accum;
      if (seg.type === 'hold') {
        ctx.drawImage(seg.canvas, 0, 0);
      } else {
        const p = local / seg.duration;
        ctx.drawImage(seg.from, 0, 0);
        ctx.globalAlpha = p;
        ctx.drawImage(seg.to, 0, 0);
        ctx.globalAlpha = 1;
      }
      return;
    }
    accum += seg.duration;
  }
}

function blendCanvas(from, to, p) {
  const c = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = c.getContext('2d');
  ctx.drawImage(from, 0, 0);
  ctx.globalAlpha = p;
  ctx.drawImage(to, 0, 0);
  ctx.globalAlpha = 1;
  return c;
}

function buildGifFrames(segments) {
  const frames = [];
  for (const seg of segments) {
    if (seg.type === 'hold') {
      frames.push({ canvas: seg.canvas, delay: seg.duration });
    } else {
      for (let s = 1; s < TRANSITION_STEPS; s++) {
        const p = s / TRANSITION_STEPS;
        frames.push({
          canvas: blendCanvas(seg.from, seg.to, p),
          delay: Math.round(seg.duration / TRANSITION_STEPS),
        });
      }
    }
  }
  return frames;
}
