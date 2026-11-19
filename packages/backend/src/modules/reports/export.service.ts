import type Database from 'better-sqlite3';
import { parseSelectedProducts } from './reports.schema.js';
import { massasReportDayView } from '../massas/massas-report.service.js';
import { salidaReportDayView } from './salida-report.service.js';
import { ERP_RECEIPT_CATEGORY_ID, dayReceipts, usesErpReceipts, type ReceiptLine } from './receipts.service.js';
import { abbreviateProduct, abbreviateTask } from './whatsapp-abbreviations.js';

/**
 * Generador Inteligente — WhatsApp text export engine.
 *
 * Generates a structured, emoji-enhanced report message in Brazilian Portuguese (pt-BR)
 * using `name_pt` fields from the database. The output is designed for direct
 * copy-paste into WhatsApp.
 */

/**
 * Removes the leading "MASSA" (or "MASSAS", optionally followed by "DE") prefix
 * from a massas product name, so the message reads "CASEIRA" instead of
 * "MASSA CASEIRA". Keeps the same rule the web and Android massas modules use.
 */
export function stripMassasPrefix(name: string): string {
  return name
    .trim()
    .replace(/^MASSAS?\s+(?:DE\s+)?/i, '')
    .trim();
}

/**
 * El recebimento, agrupado por el operario que lo cargó.
 *
 * Antes cada línea repetía el nombre entre paréntesis y el mensaje se leía como una lista plana donde el ojo tenía
 * que buscar de quién era cada insumo. La propuesta aprobada pide la misma forma que las salidas: el operario
 * arriba, sus productos abajo. El orden es el de llegada, así el mensaje sigue el día y no un criterio inventado.
 */
function groupReceiptsByOperator(receipts: ReceiptLine[]): { operator: string; lines: ReceiptLine[] }[] {
  const groups = new Map<string, { operator: string; lines: ReceiptLine[] }>();
  for (const receipt of receipts) {
    const name = receipt.operatorName?.trim() ? receipt.operatorName.trim() : '—';
    const key = name.toUpperCase();
    const group = groups.get(key) ?? { operator: name, lines: [] };
    group.lines.push(receipt);
    groups.set(key, group);
  }
  return [...groups.values()];
}

interface ExportRow {
  id: number;
  turno: string;
  report_date: string;
  notes: string | null;
  created_at: string;
  display_name: string;
}

interface ExportItemRow {
  task_name: string;
  task_type: string;
  category_name: string;
  checked: number;
}

interface ExportTemperatureRow {
  location: string;
  reading_index: number;
  value: number;
}

function formatTemperature(location: string, values: number[]): string {
  const readings = values.map((value) => `*${value}°C*`).join(' / ');
  return `🌡️ ${location}: ${readings}`;
}

function groupTemperatures(temperatures: ExportTemperatureRow[]): Map<string, ExportTemperatureRow[]> {
  const grouped = new Map<string, ExportTemperatureRow[]>();
  for (const temperature of temperatures) {
    grouped.set(temperature.location, [...(grouped.get(temperature.location) ?? []), temperature]);
  }
  return grouped;
}

const HEADER_TARDE = '🌅 *RELATÓRIO — TURNO DA TARDE*';
const HEADER_NOITE = '🌙 *RELATÓRIO — TURNO DA NOITE*';

export function generateWhatsAppText(
  db: Database.Database,
  reportId: number,
  publicBaseUrl = '',
): string | null {
  const missingReference = db.prepare(
    `SELECT ri.id, ri.task_id
     FROM report_items ri
     LEFT JOIN report_tasks rt ON rt.id = ri.task_id
     LEFT JOIN report_categories rc ON rc.id = rt.category_id
     WHERE ri.report_id = ? AND (rt.id IS NULL OR rc.id IS NULL)
     LIMIT 1`
  ).get(reportId) as { id: number; task_id: number } | undefined;
  if (missingReference) {
    throw new Error(`Missing required report reference: item ${missingReference.id}, task ${missingReference.task_id}`);
  }

  const report = db
    .prepare(
      `SELECT r.id, r.turno, r.report_date, r.notes, r.created_at, u.display_name
       FROM reports r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = ?`
    )
    .get(reportId) as ExportRow | undefined;

  if (!report) return null;
  if (!report.display_name) throw new Error(`Missing required report reference: user for report ${reportId}`);

  const lines: string[] = [];

  // --- Header ---
  const header = report.turno === 'tarde' ? HEADER_TARDE : HEADER_NOITE;
  lines.push(header);
  lines.push('');

  // --- Metadata ---
  const [year, month, day] = report.report_date.split('-');
  lines.push(`📅 *Data:* ${day}/${month}/${year}`);
  lines.push(`👤 *Responsável:* ${report.display_name}`);
  lines.push('');

  // --- Categories & Tasks ---
  const categories = db
    .prepare(
      `SELECT DISTINCT rc.id, rc.name_pt, rc.sort_order
       FROM report_categories rc
       JOIN report_tasks rt ON rc.id = rt.category_id
       JOIN report_items ri ON rt.id = ri.task_id AND ri.report_id = ?
       ORDER BY rc.sort_order`
    )
    .all(reportId) as { id: number; name_pt: string; sort_order: number }[];

  // Also include categories from temperatures
  const tempCategories = db
    .prepare(
      `SELECT DISTINCT rc.id, rc.name_pt, rc.sort_order
       FROM report_categories rc
       JOIN report_tasks rt ON rc.id = rt.category_id
       JOIN report_temperatures rtemp ON rtemp.location = rt.name_pt AND rtemp.report_id = ?
       WHERE rc.category_type = 'temperature'
       ORDER BY rc.sort_order`
    )
    .all(reportId) as { id: number; name_pt: string; sort_order: number }[];

  // Merge all relevant category IDs
  const relevantIds = new Set<number>();
  for (const c of categories) relevantIds.add(c.id);
  for (const c of tempCategories) relevantIds.add(c.id);

  // Fetch actual categories sorted
  const allCategories = db
    .prepare(
      `SELECT id, name_pt, sort_order
       FROM report_categories
       ORDER BY sort_order`
    )
    .all() as { id: number; name_pt: string; sort_order: number }[];

  // Recebimento no longer depends on a ticked task: its content is the day's ERP snapshot. It joins the
  // printed set when the day was mirrored, or when the report still carries rows for it -- which is how a
  // report made before this change asks for its own historical ticks instead of disappearing.
  const receiptDay = dayReceipts(db, report.report_date);
  const erpReceipts = usesErpReceipts(report.report_date);
  const hasLegacyTicks =
    db
      .prepare(
        `SELECT EXISTS(
           SELECT 1
           FROM report_items ri
           JOIN report_tasks rt ON rt.id = ri.task_id
           WHERE ri.report_id = ? AND rt.category_id = ? AND ri.checked = 1
         ) AS present`,
      )
      .get(reportId, ERP_RECEIPT_CATEGORY_ID) as { present: number };
  if (erpReceipts || hasLegacyTicks.present === 1) {
    relevantIds.add(ERP_RECEIPT_CATEGORY_ID);
  }

  const activeCategories = allCategories.filter((c) => relevantIds.has(c.id));

  const printedTempLocations = new Set<string>();

  for (const cat of activeCategories) {
    // Lo que esta categoría tiene para contar, sin escribir todavía: el encabezado sale sólo si hay algo
    // debajo. Antes se escribía siempre, y como el reporte guarda una fila por tarea -- marcada o no -- el
    // mensaje terminaba mostrando todas las categorías con sus tareas sin hacer, que es lo contrario de lo
    // que el operador quiere mandarle al grupo.
    const categoryLines: string[] = [];

    // --- Recebimento: the ERP is the answer while the day has a snapshot ---
    if (cat.id === ERP_RECEIPT_CATEGORY_ID && erpReceipts && receiptDay.syncedAt !== null) {
      if (receiptDay.receipts.length === 0) {
        categoryLines.push('_Nenhum insumo recebido no dia._');
      } else {
        // Same shape as the exits block: the operator is the heading, the products hang under it with the prefix
        // every list in this message uses. The name on the line is the plant's, abbreviated.
        groupReceiptsByOperator(receiptDay.receipts).forEach((group, index) => {
          // Un renglón en blanco entre operarios, no después del último: la categoría ya cierra con el suyo.
          if (index > 0) categoryLines.push('');
          categoryLines.push(`👤 ${group.operator}:`);
          for (const receipt of group.lines) {
            categoryLines.push(
              `- ${abbreviateProduct(receipt.productDesc, receipt.productCode)}: ${receipt.quantity} un`,
            );
          }
        });
      }
    }

    const skipChecks =
      cat.id === ERP_RECEIPT_CATEGORY_ID && (erpReceipts || receiptDay.syncedAt !== null);

    // --- Checks ---
    const items = skipChecks
      ? []
      : db
      .prepare(
        `SELECT rt.name_pt AS task_name, rc.category_type AS task_type,
                rc.name_pt AS category_name, ri.checked, ri.selected_products
         FROM report_items ri
         JOIN report_tasks rt ON ri.task_id = rt.id
         JOIN report_categories rc ON rt.category_id = rc.id
         WHERE rc.id = ? AND ri.report_id = ?
           AND rc.category_type IN ('check', 'check_assai', 'check_normal')
         ORDER BY rt.id ASC`
      )
      .all(cat.id, reportId) as (ExportItemRow & { task_type: string; selected_products?: string })[];

    for (const item of items) {
      // Sólo entra lo que el operador marcó o seleccionó: el mensaje dice lo que se hizo. Una tarea sin
      // marcar no es trabajo hecho, y listarla convierte el mensaje en el inventario de lo pendiente, que
      // es lo que hacía que el texto no coincidiera con el reporte.
      if (item.task_type === 'check_assai' || item.task_type === 'check_normal') {
        const selected = parseSelectedProducts(item.selected_products) ?? [];
        if (selected.length > 0) {
          categoryLines.push(`✅ ${abbreviateTask(item.task_name)}:`);
          for (const p of selected) {
            categoryLines.push(`- ${abbreviateProduct(p)}`);
          }
        }
      } else if (item.checked) {
        categoryLines.push(`✅ ${abbreviateTask(item.task_name)}`);
      }
    }

    // The section belongs to the report, but no snapshot answered it: say so instead of printing fifteen
    // unticked tasks, which read as "nothing arrived" when the truth is "nobody asked".
    if (cat.id === ERP_RECEIPT_CATEGORY_ID && erpReceipts && receiptDay.syncedAt === null) {
      categoryLines.push('_Pendente de sincronização ERP._');
    }

    // --- Temperatures ---
    const temps = db
      .prepare(
        `SELECT rt_temp.location, rt_temp.reading_index, rt_temp.value
         FROM report_temperatures rt_temp
         JOIN report_tasks rt ON rt_temp.location = rt.name_pt
         JOIN report_categories rc ON rt.category_id = rc.id
         WHERE rc.id = ? AND rt_temp.report_id = ?
           AND rc.category_type = 'temperature'
          ORDER BY rt.id ASC, rt_temp.reading_index ASC`
      )
      .all(cat.id, reportId) as ExportTemperatureRow[];

    for (const [location, readings] of groupTemperatures(temps)) {
      categoryLines.push(formatTemperature(location, readings.map((temp) => temp.value)));
      printedTempLocations.add(location);
    }

    // El cierre de la categoría: encabezado, contenido y la línea en blanco, sólo si hubo contenido.
    if (categoryLines.length > 0) {
      lines.push(`━━━━━━━━━━━━━━`);
      lines.push(`📋 *${cat.name_pt.toUpperCase()}*`);
      lines.push('');
      lines.push(...categoryLines);
      lines.push('');
    }
  }

  // Check for any temperatures in the database that were not printed
  const allTemps = db
    .prepare(
      `SELECT location, reading_index, value
       FROM report_temperatures
       WHERE report_id = ?`
    )
    .all(reportId) as ExportTemperatureRow[];

  const unprintedTemps = allTemps.filter((t) => !printedTempLocations.has(t.location));

  if (unprintedTemps.length > 0) {
    lines.push(`━━━━━━━━━━━━━━`);
    lines.push(`📋 *OUTROS*`);
    lines.push('');
    for (const [location, readings] of groupTemperatures(unprintedTemps)) {
      lines.push(formatTemperature(location, readings.map((temp) => temp.value)));
    }
    lines.push('');
  }

  // --- Massas Launches ---
  // The section is not a flag anymore: the plant's day belongs in the report, and hiding it behind a query
  // parameter only made the WhatsApp message disagree with the screen it came from.
  const massasView = massasReportDayView(db, report.report_date);
  if (massasView.operators.length > 0) {
    lines.push('━━━━━━━━━━━━━━');
    lines.push('🍝 *LANÇAMENTO DE MASSAS*');
    lines.push('');

    for (const operator of massasView.operators) {
      lines.push(`👤 ${operator.name}:`);
      for (const item of operator.products) {
        if (item.units > 0) {
          lines.push(`- ${abbreviateProduct(stripMassasPrefix(item.name), item.code)}: ${item.units} un`);
        }
      }
      lines.push('');
    }
    lines.push('');

    const activeProducts = massasView.products.filter((product) => product.totalUnits > 0);
    if (activeProducts.length > 0) {
      lines.push('Resumo Coletivo:');
      for (const product of activeProducts) {
        lines.push(`📦 ${abbreviateProduct(stripMassasPrefix(product.name), product.code)}: ${product.totalUnits} un`);
      }
      lines.push('');
    }
  }

  /**
   * El nombre de un producto de Salida con el bloque delante, como lo lee la planta.
   *
   * `EMB.` para embalagens y `BOB.` para bobinas; la materia prima va sin prefijo, porque su nombre ya dice lo que
   * es. La tabla aprobada ya trae nombres con su prefijo (`BOB. LASANHA`, `BOB. DISCO`), y repetirlo daría
   * `BOB. BOB. LASANHA`: si la abreviatura ya empieza por el suyo, se deja como está.
   */
  const salidaProductLabel = (product: { name: string; code: string; block: string }): string => {
    const name = abbreviateProduct(product.name, product.code);
    const prefix = product.block === 'embalagens' ? 'EMB.' : product.block === 'bobinas' ? 'BOB.' : null;
    if (!prefix) return name;
    return name.startsWith(prefix) ? name : `${prefix} ${name}`;
  };

  // --- Salidas / Baixa ---
  // Same idea as the massas block above: what left the plant belongs in the day's report, grouped by the operator
  // who recorded it, with product names and units only -- never a code, which is traceability and not a message.
  const salidaView = salidaReportDayView(db, report.report_date);
  if (salidaView.operators.length > 0) {
    lines.push('━━━━━━━━━━━━━━');
    lines.push('📤 *SAÍDAS / BAIXA*');
    lines.push('');

    for (const operator of salidaView.operators) {
      lines.push(`👤 ${operator.name}:`);
      for (const product of operator.products) {
        if (product.units > 0) {
          lines.push(`- ${salidaProductLabel(product)}: ${product.units} un`);
        }
      }
      lines.push('');
    }
    // Sin total de la sección: el grupo suma por operario, y un número suelto al final se leía como el total del
    // día sin decir de qué. Los totales de las otras secciones no se tocan.
    lines.push('');
  }

  // --- Notes ---
  const userNotes = report.notes ? report.notes.trim() : '';
  const warnings: string[] = [];
  for (const t of allTemps) {
    if (/c[âáa]mara|fr[ií]a/i.test(t.location)) {
      // Las bandas del operador: por encima de 15 hay riesgo de producto, de 10 a 15 alcanza con limpiar los
      // aires, y por debajo de 10 no hay nada que avisar. El 15 exacto ya es limpieza, porque la banda
      // crítica empieza en "más de 15".
      if (t.value > 15) {
        warnings.push(`A ${t.location} tem uma temperatura de ${t.value}°C, recomenda-se revisar os ares-condicionados, os produtos podem estragar.`);
      } else if (t.value >= 10) {
        warnings.push(`A ${t.location} tem uma temperatura de ${t.value}°C, recomenda-se limpar os ares-condicionados.`);
      }
    }
  }

  if (userNotes || warnings.length > 0) {
    lines.push(`📝 *Observações:*`);
    if (userNotes) {
      lines.push(userNotes);
    }
    if (warnings.length > 0) {
      if (userNotes) {
        lines.push('');
      }
      warnings.forEach((w) => lines.push(w));
    }
    lines.push('');
  }


  // --- Photo links ---
  const photos = db
    .prepare(
      `SELECT public_token
       FROM report_photos
       WHERE report_id = ?
       ORDER BY created_at ASC`
    )
    .all(reportId) as { public_token: string }[];

  if (photos.length > 0) {
    const base = publicBaseUrl.replace(/\/$/, '');
    lines.push(`📸 *FOTOS:*`);
    photos.forEach((photo, index) => {
      const path = `/p/${photo.public_token}`;
      lines.push(`${index + 1}. ${base ? `${base}${path}` : path}`);
    });
    lines.push('');
  }

  // --- Footer ---
  lines.push('━━━━━━━━━━━━━━');
  lines.push(`📌 _Trindade Massas — ${day}/${month}/${year}_`);

  return lines.join('\n');
}
