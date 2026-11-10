// A setInterval that only runs while the tab is visible. Hidden: the timer is
// cleared. Back to visible: the callback runs once right away and the timer
// restarts. Returns a stop function (use it as a useEffect cleanup). The first
// run is the caller's: it is not called on start.
export const startVisibleInterval = (callback: () => void, ms: number) => {
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  const start = () => {
    if (timer === null) {
      timer = setInterval(callback, ms);
    }
  };
  const onVisibility = () => {
    stop();
    if (document.visibilityState === "hidden") {
      return;
    }
    callback();
    start();
  };

  if (document.visibilityState !== "hidden") {
    start();
  }
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
};
