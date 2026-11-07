// Saves an image the app serves (cookie-authenticated) as a file. The bytes
// are fetched and handed to a temporary <a download>; when that is not
// possible (a failed fetch, a browser without blob downloads) the image is
// opened in a new tab instead, which is what iOS Safari users expect anyway.
// Returns whether the download was started.
export const downloadImage = async (
  src: string,
  fileNameFor: (mime: string | null) => string,
): Promise<boolean> => {
  try {
    const response = await fetch(src);

    if (!response.ok) {
      throw new Error("download failed");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileNameFor(blob.type || null);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The browser has taken the blob once the click handlers ran.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    window.open(src, "_blank", "noopener");
    return false;
  }
};
