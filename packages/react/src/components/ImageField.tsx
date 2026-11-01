import { useEffect, useRef, useState } from 'react';
import { ZevAuthError } from '@zevauth/js';
import { Alert } from './parts.js';
import { useElements } from '../internal/appearance.js';
import { errorMessage, format, useStrings } from '../internal/localization.js';

export interface ImageFieldProps {
  label: string;
  /** The picture on the account right now, or null. */
  value: string | null;
  /** Uploads the bytes and resolves to the URL to save. */
  upload: (file: File, onProgress: (fraction: number) => void) => Promise<string>;
  /** Saves the URL. Called with `null` when the picture is removed. */
  onSave: (url: string | null) => Promise<unknown>;
  /** Round for a person, square for an organization. */
  shape?: 'circle' | 'square';
  isDisabled?: boolean;
}

/** Kept in step with the server's `asset-purposes` table. */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 1024 * 1024;

/**
 * A picture, changed in place.
 *
 * ── Why upload and save are two steps ─────────────────────────────
 * The bytes go to storage first and the URL is saved second. That is
 * what lets the picture appear the moment it is chosen: a person
 * picking an avatar is answering "does this look right", and a control
 * that shows nothing until after the save has already asked them to
 * commit to an answer they cannot see.
 *
 * It also means the two failures are distinguishable. An upload that
 * fails is a network problem worth retrying; a save that fails is a
 * permission problem worth reading. One combined step would report both
 * as "could not change your picture".
 *
 * ── Why the file input is hidden ──────────────────────────────────
 * A native `<input type="file">` cannot be styled, and a bare one sitting
 * in a branded profile card is the single most obvious sign that a
 * component came from somewhere else. The button is ours; the input is
 * behind it and still reachable by keyboard, because the button is a
 * real button that clicks it.
 */
export function ImageField({
  label,
  value,
  upload,
  onSave,
  shape = 'circle',
  isDisabled,
}: ImageFieldProps) {
  const el = useElements();
  const strings = useStrings();
  const t = strings.imageField;
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasFailedToLoad, setHasFailedToLoad] = useState(false);

  useEffect(() => setHasFailedToLoad(false), [value]);

  const isBusy = progress !== null;

  async function handleFile(file: File) {
    setError(null);

    /*
     * Checked here as well as on the server, and this is not redundant:
     * the server check is the one that matters, and this one is the only
     * one that can refuse a 40 MB file before it is read, hashed and
     * sent over somebody's phone connection.
     */
    if (!ACCEPTED.includes(file.type)) {
      setError(t.wrongType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t.tooLarge);
      return;
    }

    setProgress(0);
    try {
      const url = await upload(file, setProgress);
      await onSave(url);
    } catch (err) {
      setError(
        err instanceof ZevAuthError ? errorMessage(strings, err, t.uploadFailed) : t.uploadFailed,
      );
    } finally {
      setProgress(null);
      // Without this, choosing the same file twice does nothing: the
      // input's value has not changed, so no `change` event fires.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setError(null);
    try {
      await onSave(null);
    } catch (err) {
      setError(
        err instanceof ZevAuthError ? errorMessage(strings, err, t.removeFailed) : t.removeFailed,
      );
    }
  }

  const showImage = value && !hasFailedToLoad;

  return (
    <div {...el('field')}>
      <span {...el('label')}>{label}</span>
      {error ? <Alert>{error}</Alert> : null}

      <div {...el('imageField')}>
        <div {...el('imagePreview')} data-shape={shape}>
          {showImage ? (
            <img src={value} alt="" onError={() => setHasFailedToLoad(true)} />
          ) : (
            /*
              A silhouette rather than empty space. An empty frame reads
              as an image that failed to load, which is the one thing a
              placeholder must not do.
            */
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="9" r="3.6" />
              <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
            </svg>
          )}
        </div>

        <div className="zv-image-actions">
          {isBusy ? (
            <>
              <div
                {...el('progress')}
                role="progressbar"
                aria-label={format(t.uploadingLabel, { label: label.toLowerCase() })}
                aria-valuenow={Math.round((progress ?? 0) * 100)}
              >
                <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
              <span {...el('hint')}>{t.uploading}</span>
            </>
          ) : (
            <>
              <div className="zv-image-buttons">
                <button
                  type="button"
                  {...el(['button', 'buttonSecondary'])}
                  data-variant="secondary"
                  disabled={isDisabled}
                  onClick={() => inputRef.current?.click()}
                >
                  {value ? t.replace : t.upload}
                </button>
                {value ? (
                  <button
                    type="button"
                    {...el(['button', 'buttonLink'])}
                    data-variant="ghost"
                    disabled={isDisabled}
                    onClick={() => void remove()}
                  >
                    {t.remove}
                  </button>
                ) : null}
              </div>
              <span {...el('hint')}>{t.hint}</span>
            </>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
