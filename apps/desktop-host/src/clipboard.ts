import clipboardy from "clipboardy";

/**
 * Clipboard seam backed by clipboardy with image fallbacks for platforms that
 * do not expose an image API. All errors surface as stable Host codes so the
 * dispatch boundary never leaks native exception messages.
 */
export type ClipboardApi = {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  readImage(): Promise<{ data: string; mimeType: string } | null>;
  writeImage(data: string, mimeType: string): Promise<void>;
};

const KNOWN_CLIPBOARD_ERRORS = new Set([
  "EACCES",
  "EPERM",
  "ENOENT",
  "CLIPBOARD_UNAVAILABLE",
  "CLIPBOARD_READ_FAILED",
  "CLIPBOARD_WRITE_FAILED"
]);

function isKnownClipboardError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const message = error.message;
  if (KNOWN_CLIPBOARD_ERRORS.has(message)) return message;
  if (message.includes("clipboardy") || message.includes("clipboard")) {
    return "CLIPBOARD_UNAVAILABLE";
  }
  return null;
}

/**
 * Reads the system clipboard as UTF-8 text.
 * Falls back to `clipboardy.read()` on platforms without a dedicated API.
 */
async function readText(): Promise<string> {
  try {
    const value = await clipboardy.read();
    if (typeof value === "string" && value.length > 0) return value;
    return "";
  } catch (error) {
    const code = isKnownClipboardError(error);
    if (code) throw new Error(code);
    throw new Error("CLIPBOARD_READ_FAILED");
  }
}

/**
 * Writes text to the system clipboard.
 * Fails closed with a stable code when the underlying API is unavailable.
 */
async function writeText(text: string): Promise<void> {
  try {
    await clipboardy.write(text);
  } catch (error) {
    const code = isKnownClipboardError(error);
    if (code) throw new Error(code);
    throw new Error("CLIPBOARD_WRITE_FAILED");
  }
}

/**
 * Reads an image from the system clipboard as base64.
 * Returns `null` when the clipboard holds no image or is unavailable.
 */
async function readImage(): Promise<{ data: string; mimeType: string } | null> {
  try {
    // clipboardy hasImages()/readImages() are available on some platforms.
    const hasImages = typeof clipboardy.hasImages === "function"
      ? await clipboardy.hasImages()
      : false;
    if (!hasImages) return null;
    const images = typeof clipboardy.readImages === "function"
      ? await clipboardy.readImages()
      : [];
    if (Array.isArray(images) && images.length > 0 && typeof images[0] === "string") {
      return { data: images[0] as string, mimeType: "image/png" };
    }
    return null;
  } catch (error) {
    const code = isKnownClipboardError(error);
    if (code) throw new Error(code);
    return null;
  }
}

/**
 * Writes an image to the system clipboard from base64.
 * Fails closed with a stable code when the platform does not support image clipboard.
 */
async function writeImage(data: string, mimeType: string): Promise<void> {
  try {
    // clipboardy.writeImages accepts array of base64 strings.
    const writeImages = typeof clipboardy.writeImages === "function"
      ? clipboardy.writeImages
      : null;
    if (writeImages) {
      await writeImages([data]);
      return;
    }
    // Fallback: attempt generic write (may throw if unsupported).
    await clipboardy.write(data);
  } catch (error) {
    const code = isKnownClipboardError(error);
    if (code) throw new Error(code);
    throw new Error("CLIPBOARD_WRITE_FAILED");
  }
}

/** Creates the clipboard seam used by SessionService. */
export function createClipboardApi(): ClipboardApi {
  return {
    readText,
    writeText,
    readImage,
    writeImage
  };
}
