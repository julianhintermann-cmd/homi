/** Minimal typings for `heic-convert` (the package ships none). */
declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    /** 0…1, JPEG only (default 0.92). */
    quality?: number;
  }

  /** Decodes the primary image of a HEIC/HEIF file and encodes it as JPEG or PNG. */
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer | Uint8Array>;

  export default convert;
}
