import { ZevAuthError } from '../types.js';
import type { Http } from './http.js';

export type AssetPurpose = 'user_avatar' | 'organization_image';

export interface UploadTicket {
  publicUrl: string;
  key: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
  alreadyExists: boolean;
}

export interface UploadImageOptions {
  /** The file to upload. Anything with a `File` shape works. */
  file: File;
  /** Only for `organization_image`. Defaults to the active organization. */
  organizationId?: string;
  /** 0 to 1, called often enough to drive a progress bar. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads an image and returns the URL to save.
 *
 * ── Three requests, and why they are worth it ─────────────────────
 * Ask for a ticket, PUT the bytes, save the URL. The middle step goes
 * straight to object storage and never touches the ZevAuth API, which
 * is what keeps a profile picture from becoming a large request body,
 * a memory spike and a bandwidth bill on somebody else's server.
 *
 * The hash is computed here, in the browser, before anything is sent.
 * It becomes the object key, so uploading the same picture twice costs
 * one upload: the second ticket comes back saying the bytes are already
 * there and there is nothing to PUT.
 *
 * This returns the URL rather than saving it. Saving is a separate call
 * — `me.update({ imageUrl })` or `organizations.update({ imageUrl })` —
 * because the two have different authority, and a helper that guessed
 * which one you meant would be wrong exactly when it mattered.
 */
export async function uploadImage(params: {
  http: Http;
  accessToken: string;
  purpose: AssetPurpose;
  options: UploadImageOptions;
}): Promise<string> {
  const { file, onProgress, signal } = params.options;

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    /*
     * `crypto.subtle` is unavailable on an insecure origin. Saying so is
     * the difference between a five-second fix and an afternoon: the
     * symptom is otherwise an undefined property in a stack trace that
     * names none of this.
     */
    throw new ZevAuthError(
      'Image uploads need a secure context. Serve your app over https, or use localhost in development.',
      'insecure_context',
      400,
    );
  }

  const bytes = await file.arrayBuffer();
  const [sha256, dimensions] = await Promise.all([
    sha256Hex(bytes),
    readDimensions(file),
  ]);

  const ticket = await params.http.post<UploadTicket>(
    '/v1/me/assets/upload-url',
    {
      purpose: params.purpose,
      contentType: file.type,
      contentLength: file.size,
      sha256,
      width: dimensions?.width,
      height: dimensions?.height,
      organizationId: params.options.organizationId,
    },
    { accessToken: params.accessToken },
  );

  if (ticket.alreadyExists || !ticket.uploadUrl) {
    onProgress?.(1);
    return ticket.publicUrl;
  }

  await putWithProgress({
    url: ticket.uploadUrl,
    headers: ticket.headers ?? {},
    body: bytes,
    onProgress,
    signal,
  });

  return ticket.publicUrl;
}

/** Lowercase hex SHA-256, which is what the object key is built from. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Pixel dimensions, or nothing.
 *
 * Optional on the server for the same reason it is forgiving here: a
 * dimension we could not measure should not block an upload that is
 * otherwise fine.
 */
async function readDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * `XMLHttpRequest`, deliberately.
 *
 * `fetch` still has no upload progress event. Streaming request bodies
 * exist in newer browsers but need HTTP/2 and are refused by some, and
 * this PUT goes to a third-party origin where we control neither. A
 * progress bar that works everywhere is worth more here than a modern
 * API: an upload on a slow connection with no feedback reads as a frozen
 * page, and the person clicks the button again.
 */
function putWithProgress(params: {
  url: string;
  headers: Record<string, string>;
  body: ArrayBuffer;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', params.url);

    for (const [name, value] of Object.entries(params.headers)) {
      /*
       * `content-length` is a forbidden header name: the browser sets it
       * from the body and refuses to let script set it. It is signed all
       * the same, and the value the browser sends is the one that was
       * signed, because the body is exactly the bytes we measured.
       */
      if (name.toLowerCase() === 'content-length') continue;
      request.setRequestHeader(name, value);
    }

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) params.onProgress?.(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        params.onProgress?.(1);
        resolve();
        return;
      }
      reject(
        new ZevAuthError(
          // The storage error body is XML nobody should read. The status
          // is the only part worth surfacing.
          `The upload was refused (${request.status}). Try again in a moment.`,
          'upload_failed',
          request.status,
        ),
      );
    });

    request.addEventListener('error', () =>
      reject(
        new ZevAuthError(
          'The upload failed. Check your connection and try again.',
          'upload_failed',
          0,
        ),
      ),
    );
    request.addEventListener('abort', () =>
      reject(new ZevAuthError('Upload cancelled.', 'upload_cancelled', 0)),
    );

    params.signal?.addEventListener('abort', () => request.abort());
    request.send(params.body);
  });
}
