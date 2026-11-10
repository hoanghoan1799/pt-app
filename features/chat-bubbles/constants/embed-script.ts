// Inline script for the root <head>: marks a framed page before first paint so
// the CSS hides the app chrome (`html[data-embed] [data-app-chrome]`) with no
// flash.
export const EMBED_MARKER_SCRIPT = `(function(){
  try {
    if (window.self !== window.top) {
      document.documentElement.setAttribute("data-embed", "1");
    }
  } catch (error) {
    document.documentElement.setAttribute("data-embed", "1");
  }
})();`;
