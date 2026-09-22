export interface DetectedFile {
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  extension: 'jpg' | 'png' | 'pdf';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Identifica o tipo pelo conteúdo real (magic bytes) e não pelo que o cliente
 * declara: o Content-Type e a extensão do arquivo são controlados por quem envia.
 */
export function detectFileType(buffer: Buffer): DetectedFile | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (
    buffer.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, i) => buffer[i] === byte)
  ) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  ) {
    return { mime: 'application/pdf', extension: 'pdf' };
  }
  return null;
}
