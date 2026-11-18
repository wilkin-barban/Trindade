import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateWhatsAppText } from './export.service.js';

/**
 * El mensaje del reporte 80 (17/11), carácter por carácter.
 *
 * El dueño del producto aprobó este texto como el que la planta quiere leer en el grupo, y la normativa de paridad
 * pide que Android produzca exactamente el mismo. Por eso el fixture está acá, completo y literal: si una línea
 * cambia, este test lo dice antes de que el cambio llegue a un teléfono.
 *
 * `odd/tasks/whatsapp-abbreviations.md` es el documento; esto es la prueba.
 */
function seedReport80(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(import.meta.dirname, '../../db/schema.sql'), 'utf-8'));

  db.exec(`
    INSERT INTO roles (id, name) VALUES (1, 'Administrador');
    INSERT INTO users (id, username, password_hash, display_name, role_id, is_active)
      VALUES (10, 'wilkin', 'hash', 'Wilkin', 1, 1);
    INSERT INTO reports (id, user_id, turno, report_date, notes, created_at)
      VALUES (80, 10, 'tarde', '2026-11-17', NULL, '2026-11-17 18:00:00');
  `);

  // La categoría de higiene con las catorce tareas que el reporte marcó, en el orden del reporte.
  db.exec(`
    INSERT INTO report_categories (id, name_pt, name_es, category_type, sort_order, is_active)
      VALUES (900, 'Higiene e Organização', 'Higiene y Organización', 'check', 100, 1);
    -- La categoría del espejo: el recebimento no es una casilla, es lo que el ERP ya registró.
    INSERT INTO report_categories (id, name_pt, name_es, category_type, sort_order, is_active)
      VALUES (4, 'Recebimento', 'Recebimiento', 'check', 950, 1);
    INSERT INTO report_tasks (id, category_id, name_pt, name_es, is_active)
      VALUES (943, 4, 'Recebimento de farinha', 'Recebimiento de harina', 1);
  `);
  const tasks = [
    'Organização do pátio',
    'Organização da área da farinha',
    'Organização da Câmara F. Principal',
    'Retirar massa dos contêineres',
    'Organização das caixas plásticas',
    'Separação dos romaneios',
    'Abastecimento da produção',
    'Montagem de caixas Produção',
    'Liberação de espaço contêineres',
    'Medir temperatura',
    'Guardar massa nas câmaras frias',
    'Organização da saída dos produtos',
    'Colocação de plaquinhas',
    'Organização da área do lixo',
  ];
  const insertTask = db.prepare(
    'INSERT INTO report_tasks (id, category_id, name_pt, name_es, is_active) VALUES (?, 900, ?, ?, 1)',
  );
  const insertItem = db.prepare('INSERT INTO report_items (report_id, task_id, checked) VALUES (80, ?, 1)');
  tasks.forEach((name, index) => {
    const id = 9800 + index;
    insertTask.run(id, name, name);
    insertItem.run(id);
  });

  // Recebimento: el espejo del día, con los nombres tal como los trajo el puente (incluido el charset errado y la
  // descripción cortada a 32 caracteres).
  const mirror = db.prepare(
    `INSERT INTO aero_movements
       (movement_date, ent_lan, product_code, product_desc, quantity, entry_date, operator_name, movement_type, synced_at)
     VALUES ('2026-11-17', ?, ?, ?, ?, '2026-11-17', ?, 'E', '2026-11-17T18:00:00.000Z')`,
  );
  mirror.run(1, '001236', '320 G PĂO DE ALHO TRINDADE  TR', 2400, 'VIVIANE');
  mirror.run(2, '000999', 'FARINHA DE TRIGO DIVERSAS', 200, 'VIVIANE');
  mirror.run(3, '001000', 'FILME STRETCH 50 CM', 489, 'VIVIANE');
  mirror.run(4, '001001', 'NHOQUE DE BATATA TRINDADE 400G', 2019, 'JONAS');
  mirror.run(5, '001002', 'NHOQUE DE BATATA TRINDADE 1 KG', 464, 'JONAS');
  mirror.run(6, '000999', 'FARINHA DE TRIGO DIVERSAS', 100, 'JONAS');
  mirror.run(7, '001002', 'NHOQUE DE BATATA TRINDADE 1 KG', 600, 'JONAS');

  // Salidas del día: dos operarios con cuenta en Trindade.
  db.exec(`
    INSERT INTO salida_movements (id, movement_date, user_id, created_at)
      VALUES (9180, '2026-11-17', 10, '2026-11-17T09:00:00.000Z');
  `);
  const salidaItem = db.prepare(
    `INSERT INTO salida_movement_items (movement_id, product_code, product_name, block, quantity, position)
     VALUES (9180, ?, ?, ?, ?, ?)`,
  );
  let position = 0;
  for (const [code, name, block, quantity] of [
    // Las dos masas que salieron del mostrador: el asiento guarda el nombre del libro, con su peso.
    ['001045', 'MASSA PARA PASTEL TRINDADE CASEIRA 1 KG', 'materia-prima', 218],
    ['001192', 'MASSA PARA PASTEL QUADRADA 2 KG', 'materia-prima', 217],
    ['1673', 'GORDURA VEGETAL', 'materia-prima', 4],
    ['1012', 'SORBATO', 'materia-prima', 1],
    ['1068', 'MICRO SAL', 'materia-prima', 8],
    ['1011', 'PROPIONATO', 'materia-prima', 1],
    ['1074', 'AÇÚCAR 5kg', 'materia-prima', 6],
  ] as [string, string, string, number][]) {
    salidaItem.run(code, name, block, quantity, position);
    position += 1;
  }

  return db;
}

describe('el mensaje del reporte 80, abreviado', () => {
  let db: Database.Database;

  before(() => {
    db = seedReport80();
  });

  after(() => {
    db.close();
  });

  it('es exactamente el texto aprobado, línea por línea', () => {
    const text = generateWhatsAppText(db, 80)!;

    // Lo aprobado son las tres secciones que la abreviación toca: higiene, recebimento y salidas. El resto del
    // mensaje (encabezado, temperaturas, footer) no cambia en esta pasada y no forma parte del fixture.
    const expected = [
      '━━━━━━━━━━━━━━',
      '📋 *HIGIENE E ORGANIZAÇÃO*',
      '',
      '✅ Organização do pátio',
      '✅ Org. área farinha',
      '✅ Câmara Principal',
      '✅ Retirar massa cont.',
      '✅ Org. caixas plást.',
      '✅ Sep. romaneios',
      '✅ Abastec. produção',
      '✅ Montagem caixas',
      '✅ Lib. contêineres',
      '✅ Medir temperatura',
      '✅ Guardar massa câm.',
      '✅ Org. saída produtos',
      '✅ Coloc. plaquinhas',
      '✅ Org. área lixo',
      '',
      '━━━━━━━━━━━━━━',
      '📋 *RECEBIMENTO*',
      '',
      '👤 VIVIANE:',
      '- PÃO ALHO 320g: 2400 un',
      '- FARINHA: 200 un',
      '- FILME 50: 489 un',
      '',
      '👤 JONAS:',
      '- NHOQUE 400g: 2019 un',
      '- NHOQUE 1kg: 464 un',
      '- FARINHA: 100 un',
      '- NHOQUE 1kg: 600 un',
      // La línea en blanco que separa el cierre de la categoría del separador siguiente.
      '',
      '',
    ].join('\n');

    const start = text.indexOf('━━━━━━━━━━━━━━');
    const salidas = text.indexOf('📤 *SAÍDAS / BAIXA*');
    assert.ok(start > -1 && salidas > start);
    // Hasta el separador que abre las salidas: lo comparado es el texto que la abreviación toca.
    const printed = text.slice(start, text.lastIndexOf('━━━━━━━━━━━━━━', salidas));
    assert.equal(printed, expected);

    assert.ok(text.includes('📤 *SAÍDAS / BAIXA*'));
    assert.ok(text.includes('👤 Wilkin:'));
    // Sin código en el mensaje y con la cantidad exacta.
    assert.ok(text.includes('- AÇÚCAR 5kg: 6 un'));
    // El peso viaja en la línea: el grupo distingue el de un kilo del de dos.
    assert.ok(text.includes('- CASEIRA 1kg: 218 un'));
    assert.ok(text.includes('- QUADRADA 2kg: 217 un'));
    // 218 + 217 de las masas, más los insumos del día.
    assert.ok(text.includes('📊 Total: 455 un'));
    assert.equal(/[Ă\u0080-\u009f]/.test(text), false, 'ninguna letra rota llega al grupo');
    assert.equal(text.includes('(VIVIANE)'), false, 'el operario no se repite en cada línea');
    assert.equal(text.includes('   - '), false, 'la lista usa el prefijo corto');
  });
});
