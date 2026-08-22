/**
 * export.js — final export with watermark composition and sensible
 * filenames (e.g. IMG_1234-05AI-edited.jpg).
 */

const ExportModule = (() => {
  async function exportCurrent({ originalFilename, format = "png", quality = 0.92 }) {
    const current = HistoryStore.current();
    if (!current) throw new Error("Nothing to export yet.");

    const img = await Utils.loadImage(current.dataUrl);
    const composited = await Watermark.apply(img);

    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const dataUrl = composited.toDataURL(mime, format === "jpeg" ? quality : undefined);

    const base = Utils.baseName(originalFilename || "photo");
    const ext = format === "jpeg" ? "jpg" : "png";
    const filename = `${base}-05AI-edited.${ext}`;

    downloadDataUrl(dataUrl, filename);
    return filename;
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function getPreviewWithWatermark(dataUrl) {
    const img = await Utils.loadImage(dataUrl);
    const c = await Watermark.apply(img);
    return c.toDataURL("image/png");
  }

  return { exportCurrent, getPreviewWithWatermark };
})();
