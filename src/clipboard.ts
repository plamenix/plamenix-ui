/**
 * Copying text to the clipboard, in both contexts Plamenix runs in.
 *
 * `navigator.clipboard` exists only in a secure context. The desktop
 * edition always has one; the web edition is a self-hosted server whose
 * ordinary deployment is `http://192.168.x.x`, where the property is
 * **undefined** rather than merely refusing.
 *
 * That distinction is why this exists. The shipped call sites were all
 * written as `void navigator.clipboard.writeText(t).catch(() => {})`,
 * which reads as guarded and is not: reading `.writeText` off `undefined`
 * throws synchronously, before there is a promise for `.catch` to attach
 * to. So on a LAN deployment every copy button raised a `TypeError` out
 * of a React event handler instead of quietly doing nothing.
 *
 * The fallback is `document.execCommand('copy')` — deprecated, and still
 * the only thing that works without a secure context. It needs a
 * selectable node in the document, hence the offscreen textarea.
 */

/**
 * Copies `text`, reporting whether it worked.
 *
 * Never throws: callers are click handlers, and a clipboard that is
 * unavailable is not a reason to tear down the view. Check the result
 * and tell the user instead — silently doing nothing is the one
 * behaviour worse than an error.
 *
 * @param text The string to place on the clipboard.
 * @returns `true` when the text was copied, `false` when neither route
 * was available or both failed.
 */
export async function copyText(text: string): Promise<boolean> {
  // Optional-chained on purpose: in an insecure context the property is
  // absent, not a function that rejects.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused, or the document was not focused. The
      // fallback below sometimes still succeeds, so fall through
      // rather than giving up here.
    }
  }
  return legacyCopy(text);
}

/**
 * The pre-Clipboard-API route, for insecure contexts.
 *
 * `execCommand` copies the current selection, so the text has to exist
 * in the document and be selected first. The textarea is positioned
 * offscreen rather than hidden — `display: none` and `visibility:
 * hidden` are not selectable, so either would make the copy silently
 * empty.
 */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '-9999px';
  area.style.opacity = '0';
  document.body.appendChild(area);

  // Restoring the user's own selection afterwards — copying a column
  // name should not clear the text they had highlighted in the editor.
  const previous = document.getSelection()?.rangeCount
    ? document.getSelection()?.getRangeAt(0)
    : null;

  try {
    area.select();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    if (previous) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(previous);
    }
  }
}
