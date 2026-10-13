import { useEffect, useId, useReducer, useRef, useState, type FormEvent } from 'react';
import {
  ITEM_CATEGORY_VALUES,
  LIMITS,
  QuantityInputSchema,
  UNIT_VALUES,
  isMeasuredUnit,
  normalizeDecimalInput,
  numberToDecimalString,
  type InventoryItemDto,
  type ItemCategory,
  type ItemImageDto,
  type Unit,
} from '@homi/shared';
import { isApiError } from '@/api/client';
import { deleteItemImage, fetchItem, uploadItemImage } from '@/api/inventory';
import {
  Button,
  FormCard,
  FormRow,
  GlassButton,
  ImageUploadArea,
  PriceField,
  QuantityStepper,
  SelectRow,
  SheetHeader,
  TextField,
  type SelectOption,
} from '@/components';
import { useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { ITEM_CATEGORY_LABELS, formatNumber } from '@/lib/format';
import { useSheetDirty } from '@/routes/sheetDirty';
import { clearDraft, loadDraft, saveDraft } from './draft';
import { handleFormEnter } from './formKeys';
import { totalPreview, unitOptionLabel } from './format';
import {
  EMPTY_ITEM_FORM,
  effectiveUnit,
  formValuesFromItem,
  isItemFormDirty,
  quantityStep,
  rebaseItemForm,
  toCreateRequest,
  toUpdateRequest,
  validateItemForm,
  type ItemFormValues,
} from './formModel';
import { useCreateItem, useUpdateItem } from './queries';
import {
  imageIdForCreate,
  imageIdForUpdate,
  initialPhotoState,
  isPhotoDirty,
  isUploading,
  checkPhotoFile,
  pendingImageId,
  photoReducer,
  uploadErrorMessage,
  uploadAreaProps,
  type PhotoState,
} from './uploadState';

const HEIF_NAME = /\.(heic|heif)$/i;
const PHOTO_ACCEPT = 'image/*,.heic,.heif';

const CATEGORY_OPTIONS: ReadonlyArray<SelectOption<ItemCategory>> = ITEM_CATEGORY_VALUES.map((value) => ({
  value,
  label: ITEM_CATEGORY_LABELS[value],
}));

function parseTypedQuantity(text: string): number | null {
  const normalized = normalizeDecimalInput(text);
  if (normalized === null) return null;
  const parsed = QuantityInputSchema.safeParse(normalized);
  return parsed.success ? Number(parsed.data) : null;
}

/** Browsers other than Safari cannot preview HEIC – the server's WebP is shown after the upload. */
function previewable(file: File): boolean {
  return typeof URL.createObjectURL === 'function' && !HEIF_NAME.test(file.name) && !/hei[cf]/i.test(file.type);
}

export interface ItemFormProps {
  mode: 'new' | 'edit';
  /** The item being edited (mode `edit`). */
  item?: InventoryItemDto;
  /** Storage scope of the in-progress draft (see draft.ts). */
  draftScope: string;
  onCreated: (item: InventoryItemDto) => void;
  onSaved: (item: InventoryItemDto) => void;
  /** Edit mode: trash button (opens the delete confirmation). */
  onRequestDelete?: () => void;
  /** The item no longer exists (deleted by someone else while editing). */
  onMissing: () => void;
}

interface FormBaseline {
  values: ItemFormValues;
  version: number;
  image: ItemImageDto | null;
}

function baselineOf(item: InventoryItemDto | undefined): FormBaseline {
  return item
    ? { values: formValuesFromItem(item), version: item.version, image: item.image }
    : { values: EMPTY_ITEM_FORM, version: 0, image: null };
}

/**
 * "Neuer Artikel" / "Artikel bearbeiten" (design 06, 07, 13): photo, name, category, quantity,
 * unit and price with a live total. Unsaved input marks the sheet dirty and is kept in
 * sessionStorage; an edit that lost a race against another member offers to reload.
 */
export function ItemForm({ mode, item, draftScope, onCreated, onSaved, onRequestDelete, onMissing }: ItemFormProps) {
  const householdId = useRequiredHouseholdId();
  const nameId = useId();
  const [restored] = useState(() => {
    const draft = loadDraft(draftScope);
    // An edit draft only applies to the version it was started from.
    if (!draft || (mode === 'edit' && draft.baseVersion !== (item?.version ?? null))) return null;
    return draft;
  });
  const [baseline, setBaseline] = useState<FormBaseline>(() => baselineOf(item));
  const [values, setValues] = useState<ItemFormValues>(() => restored?.values ?? baseline.values);
  const [photo, dispatch] = useReducer(photoReducer, undefined, (): PhotoState =>
    initialPhotoState(baseline.image, restored?.selection),
  );
  const [nameTouched, setNameTouched] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const photoRef = useRef(photo);
  const uploadAbort = useRef<AbortController | null>(null);
  /** Set once saved: the sheet is closing, its input must not be stored as a draft again. */
  const saved = useRef(false);
  useEffect(() => {
    photoRef.current = photo;
  }, [photo]);

  const create = useCreateItem();
  const update = useUpdateItem(item?.id ?? '');
  const saving = create.isPending || update.isPending;

  const errors = validateItemForm(values);
  const valid = Object.keys(errors).length === 0;
  const uploading = isUploading(photo);
  const dirty = isItemFormDirty(values, baseline.values) || isPhotoDirty(photo) || uploading;
  useSheetDirty(dirty);

  // Keep the in-progress input (reload / offline / crash safe).
  useEffect(() => {
    if (saved.current) return;
    if (dirty) {
      saveDraft(draftScope, {
        values,
        selection: photo.selection,
        baseVersion: mode === 'edit' ? baseline.version : null,
      });
    } else {
      clearDraft(draftScope);
    }
  }, [baseline.version, dirty, draftScope, mode, photo.selection, values]);

  // Revoke object URLs of local previews once they are no longer shown.
  const previewUrl = photo.upload.status === 'idle' ? null : photo.upload.previewUrl;
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => uploadAbort.current?.abort(), []);

  const set = <K extends keyof ItemFormValues>(field: K, value: ItemFormValues[K]): void => {
    setServerError(null);
    setValues((current) => ({ ...current, [field]: value }));
  };

  const onFileSelected = (file: File): void => {
    const problem = checkPhotoFile(file);
    dispatch({ type: 'pick', previewUrl: previewable(file) ? URL.createObjectURL(file) : null, fileName: file.name });
    if (problem) {
      dispatch({ type: 'failed', message: problem });
      return;
    }
    uploadAbort.current?.abort();
    const controller = new AbortController();
    uploadAbort.current = controller;
    uploadItemImage(householdId, file, {
      signal: controller.signal,
      onProgress: (progress) => dispatch({ type: 'progress', fraction: progress.fraction }),
    }).then(
      (uploaded) => {
        const replaced = pendingImageId(photoRef.current);
        dispatch({
          type: 'uploaded',
          image: { id: uploaded.id, thumbUrl: uploaded.thumbUrl, fullUrl: uploaded.fullUrl },
        });
        // A previously uploaded (never attached) photo is no longer needed.
        if (replaced && replaced !== uploaded.id) void deleteItemImage(householdId, replaced).catch(() => undefined);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({ type: 'failed', message: uploadErrorMessage(error) });
      },
    );
  };

  const onRemovePhoto = (): void => {
    uploadAbort.current?.abort();
    const pending = pendingImageId(photoRef.current);
    dispatch({ type: 'remove' });
    if (pending) void deleteItemImage(householdId, pending).catch(() => undefined);
  };

  const reloadAfterConflict = async (): Promise<void> => {
    if (!item) return;
    setReloading(true);
    try {
      const latest = await fetchItem(householdId, item.id);
      const next = baselineOf(latest);
      setValues((current) => rebaseItemForm(current, baseline.values, next.values));
      setBaseline(next);
      const selection = photoRef.current.selection;
      dispatch({ type: 'reset', committed: next.image, selection });
      setConflict(false);
    } catch (error) {
      if (isApiError(error) && error.status === 404) onMissing();
      else setServerError('Der Artikel konnte nicht neu geladen werden.');
    } finally {
      setReloading(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setNameTouched(true);
    if (!valid || uploading || saving) return;
    setServerError(null);

    const handleError = (error: unknown): void => {
      if (isApiError(error)) {
        if (error.code === 'VERSION_CONFLICT') {
          setConflict(true);
          return;
        }
        if (error.status === 404 && mode === 'edit') {
          onMissing();
          return;
        }
        setServerError(
          error.isNetworkError ? 'Keine Verbindung zum Server. Deine Eingaben bleiben erhalten.' : error.message,
        );
        return;
      }
      setServerError('Speichern ist fehlgeschlagen.');
    };

    if (mode === 'new') {
      create.mutate(toCreateRequest(values, imageIdForCreate(photo)), {
        onSuccess: (created) => {
          saved.current = true;
          clearDraft(draftScope);
          onCreated(created);
        },
        onError: handleError,
      });
      return;
    }
    if (!item) return;
    if (!dirty) {
      onSaved(item);
      return;
    }
    update.mutate(toUpdateRequest(values, baseline.values, baseline.version, imageIdForUpdate(photo)), {
      onSuccess: (updated) => {
        saved.current = true;
        clearDraft(draftScope);
        onSaved(updated);
      },
      onError: handleError,
    });
  };

  const unit = effectiveUnit(values);
  const step = quantityStep(values);
  const quantityNumber = Number(QuantityInputSchema.safeParse(values.quantity).data ?? '0');
  const unitOptions: ReadonlyArray<SelectOption<Unit>> = UNIT_VALUES.map((value) => ({
    value,
    label: unitOptionLabel(values.quantity, value),
  }));
  const preview = totalPreview(values.quantity, values.unitPrice);
  const area = uploadAreaProps(photo);

  return (
    <div className="item-form">
      <SheetHeader
        title={mode === 'new' ? 'Neuer Artikel' : 'Artikel bearbeiten'}
        trailing={
          mode === 'edit' && onRequestDelete ? (
            <GlassButton
              icon="trash"
              size="sheet"
              tone="destructive"
              label="Artikel löschen"
              onClick={onRequestDelete}
            />
          ) : null
        }
      />
      <form className="item-form__fields" onSubmit={onSubmit} onKeyDown={handleFormEnter} noValidate>
        <ImageUploadArea
          state={area.state}
          imageUrl={area.imageUrl}
          progress={area.progress}
          errorMessage={area.errorMessage}
          accept={PHOTO_ACCEPT}
          onFileSelected={onFileSelected}
          onRemove={onRemovePhoto}
        />

        <TextField
          id={nameId}
          label="Artikelname"
          placeholder="z. B. Olivenöl"
          value={values.name}
          maxLength={LIMITS.itemName.max}
          required
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="next"
          error={nameTouched ? errors.name : undefined}
          onChange={(event) => set('name', event.target.value)}
          onBlur={() => setNameTouched(true)}
        />

        <FormCard aria-label="Details">
          <SelectRow
            variant="inset"
            label="Kategorie"
            value={values.category}
            options={CATEGORY_OPTIONS}
            placeholder="Auswählen"
            onValueChange={(value) => set('category', value)}
          />
          <FormRow label="Menge">
            <QuantityStepper
              size="compact"
              label="Menge"
              value={quantityNumber}
              min={mode === 'new' && !isMeasuredUnit(unit) ? 1 : 0}
              max={Number(LIMITS.quantity.max)}
              step={step}
              editable={isMeasuredUnit(unit)}
              parseValue={parseTypedQuantity}
              formatValue={(next) => formatNumber(numberToDecimalString(next, 3))}
              onChange={(next) => set('quantity', numberToDecimalString(next, 3))}
            />
          </FormRow>
          <SelectRow
            variant="inset"
            label="Einheit"
            value={values.unit}
            options={unitOptions}
            placeholder={unitOptionLabel(values.quantity, 'STUECK')}
            onValueChange={(value) => set('unit', value)}
          />
        </FormCard>
        {errors.quantity && values.quantity !== '' ? (
          <p className="item-form__error" role="alert">
            {errors.quantity}
          </p>
        ) : null}

        <PriceField
          value={values.unitPrice}
          onValueChange={(value) => set('unitPrice', value)}
          error={errors.unitPrice}
        />

        <p className="item-form__total">
          <span className="item-form__total-label">Gesamtwert</span>
          <span className="item-form__total-value" data-placeholder={preview.known ? undefined : ''} aria-live="polite">
            {preview.text}
          </span>
        </p>

        {conflict ? (
          <div className="item-form__alert" role="alert">
            <p>Der Artikel wurde inzwischen geändert. Lade ihn neu – deine Änderungen bleiben erhalten.</p>
            <Button variant="secondary" fullWidth loading={reloading} onClick={() => void reloadAfterConflict()}>
              Neu laden
            </Button>
          </div>
        ) : null}
        {serverError ? (
          <p className="item-form__alert" role="alert">
            {serverError}
          </p>
        ) : null}

        <Button
          type="submit"
          fullWidth
          className="item-form__submit"
          disabled={!valid || uploading || conflict}
          loading={saving}
        >
          {mode === 'new' ? 'Artikel hinzufügen' : 'Änderungen sichern'}
        </Button>
      </form>
    </div>
  );
}
