/**
 * Reads a Response body as JSON. A timeout/abort during the body read throws a clear
 * "timed out after <label>: <url>" error; a genuine parse failure returns null.
 */
export async function readJson(res, url, timeoutLabel) {
  try {
    return await res.json();
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`timed out after ${timeoutLabel}: ${url}`);
    }
    return null;
  }
}
