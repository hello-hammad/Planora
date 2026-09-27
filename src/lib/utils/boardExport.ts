import type { Board, BoardItem } from '$lib/models/types';
import { getFloorTextureCanvas, getWallTextureCanvas } from '$lib/utils/textureGenerator';
import { getMaterial } from '$lib/utils/materials';

/** Render a mood board as a presentation image (PNG) and download it. */

const COLS = 4, TILE_W = 360, SWATCH_H = 250, CAPTION_H = 74, GAP = 28, PAD = 56, HEADER = 150;
const FONT = '"Plus Jakarta Sans", Inter, system-ui, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = '', lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + lines * lineH);
      line = word;
      if (++lines >= maxLines) return;
    } else line = test;
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineH);
}

async function drawSwatch(ctx: CanvasRenderingContext2D, item: BoardItem, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, TILE_W, SWATCH_H, [14, 14, 0, 0]);
  ctx.clip();
  ctx.fillStyle = '#F3ECE3';
  ctx.fillRect(x, y, TILE_W, SWATCH_H);
  if (item.kind === 'wall' && item.texture) {
    const tex = getWallTextureCanvas(item.texture, item.color ?? '#cccccc');
    if (tex) { const pat = ctx.createPattern(tex, 'repeat'); if (pat) { ctx.fillStyle = pat; ctx.fillRect(x, y, TILE_W, SWATCH_H); } }
  } else if (item.kind === 'floor' && item.materialId) {
    const tex = getFloorTextureCanvas(item.materialId);
    if (tex) { const pat = ctx.createPattern(tex, 'repeat'); if (pat) { ctx.fillStyle = pat; ctx.fillRect(x, y, TILE_W, SWATCH_H); } }
    else { ctx.fillStyle = getMaterial(item.materialId).color; ctx.fillRect(x, y, TILE_W, SWATCH_H); }
  } else if ((item.kind === 'wall' || item.kind === 'color') && item.color) {
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y, TILE_W, SWATCH_H);
  } else if (item.kind === 'photo' && item.dataUrl) {
    const img = await loadImage(item.dataUrl);
    if (img) cover(ctx, img, img.naturalWidth, img.naturalHeight, x, y, TILE_W, SWATCH_H);
  } else if (item.kind === 'note') {
    ctx.fillStyle = '#FFF8E6';
    ctx.fillRect(x, y, TILE_W, SWATCH_H);
    ctx.fillStyle = '#4A3026';
    ctx.font = `500 22px ${FONT}`;
    wrap(ctx, item.note || item.label, x + 24, y + 44, TILE_W - 48, 32, 6);
  } else if (item.kind === 'furniture') {
    ctx.fillStyle = '#6B4636';
    ctx.font = `600 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('FURNITURE', x + TILE_W / 2, y + SWATCH_H / 2 - 8);
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(item.label, x + TILE_W / 2, y + SWATCH_H / 2 + 26, TILE_W - 40);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export async function exportBoardPNG(board: Board, projectName: string, roomName?: string) {
  const items = board.items;
  const rows = Math.max(1, Math.ceil(items.length / COLS));
  const width = PAD * 2 + COLS * TILE_W + (COLS - 1) * GAP;
  const height = HEADER + PAD + rows * (SWATCH_H + CAPTION_H) + (rows - 1) * GAP + PAD;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  await document.fonts?.ready;

  ctx.fillStyle = '#F7F3ED';
  ctx.fillRect(0, 0, width, height);
  // Header: brand mark, board title, context line.
  ctx.fillStyle = '#6B4636';
  ctx.beginPath(); ctx.roundRect(PAD, PAD, 52, 52, 14); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(PAD + 17, PAD + 42); ctx.lineTo(PAD + 17, PAD + 12); ctx.lineTo(PAD + 29, PAD + 12);
  ctx.arc(PAD + 29, PAD + 21, 9, -Math.PI / 2, Math.PI / 2); ctx.lineTo(PAD + 17, PAD + 30); ctx.stroke();
  ctx.fillStyle = '#252321';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(board.name, PAD + 76, PAD + 36);
  ctx.fillStyle = '#746F69';
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText([projectName, roomName, `${items.length} item${items.length === 1 ? '' : 's'}`].filter(Boolean).join('  ·  '), PAD + 76, PAD + 68);

  for (const [i, item] of items.entries()) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = PAD + col * (TILE_W + GAP), y = HEADER + PAD + row * (SWATCH_H + CAPTION_H + GAP);
    ctx.fillStyle = '#FFFDF9';
    ctx.beginPath(); ctx.roundRect(x, y, TILE_W, SWATCH_H + CAPTION_H, 14); ctx.fill();
    ctx.strokeStyle = '#DED7CF'; ctx.lineWidth = 1.5; ctx.stroke();
    await drawSwatch(ctx, item, x, y);
    ctx.fillStyle = '#252321';
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(item.label, x + 18, y + SWATCH_H + 30, TILE_W - 36);
    if (item.note && item.kind !== 'note') {
      ctx.fillStyle = '#746F69';
      ctx.font = `500 15px ${FONT}`;
      ctx.fillText(item.note, x + 18, y + SWATCH_H + 54, TILE_W - 36);
    }
  }

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the board image.');
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.name || 'board'}.png`;
    a.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
