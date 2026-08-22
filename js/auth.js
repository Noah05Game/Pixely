/**
 * auth.js — beta passcode gate.
 *
 * This is a UI gate only. Anyone can read config.js in the browser and see
 * the valid passcodes — that is unavoidable on a static GitHub Pages site.
 * See README "Beta Login Security" for the honest explanation.
 */

const Auth = (() => {
  const SESSION_KEY = "05ai_beta_unlocked";

  function isUnlocked() {
    if (!CONFIG.beta.enabled) return true;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  }

  function tryUnlock(code) {
    if (!CONFIG.beta.enabled) return true;
    const entered = CONFIG.beta.caseInsensitive ? code.trim().toUpperCase() : code.trim();
    const valid = CONFIG.beta.passcodes.some((p) =>
      CONFIG.beta.caseInsensitive ? p.toUpperCase() === entered : p === entered
    );
    if (valid) {
      sessionStorage.setItem(SESSION_KEY, "1");
      return true;
    }
    return false;
  }

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  return { isUnlocked, tryUnlock, lock };
})();
