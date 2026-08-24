const UPNG = require("@pdf-lib/upng").default || require("@pdf-lib/upng");
const jpeg = require("jpeg-js");

const SAVE_OPTIONS = {
  useObjectStreams: true,
  addDefaultPage: false
};

const JPEG_QUALITY = 58;
const MAX_EDGE_PX = 420;
const TARGET_DPI = 110;

async function compactPdfBytes(bytes) {
  const { PDFDocument } = require("pdf-lib");
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false
  });
  return Buffer.from(await doc.save(SAVE_OPTIONS));
}

async function saveCompressedPdf(pdfDoc) {
  return Buffer.from(await pdfDoc.save(SAVE_OPTIONS));
}

function targetSize(widthPt, heightPt, srcW, srcH) {
  const boxW = Math.max(1, Number(widthPt) || 100);
  const boxH = Math.max(1, Number(heightPt) || 50);
  let w = Math.round((boxW * TARGET_DPI) / 72);
  let h = Math.round((boxH * TARGET_DPI) / 72);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h, 1));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  if (srcW && srcH) {
    w = Math.min(w, srcW);
    h = Math.min(h, srcH);
  }
  return { w, h };
}

function resizeRgba(src, sw, sh, dw, dh) {
  const srcBuf = Buffer.isBuffer(src) ? src : Buffer.from(src);
  if (sw === dw && sh === dh) return srcBuf;
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const sy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dw; x += 1) {
      const sx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const di = (y * dw + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const v0 = srcBuf[i00 + c] * (1 - fx) + srcBuf[i10 + c] * fx;
        const v1 = srcBuf[i01 + c] * (1 - fx) + srcBuf[i11 + c] * fx;
        out[di + c] = Math.round(v0 * (1 - fy) + v1 * fy);
      }
    }
  }
  return out;
}

function hasUsefulAlpha(rgba) {
  const buf = Buffer.isBuffer(rgba) ? rgba : Buffer.from(rgba);
  for (let i = 3; i < buf.length; i += 4) {
    if (buf[i] < 250) return true;
  }
  return false;
}

function flattenOnWhite(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    if (a >= 0.999) continue;
    out[i] = Math.round(out[i] * a + 255 * (1 - a));
    out[i + 1] = Math.round(out[i + 1] * a + 255 * (1 - a));
    out[i + 2] = Math.round(out[i + 2] * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

function decodeToRgba(imageBuffer, isPng) {
  if (isPng) {
    const img = UPNG.decode(imageBuffer);
    const rgba = UPNG.toRGBA8(img)[0];
    return { width: img.width, height: img.height, data: Buffer.from(rgba) };
  }
  const img = jpeg.decode(imageBuffer, { useTArray: true });
  return { width: img.width, height: img.height, data: Buffer.from(img.data) };
}

/**
 * Downscale photos / signatures / stamps before pdf-lib embed.
 * Photos become JPEG; signatures/stamps with transparency stay palette PNG.
 */
function compressEmbedImage(imageBuffer, { isPng, destWidthPt, destHeightPt, keepAlpha = false } = {}) {
  if (!imageBuffer || imageBuffer.length < 32) {
    return { bytes: imageBuffer, kind: isPng ? "png" : "jpg" };
  }
  try {
    const decoded = decodeToRgba(imageBuffer, isPng);
    const next = targetSize(destWidthPt, destHeightPt, decoded.width, decoded.height);
    const rgba = resizeRgba(decoded.data, decoded.width, decoded.height, next.w, next.h);
    const useAlpha = keepAlpha && hasUsefulAlpha(rgba);

    let bytes;
    let kind;
    if (useAlpha) {
      bytes = Buffer.from(UPNG.encode([rgba.buffer], next.w, next.h, 256));
      kind = "png";
    } else {
      const flat = flattenOnWhite(rgba);
      bytes = Buffer.from(jpeg.encode({ data: flat, width: next.w, height: next.h }, JPEG_QUALITY).data);
      kind = "jpg";
    }

    if (!bytes || bytes.length >= imageBuffer.length) {
      return { bytes: imageBuffer, kind: isPng ? "png" : "jpg" };
    }
    return { bytes, kind };
  } catch (err) {
    console.warn("PDF image compress skipped:", err.message);
    return { bytes: imageBuffer, kind: isPng ? "png" : "jpg" };
  }
}

module.exports = {
  SAVE_OPTIONS,
  compactPdfBytes,
  saveCompressedPdf,
  compressEmbedImage
};
