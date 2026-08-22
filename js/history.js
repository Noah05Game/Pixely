/**
 * history.js — in-memory (optionally localStorage-backed) version history
 * for the current editing session. Each version stores a data URL so the
 * user can freely undo/redo/restore without re-calling the API.
 */

const HistoryStore = (() => {
  let versions = []; // { id, label, prompt, dataUrl, timestamp, isOriginal }
  let currentIndex = -1;
  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => fn(getState()));
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function reset(originalDataUrl, filename) {
    versions = [
      {
        id: Utils.uid(),
        label: "Original",
        prompt: null,
        dataUrl: originalDataUrl,
        timestamp: Date.now(),
        isOriginal: true,
        filename,
      },
    ];
    currentIndex = 0;
    notify();
  }

  function push(dataUrl, prompt) {
    // Drop any "future" versions if the user had undone before generating new ones.
    versions = versions.slice(0, currentIndex + 1);
    versions.push({
      id: Utils.uid(),
      label: `Edit #${versions.filter((v) => !v.isOriginal).length + 1}`,
      prompt,
      dataUrl,
      timestamp: Date.now(),
      isOriginal: false,
    });
    currentIndex = versions.length - 1;
    notify();
    return versions[currentIndex];
  }

  function restore(id) {
    const idx = versions.findIndex((v) => v.id === id);
    if (idx >= 0) {
      currentIndex = idx;
      notify();
    }
    return current();
  }

  function undo() {
    if (currentIndex > 0) currentIndex -= 1;
    notify();
    return current();
  }

  function redo() {
    if (currentIndex < versions.length - 1) currentIndex += 1;
    notify();
    return current();
  }

  function canUndo() {
    return currentIndex > 0;
  }
  function canRedo() {
    return currentIndex < versions.length - 1;
  }

  function current() {
    return versions[currentIndex] || null;
  }

  function original() {
    return versions[0] || null;
  }

  function editCount() {
    return versions.filter((v) => !v.isOriginal).length;
  }

  function getState() {
    return { versions: [...versions], currentIndex, current: current() };
  }

  return { reset, push, restore, undo, redo, canUndo, canRedo, current, original, editCount, getState, onChange };
})();
