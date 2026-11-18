/**
 * Las abreviaturas del WhatsApp, del lado del navegador.
 *
 * El texto que el Relatório exporta lo arma el backend (`generateWhatsAppText`), y su tabla es la fuente de verdad.
 * Los históricos de Masas y de Salidas arman su vista previa acá, en el navegador, porque tienen el día ya cargado
 * y no van a pedirle al servidor que se los escriba. Las dos tablas tienen que decir lo mismo: si una cambia y la
 * otra no, el mismo producto viaja con dos nombres según desde dónde se comparta.
 *
 * Por eso esta tabla se copia y `whatsapp-abbreviations.parity.test.ts` compara las tres -- catálogo, nombres del
 * ERP y tareas -- contra `packages/backend/src/modules/reports/whatsapp-abbreviations.ts`, entrada por entrada. La
 * copia sin ese test es una promesa; con él, es una regla.
 */

/** El techo de la propuesta aprobada: una abreviatura nunca pasa de veinte caracteres. */
export const WHATSAPP_ABBREVIATION_LIMIT = 20;

/** El catálogo, por código: es la identidad más estable que tiene un producto. */
const CATALOGUE_BY_CODE = new Map<string, string>([
  // Salida / baixa
  ['1357', 'DISCO 200g'],
  ['1356', 'DISCO 400g'],
  ['1355', 'DISCO 500g'],
  ['1358', 'LASANHA'],
  ['1359', 'CASEIRA'],
  ['1361', 'QUADRADA'],
  ['1307', 'ROLO 1kg'],
  ['1625', 'TOKO'],
  ['1354', 'ROLO 500g'],
  ['1528', 'ROLO 2kg'],
  ['1781', 'TEMPERO'],
  ['1900', 'BOBINA ROLO'],
  ['1899', 'BOB. LASANHA'],
  ['1898', 'BOB. DISCO'],
  ['1012', 'SORBATO'],
  ['1011', 'PROPIONATO'],
  ['1068', 'MICRO SAL'],
  ['1074', 'AÇÚCAR 5kg'],
  ['1673', 'GORDURA'],
  // Masas
  ['1045', 'CASEIRA'],
  ['39', 'DISCO 200g'],
  ['60', 'DISCO 400g'],
  ['84', 'DISCO 500g'],
  ['91', 'LASANHA'],
  ['1192', 'QUADRADA'],
  ['5000', 'ROLO 1kg'],
  ['1047', 'ROLO 2kg'],
  ['22', 'ROLO 500g'],
  ['1616', 'TOKO'],
]);

/** Las mismas palabras, por nombre, para cuando el código no viaja en la línea. */
const CATALOGUE_BY_NAME = new Map<string, string>(
  [
    ['EMBALAG. DISCO 200G', 'DISCO 200g'],
    ['EMBALAG. DISCO 400G', 'DISCO 400g'],
    ['EMBALAG. DISCO 500G', 'DISCO 500g'],
    ['EMBALAG. LASANHA', 'LASANHA'],
    ['EMBALAG. CASEIRA', 'CASEIRA'],
    ['EMBALAG. QUADRADA', 'QUADRADA'],
    ['EMBALAG. ROLO 1KG', 'ROLO 1kg'],
    ['EMBALAG. TOKO', 'TOKO'],
    ['EMBALAG. ROLO 500G', 'ROLO 500g'],
    ['EMBALAG. ROLO 2KG', 'ROLO 2kg'],
    ['EMBALAG. TEMPERO', 'TEMPERO'],
    ['BOBINA ROLO', 'BOBINA ROLO'],
    ['BOBINA LASANHA', 'BOB. LASANHA'],
    ['BOBINA DISCO', 'BOB. DISCO'],
    ['SORBATO', 'SORBATO'],
    ['PROPIONATO', 'PROPIONATO'],
    ['MICRO SAL', 'MICRO SAL'],
    ['AÇÚCAR 5KG', 'AÇÚCAR 5kg'],
    ['GORDURA VEGETAL', 'GORDURA'],
    ['MASSA CASEIRA', 'CASEIRA'],
    ['MASSA DISCO 200G', 'DISCO 200g'],
    ['MASSA DISCO 400G', 'DISCO 400g'],
    ['MASSA DISCO 500G', 'DISCO 500g'],
    ['MASSA LASANHA 500G', 'LASANHA'],
    ['MASSA QUADRADA', 'QUADRADA'],
    ['MASSA ROLO 1KG', 'ROLO 1kg'],
    ['MASSA ROLO 2KG', 'ROLO 2kg'],
    ['MASSA ROLO 500G', 'ROLO 500g'],
    ['MASSA TOKO', 'TOKO'],
  ] as [string, string][],
);

/** Los nombres del ERP, con `PÃO` ya reparado: la tabla se compara contra la del backend tal cual. */
const ERP_BY_NAME = new Map<string, string>([
  ['MASSA P PIZZA TRINDADE UNIT FAMILIA 200 G', 'FAMÍLIA 200g'],
  ['320 G PÃO DE ALHO TRINDADE TRADICIONAL', 'PÃO ALHO 320g'],
  ['MASSA PARA PASTEL TRINDADE CASEIRA 1 KG', 'CASEIRA 1kg'],
  ['PÃO DE ALHO TRINDADE 400G TRADICIONAL', 'PÃO ALHO 400g'],
  ['320 G PÃO DE ALHO TRINDADE CALABRESA', 'PÃO ALHO 320g CAL'],
  ['BATATA PALHA EXTRA FINA TRINDADE 220G', 'BATATA 220g'],
  ['MASSA P PIZZA TRINDADE BROTINHO 55 G', 'BROT 55g'],
  ['PÃO DE ALHO TRINDADE 400G CALABRESA', 'PÃO ALHO 400g CAL'],
  ['320 G PÃO DE ALHO TRINDADE PICANTE', 'PÃO ALHO 320g PIC'],
  ['CANUDO PARA RECHEAR TRINDADE 200 G', 'CANUDO 200g'],
  ['TOKO - MASSA PARA PASTEL ROLO 1 KG', 'TOKO 1kg'],
  ['MASSA P PIZZA TRINDADE UNIT. 160G', 'UNIT 160g'],
  ['PÃO DE ALHO TRINDADE 400G PICANTE', 'PÃO ALHO 400g PIC'],
  ['QUEIJO RALADO GROSSO TRINDADE 40G', 'QUEIJO 40g'],
  ['MASSA PARA PASTEL QUADRADA 2 KG', 'QUADRADA 2kg'],
  ['SALGADINHO CHEDDAR TRINDADE 70G', 'SALGADINHO 70g'],
  ['CAIXA DE PAPELAO PEQUENA MISTA', 'CX PAP P'],
  ['CAIXA PAPELAO PEQUENA 2KG E 2K', 'CX PAP 2kg'],
  ['EMBALAGEM PLÁSTICA DISCO 400G', 'DISCO 400g'],
  ['EMBALAGEM PLÁSTICA LASANHA 50', 'LASANHA'],
  ['NHOQUE DE BATATA TRINDADE 1 KG', 'NHOQUE 1kg'],
  ['NHOQUE DE BATATA TRINDADE 400G', 'NHOQUE 400g'],
  ['FARINHA DE TRIGO DIVERSAS', 'FARINHA'],
  ['FILME STRETCH 50 CM', 'FILME 50'],
]);

/** Las tareas largas, en la versión moderada: `Org.` y `Receb.` se conservan. */
const TASK_BY_NAME = new Map<string, string>([
  ['ORGANIZAÇÃO DA CÂMARA F. PRINCIPAL', 'Câmara Principal'],
  ['CARREGAMENTO DOS CAMINHÕES DA CASA', 'Carreg. caminhões'],
  ['ORGANIZAÇÃO DA SAÍDA DOS PRODUTOS', 'Org. saída produtos'],
  ['ORGANIZAÇÃO CAIXAS USADAS X ITENS', 'Org. caixas usadas'],
  ['ORGANIZAÇÃO DAS CAIXAS PLÁSTICAS', 'Org. caixas plást.'],
  ['LIBERAÇÃO DE ESPAÇO CONTÊINERES', 'Lib. contêineres'],
  ['GUARDAR MASSA NAS CÂMARAS FRIAS', 'Guardar massa câm.'],
  ['ORGANIZAÇÃO DO CONTÊINER PIZZAS', 'Contêiner Pizzas'],
  ['ORGANIZAÇÃO DA ÁREA DA FARINHA', 'Org. área farinha'],
  ['RECEBIMENTO DE CAJAS DE CARTON', 'Receb. caixas cartón'],
  ['RETIRAR MASSA DOS CONTÊINERES', 'Retirar massa cont.'],
  ['MONTAGEM DE CAIXAS PRODUÇÃO', 'Montagem caixas'],
  ['ORGANIZAÇÃO DA ÁREA DO LIXO', 'Org. área lixo'],
  ['ORGANIZAÇÃO DO PÃO DE ALHO', 'Org. pão de alho'],
  ['ORGANIZAÇÃO DOS BRINQUEDOS', 'Org. brinquedos'],
  ['ABASTECIMENTO DA PRODUÇÃO', 'Abastec. produção'],
  ['ABASTECIMENTO DE TEMPEROS', 'Abastec. temperos'],
  ['RECEBIMENTO DE SALGADINHO', 'Receb. salgadinho'],
  ['RECEBIMENTO DE PROPIONATO', 'Receb. propionato'],
  ['RECEBIMENTO DE EMBALAGEM', 'Receb. embalagem'],
  ['RECEBIMENTO DE BRINQUEDO', 'Receb. brinquedo'],
  ['RECEBIMENTO DE PÃO ALHO', 'Receb. pão alho'],
  ['SEPARAÇÃO DOS ROMANEIOS', 'Sep. romaneios'],
  ['COLOCAÇÃO DE PLAQUINHAS', 'Coloc. plaquinhas'],
  ['ORGANIZAÇÃO DOS CANUDOS', 'Org. canudos'],
  ['ORGANIZAÇÃO DAS BATATAS', 'Org. batatas'],
  ['ORGANIZAÇÃO DO BARRACÃO', 'Org. barracão'],
  ['ORGANIZAÇÃO DAS PIZZAS', 'Org. pizzas'],
  ['RECEBIMENTO DE FARINHA', 'Receb. farinha'],
  ['RECEBIMENTO DE SORBATO', 'Receb. sorbato'],
]);

/** Las tablas, expuestas para el test que las compara con las del backend. */
export const WHATSAPP_TABLES = {
  catalogueByCode: CATALOGUE_BY_CODE,
  catalogueByName: CATALOGUE_BY_NAME,
  erpByName: ERP_BY_NAME,
  taskByName: TASK_BY_NAME,
} as const;

/** La tabla, en el archivo que también lee el backend para su test de contrato. */
export const WHATSAPP_TABLE_ARTIFACT = './whatsapp-abbreviations.table.json';

const NOISE_WORDS = new Set([
  'MASSA', 'MASSAS', 'PARA', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EMBALAGEM', 'EMBALAG.', 'PLASTICA',
  'PLÁSTICA', 'TRINDADE', 'EXTRA', 'FINA', 'FINAS', 'GROSSO', 'RALADO', 'DIVERSAS', 'DIVERSOS', 'COM', 'SEM',
]);

/**
 * El texto del ERP cuando la heurística de charset del puente le erró.
 *
 * El espejo guarda lo que llegó -- `PĂO` en vez de `PÃO`, o `Ă` más un carácter de control --, y el mensaje lo
 * escribe como la planta lo dice. La ingesta no se toca: esto es del texto, igual que en el backend.
 */
export function repairErpText(value: string): string {
  if (!/[\u0080-\u009f]/.test(value)) return repairLoneTilde(value);
  const decoder = new TextDecoder('iso-8859-2');
  const bytes = new Map<string, number>();
  for (let byte = 0; byte < 256; byte += 1) {
    const character = decoder.decode(new Uint8Array([byte]));
    if (!bytes.has(character)) bytes.set(character, byte);
  }
  const out: number[] = [];
  for (const character of value) {
    const byte = bytes.get(character);
    if (byte === undefined) return repairLoneTilde(value);
    out.push(byte);
  }
  try {
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(out));
    return /[\u0080-\u009f]/.test(repaired) ? repairLoneTilde(value) : repairLoneTilde(repaired);
  } catch {
    return repairLoneTilde(value);
  }
}

/** El puente, en algunos cuerpos, comió el segundo byte y guardó `PĂO` en vez de `PÃO`. */
function repairLoneTilde(value: string): string {
  return value.includes('Ă') ? value.replace(/Ă/g, 'Ã') : value;
}

/** La forma con la que se comparan nombres: reparada, sin espacios de más, en mayúsculas. */
function lookupKey(value: string): string {
  return repairErpText(value).normalize('NFC').replace(/\s+/g, ' ').trim().toUpperCase();
}

function codeKey(code: string | number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const stripped = String(code).trim().replace(/^0+/, '');
  return stripped.length > 0 ? stripped : null;
}

function sizeToken(words: string[]): string {
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const match = /^(\d+(?:[.,]\d+)?)$/.exec(words[index]);
    if (match && index + 1 < words.length) {
      const unit = words[index + 1];
      if (unit === 'G' || unit === 'KG' || unit === 'ML' || unit === 'L') return `${match[1]}${unit.toLowerCase()}`;
    }
  }
  return '';
}

function fit(value: string): string {
  return value.length <= WHATSAPP_ABBREVIATION_LIMIT
    ? value
    : value.slice(0, WHATSAPP_ABBREVIATION_LIMIT - 1).trimEnd() + '…';
}

function titleCaseProduct(value: string): string {
  return value
    .split(' ')
    .map((word) =>
      /^\d/.test(word) ? word.replace(/(\d)(KG|ML|CM|L)$/i, (_, size, unit) => `${size}${unit.toLowerCase()}`) : word,
    )
    .join(' ');
}

function isTruncation(shorter: string, longer: string): boolean {
  if (!longer.startsWith(shorter)) return false;
  const next = longer.charAt(shorter.length);
  return next !== '' && next !== ' ';
}

function lookupName(map: Map<string, string>, key: string): string | null {
  const exact = map.get(key);
  if (exact) return exact;
  const matches: [string, string][] = [];
  for (const entry of map) {
    if (isTruncation(key, entry[0]) || isTruncation(entry[0], key)) matches.push(entry);
  }
  return matches.length === 1 ? matches[0][1] : null;
}

function fallbackProductName(name: string, code: string | null): string {
  const words = lookupKey(name).split(' ').filter(Boolean);
  const size = sizeToken(words);
  const meaningful = words.filter(
    (word) =>
      !NOISE_WORDS.has(word) &&
      !/^\d+(?:[.,]\d+)?$/.test(word) &&
      !['G', 'KG', 'ML', 'L', 'CM'].includes(word),
  );

  if (meaningful.length === 0) return fit(code ? `#${code}` : (words.join(' ') || name.trim()));

  let kept = meaningful;
  let dropped = 0;
  while (kept.length > 0) {
    const joined = [kept.join(' '), size].filter(Boolean).join(' ');
    const candidate = code && dropped > 0 ? `${joined} #${code}` : joined;
    if (candidate.length <= WHATSAPP_ABBREVIATION_LIMIT) return titleCaseProduct(candidate);
    kept = kept.slice(0, -1);
    dropped += 1;
  }

  const head = meaningful[0].slice(
    0,
    code ? WHATSAPP_ABBREVIATION_LIMIT - code.length - 2 : WHATSAPP_ABBREVIATION_LIMIT,
  );
  return fit(code ? `${head} #${code}` : head);
}

/**
 * El nombre que va en el mensaje.
 *
 * El nombre que la planta escribió en esa línea manda sobre la abreviatura del catálogo por código -- así el kilo y
 * los dos kilos no se confunden --, el código es el respaldo, y lo que no está en ninguna tabla pasa por la regla
 * determinística.
 */
export function abbreviateProduct(name: string, code?: string | number | null): string {
  const stripped = codeKey(code);
  const key = lookupKey(name);
  const known = lookupName(CATALOGUE_BY_NAME, key) ?? lookupName(ERP_BY_NAME, key);
  if (known) return known;
  if (stripped) {
    const byCode = CATALOGUE_BY_CODE.get(stripped);
    if (byCode) return byCode;
  }
  const clean = repairErpText(name).replace(/\s+/g, ' ').trim();
  if (clean.length <= WHATSAPP_ABBREVIATION_LIMIT) return clean;
  return fallbackProductName(name, stripped);
}

/** El nombre de una tarea: la tabla moderada, y si es nueva, se recorta por palabra sin inventar nada. */
export function abbreviateTask(name: string): string {
  const key = lookupKey(name);
  const known = TASK_BY_NAME.get(key);
  if (known) return known;
  const clean = repairErpText(name).replace(/\s+/g, ' ').trim();
  if (clean.length <= WHATSAPP_ABBREVIATION_LIMIT) return clean;
  const words = clean.split(' ');
  let kept = '';
  for (const word of words) {
    const candidate = kept ? `${kept} ${word}` : word;
    if (candidate.length > WHATSAPP_ABBREVIATION_LIMIT) break;
    kept = candidate;
  }
  return kept || fit(clean);
}
