import { useState, type CSSProperties } from 'react';
import { Icon } from '@/icons/Icon';
import { cx } from './utils';

/** Design sizes: S 52 (r 12, list rows), M 108 (r 20, Home tiles), L 168 (r 38, hero + shadow). */
export type ProductImageSize = 'S' | 'M' | 'L';

const SIZES: Record<ProductImageSize, { px: number; radius: number }> = {
  S: { px: 52, radius: 12 },
  M: { px: 108, radius: 20 },
  L: { px: 168, radius: 38 },
};

export interface ProductImageProps {
  /** Image URL (e.g. `item.image.thumbUrl`); `null`/missing shows the placeholder glyph. */
  src?: string | null;
  /** Optional responsive sources (thumb/full variants). */
  srcSet?: string;
  sizes?: string;
  /** Alternative text – usually empty because the product name is shown next to it. */
  alt?: string;
  size?: ProductImageSize;
  /** Custom square size in px (overrides `size`; radius scales from the nearest design size). */
  px?: number;
  /** Custom corner radius in px. */
  radius?: number;
  /** Load eagerly (above-the-fold hero). Default: lazy. */
  priority?: boolean;
  /** Hero shadow 0/14/34 (12 %, dark 40 %) – the L image on the item details screen (05). */
  elevated?: boolean;
  className?: string;
}

/**
 * Freegma "Product Image" (S 52 r 12 · M 108 r 20 · L 168 r 38): square, `object-fit: cover`, explicit width/height (no layout
 * shift), lazy-loaded and faded in on load; neutral placeholder glyph without/failed image.
 */
export function ProductImage({
  src,
  srcSet,
  sizes,
  alt = '',
  size = 'S',
  px,
  radius,
  priority = false,
  elevated = false,
  className,
}: ProductImageProps) {
  const spec = SIZES[size];
  const dimension = px ?? spec.px;
  const corner = radius ?? (px ? Math.round((spec.radius / spec.px) * px) : spec.radius);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setStatus('loading');
  }
  const showImage = Boolean(src) && status !== 'error';
  const style = {
    '--product-size': `${dimension}px`,
    '--product-radius': `${corner}px`,
  } as CSSProperties;

  return (
    <span
      className={cx('homi-product-image', className)}
      data-size={px ? undefined : size}
      data-status={showImage ? status : 'placeholder'}
      data-elevated={elevated || undefined}
      style={style}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          width={dimension}
          height={dimension}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className="homi-product-image__img"
          ref={(element) => {
            // Cached images may finish before React attaches onLoad.
            if (element?.complete && element.naturalWidth > 0) setStatus('loaded');
          }}
        />
      ) : (
        <Icon
          name="photo"
          size={Math.max(16, Math.round(dimension * 0.42))}
          weight={dimension >= 100 ? 1.6 : 1.5}
          className="homi-product-image__placeholder"
          label={alt || undefined}
        />
      )}
    </span>
  );
}
