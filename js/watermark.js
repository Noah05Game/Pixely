/**
 * watermark.js — applies the 05 AI watermark locally in the browser using
 * Canvas. The watermark is never sent to the AI model or included in any
 * prompt; it's composited after generation, purely client-side.
 */

const Watermark = (() => {
  let cachedLogo = null;
  let cachedLogoFailed = false;

  async function getLogo() {
    if (cachedLogo || cachedLogoFailed) return cachedLogo;
    try {
      cachedLogo = await Utils.loadImage(CONFIG.watermark.path);
      return cachedLogo;
    } catch (e) {
      cachedLogoFailed = true;
      return null;
    }
  }

  /**
   * @param {HTMLImageElement|HTMLCanvasElement} sourceImage
   * @param {object} overrides optional per-call watermark settings
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function apply(sourceImage, overrides = {}) {
    const settings = { ...CONFIG.watermark, ...overrides };
    const canvas = document.createElement("canvas");
    canvas.width = sourceImage.width || sourceImage.naturalWidth;
    canvas.height = sourceImage.height || sourceImage.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

    if (!settings.enabled) return canvas;

    const logo = await getLogo();
    if (!logo) return canvas; // No logo file provided yet — skip silently.

    const targetW = canvas.width * (settings.widthPercent / 100);
    const scale = targetW / logo.width;
    const targetH = logo.height * scale;
    const margin = canvas.width * (settings.marginPercent / 100);

    let x, y;
    switch (settings.position) {
      case "bottom-left":
        x = margin;
        y = canvas.height - targetH - margin;
        break;
      case "top-right":
        x = canvas.width - targetW - margin;
        y = margin;
        break;
      case "top-left":
        x = margin;
        y = margin;
        break;
      case "bottom-right":
      default:
        x = canvas.width - targetW - margin;
        y = canvas.height - targetH - margin;
    }

    ctx.save();
    ctx.globalAlpha = settings.opacity;
    ctx.drawImage(logo, x, y, targetW, targetH);
    ctx.restore();

    return canvas;
  }

  function logoAvailable() {
    return getLogo().then((l) => !!l);
  }

  return { apply, logoAvailable };
})();
