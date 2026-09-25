/** Native installation help; no store account or game-menu dependency. */
export function setupInstallApp({ production = import.meta.env?.PROD ?? false, baseUrl = import.meta.env?.BASE_URL ?? "./" } = {}) {
  const button = document.querySelector("#install-button"), help = document.querySelector("#install-help");
  const update = document.querySelector("#update-button");
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let invitation = null, waiting = null;
  if (standalone()) { button.hidden = true; help.hidden = true; }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); invitation = event; button.textContent = "INSTALL APP"; button.hidden = standalone();
  });
  window.addEventListener("appinstalled", () => { button.hidden = true; help.hidden = true; invitation = null; });
  button.addEventListener("click", async () => {
    if (invitation) { await invitation.prompt(); await invitation.userChoice; invitation = null; }
    else help.hidden = !help.hidden;
  });
  // Only production uses a worker; local dev changes should appear immediately.
  if (!production || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(`${baseUrl}sw.js`, { updateViaCache: "none" }).then(registration => {
    const offer = () => { if (registration.waiting) { waiting = registration.waiting; update.hidden = false; } };
    offer(); registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", offer);
    });
    update.addEventListener("click", () => waiting?.postMessage({ type: "ACTIVATE_UPDATE" }));
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!waiting || reloading) return; reloading = true; location.reload();
    });
    let lastCheck = Date.now();
    const checkForUpdate = () => {
      if (document.hidden || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now(); registration.update().catch(() => {});
    };
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
  }).catch(error => console.warn("Offline installation unavailable; online game remains playable.", error));
}
