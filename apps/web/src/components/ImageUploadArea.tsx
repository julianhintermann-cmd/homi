import { useId, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '@/icons/Icon';
import { BottomSheetOption, HomiBottomSheet } from './HomiBottomSheet';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export type ImageUploadState = 'empty' | 'selected' | 'uploading' | 'error';

export interface ImageUploadAreaProps {
  /** Preview URL (object URL of the picked file or the stored image). */
  imageUrl?: string | null;
  /** Derived from `imageUrl` when omitted (`selected` with an image, else `empty`). */
  state?: ImageUploadState;
  /** Upload progress 0…1 while `uploading` (indeterminate when omitted). */
  progress?: number;
  /** Message in the `error` state. Default "Upload fehlgeschlagen". */
  errorMessage?: string;
  /** A file was picked (camera or library). */
  onFileSelected: (file: File) => void;
  /** Tap in the `error` state (retry). Defaults to opening the picker again. */
  onRetry?: () => void;
  /**
   * Show the "Foto hinzufügen" action sheet (Foto aufnehmen / Aus Mediathek wählen / Abbrechen,
   * design 13). Default `true`; `false` opens the library picker directly.
   */
  sourceSheet?: boolean;
  /** Accepted types. Default `image/*` (HEIC is converted by the server). */
  accept?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Offers a destructive "Foto entfernen" option in the source sheet while a photo is shown
   * (selected or failed upload).
   */
  onRemove?: () => void;
  /** Label of the remove option. Default "Foto entfernen". */
  removeLabel?: string;
}

/**
 * Freegma "Image Upload Area" (353 × 200, r 22). Empty: surface with a 1.5 px dashed
 * label-tertiary 70 % ring, 48 px accent-soft camera circle, "Foto hinzufügen" + hint.
 * Selected: cover image with the glass "Ändern" pill 12 px from the bottom-right corner.
 * Uploading: dimmed image with a progress ring. Error: destructive ring with retry.
 */
export function ImageUploadArea({
  imageUrl,
  state,
  progress,
  errorMessage = 'Upload fehlgeschlagen',
  onFileSelected,
  onRetry,
  sourceSheet = true,
  accept = 'image/*',
  disabled = false,
  className,
  onRemove,
  removeLabel = 'Foto entfernen',
}: ImageUploadAreaProps) {
  const resolved: ImageUploadState = state ?? (imageUrl ? 'selected' : 'empty');
  const [sheetOpen, setSheetOpen] = useState(false);
  const cameraId = useId();
  const libraryId = useId();
  const libraryRef = useRef<HTMLInputElement>(null);

  const pick = (): void => {
    if (disabled) return;
    if (sourceSheet) setSheetOpen(true);
    else libraryRef.current?.click();
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    setSheetOpen(false);
    if (file) onFileSelected(file);
  };

  const inputs = (
    <>
      <input
        id={cameraId}
        type="file"
        accept={accept}
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        onChange={onChange}
      />
      <input
        id={libraryId}
        ref={libraryRef}
        type="file"
        accept={accept}
        className="visually-hidden"
        tabIndex={-1}
        onChange={onChange}
      />
    </>
  );

  const sheet = sourceSheet ? (
    <HomiBottomSheet
      open={sheetOpen}
      variant="action"
      title="Foto hinzufügen"
      cancelLabel="Abbrechen"
      onClose={() => setSheetOpen(false)}
    >
      <div className="homi-sheet-options">
        <BottomSheetOption icon="camera" label="Foto aufnehmen" htmlFor={cameraId} />
        <BottomSheetOption icon="photo" label="Aus Mediathek wählen" htmlFor={libraryId} />
        {onRemove && (resolved === 'selected' || resolved === 'error') ? (
          <BottomSheetOption
            icon="trash"
            label={removeLabel}
            destructive
            onClick={() => {
              setSheetOpen(false);
              onRemove();
            }}
          />
        ) : null}
      </div>
    </HomiBottomSheet>
  ) : null;

  if (resolved === 'selected' || resolved === 'uploading') {
    const uploading = resolved === 'uploading';
    const percent = progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, progress)) * 100);
    return (
      <div className={cx('homi-upload', className)} data-state={resolved}>
        {imageUrl ? (
          <img
            className="homi-upload__image"
            src={imageUrl}
            alt="Ausgewähltes Foto"
            width={353}
            height={200}
            decoding="async"
          />
        ) : null}
        {uploading ? (
          <div
            className="homi-upload__progress"
            role="progressbar"
            aria-label="Foto wird hochgeladen"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <ProgressRing value={progress} />
            <span className="homi-upload__progress-label">
              {percent === undefined ? 'Wird hochgeladen …' : `${percent} %`}
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="glass glass--pressable homi-upload__change"
            onClick={pick}
            disabled={disabled}
          >
            <Icon name="camera" size={18} strokeWidth={2.53} />
            <span>Ändern</span>
          </button>
        )}
        {inputs}
        {sheet}
      </div>
    );
  }

  const error = resolved === 'error';
  return (
    <div className={cx('homi-upload', className)} data-state={resolved}>
      <button
        type="button"
        className="homi-upload__empty"
        onClick={error && onRetry ? onRetry : pick}
        disabled={disabled}
        aria-describedby={`${libraryId}-hint`}
      >
        {/* 1.5 px inner dashed ring with the design's 11.5 / 11.5 dash rhythm (CSS `dashed` is too short). */}
        <svg className="homi-upload__dash" aria-hidden="true" focusable="false">
          <rect
            x="0.75"
            y="0.75"
            rx="21.25"
            ry="21.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="11.5 11.5"
          />
        </svg>
        <span className="homi-upload__icon" aria-hidden="true">
          <Icon name={error ? 'xmark' : 'camera'} size={24} strokeWidth={1.9} />
        </span>
        <span className="homi-upload__title">{error ? errorMessage : 'Foto hinzufügen'}</span>
        <span id={`${libraryId}-hint`} className="homi-upload__hint" role={error ? 'alert' : undefined}>
          {error ? 'Tippe, um es erneut zu versuchen.' : 'Aufnehmen oder aus der Mediathek wählen'}
        </span>
      </button>
      {inputs}
      {sheet}
    </div>
  );
}

/** 44 px circular progress (stroke-dashoffset; indeterminate = rotating arc). */
function ProgressRing({ value }: { value?: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const indeterminate = value === undefined;
  const dash = indeterminate ? circumference * 0.28 : circumference * Math.min(1, Math.max(0, value));
  return (
    <svg
      className="homi-upload__ring"
      data-indeterminate={indeterminate || undefined}
      width="44"
      height="44"
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3.5" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}
