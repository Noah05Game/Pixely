/**
 * pollinations.js — thin client for the Pollinations OpenAI-compatible
 * image-editing API (POST /v1/images/edits).
 *
 * AUTHENTICATION (read this before deploying — see README "Pollinations Setup"):
 * Pollinations authenticates requests with `Authorization: Bearer <key>`.
 * There is currently no browser-safe / publishable-key flow documented for
 * this endpoint — every key that can call it is a secret key. That means:
 *   - We NEVER put a key inside config.js or any committed file.
 *   - Instead, each visitor pastes their OWN Pollinations API key into the
 *     Settings panel. It is stored only in that browser's localStorage and
 *     is sent directly from that browser straight to gen.pollinations.ai.
 *   - This key is still visible to that visitor (devtools/network tab) and
 *     to anything running in their own browser. That's expected — it's
 *     their own key, under their own account. It is never sent anywhere
 *     except gen.pollinations.ai, and it never touches a server of ours
 *     because this app has no server.
 */

const Pollinations = (() => {
  const KEY_STORAGE = "05ai_pollinations_key";

  function getApiKey() {
    return localStorage.getItem(KEY_STORAGE) || "";
  }

  function setApiKey(key) {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  }

  function hasApiKey() {
    return !!getApiKey();
  }

  class PollinationsError extends Error {
    constructor(message, { status, retryAfter } = {}) {
      super(message);
      this.name = "PollinationsError";
      this.status = status;
      this.retryAfter = retryAfter;
    }
  }

  function friendlyMessage(status, bodyText) {
    switch (status) {
      case 401:
        return "Pollinations rejected the request — the API key is missing or invalid. Check it in Settings.";
      case 402:
        return "Pollinations rejected the request because the account budget is exhausted.";
      case 403:
        return "Pollinations refused this request (forbidden). The key may not have access to this model.";
      case 404:
        return "The requested model or endpoint was not found. Try a different model in Settings.";
      case 413:
        return "The image is too large for the API to accept. Try a smaller photograph.";
      case 429:
        return "Pollinations is rate-limiting this key. Please wait a moment and try again.";
      case 500:
      case 502:
      case 503:
      case 504:
        return "Pollinations had a server error. Please try again shortly.";
      default:
        return `Pollinations returned an unexpected error${status ? ` (HTTP ${status})` : ""}. ${bodyText ? bodyText.slice(0, 200) : ""}`;
    }
  }

  /**
   * Fetch the current image-editing-capable model list.
   * Falls back to just the configured default model if the request fails,
   * so the app never fakes a stale hard-coded list.
   */
  async function listModels() {
    try {
      const res = await fetch(`${CONFIG.pollinations.apiBaseUrl}${CONFIG.pollinations.modelsEndpoint}`, {
        headers: apiKeyHeader(),
      });
      if (!res.ok) throw new Error("model list request failed");
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.data || data.models || [];
      const editModels = list
        .filter((m) => {
          const caps = m.capabilities || m.tags || [];
          const id = (m.id || m.name || "").toLowerCase();
          return (
            caps.includes?.("edit") ||
            caps.includes?.("image-edit") ||
            id.includes("kontext") ||
            id.includes("edit")
          );
        })
        .map((m) => m.id || m.name)
        .filter(Boolean);
      return editModels.length ? editModels : [CONFIG.pollinations.model];
    } catch (e) {
      return [CONFIG.pollinations.model];
    }
  }

  function apiKeyHeader() {
    const key = getApiKey();
    return key ? { Authorization: `Bearer ${key}` } : {};
  }

  /**
   * Edit an image via multipart/form-data, per the current documented
   * request shape: image file + prompt + model.
   *
   * @param {Blob} imageBlob   The source photograph (or working image).
   * @param {string} prompt    The full constructed instruction.
   * @param {object} opts      { model, signal }
   * @returns {Promise<string>} A data URL (or remote URL) of the result.
   */
  async function editImage(imageBlob, prompt, opts = {}) {
    const model = opts.model || CONFIG.pollinations.model;
    if (!hasApiKey()) {
      throw new PollinationsError(
        "No Pollinations API key configured. Add your key in Settings before generating an edit."
      );
    }

    const form = new FormData();
    form.append("image", imageBlob, "source.png");
    form.append("prompt", prompt);
    form.append("model", model);
    if (CONFIG.pollinations.responseFormat) form.append("response_format", CONFIG.pollinations.responseFormat);
    if (CONFIG.pollinations.quality) form.append("quality", CONFIG.pollinations.quality);

    let res;
    try {
      res = await fetch(`${CONFIG.pollinations.apiBaseUrl}${CONFIG.pollinations.imageEditEndpoint}`, {
        method: "POST",
        headers: apiKeyHeader(),
        body: form,
        signal: opts.signal,
      });
    } catch (networkErr) {
      throw new PollinationsError("Network error reaching Pollinations. Check your connection and try again.");
    }

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch (_) {}
      const retryAfter = res.headers.get("Retry-After");
      throw new PollinationsError(friendlyMessage(res.status, bodyText), {
        status: res.status,
        retryAfter: retryAfter ? Number(retryAfter) : null,
      });
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new PollinationsError("Pollinations returned a response that could not be parsed.");
    }

    const item = data?.data?.[0];
    if (!item) throw new PollinationsError("Pollinations returned an empty result.");

    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
    if (item.url) return item.url;
    throw new PollinationsError("Pollinations response did not include image data.");
  }

  /** Optional "Improve Prompt" helper — only called on explicit user action. */
  async function improvePrompt(rawPrompt) {
    if (!hasApiKey()) {
      throw new PollinationsError("Add your Pollinations API key in Settings to use Improve Prompt.");
    }
    const res = await fetch(`${CONFIG.pollinations.apiBaseUrl}${CONFIG.promptAssist.textEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiKeyHeader() },
      body: JSON.stringify({
        model: CONFIG.promptAssist.textModel,
        messages: [
          {
            role: "system",
            content:
              "Rewrite the user's photo-editing instruction into a single precise, concise image-editing prompt for an AI photo editor. Preserve their intent exactly. Do not add unrelated changes. Reply with only the rewritten prompt, no quotes, no preamble.",
          },
          { role: "user", content: rawPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new PollinationsError(friendlyMessage(res.status, bodyText), { status: res.status });
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new PollinationsError("Prompt assistant returned no text.");
    return text.trim();
  }

  return { getApiKey, setApiKey, hasApiKey, listModels, editImage, improvePrompt, PollinationsError };
})();
