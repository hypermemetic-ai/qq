(() => {
  "use strict";

  const ownScript = document.currentScript;
  const composer = () => document.querySelector("#prompt");
  const focusComposer = () => {
    if (window.matchMedia("(pointer: fine)").matches) composer()?.focus();
  };

  document.addEventListener("keydown", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLTextAreaElement) || input.id !== "prompt") return;
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    input.form?.requestSubmit();
  });

  document.addEventListener("htmx:afterSwap", (event) => {
    if (event.detail?.target?.id === "session-panel") focusComposer();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", focusComposer, { once: true });
  } else {
    focusComposer();
  }

  const serviceWorker = ownScript?.dataset.serviceWorker;
  if (serviceWorker && "serviceWorker" in navigator) {
    window.addEventListener(
      "load",
      () => navigator.serviceWorker.register(serviceWorker).catch(() => {}),
      { once: true },
    );
  }
})();
