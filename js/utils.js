/**
 * utils.js — small shared helpers, no dependencies on other modules.
 */

const Utils = (() => {
  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function uid() {
    return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function baseName(filename) {
    const dot = filename.lastIndexOf(".");
    return dot > 0 ? filename.slice(0, dot) : filename;
  }

  function extOf(filename) {
    const dot = filename.lastIndexOf(".");
    return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not read file."));
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load image."));
      img.crossOrigin = "anonymous";
      img.src = src;
    });
  }

  function dataURLToBlob(dataURL) {
    const [header, data] = dataURL.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(data);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  return {
    formatBytes,
    formatTime,
    clamp,
    uid,
    baseName,
    extOf,
    readFileAsDataURL,
    loadImage,
    dataURLToBlob,
    debounce,
    el,
  };
})();
