import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ASSAI_PRODUCTS,
  ASSAI_WEEKDAYS,
  ASSAI_WEEKDAY_OPTIONS,
  assaiHasError,
  assaiLines,
  assaiMessage,
  assaiTotalBoxes,
  boxesFor,
  assaiHasVisibleError,
  assaiVisibleErrors,
} from './assai';

const nhoque = 'Nhoque 1kg';
const discoQuatrocentos = 'Disco 400g';
const roloDois = 'Rolo 2kg';

describe('o catalogo do Assai', () => {
  // A Quadrada saiu do catalogo: a massa quadrada nao e um pedido que a loja aceite hoje, e a lista de
  // produtos da tela e a mesma que o operador le no papel. As outras oito ficam como estavam.
  it('traz os oito produtos com as unidades de cada caixa, sem a Quadrada', () => {
    assert.equal(ASSAI_PRODUCTS.length, 8);
    assert.deepEqual(
      ASSAI_PRODUCTS.map((product) => product.name),
      ['Nhoque 1kg', 'Disco 200g', 'Disco 400g', 'Disco 500g', 'Lasanha', 'Rolo 500g', 'Rolo 1kg', 'Rolo 2kg'],
    );
    assert.equal(ASSAI_PRODUCTS[0].name, nhoque);
    assert.equal(ASSAI_PRODUCTS[0].unitsPerBox, 15);
    assert.equal(ASSAI_PRODUCTS[7].name, roloDois);
    assert.equal(ASSAI_PRODUCTS[7].unitsPerBox, 10);
    assert.equal(
      ASSAI_PRODUCTS.some((product) => product.name === 'Quadrada'),
      false,
      'a Quadrada nao volta ao catalogo',
    );
  });
});

describe('boxesFor', () => {
  it('divide, y a tela decide o que fazer com o resto', () => {
    assert.equal(boxesFor(15, 15), 1);
    assert.equal(boxesFor(45, 15), 3);
    assert.equal(boxesFor(16, 15), 16 / 15);
  });
});

describe('assaiLines', () => {
  it('marca a quantidade exata como pedido e o resto como erro', () => {
    const linhas = assaiLines({ [nhoque]: '30', [discoQuatrocentos]: '15' });
    const primeira = linhas[0];
    const segunda = linhas.find((line) => line.product === discoQuatrocentos)!;

    assert.equal(primeira.boxes, 2);
    assert.equal(primeira.exact, true);
    // 15 unidades de uma caixa de 50 nao fecham caixa, entao nao sao um pedido.
    assert.equal(segunda.exact, false);
  });

  it('deixa o produto vazio fora do pedido em vez de chama-lo de erro', () => {
    const linhas = assaiLines({ [nhoque]: '' });

    assert.equal(linhas[0].filled, false);
    assert.equal(linhas[0].exact, true);
    assert.equal(assaiHasError(linhas), false);
  });

  it('trata zero como nada pedido e um texto como erro', () => {
    assert.equal(assaiHasError(assaiLines({ [nhoque]: '0' })), false);
    assert.equal(assaiHasError(assaiLines({ [nhoque]: 'abc' })), true);
  });

  it('soma as caixas do pedido inteiro', () => {
    const linhas = assaiLines({ [nhoque]: '30', [discoQuatrocentos]: '100', 'Disco 200g': '80' });
    assert.equal(assaiTotalBoxes(linhas), 5);
  });
});

describe('assaiMessage', () => {
  it('leva so o que foi pedido, com as suas caixas', () => {
    const mensagem = assaiMessage(assaiLines({ [nhoque]: '30', [roloDois]: '20' }));

    assert.ok(mensagem.includes('Nhoque 1kg: 2 caixas'));
    assert.ok(mensagem.includes('Rolo 2kg: 2 caixas'));
    assert.ok(!mensagem.includes(' und'), 'a quantidade por caixa nao viaja no pedido');
    assert.ok(mensagem.includes('Total: 4 caixas'));
    assert.equal(mensagem.includes('Lasanha'), false);
  });

  it('avisa que nao ha pedido em vez de mandar uma mensagem vazia', () => {
    assert.ok(assaiMessage(assaiLines({})).includes('Nenhum produto'));
  });

  it('nao nomeia a Quadrada nem no pedido nem no total', () => {
    // O pior caso: todas as linhas do catalogo preenchidas com uma caixa. Se a Quadrada ainda existisse,
    // ela viajaria aqui e o total seria nove.
    const umaCaixaDeCada = Object.fromEntries(
      ASSAI_PRODUCTS.map((product) => [product.name, String(product.unitsPerBox)]),
    );
    const linhas = assaiLines(umaCaixaDeCada);
    const mensagem = assaiMessage(linhas);

    assert.equal(mensagem.includes('Quadrada'), false);
    assert.equal(assaiTotalBoxes(linhas), 8);
    assert.ok(mensagem.includes('Total: 8 caixas'));
  });

  it('inclui o dia da semana no cabecalho quando informado', () => {
    const comDia = assaiMessage(assaiLines({ [nhoque]: '30' }), 'Sexta-feira');
    assert.ok(comDia.startsWith('🛒 Pedido Assaí Sexta-feira\n'));
    assert.ok(comDia.includes('Nhoque 1kg: 2 caixas'));

    const vazioComDia = assaiMessage(assaiLines({}), 'Quinta-feira');
    assert.equal(vazioComDia, '🛒 Pedido Assaí Quinta-feira\nNenhum produto com quantidade informada.');
  });

  it('mantem o cabecalho padrao quando o dia e omitido, nulo ou espaco em branco', () => {
    const semDia = assaiMessage(assaiLines({ [nhoque]: '30' }));
    assert.ok(semDia.startsWith('🛒 Pedido Assaí\n'));

    const comNulo = assaiMessage(assaiLines({ [nhoque]: '30' }), null);
    assert.ok(comNulo.startsWith('🛒 Pedido Assaí\n'));

    const comBranco = assaiMessage(assaiLines({ [nhoque]: '30' }), '   ');
    assert.ok(comBranco.startsWith('🛒 Pedido Assaí\n'));
  });
});

/**
 * The calculator screen, read as source: what the remediation fixed is layout, and the arithmetic above is the
 * only part of it with a pure seam. The assertions are the three defects the screenshot shows -- four columns
 * that do not fit a phone, a `Quadrada` line the store no longer takes, and a units-per-box column spent on a
 * number that reads better under the product's own name.
 */
const page = readFileSync(new URL('../pages/AssaiCalculatorPage.tsx', import.meta.url), 'utf8');

describe('a tela do pedido (AssaiCalculatorPage)', () => {
  it('lista o pedido em tres colunas -- produto, unidades e caixas -- sem tabela de quatro', () => {
    assert.doesNotMatch(page, /<table/, 'a tabela de quatro colunas saiu');
    assert.doesNotMatch(page, /overflow-x-auto/, 'sem rolagem lateral: a linha cabe a 390 px');
    assert.doesNotMatch(page, /min-w-\[320px\]/, 'a largura minima que forcava a rolagem saiu');

    // O cabecalho e cada linha compartilham a mesma rejilla de tres colunas, senao as caixas nao alinham.
    assert.match(page, /const ASSAI_ROW_GRID = 'grid grid-cols-\[minmax\(0,1fr\)[^']*';/);
    assert.match(page, /const ASSAI_ROW_GRID = '[^']*grid-cols-\[/);
    // E as tres colunas sao produto, unidades e caixas, nesta ordem.
    assert.match(
      page,
      /t\('assai\.product'\)[\s\S]{0,300}?t\('assai\.units'\)[\s\S]{0,300}?t\('assai\.boxes'\)/,
    );
  });

  it('poe as unidades por caixa como sublinea do nome, nao como coluna', () => {
    assert.match(page, /\{line\.unitsPerBox\} un\/cx/);
    assert.doesNotMatch(page, /t\('assai\.perBox'\)/, 'a coluna «Por caja» deixou de existir');
  });

  it('deixa o campo no tamanho de um dedo e as caixas a direita', () => {
    // 44 px de alto e 16 px de fonte: o campo que um dedo acerta e que impede o iPhone de dar zoom no foco.
    assert.match(page, /className="h-11 text-base[^"]*"[\s\S]{0,300}?data-testid=\{`assai-units-/);
    // As caixas fecham a coluna da direita, alinhadas uma embaixo da outra.
    const boxesAt = page.indexOf('data-testid={`assai-boxes-');
    assert.ok(boxesAt > 0, 'a celula das caixas existe');
    assert.match(page.slice(Math.max(0, boxesAt - 300), boxesAt + 300), /text-right/);
  });
});

describe('dias da semana do Assai', () => {
  it('oferece os quatro dias permitidos na ordem esperada', () => {
    assert.deepEqual(ASSAI_WEEKDAYS, [
      'Terça-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
    ]);
    assert.equal(ASSAI_WEEKDAY_OPTIONS.length, 4);
    assert.equal(ASSAI_WEEKDAY_OPTIONS[0].value, 'Terça-feira');
    assert.equal(ASSAI_WEEKDAY_OPTIONS[1].value, 'Quinta-feira');
    assert.equal(ASSAI_WEEKDAY_OPTIONS[2].value, 'Sexta-feira');
    assert.equal(ASSAI_WEEKDAY_OPTIONS[3].value, 'Sábado');
  });
});

describe('cuando se muestra el error de una linea', () => {
  // El cartel de un campo es una decision sobre el momento y no sobre el numero: la misma linea inexacta
  // se muestra o no segun donde este el operador. Por eso la regla vive en el modulo puro y la pantalla
  // solo pregunta, en vez de llevar su propia copia de la condicion.
  it('no muestra nada mientras el campo esta en foco, aunque la cantidad este mal', () => {
    const lines = assaiLines({ [nhoque]: '20' });
    assert.ok(assaiHasError(lines), 'el pedido sigue siendo inexacto');
    assert.deepStrictEqual(assaiVisibleErrors(lines, { blurred: { [nhoque]: true }, focused: nhoque }), []);
  });

  it('muestra el error de un campo que ya fue dejado', () => {
    const lines = assaiLines({ [nhoque]: '20' });
    assert.deepStrictEqual(assaiVisibleErrors(lines, { blurred: { [nhoque]: true }, focused: null }), [nhoque]);
  });

  it('no muestra el error de un campo que nunca fue dejado', () => {
    const lines = assaiLines({ [nhoque]: '20' });
    assert.deepStrictEqual(assaiVisibleErrors(lines, { blurred: {}, focused: null }), []);
  });

  it('volver a entrar a editar apaga el cartel viejo', () => {
    const lines = assaiLines({ [nhoque]: '20' });
    assert.deepStrictEqual(assaiVisibleErrors(lines, { blurred: { [nhoque]: true }, focused: nhoque }), []);
  });

  it('un campo vacio no es un error visible aunque se haya dejado', () => {
    assert.deepStrictEqual(assaiVisibleErrors(assaiLines({}), { blurred: { [nhoque]: true }, focused: null }), []);
  });

  it('el aviso de abajo sigue a los errores visibles y no al pedido inexacto', () => {
    const lines = assaiLines({ [nhoque]: '20' });
    assert.strictEqual(assaiHasVisibleError(lines, { blurred: { [nhoque]: true }, focused: nhoque }), false);
    assert.strictEqual(assaiHasVisibleError(lines, { blurred: { [nhoque]: true }, focused: null }), true);
    assert.strictEqual(assaiHasVisibleError(lines, { blurred: {}, focused: null }), false);
  });
});
