/**
 * 05 AI Photographer — Central Configuration
 * -------------------------------------------------
 * Everything you are likely to want to change lives here.
 * Nothing important should be hard-coded elsewhere in the app.
 */

const CONFIG = {
  branding: {
    name: "05 AI",
    productName: "05 AI Photographer",
    poweredByText: "Powered by 05 AI",
  },

  // Beta gate. This is NOT real security — see README "Beta Login Security".
  beta: {
    enabled: true,
    caseInsensitive: true,
    passcodes: [
      "ABC123",
      "PHOTO1",
      "05AI26",
    ],
  },

  // Pollinations API. See README "Pollinations Setup" before deploying.
  pollinations: {
    apiBaseUrl: "https://gen.pollinations.ai",
    imageEditEndpoint: "/v1/images/edits",
    modelsEndpoint: "/v1/models",
    // Default low-cost image-editing model. Configurable — see README.
    model: "kontext",
    // "url" or "b64_json". b64_json avoids a second network round trip.
    responseFormat: "b64_json",
    // OpenAI-style quality hint some community models honor. Optional.
    quality: "medium",
  },

  image: {
    maxFileSizeMB: 25,
    maxWidth: 4096,
    maxHeight: 4096,
    supportedFormats: ["image/jpeg", "image/png", "image/webp"],
  },

  watermark: {
    enabled: true,
    filename: "05ai-watermark.png",
    path: "assets/05ai-watermark.png",
    position: "bottom-right", // bottom-right | bottom-left | top-right | top-left
    widthPercent: 8,
    marginPercent: 2,
    opacity: 0.85,
  },

  limits: {
    maxEditsPerSession: 20,
    enableCostWarnings: true,
  },

  ui: {
    theme: "dark",
    showBeforeAfter: true,
    showHistory: true,
    showFirstRunGuide: true,
  },

  presets: [
    { label: "Remove Object", prompt: "Remove the selected object and naturally reconstruct the background." },
    { label: "Remove Person", prompt: "Remove the selected person and realistically reconstruct the background." },
    { label: "Sky Replacement", prompt: "Replace the sky with a realistic dramatic sky while preserving the foreground, buildings, lighting direction and overall composition." },
    { label: "Golden Hour", prompt: "Transform the lighting into realistic golden-hour lighting while preserving the subject and composition." },
    { label: "Clean Background", prompt: "Clean up distractions in the background while keeping the main subject unchanged." },
    { label: "Professional Retouch", prompt: "Perform a subtle professional photographic retouch while preserving realistic skin texture, lighting and natural detail." },
    { label: "Sharpen Subject", prompt: "Improve perceived detail and clarity of the selected subject while keeping the result photorealistic." },
  ],

  // Optional "Improve Prompt" feature — uses a Pollinations text model.
  promptAssist: {
    enabled: true,
    textEndpoint: "/v1/chat/completions",
    textModel: "openai",
  },
};

// Freeze one level deep so accidental runtime mutation is caught early.
Object.freeze(CONFIG);
