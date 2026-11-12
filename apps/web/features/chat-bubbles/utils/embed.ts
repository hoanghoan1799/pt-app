// The chat page runs inside the bubble panel as a same-origin iframe. Reading
// `window.top` can throw for a foreign parent, which also counts as framed.
export const isEmbeddedNow = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};
