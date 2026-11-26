function buildSingleByteTable(encoding: 'iso-8859-2' | 'windows-1252', includeC1: boolean): Map<string, number> {
  const decoder = new TextDecoder(encoding);
  const bytes = new Map<string, number>();
  for (let byte = 0; byte < 256; byte += 1) {
    const character = decoder.decode(new Uint8Array([byte]));
    if (!bytes.has(character)) bytes.set(character, byte);
  }
  if (includeC1) {
    for (let byte = 0x80; byte <= 0x9f; byte += 1) {
      const c1 = String.fromCharCode(byte);
      if (!bytes.has(c1)) bytes.set(c1, byte);
    }
  }
  return bytes;
}

const ISO_8859_2_BYTES = buildSingleByteTable('iso-8859-2', false);
const WIN_1252_AND_LATIN1_BYTES = buildSingleByteTable('windows-1252', true);
const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true });

function tryDecodeWithTable(value: string, bytes: Map<string, number>): string | null {
  const out: number[] = [];
  for (const character of value) {
    const byte = bytes.get(character);
    if (byte === undefined) return null;
    out.push(byte);
  }
  try {
    const repaired = UTF8_FATAL.decode(new Uint8Array(out));
    if (/[\u0080-\u009f]/.test(repaired)) return null;
    return repaired;
  } catch {
    return null;
  }
}

/** El puente, en algunos cuerpos, comió el segundo byte y guardó `PĂO` en vez de `PÃO`. */
function repairLoneTilde(value: string): string {
  return value.includes('Ă') ? value.replace(/Ă/g, 'Ã') : value;
}

/**
 * Repara el texto del ERP cuando la heurística de charset del puente leyó UTF-8 como ISO-8859-2 o Latin-1/Win-1252.
 */
export function repairErpText(value: string): string {
  const hasC1Control = /[\u0080-\u009f]/.test(value);
  const hasSuspiciousPair = /[ÃÂ][^\x00-\x7f]/.test(value);
  if (hasC1Control || hasSuspiciousPair) {
    const fromIso2 = hasC1Control ? tryDecodeWithTable(value, ISO_8859_2_BYTES) : null;
    if (fromIso2 !== null) return repairLoneTilde(fromIso2);
    const fromLatin1 = tryDecodeWithTable(value, WIN_1252_AND_LATIN1_BYTES);
    if (fromLatin1 !== null && fromLatin1 !== value) return repairLoneTilde(fromLatin1);
  }
  return repairLoneTilde(value);
}
