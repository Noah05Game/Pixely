/**
 * editor.js — the image canvas: rendering, zoom/pan, and rectangle /
 * freeform selection. Coordinates are always tracked in *image space*
 * so selections stay correct at any zoom level.
 */

const Editor = (() => {
  let canvas, ctx, wrapper;
  let image = null; // current HTMLImageElement being displayed
  let zoom = 1;
  let fitZoom = 1;
  let panX = 0, panY = 0;
  let mode = "select"; // "select" | "freeform" | "pan" | "whole"
  let selection = null; // {x,y,w,h} in image space, or null
  let freeformPoints = null; // array of {x,y} in image space
  let isDragging = false;
  let dragStart = null;
  let isPanning = false;
  let panStart = null;
  let ants = 0;
  let antsTimer = null;

  const listeners = new Set();
  function notify() {
    listeners.forEach((fn) => fn({ mode, selection, hasFreeform: !!freeformPoints, zoom }));
  }
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function init(canvasEl, wrapperEl) {
    canvas = canvasEl;
    wrapper = wrapperEl;
    ctx = canvas.getContext("2d");

    canvas.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    window.addEventListener("touchmove", onPointerMove, { passive: false });
    window.addEventListener("touchend", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", () => {
      if (image) render();
    });

    if (!antsTimer) {
      antsTimer = setInterval(() => {
        ants = (ants + 1) % 16;
        if (selection || freeformPoints) render();
      }, 90);
    }
  }

  function setImage(img) {
    image = img;
    selection = null;
    freeformPoints = null;
    fitToScreen();
  }

  function getImage() {
    return image;
  }

  function setMode(m) {
    mode = m;
    if (m === "whole") {
      selectEntireImage();
    }
    notify();
  }

  function getMode() {
    return mode;
  }

  function clearSelection() {
    selection = null;
    freeformPoints = null;
    render();
    notify();
  }

  function selectEntireImage() {
    if (!image) return;
    selection = { x: 0, y: 0, w: image.width, h: image.height };
    freeformPoints = null;
    render();
    notify();
  }

  function hasSelection() {
    return !!(selection || freeformPoints);
  }

  function isWholeImageSelection() {
    if (!selection || !image) return false;
    return selection.x === 0 && selection.y === 0 && selection.w === image.width && selection.h === image.height;
  }

  function fitToScreen() {
    if (!image || !wrapper) return;
    const pad = 32;
    const availW = wrapper.clientWidth - pad;
    const availH = wrapper.clientHeight - pad;
    fitZoom = Utils.clamp(Math.min(availW / image.width, availH / image.height), 0.02, 4);
    zoom = fitZoom;
    panX = 0;
    panY = 0;
    render();
    notify();
  }

  function setZoom(z) {
    zoom = Utils.clamp(z, 0.05, 8);
    render();
    notify();
  }

  function zoomIn() {
    setZoom(zoom * 1.25);
  }
  function zoomOut() {
    setZoom(zoom / 1.25);
  }
  function resetZoom() {
    fitToScreen();
  }

  function screenToImage(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const offsetX = canvas.width / 2 - (image.width * zoom) / 2 + panX;
    const offsetY = canvas.height / 2 - (image.height * zoom) / 2 + panY;
    return {
      x: (cx - offsetX) / zoom,
      y: (cy - offsetY) / zoom,
    };
  }

  function getEventPoint(e) {
    if (e.touches && e.touches.length) return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    return { clientX: e.clientX, clientY: e.clientY };
  }

  function onPointerDown(e) {
    if (!image) return;
    if (mode === "pan") {
      isPanning = true;
      const p = getEventPoint(e);
      panStart = { x: p.clientX - panX, y: p.clientY - panY };
      return;
    }
    if (mode !== "select" && mode !== "freeform") return;
    e.preventDefault();
    const p = getEventPoint(e);
    const imgPt = screenToImage(p.clientX, p.clientY);
    isDragging = true;

    if (mode === "select") {
      dragStart = imgPt;
      selection = { x: imgPt.x, y: imgPt.y, w: 0, h: 0 };
      freeformPoints = null;
    } else {
      freeformPoints = [imgPt];
      selection = null;
    }
    render();
  }

  function onPointerMove(e) {
    if (!image) return;
    if (isPanning) {
      const p = getEventPoint(e);
      panX = p.clientX - panStart.x;
      panY = p.clientY - panStart.y;
      render();
      return;
    }
    if (!isDragging) return;
    const p = getEventPoint(e);
    e.preventDefault?.();
    const imgPt = screenToImage(p.clientX, p.clientY);

    if (mode === "select" && dragStart) {
      const x = Math.min(dragStart.x, imgPt.x);
      const y = Math.min(dragStart.y, imgPt.y);
      const w = Math.abs(imgPt.x - dragStart.x);
      const h = Math.abs(imgPt.y - dragStart.y);
      selection = clampRect({ x, y, w, h });
      render();
    } else if (mode === "freeform" && freeformPoints) {
      freeformPoints.push(imgPt);
      render();
    }
  }

  function onPointerUp() {
    isDragging = false;
    isPanning = false;
    dragStart = null;
    if (selection && (selection.w < 3 || selection.h < 3)) selection = null;
    if (freeformPoints && freeformPoints.length < 3) freeformPoints = null;
    if (freeformPoints) selection = freeformBoundingBox(freeformPoints);
    render();
    notify();
  }

  function onWheel(e) {
    if (!image) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(zoom * delta);
  }

  function clampRect(r) {
    const x = Utils.clamp(r.x, 0, image.width);
    const y = Utils.clamp(r.y, 0, image.height);
    const w = Utils.clamp(r.w, 0, image.width - x);
    const h = Utils.clamp(r.h, 0, image.height - y);
    return { x, y, w, h };
  }

  function freeformBoundingBox(points) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return clampRect({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    });
  }

  function render() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!image) return;

    const offsetX = w / 2 - (image.width * zoom) / 2 + panX;
    const offsetY = h / 2 - (image.height * zoom) / 2 + panY;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    if (selection && !isWholeImageSelection()) {
      drawSelectionOverlay(offsetX, offsetY);
    } else if (selection && isWholeImageSelection()) {
      drawWholeImageBorder(offsetX, offsetY);
    }
  }

  function drawSelectionOverlay(offsetX, offsetY) {
    const sx = offsetX + selection.x * zoom;
    const sy = offsetY + selection.y * zoom;
    const sw = selection.w * zoom;
    const sh = selection.h * zoom;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(sx, sy, sw, sh);
    // Re-draw image inside the selection so it's not dimmed.
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    if (freeformPoints && freeformPoints.length > 2) {
      ctx.beginPath();
      ctx.moveTo(offsetX + freeformPoints[0].x * zoom, offsetY + freeformPoints[0].y * zoom);
      for (const p of freeformPoints) ctx.lineTo(offsetX + p.x * zoom, offsetY + p.y * zoom);
      ctx.closePath();
      ctx.strokeStyle = "#5eead4";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.strokeStyle = "#5eead4";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -ants;
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);

    // corner handles
    const hs = 6;
    ctx.fillStyle = "#5eead4";
    for (const [hx, hy] of [
      [sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh],
    ]) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
    ctx.restore();
  }

  function drawWholeImageBorder(offsetX, offsetY) {
    ctx.save();
    ctx.strokeStyle = "#5eead4";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -ants;
    ctx.strokeRect(offsetX, offsetY, image.width * zoom, image.height * zoom);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** Crop the selection out of the current image into a new canvas. */
  function getSelectionCanvas() {
    if (!image || !selection) return null;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(selection.w));
    c.height = Math.max(1, Math.round(selection.h));
    const cctx = c.getContext("2d");
    cctx.drawImage(image, selection.x, selection.y, selection.w, selection.h, 0, 0, c.width, c.height);
    return c;
  }

  function getFullImageCanvas() {
    if (!image) return null;
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d").drawImage(image, 0, 0);
    return c;
  }

  function getZoomPercent() {
    return Math.round(zoom * 100);
  }

  return {
    init,
    setImage,
    getImage,
    setMode,
    getMode,
    clearSelection,
    selectEntireImage,
    hasSelection,
    isWholeImageSelection,
    fitToScreen,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    getZoomPercent,
    getSelectionCanvas,
    getFullImageCanvas,
    onChange,
    render,
  };
})();
