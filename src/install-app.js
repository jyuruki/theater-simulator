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
  const movies = document.createElement("div"), saveMovies = document.createElement("button"), movieStatus = document.createElement("small");
  movies.id = "offline-movies"; saveMovies.id = "offline-movies-button"; saveMovies.type = "button"; saveMovies.className = "pause-options";
  saveMovies.textContent = "SAVE MOVIES OFFLINE · ~88 MB"; saveMovies.disabled = true;
  movieStatus.id = "offline-movies-status"; movieStatus.className = "new-day-note"; movieStatus.setAttribute("role", "status");
  movieStatus.textContent = "Optional. Movies stream as needed. Saving them does not interrupt your shift.";
  movies.append(saveMovies, movieStatus); (document.querySelector("#pause-card") ?? help.parentElement).append(movies);
  navigator.serviceWorker.register(`${baseUrl}sw.js`, { updateViaCache: "none" }).then(registration => {
    const movieWorker = () => registration.waiting ?? registration.active ?? navigator.serviceWorker.controller;
    let downloading = false;
    const checkMovies = () => {
      const worker = movieWorker();
      if (worker) { if (!downloading) saveMovies.disabled = false; worker.postMessage({ type: "CACHE_MOVIES_STATUS" }); }
    };
    const offer = () => {
      if (registration.waiting) { waiting = registration.waiting; update.hidden = false; }
      if (!downloading) checkMovies();
    };
    offer(); registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", offer);
    });
    update.addEventListener("click", () => waiting?.postMessage({ type: "ACTIVATE_UPDATE" }));
    saveMovies.addEventListener("click", () => {
      const worker = movieWorker(); if (!worker || downloading) return;
      downloading = true; saveMovies.disabled = true; saveMovies.textContent = "SAVING MOVIES…";
      movieStatus.textContent = "Downloading in the background. You can resume your shift.";
      worker.postMessage({ type: "CACHE_MOVIES" });
    });
    navigator.serviceWorker.addEventListener("message", event => {
      const data = event.data; if (data?.type !== "MOVIES_CACHE_STATUS") return;
      if (!["ready", "downloading", "complete", "error"].includes(data.state)) return;
      downloading = data.state === "downloading";
      saveMovies.disabled = downloading || data.state === "complete";
      if (data.state === "downloading") {
        saveMovies.textContent = `SAVING MOVIES · ${data.completed} / ${data.total}`;
        movieStatus.textContent = "Downloading in the background. You can resume your shift.";
      } else if (data.state === "complete") {
        saveMovies.textContent = "MOVIES SAVED OFFLINE";
        movieStatus.textContent = "All four movies are saved on this device. App updates keep these downloads.";
      } else if (data.state === "error") {
        saveMovies.textContent = "RETRY MOVIE DOWNLOAD";
        movieStatus.textContent = `${data.completed} / ${data.total} saved. Check your connection and free storage, then retry. Your shift is unaffected.`;
      } else {
        saveMovies.textContent = "SAVE MOVIES OFFLINE · ~88 MB";
        movieStatus.textContent = `Optional · ${data.completed} / ${data.total} saved. Movies stream as needed; saving does not interrupt your shift.`;
      }
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!downloading) checkMovies();
      if (!waiting || reloading) return; reloading = true; location.reload();
    });
    let lastCheck = Date.now();
    const checkForUpdate = () => {
      if (document.hidden) return;
      // A mobile browser may suspend or terminate the worker while background
      // movie downloads are running. Its cached files are authoritative: a
      // fresh status restores progress or re-enables retry after returning.
      checkMovies();
      if (Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now(); registration.update().catch(() => {});
    };
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
  }).catch(error => {
    movieStatus.textContent = "Offline saving is unavailable in this browser. Online play still works.";
    console.warn("Offline installation unavailable; online game remains playable.", error);
  });
}
