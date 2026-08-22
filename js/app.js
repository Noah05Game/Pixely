/**
 * app.js — wires together auth, upload, editor, history, Pollinations calls,
 * and all UI panels. Kept intentionally readable rather than clever.
 */

(function () {
  "use strict";

  let currentFilename = "photo";
  let currentDims = { w: 0, h: 0 };
  let sessionEdits = 0;
  let generateAbort = null;
  let elapsedTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setupLogin();
    if (Auth.isUnlocked()) enterApp();
  }

  // ---------------------------------------------------------------- LOGIN
  function setupLogin() {
    const form = $("#login-form");
    const input = $("#login-code");
    const err = $("#login-error");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (Auth.tryUnlock(input.value)) {
        err.hidden = true;
        enterApp();
      } else {
        err.hidden = false;
      }
    });
  }

  function enterApp() {
    $("#login-screen").hidden = true;
    $("#app").hidden = false;
    setupApp();
  }

  // ---------------------------------------------------------------- APP INIT
  let appInitialized = false;
  function setupApp() {
    if (appInitialized) return;
    appInitialized = true;

    document.title = CONFIG.branding.productName;

    Editor.init($("#editor-canvas"), $("#canvas-wrapper"));
    Editor.onChange(onEditorChange);
    HistoryStore.onChange(onHistoryChange);

    setupUpload();
    setupTools();
    setupPresets();
    setupPromptActions();
    setupCompare();
    setupSettings();
    setupPrivacy();
    setupFirstRun();
    setupConfirmDialog();

    updateSessionCounter();
  }

  // ---------------------------------------------------------------- UPLOAD
  function setupUpload() {
    const zone = $("#upload-zone");
    const fileInput = $("#file-input");

    $("#btn-browse").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
      })
    );
    zone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    window.addEventListener("paste", (e) => {
      if ($("#login-screen").hidden === false) return;
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      if (item) handleFile(item.getAsFile());
    });
  }

  async function handleFile(file) {
    if (!CONFIG.image.supportedFormats.includes(file.type)) {
      toast(`Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, or WebP.`, "error");
      return;
    }
    const maxBytes = CONFIG.image.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      toast(`Image is too large (${Utils.formatBytes(file.size)}). Max is ${CONFIG.image.maxFileSizeMB} MB.`, "error");
      return;
    }

    try {
      const dataUrl = await Utils.readFileAsDataURL(file);
      const img = await Utils.loadImage(dataUrl);

      if (img.width > CONFIG.image.maxWidth || img.height > CONFIG.image.maxHeight) {
        toast(
          `Image dimensions (${img.width}×${img.height}) exceed the configured max (${CONFIG.image.maxWidth}×${CONFIG.image.maxHeight}).`,
          "error"
        );
        return;
      }

      currentFilename = file.name;
      currentDims = { w: img.width, h: img.height };

      $("#upload-zone").hidden = true;
      $("#editor-zone").hidden = false;
      $("#empty-controls").hidden = true;
      $("#edit-controls").hidden = false;

      Editor.setImage(img);
      HistoryStore.reset(dataUrl, file.name);
      updateImageMeta(file);
      maybeShowFirstRun();
    } catch (e) {
      toast("Could not load that image. Try a different file.", "error");
    }
  }

  function updateImageMeta(file) {
    $("#image-meta").textContent = `${currentFilename} · ${currentDims.w}×${currentDims.h} · ${Utils.formatBytes(file.size)}`;
  }

  // ---------------------------------------------------------------- TOOLS
  function setupTools() {
    $$(".tool-btn[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".tool-btn[data-mode]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        Editor.setMode(btn.dataset.mode);
      });
    });
    $$(".tool-btn[data-mode]")[0]?.classList.add("active");

    $("#btn-clear-selection").addEventListener("click", () => Editor.clearSelection());
    $("#btn-undo").addEventListener("click", () => applyVersion(HistoryStore.undo()));
    $("#btn-redo").addEventListener("click", () => applyVersion(HistoryStore.redo()));
    $("#btn-reset").addEventListener("click", () => {
      confirmDialog("Reset to the original photograph? Your current edit will remain in history.", () => {
        applyVersion(HistoryStore.restore(HistoryStore.original().id));
      });
    });

    $("#btn-zoom-in").addEventListener("click", () => Editor.zoomIn());
    $("#btn-zoom-out").addEventListener("click", () => Editor.zoomOut());
    $("#btn-zoom-fit").addEventListener("click", () => Editor.resetZoom());
  }

  function onEditorChange(state) {
    $("#zoom-level").textContent = `${Editor.getZoomPercent()}%`;
    const chip = $("#editing-mode-chip");
    const hint = $("#no-selection-hint");
    const genBtn = $("#btn-generate");

    if (Editor.hasSelection() && Editor.isWholeImageSelection()) {
      chip.textContent = "Editing: Entire Image";
    } else if (Editor.hasSelection()) {
      chip.textContent = "Editing: Selected Area";
    } else {
      chip.textContent = "Editing: Entire Image";
    }
    hint.hidden = Editor.hasSelection();
    genBtn.disabled = !Editor.hasSelection();
  }

  async function applyVersion(version) {
    if (!version) return;
    const img = await Utils.loadImage(version.dataUrl);
    Editor.setImage(img);
    Editor.selectEntireImage();
    updateCompareImages();
  }

  // ---------------------------------------------------------------- PRESETS
  function setupPresets() {
    const wrap = $("#presets");
    CONFIG.presets.forEach((p) => {
      const btn = Utils.el("button", { class: "preset-btn", text: p.label, type: "button" });
      btn.addEventListener("click", () => {
        $("#prompt-box").value = p.prompt;
      });
      wrap.appendChild(btn);
    });
  }

  function setupPromptActions() {
    $("#btn-improve-prompt").addEventListener("click", async () => {
      const box = $("#prompt-box");
      if (!box.value.trim()) {
        toast("Write an instruction first.", "error");
        return;
      }
      if (!CONFIG.promptAssist.enabled) return;
      const btn = $("#btn-improve-prompt");
      btn.disabled = true;
      btn.textContent = "Improving…";
      try {
        const improved = await Pollinations.improvePrompt(box.value.trim());
        box.value = improved;
      } catch (e) {
        toast(e.message || "Could not improve prompt.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "✦ Improve Prompt";
      }
    });

    $("#btn-generate").addEventListener("click", onGenerateClick);
    $("#btn-export").addEventListener("click", onExportClick);
  }

  // ---------------------------------------------------------------- GENERATE
  function buildPrompt(userPrompt, isWholeImage) {
    const trimmed = userPrompt.trim();
    if (!trimmed) return null;
    if (isWholeImage) {
      return `${trimmed} Preserve realistic lighting, composition, and photographic detail throughout the photograph.`;
    }
    return `Edit only the selected region of this photograph. ${trimmed} Preserve the rest of the photograph exactly as-is, including composition, lighting, reflections, shadows, and photographic detail outside the selection.`;
  }

  async function onGenerateClick() {
    const promptBox = $("#prompt-box");
    const userPrompt = promptBox.value;
    if (!userPrompt.trim()) {
      toast("Describe what you'd like to change first.", "error");
      return;
    }
    if (!Editor.hasSelection()) {
      toast("Select an area or choose Entire Image first.", "error");
      return;
    }
    if (!Pollinations.hasApiKey()) {
      toast("Add your Pollinations API key in Settings first.", "error");
      openSettings();
      return;
    }
    if (sessionEdits >= CONFIG.limits.maxEditsPerSession) {
      toast(`Session limit reached (${CONFIG.limits.maxEditsPerSession} edits). Refresh to start a new session.`, "error");
      return;
    }

    const isWhole = Editor.isWholeImageSelection();
    const finalPrompt = buildPrompt(userPrompt, isWhole);

    const proceed = () => runGenerate(finalPrompt, isWhole);

    if (CONFIG.limits.enableCostWarnings) {
      confirmDialog("This will use one AI image generation. Continue?", proceed);
    } else {
      proceed();
    }
  }

  async function runGenerate(finalPrompt, isWhole) {
    const sourceCanvas = isWhole ? Editor.getFullImageCanvas() : Editor.getSelectionCanvas();
    if (!sourceCanvas) {
      toast("Nothing to edit — upload a photo first.", "error");
      return;
    }

    showGenerating(isWhole);
    const startTime = Date.now();
    elapsedTimer = setInterval(() => {
      $("#generating-elapsed").textContent = Utils.formatTime(Date.now() - startTime);
    }, 250);

    generateAbort = new AbortController();

    try {
      const blob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
      const resultUrl = await Pollinations.editImage(blob, finalPrompt, {
        model: currentModel(),
        signal: generateAbort.signal,
      });

      let mergedDataUrl;
      if (isWhole) {
        mergedDataUrl = await toDataUrl(resultUrl);
      } else {
        mergedDataUrl = await mergeSelectionResult(resultUrl);
      }

      const version = HistoryStore.push(mergedDataUrl, finalPrompt);
      await applyVersion(version);

      sessionEdits += 1;
      updateSessionCounter();
      toast("Edit generated.", "success");
    } catch (e) {
      if (e.name === "AbortError") {
        toast("Generation cancelled.", "error");
      } else {
        toast(e.message || "Something went wrong generating the edit.", "error");
        if (e.retryAfter) {
          toast(`Pollinations asked us to wait ${e.retryAfter}s before retrying.`, "error");
        }
      }
    } finally {
      clearInterval(elapsedTimer);
      hideGenerating();
      generateAbort = null;
    }
  }

  async function toDataUrl(urlOrDataUrl) {
    if (urlOrDataUrl.startsWith("data:")) return urlOrDataUrl;
    const img = await Utils.loadImage(urlOrDataUrl);
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/png");
  }

  /**
   * The API returns an edited crop for selection-based edits (the model only
   * sees the cropped region we sent it). We composite that result back onto
   * the full working image at the original selection coordinates so the
   * rest of the photograph is untouched pixel-for-pixel.
   *
   * Note: this is compositing, not true model-side inpainting/masking — see
   * README "Original vs Generated Image" for the honest explanation of this
   * limitation.
   */
  async function mergeSelectionResult(resultUrl) {
    const full = Editor.getFullImageCanvas();
    const fctx = full.getContext("2d");
    const editedPiece = await Utils.loadImage(await toDataUrl(resultUrl));
    // The current selection rect, read straight off the editor's last selection.
    const rect = Editor.__lastRectForMerge || null;
    fctx.drawImage(editedPiece, rect.x, rect.y, rect.w, rect.h);
    return full.toDataURL("image/png");
  }

  function currentModel() {
    const sel = $("#model-select");
    return (sel && sel.value) || CONFIG.pollinations.model;
  }

  function showGenerating(isWhole) {
    $("#generating-overlay").hidden = false;
    $("#generating-detail").textContent = `Model: ${currentModel()} · ${isWhole ? "Entire Image" : "Selected Area"}`;
    $("#generating-elapsed").textContent = "00:00";
  }
  function hideGenerating() {
    $("#generating-overlay").hidden = true;
  }

  function updateSessionCounter() {
    $("#session-counter").textContent = `Edits this session: ${sessionEdits}`;
    const used = $("#settings-edits-used");
    if (used) used.textContent = sessionEdits;
  }

  // ---------------------------------------------------------------- HISTORY PANEL
  function onHistoryChange(state) {
    const list = $("#history-list");
    const empty = $("#history-empty");
    list.innerHTML = "";

    const items = state.versions;
    empty.hidden = items.length > 1;

    items.forEach((v, idx) => {
      const item = Utils.el(
        "button",
        { class: "history-item" + (idx === state.currentIndex ? " active" : ""), type: "button" },
        [
          Utils.el("img", { src: v.dataUrl, alt: v.label }),
          Utils.el("span", { class: "hi-meta" }, [
            Utils.el("div", { class: "hi-label", text: v.label }),
            Utils.el("div", { class: "hi-prompt", text: v.prompt || "Uploaded photo" }),
          ]),
        ]
      );
      item.addEventListener("click", () => applyVersion(HistoryStore.restore(v.id)));
      list.appendChild(item);
    });

    $("#btn-undo").disabled = !HistoryStore.canUndo();
    $("#btn-redo").disabled = !HistoryStore.canRedo();
    updateCompareImages();
  }

  // ---------------------------------------------------------------- COMPARE
  function setupCompare() {
    $("#toggle-compare").addEventListener("change", (e) => {
      $("#compare-bar").hidden = false;
      $("#compare-slider-wrap").hidden = !e.target.checked;
      updateCompareImages();
    });
    $("#compare-bar").hidden = false;

    const divider = $("#compare-divider");
    const container = $("#compare-container");
    let dragging = false;
    divider.addEventListener("mousedown", () => (dragging = true));
    window.addEventListener("mouseup", () => (dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      setComparePosition(e.clientX, container);
    });
    container.addEventListener("touchmove", (e) => {
      setComparePosition(e.touches[0].clientX, container);
    });
  }

  function setComparePosition(clientX, container) {
    const rect = container.getBoundingClientRect();
    const pct = Utils.clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    $("#compare-after-wrap").style.width = pct + "%";
    $("#compare-divider").style.left = pct + "%";
    $("#compare-after").style.width = rect.width + "px";
  }

  function updateCompareImages() {
    const original = HistoryStore.original();
    const current = HistoryStore.current();
    if (!original || !current) return;
    $("#compare-before").src = original.dataUrl;
    $("#compare-after").src = current.dataUrl;
  }

  // ---------------------------------------------------------------- EXPORT
  async function onExportClick() {
    if (!HistoryStore.current()) {
      toast("Nothing to export yet.", "error");
      return;
    }
    try {
      const filename = await ExportModule.exportCurrent({ originalFilename: currentFilename, format: "png" });
      toast(`Exported ${filename}`, "success");
    } catch (e) {
      toast(e.message || "Export failed.", "error");
    }
  }

  // ---------------------------------------------------------------- SETTINGS
  function setupSettings() {
    $("#btn-settings").addEventListener("click", openSettings);
    $("#btn-close-settings").addEventListener("click", () => ($("#settings-modal").hidden = true));

    $("#api-key-input").value = Pollinations.getApiKey();
    $("#btn-save-key").addEventListener("click", () => {
      Pollinations.setApiKey($("#api-key-input").value);
      toast("API key saved to this browser.", "success");
    });

    $("#watermark-enabled").checked = CONFIG.watermark.enabled;
    $("#watermark-opacity").value = CONFIG.watermark.opacity;
    $("#watermark-size").value = CONFIG.watermark.widthPercent;
    $("#settings-max-edits").textContent = CONFIG.limits.maxEditsPerSession;

    // Runtime-only overrides layered on top of frozen CONFIG for live tweaking.
    $("#watermark-enabled").addEventListener("change", (e) => {
      window.__watermarkOverrides = { ...(window.__watermarkOverrides || {}), enabled: e.target.checked };
      Watermark.apply = wrapWatermarkApply();
    });
    $("#watermark-opacity").addEventListener("input", (e) => {
      window.__watermarkOverrides = { ...(window.__watermarkOverrides || {}), opacity: Number(e.target.value) };
    });
    $("#watermark-size").addEventListener("input", (e) => {
      window.__watermarkOverrides = { ...(window.__watermarkOverrides || {}), widthPercent: Number(e.target.value) };
    });

    populateModelSelect();
  }

  function wrapWatermarkApply() {
    const original = Watermark.apply.__original || Watermark.apply;
    Watermark.apply.__original = original;
    return (img, overrides = {}) => original(img, { ...(window.__watermarkOverrides || {}), ...overrides });
  }

  async function populateModelSelect() {
    const select = $("#model-select");
    select.innerHTML = `<option>${CONFIG.pollinations.model}</option>`;
    try {
      const models = await Pollinations.listModels();
      select.innerHTML = "";
      models.forEach((m) => {
        const opt = Utils.el("option", { value: m, text: m });
        if (m === CONFIG.pollinations.model) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (e) {
      // Fallback already set above.
    }
  }

  function openSettings() {
    $("#settings-modal").hidden = false;
  }

  // ---------------------------------------------------------------- PRIVACY
  function setupPrivacy() {
    $("#btn-privacy").addEventListener("click", () => ($("#privacy-modal").hidden = false));
    $("#btn-close-privacy").addEventListener("click", () => ($("#privacy-modal").hidden = true));
  }

  // ---------------------------------------------------------------- FIRST RUN
  function setupFirstRun() {
    $("#btn-dismiss-first-run").addEventListener("click", () => {
      $("#first-run").hidden = true;
      localStorage.setItem("05ai_first_run_seen", "1");
    });
  }
  function maybeShowFirstRun() {
    if (!CONFIG.ui.showFirstRunGuide) return;
    if (localStorage.getItem("05ai_first_run_seen")) return;
    $("#first-run").hidden = false;
  }

  // ---------------------------------------------------------------- CONFIRM DIALOG
  let confirmCallback = null;
  function setupConfirmDialog() {
    $("#confirm-cancel").addEventListener("click", () => ($("#confirm-modal").hidden = true));
    $("#confirm-ok").addEventListener("click", () => {
      $("#confirm-modal").hidden = true;
      if (confirmCallback) confirmCallback();
    });
  }
  function confirmDialog(message, onConfirm) {
    $("#confirm-message").textContent = message;
    confirmCallback = onConfirm;
    $("#confirm-modal").hidden = false;
  }

  // ---------------------------------------------------------------- TOASTS
  function toast(message, kind = "info") {
    const t = Utils.el("div", { class: `toast ${kind}`, text: message });
    $("#toast-container").appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  // Expose the last selection rect for merge compositing (set by Editor pointerup).
  const origOnChange = Editor.onChange;
  Editor.onChange((state) => {
    if (state.selection) Editor.__lastRectForMerge = state.selection;
  });
})();
