// Inline script for the root layout <head>. Chrome fires `beforeinstallprompt`
// once per page load, often on the login page before the install banner
// mounts, so it is captured here and read later through install-store.
export const INSTALL_CAPTURE_SCRIPT = `(function(){
  var notify = function () {
    window.dispatchEvent(new CustomEvent("pt:installprompt"));
  };
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__ptInstallPrompt = event;
    notify();
  });
  window.addEventListener("appinstalled", function () {
    window.__ptInstallPrompt = null;
    window.__ptInstalled = true;
    notify();
  });
})();`;
