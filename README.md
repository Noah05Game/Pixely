# 05 AI Photographer

A lightweight, Photoshop-style AI photo-editing tool for photographers, deployable entirely on GitHub Pages. **Powered by 05 AI.**

Workflow: **Upload → Select → Describe Edit → Generate → Review → Refine → Export**

---

## Features

- Beta-access passcode gate (configurable, multi-code)
- Drag-and-drop / browse / clipboard-paste photo upload (JPEG, PNG, WebP)
- Rectangle and freeform selection, plus whole-image editing
- Natural-language edit instructions, with photographer-focused presets
- Uses Pollinations' current `POST /v1/images/edits` OpenAI-compatible endpoint
- Iterative editing with full version history (thumbnails, prompts, timestamps, restore)
- Undo / redo / reset to original
- Before/after draggable comparison slider
- Zoom, pan, fit-to-screen
- Client-side watermark compositing (Canvas) — never sent to the AI
- Export to PNG/JPEG with sensible filenames (`IMG_1234-05AI-edited.jpg`)
- Session edit-count limiter and pre-generation cost warning
- Honest, specific error handling (auth, budget, rate limits, network, etc.)
- Fully responsive, dark, accessible UI
- No backend — 100% static, deployable to GitHub Pages

---

## Requirements

- A modern browser (Chrome, Firefox, Safari, Edge)
- Your own Pollinations API key (get one at https://enter.pollinations.ai)
- A GitHub account, if deploying to GitHub Pages

---

## Project Structure

```
05-ai-photographer/
├── index.html
├── config.js              # all app settings live here
├── README.md
├── LICENSE
├── assets/
│   └── 05ai-watermark.png # you provide this (see Watermark Setup)
├── css/
│   └── styles.css
└── js/
    ├── utils.js
    ├── auth.js
    ├── pollinations.js
    ├── editor.js
    ├── history.js
    ├── watermark.js
    ├── export.js
    └── app.js
```

---

## Installation

1. Extract `05-ai-photographer.zip`.
2. Open `index.html` directly in a browser to test locally (no build step, no server required), **or** serve the folder with any static file server.
3. Add your watermark image (see below).
4. Edit `config.js` as needed.

---

## GitHub Pages Deployment

1. Create a new GitHub repository.
2. Upload the extracted project contents to the repository root (or push via git).
3. Add your logo at `assets/05ai-watermark.png`.
4. Edit `config.js` — set your beta passcodes, watermark settings, and default model.
5. **Do not** put any Pollinations secret key into `config.js` or any committed file.
6. Commit and push your changes.
7. In the repository, open **Settings**.
8. Open the **Pages** section in the left sidebar.
9. Under **Build and deployment → Source**, select **Deploy from a branch**.
10. Choose your branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
11. Wait for the deployment to finish, then open the generated `https://<username>.github.io/<repo>/` URL.

All asset paths in this project are relative, so it works correctly whether it's served from a repo subpath or a custom domain.

---

## Pollinations Setup

This app uses Pollinations' current OpenAI-compatible image editing endpoint:

```
POST https://gen.pollinations.ai/v1/images/edits
Authorization: Bearer <your key>
Content-Type: multipart/form-data
  image: <file>
  prompt: <text>
  model: kontext
```

### Authentication — read this carefully

At the time this app was built, every credential capable of calling `/v1/images/edits` is a **secret key** (`Authorization: Bearer sk_...`). Pollinations does not currently document a separate browser-safe "publishable" credential for this endpoint. That has real consequences for a **static, backend-less GitHub Pages app**:

- **We never put a key in `config.js` or any committed file.** A key baked into a public repo is visible to literally anyone, forever (including in git history).
- **Instead, each visitor pastes their own Pollinations API key into the in-app Settings panel.** It's stored only in that browser's `localStorage`, under that visitor's own device, and is sent directly from their browser to `gen.pollinations.ai` — never to any server of ours, because this app has no server.
- That key is still visible to *that visitor* (e.g. in browser devtools). That's expected and fine — it's their own key, under their own account and budget. It is not exposed to other visitors, and it never leaves their browser except to reach Pollinations directly.
- If Pollinations later ships a scoped/publishable browser credential for this endpoint, swap the auth logic in `js/pollinations.js` (`apiKeyHeader()`) accordingly.

### Steps

1. Go to https://enter.pollinations.ai and create an account / API key.
2. Open the app, click **Settings**, paste your key into "Your Pollinations API key", click **Save Key**.
3. The model dropdown will populate from the live `/v1/models` endpoint automatically. If that request fails, it falls back to the `pollinations.model` value in `config.js`.
4. Monitor usage/budget from your Pollinations account dashboard at enter.pollinations.ai — this app does not have access to your account balance and never guesses at monetary cost.
5. If your budget is exhausted, Pollinations returns an HTTP 402 and the app will show: *"Pollinations rejected the request because the account budget is exhausted."*

---

## Configuration

Everything is in `config.js`:

| Key | What it does |
|---|---|
| `beta.enabled` | Turn the beta gate on/off |
| `beta.passcodes` | Array of valid 6-character codes |
| `pollinations.model` | Default image-editing model (`kontext` by default) |
| `pollinations.apiBaseUrl` / `imageEditEndpoint` | API base + edit endpoint path |
| `image.maxFileSizeMB` | Max upload size |
| `image.maxWidth` / `maxHeight` | Max accepted image dimensions |
| `watermark.filename` / `path` | Where the app looks for your logo |
| `watermark.position` / `widthPercent` / `marginPercent` / `opacity` | Watermark placement/appearance |
| `limits.maxEditsPerSession` | Hard cap on generations per browser session |
| `limits.enableCostWarnings` | Show a confirm dialog before each generation |
| `presets` | The list of one-click preset prompts |
| `promptAssist.enabled` | Turn the "Improve Prompt" button on/off |

Some watermark settings (enabled/opacity/size) can also be tweaked live from the in-app **Settings** panel for the current browser session, without editing `config.js`.

---

## Beta Passcodes

The login screen requires one of the codes in `config.js` → `beta.passcodes`. Add or remove codes there.

## Beta Login Security

**This is not real authentication.** Because this app is 100% static and has no server, the passcode list in `config.js` is downloaded to every visitor's browser along with everything else. A determined user can open browser devtools, view `config.js`, and read every valid passcode directly. The gate only stops casual/accidental access — it does **not** prevent someone who intentionally goes looking for the codes. If you need real access control, you'll need a proper backend/auth provider, which is outside the scope of a GitHub Pages deployment.

---

## Watermark Setup

1. Prepare your logo as a PNG, ideally with a transparent background, reasonably high resolution.
2. Name it exactly: **`05ai-watermark.png`**
3. Place it at: **`assets/05ai-watermark.png`**
4. The app automatically scales it to `watermark.widthPercent` of the exported image's width, positions it per `watermark.position`, and applies `watermark.opacity` — all done locally in the browser with Canvas, after the AI edit is generated. The watermark is never sent to Pollinations and never appears in any prompt.
5. If the file is missing, the app skips watermarking silently rather than breaking.

---

## Changing the AI Model

Edit `config.js` → `pollinations.model`, e.g.:

```js
pollinations: {
  model: "kontext"
}
```

Or use the **Model** dropdown in Settings, which lists editing-capable models pulled live from `GET /v1/models` (filtered heuristically for edit-capable tags/ids). Do not assume `kontext` remains the cheapest or best option forever — check the live catalogue and Pollinations' own pricing/model pages before deploying.

---

## Using the Editor

- **Select Area** — drag a rectangle over the part of the photo you want changed.
- **Freeform** — draw an approximate freeform region; the app uses its bounding box as the edited region.
- **Whole Image** — edit the entire photograph.
- **Pan** — click-drag to move around when zoomed in.
- Type your instruction, optionally click a preset or **Improve Prompt**, then **Generate Edit**.

## Image Selection

For a selected-area edit, the app crops that region, sends only the crop to the model with a constructed instruction ("edit only the selected region... preserve the rest exactly..."), and composites the model's result back onto the full image at the original coordinates. This keeps everything outside your selection byte-identical to the working image, rather than relying on the model to leave it untouched.

## Iterative Editing

Every generation becomes a new version in **History**, with its thumbnail, the prompt used, and a timestamp. Click any version to restore it as the current working image and keep editing from there. Nothing is ever lost — jump back to any earlier version at any time.

## Exporting

Click **Export** to download the current version as PNG (JPEG export also available in the export logic — see `js/export.js` — with quality control) with the watermark composited in, named `<original-basename>-05AI-edited.<ext>`.

---

## Privacy

- Photographs go directly from your browser to Pollinations (`gen.pollinations.ai`). This app has no backend and cannot store your photos anywhere itself.
- Editing history and your API key live only in your browser's local/session storage.
- Avoid uploading confidential photographs if you're not comfortable with third-party AI processing.
- Pollinations' own terms and privacy policy govern their processing of anything sent to their API — review those independently.

---

## API Costs / Budget Protection

- `limits.maxEditsPerSession` hard-stops generations once a browser session hits the configured count.
- With `limits.enableCostWarnings` on, every generation shows a confirm dialog first.
- The session counter ("Edits this session: N") is visible in the top bar at all times.
- This app does **not** know your real-time Pollinations account balance or exact per-call pricing — it never fabricates a dollar figure. Check your usage on your Pollinations account dashboard.

---

## Limitations

- **No true server-side masking/inpainting guarantee.** Selected-area edits are composited client-side (crop → edit → paste back) rather than relying on a documented mask API, because the current image-edit endpoint's public docs don't specify a dedicated mask parameter. This is honest compositing, not a claim of pixel-perfect AI inpainting.
- **The beta passcode gate is not real security** (see above).
- **No safe way to hide a Pollinations key on a static site** — every visitor must supply their own key.
- Freeform selection uses its bounding rectangle as the actual edited region, since the edit endpoint takes a rectangular image, not an arbitrary polygon mask.
- Model availability/pricing on Pollinations can change; always check the live model list.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "No Pollinations API key configured" | Add your key in Settings |
| HTTP 401 | Key missing/invalid |
| HTTP 402 | Account budget exhausted |
| HTTP 429 | Rate-limited — wait and retry; the app surfaces `Retry-After` if provided |
| Watermark doesn't appear | Confirm `assets/05ai-watermark.png` exists at exactly that path/name |
| Blank page on GitHub Pages | Confirm Pages source is set to the correct branch/folder and paths are relative |

---

## Updating Pollinations API Configuration

If Pollinations changes the endpoint, auth scheme, or parameters, the two files to check are:

- `config.js` → `pollinations` block (base URL, endpoint paths, default model, response format)
- `js/pollinations.js` → request construction (`editImage`, `listModels`, `improvePrompt`) and the `apiKeyHeader()` auth helper

---

## Credits

Built as **05 AI Photographer**, powered by 05 AI, using the Pollinations open-source generative AI platform (https://pollinations.ai).
