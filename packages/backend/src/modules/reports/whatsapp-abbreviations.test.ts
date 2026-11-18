import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WHATSAPP_ABBREVIATION_LIMIT,
  abbreviateProduct,
  abbreviateTask,
} from './whatsapp-abbreviations.js';

/**
 * Las tablas aprobadas (`odd/tasks/whatsapp-abbreviations.md`), fila por fila.
 *
 * Si una fila deja de cumplirse, el mensaje de la planta cambia sin que nadie lo haya pedido: esto es el contrato
 * del texto, no un detalle de implementación.
 */
describe('abreviaturas del mensaje', () => {
  it('nombra el catálogo por código, que es la identidad más estable', () => {
    const catalogue: [string, string][] = [
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
    ];

    for (const [code, expected] of catalogue) {
      assert.equal(abbreviateProduct('ignorado porque el código manda', code), expected, `código ${code}`);
    }

    // El código llega con los ceros del ERP y la tabla no los guarda.
    assert.equal(abbreviateProduct('EMBALAG. DISCO 400g', '001356'), 'DISCO 400g');
    assert.equal(abbreviateProduct('GORDURA VEGETAL', 1673), 'GORDURA');
  });

  it('traduce los nombres del ERP, incluidos los que el puente trajo con el charset errado', () => {
    const erp: [string, string][] = [
      ['MASSA P PIZZA TRINDADE UNIT FAMILIA 200 G', 'FAMÍLIA 200g'],
      ['320 G PĂO DE ALHO TRINDADE TRADICIONAL', 'PÃO ALHO 320g'],
      ['MASSA PARA PASTEL TRINDADE CASEIRA 1 KG', 'CASEIRA 1kg'],
      ['PĂO DE ALHO TRINDADE 400G TRADICIONAL', 'PÃO ALHO 400g'],
      ['320 G PĂO DE ALHO TRINDADE CALABRESA', 'PÃO ALHO 320g CAL'],
      ['BATATA PALHA EXTRA FINA TRINDADE 220g', 'BATATA 220g'],
      ['MASSA P PIZZA TRINDADE BROTINHO 55 G', 'BROT 55g'],
      ['PĂO DE ALHO TRINDADE 400G CALABRESA', 'PÃO ALHO 400g CAL'],
      ['320 G PĂO DE ALHO TRINDADE PICANTE', 'PÃO ALHO 320g PIC'],
      ['CANUDO PARA RECHEAR TRINDADE 200 G', 'CANUDO 200g'],
      ['TOKO - MASSA PARA PASTEL ROLO 1 KG', 'TOKO 1kg'],
      ['MASSA P PIZZA TRINDADE UNIT. 160G', 'UNIT 160g'],
      ['PĂO DE ALHO TRINDADE 400G PICANTE', 'PÃO ALHO 400g PIC'],
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
    ];

    for (const [name, expected] of erp) {
      assert.equal(abbreviateProduct(name), expected, name);
    }
  });

  it('reconoce el nombre cortado a 32 caracteres como el mismo producto', () => {
    // El ERP guarda la descripción truncada: el mismo insumo llega completo o cortado a mitad de palabra.
    const truncated: [string, string][] = [
      ['320 G PĂO DE ALHO TRINDADE  TR', 'PÃO ALHO 320g'],
      ['320 G PĂO DE ALHO TRINDADE  CA', 'PÃO ALHO 320g CAL'],
      ['320 G PĂO DE ALHO TRINDADE PIC', 'PÃO ALHO 320g PIC'],
      ['PĂO DE ALHO TRINDADE 400G  TRA', 'PÃO ALHO 400g'],
      ['PĂO DE ALHO TRINDADE 400G  CAL', 'PÃO ALHO 400g CAL'],
      ['PĂO DE ALHO TRINDADE 400G PICA', 'PÃO ALHO 400g PIC'],
    ];

    for (const [name, expected] of truncated) {
      assert.equal(abbreviateProduct(name), expected, name);
    }

    // Un nombre más corto no es una truncación, aunque empiece igual que una entrada de la tabla.
    assert.equal(abbreviateProduct('QUEIJO RALADO'), 'QUEIJO RALADO');
  });

  it('abrevia las tareas largas y conserva Org. / Receb.', () => {
    const tasks: [string, string][] = [
      ['Organização da Câmara F. Principal', 'Câmara Principal'],
      ['Carregamento dos caminhões da casa', 'Carreg. caminhões'],
      ['Organização da saída dos produtos', 'Org. saída produtos'],
      ['Organização caixas usadas x itens', 'Org. caixas usadas'],
      ['Organização das caixas plásticas', 'Org. caixas plást.'],
      ['Liberação de espaço contêineres', 'Lib. contêineres'],
      ['Guardar massa nas câmaras frias', 'Guardar massa câm.'],
      ['Organização do contêiner Pizzas', 'Contêiner Pizzas'],
      ['Organização da área da farinha', 'Org. área farinha'],
      ['Recebimento de cajas de carton', 'Receb. caixas cartón'],
      ['Retirar massa dos contêineres', 'Retirar massa cont.'],
      ['Montagem de caixas Produção', 'Montagem caixas'],
      ['Organização da área do lixo', 'Org. área lixo'],
      ['Organização do pão de alho', 'Org. pão de alho'],
      ['Organização dos brinquedos', 'Org. brinquedos'],
      ['Abastecimento da produção', 'Abastec. produção'],
      ['Abastecimento de temperos', 'Abastec. temperos'],
      ['Recebimento de salgadinho', 'Receb. salgadinho'],
      ['Recebimento de propionato', 'Receb. propionato'],
      ['Recebimento de embalagem', 'Receb. embalagem'],
      ['Recebimento de brinquedo', 'Receb. brinquedo'],
      ['Recebimento de Pão alho', 'Receb. pão alho'],
      ['Separação dos romaneios', 'Sep. romaneios'],
      ['Colocação de plaquinhas', 'Coloc. plaquinhas'],
      ['Organização dos canudos', 'Org. canudos'],
      ['Organização das batatas', 'Org. batatas'],
      ['Organização do barracão', 'Org. barracão'],
      ['Organização das pizzas', 'Org. pizzas'],
      ['Recebimento de farinha', 'Receb. farinha'],
      ['Recebimento de sorbato', 'Receb. sorbato'],
    ];

    for (const [name, expected] of tasks) {
      assert.equal(abbreviateTask(name), expected, name);
    }
  });

  it('no pasa de veinte caracteres y no toca la cantidad ni el peso', () => {
    const product = abbreviateProduct('MASSA ESPECIAL ARTESANAL PREMIUM 500 G');
    const task = abbreviateTask('Tarefa nova muito comprida mesmo com palavras');

    assert.ok(product.length <= WHATSAPP_ABBREVIATION_LIMIT, `producto: ${product} (${product.length})`);
    assert.ok(task.length <= WHATSAPP_ABBREVIATION_LIMIT, `tarea: ${task} (${task.length})`);
    // El peso sobrevive a la abreviación: es lo que distingue un disco de 400 de uno de 500.
    assert.ok(product.includes('500g') || product.includes('#'), `conserva el peso: ${product}`);
  });

  it('es determinístico con lo que todavía no está en ninguna tabla', () => {
    const name = 'MASSA ESPECIAL ARTESANAL PREMIUM 500 G';
    const first = abbreviateProduct(name);
    const second = abbreviateProduct(name);

    assert.equal(first, second, 'misma entrada, misma salida');
    // Una segunda llamada no depende del orden de las demás: el mapa es estático.
    assert.equal(abbreviateProduct('FARINHA DE TRIGO DIVERSAS'), 'FARINHA');
    assert.equal(abbreviateProduct(name), first);
  });

  it('agrega el código cuando el recorte deja el nombre corto', () => {
    // Sin espacio para una sola palabra, el mensaje diría lo mismo de dos productos distintos.
    const long = 'SUPLEMENTO PROTEICO TRINDADE 2 KG';
    const abbreviated = abbreviateProduct(long, '9999');
    assert.ok(abbreviated.includes('9999'), `el código desambigua: ${abbreviated}`);

    // Soltar palabras también es recortar: lo que queda no distingue el producto sin el código.
    assert.equal(abbreviateProduct('MASSA ESPECIAL ARTESANAL PREMIUM 500 G', '9999'), 'ESPECIAL 500g #9999');
    // Sin código no hay con qué desambiguar: queda el nombre que entró en el ancho disponible.
    assert.equal(abbreviateProduct('MASSA ESPECIAL ARTESANAL PREMIUM 500 G'), 'ESPECIAL 500g');
  });

  it('corrige el charset localmente, sin tocar el nombre cuando ya está bien', () => {
    assert.equal(abbreviateProduct('PĂO DE ALHO TRINDADE 400G TRADICIONAL'), 'PÃO ALHO 400g');
    assert.equal(abbreviateProduct('AĂ\u0087UCAR 5 KG'), 'AÇUCAR 5 KG');
    // Texto sano intacto, con sus acentos.
    assert.equal(abbreviateProduct('AÇÚCAR 5kg', '1074'), 'AÇÚCAR 5kg');
    assert.equal(abbreviateProduct('PÃO DE ALHO TRINDADE 400G TRADICIONAL'), 'PÃO ALHO 400g');
  });
});
