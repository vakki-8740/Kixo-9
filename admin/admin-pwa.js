(function () {
  "use strict";

  const installButtons = Array.from(document.querySelectorAll(".js-admin-install"));
  let deferredInstallPrompt = null;

  function isStandalone() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    const userAgent = window.navigator.userAgent || "";
    return (
      /iphone|ipad|ipod/i.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
    );
  }

  function notify(message, type) {
    if (typeof window.showToast === "function") {
      window.showToast(message, type || "ok");
    }
  }

  function updateInstallButtons() {
    const showButton = !isStandalone() && (!!deferredInstallPrompt || isIos());
    installButtons.forEach((button) => {
      button.hidden = !showButton;
    });
  }

  async function handleInstallClick() {
    if (isStandalone()) return;

    if (!deferredInstallPrompt) {
      if (isIos()) {
        notify("Tap Share, then Add to Home Screen to install Admin.", "ok");
      } else {
        notify("Install option is not available in this browser yet.", "err");
      }
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    updateInstallButtons();

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === "accepted") {
        notify("Installing Admin app...", "ok");
      }
    } catch {
      notify("Install was cancelled.", "err");
    } finally {
      if (typeof window.closeMenu === "function") window.closeMenu();
    }
  }

  installButtons.forEach((button) => {
    button.addEventListener("click", handleInstallClick);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButtons();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallButtons();
    notify("Admin app installed", "ok");
  });

  if (window.matchMedia) {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    if (typeof standaloneQuery.addEventListener === "function") {
      standaloneQuery.addEventListener("change", updateInstallButtons);
    } else if (typeof standaloneQuery.addListener === "function") {
      standaloneQuery.addListener(updateInstallButtons);
    }
  }

  updateInstallButtons();

  const canRegisterServiceWorker =
    "serviceWorker" in window.navigator &&
    (window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  if (canRegisterServiceWorker) {
    window.addEventListener("load", () => {
      window.navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
