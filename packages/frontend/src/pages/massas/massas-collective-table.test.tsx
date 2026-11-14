import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import { massasUnifiedRows } from '../../lib/massas-unified';
import type { AeroErpMovementItem } from '../../lib/aero-integration';
import type { MassaIndividualLaunch, MassaProductTotal } from '../../lib/massas';
import { MassasCollectiveTable } from './MassasCollectiveTable';
import { MassasLaunchGrid } from './MassasLaunchGrid';

/**
 * The two lower sections of the massas screen, as the operator reads them.
 *
 * The ERP's seats used to live only in the unified card: the individual and collective sections read the local
 * table, so a worker who only typed on the company tablet had no boxes and no name in either of them. Now both
 * sections read the unified day, which also means the partial seat the plant cannot import has to stay visible
 * and untouchable.
 */

const DATE = '2026-11-04';

const CATALOG: MassaProductTotal[] = [
  { code: '1192', name: 'MASSA QUADRADA', unitsPerBox: 15, totalBoxes: 0, totalUnits: 0, openBoxUnits: 0 },
  { code: '1045', name: 'MASSA CASEIRA', unitsPerBox: 10, totalBoxes: 0, totalUnits: 0, openBoxUnits: 0 },
];

const ALICE_LAUNCH: MassaIndividualLaunch = {
  id: 111,
  launch_date: DATE,
  product_code: '1045',
  product_name: 'MASSA CASEIRA',
  boxes: 4,
  units: 40,
  user_id: 3,
  username: 'alice',
  display_name: 'Alice',
  ent_lan: null,
  created_at: `${DATE} 08:30:00`,
  updated_at: `${DATE} 08:30:00`,
};

function seat(
  args: Pick<AeroErpMovementItem, 'entLan' | 'productCode' | 'quantity' | 'operatorName'> &
    Partial<Pick<AeroErpMovementItem, 'ownerUserId' | 'ownerStatus'>>,
): AeroErpMovementItem {
  return {
    productDesc: 'MASSA',
    entryDate: DATE,
    movementType: 'E',
    ownerUserId: null,
    ...args,
  };
}

function renderTable(options: { seats?: AeroErpMovementItem[]; launches?: MassaIndividualLaunch[] } = {}) {
  const launches = options.launches ?? [ALICE_LAUNCH];
  const movements =
    options.seats ??
    [
      // The seat of the day: 182 units of a 15-unit box, typed on the company tablet by a worker with no
      // Trindade account. It does not close whole boxes, so it is neither editable nor importable here.
      seat({ entLan: 35983, productCode: '001192', quantity: 182, operatorName: 'VINICIUS R' }),
      seat({ entLan: 35984, productCode: '1045', quantity: 30, operatorName: 'ALICE' }),
    ];
  const unifiedRows = massasUnifiedRows({ launches, movements, products: CATALOG });

  const onImport = vi.fn();
  const onStartEdit = vi.fn();
  const onDelete = vi.fn();

  const view = render(
    <MassasCollectiveTable
      products={CATALOG}
      launches={launches}
      currentUserId={1}
      isAdmin
      unifiedRows={unifiedRows}
      unifiedDate={DATE}
      onImport={onImport}
      onStartEdit={onStartEdit}
      onDelete={onDelete}
    />,
  );

  return { ...view, unifiedRows, onImport, onStartEdit, onDelete };
}

describe('MassasLaunchGrid — one row per product', () => {
  /**
   * The launch grid of a phone: name on the left with the units-per-box as a subline, the field and the computed
   * units on the right. The name above the field was a stack, and ten products stacked are twenty lines to scroll
   * with a thumb before the operator reaches `Lançar`.
   */
  function renderGrid(options: { readOnly?: boolean } = {}) {
    render(
      <MassasLaunchGrid
        products={CATALOG}
        quantities={{ '1045': '4' }}
        onQuantityChange={vi.fn()}
        onLaunch={vi.fn()}
        submitting={false}
        readOnly={options.readOnly}
      />,
    );
    return screen.getByTestId('massas-product-1045');
  }

  it('keeps the name, its subline and the field in one row', () => {
    const row = renderGrid();

    expect(row.className).toContain('flex');
    expect(row.className).toContain('items-center');
    expect(row.className).not.toContain('flex-col');

    const name = within(row).getByText('MASSA CASEIRA');
    // The units per box are a 10px subline of the name, not a second column competing with the field.
    const perBox = within(row).getByText('10 un/cx');
    expect(perBox.className).toContain('text-[10px]');
    expect(name.parentElement).toBe(perBox.parentElement);

    const field = within(row).getByRole('spinbutton');
    // The field is the name's sibling column, never its child: no stacking.
    expect(name.parentElement?.contains(field)).toBe(false);
    expect(field.parentElement?.parentElement).toBe(row);
    expect(within(row).getByText('40 un')).toBeInTheDocument();
  });

  it('lays the products out one, two and three per row instead of five', () => {
    renderGrid();

    const grid = screen.getByTestId('massas-product-1045').parentElement!;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('xl:grid-cols-3');
  });

  it('puts the closed day\'s total where the field would be', () => {
    const row = renderGrid({ readOnly: true });

    expect(within(row).getByTestId('massas-closed-1045').textContent).toBe('0 cx');
    expect(within(row).queryByRole('spinbutton')).toBeNull();
    // Still one row, still the subline under the name.
    expect(within(row).getByText('10 un/cx').className).toContain('text-[10px]');
  });
});

describe('MassasCollectiveTable — the unified day in both sections', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('offers the ERP-only worker in the filter, with the boxes the day really occupies', () => {
    renderTable();

    const chips = screen.getByTestId('massas-worker-chips');
    expect(within(chips).getByText(/VINICIUS R/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('filter-operator-vinicius r'));

    // 182 units of a 15-unit box are 13 boxes, one of them open with two units.
    const individual = screen.getByTestId('massas-individual-launches');
    expect(within(individual).getAllByText(/13 cx/).length).toBeGreaterThan(0);
    expect(within(individual).getAllByText(/182 un/).length).toBeGreaterThan(0);
    expect(within(individual).getAllByText(/incluye 1 caja abierta/).length).toBeGreaterThan(0);

    const collective = screen.getByTestId('massas-collective-summary');
    expect(within(collective).getAllByText('MASSA QUADRADA').length).toBeGreaterThan(0);
    expect(within(collective).getAllByText('13 cx').length).toBeGreaterThan(0);
    expect(within(collective).getAllByText('182 un').length).toBeGreaterThan(0);
    expect(within(collective).getAllByText(/incluye 1 caja abierta/).length).toBeGreaterThan(0);

    const subtotal = screen.getByTestId('massas-worker-subtotal');
    expect(within(subtotal).getByText(/13 cx/)).toBeInTheDocument();
    expect(within(subtotal).getByText(/182 un/)).toBeInTheDocument();
  });

  it('never offers to import the partial seat, but keeps it readable', () => {
    renderTable();

    expect(screen.queryByTestId('massas-import-35983')).not.toBeInTheDocument();
    expect(screen.getAllByText(/No cierra cajas enteras|Não fecha caixas inteiras/).length).toBeGreaterThan(0);
  });

  it('still offers to import a seat that closes whole boxes', () => {
    // 30 units of a ten-unit box are three whole boxes; Alice owns the account the mirror resolved.
    renderTable({
      launches: [],
      seats: [
        seat({ entLan: 35990, productCode: '1045', quantity: 30, operatorName: 'ALICE', ownerUserId: 1 }),
      ],
    });

    expect(screen.getByTestId('massas-import-35990')).toBeInTheDocument();
  });

  it('keeps a local launch editable and readable in the individual section', () => {
    const { onStartEdit } = renderTable({ seats: [] });

    const editButton = screen.getAllByTitle(/Editar|Editar lançamento/i)[0];
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(onStartEdit).toHaveBeenCalledWith(ALICE_LAUNCH);
  });

  it('never offers to edit or delete a launch the ERP already has', () => {
    renderTable({
      launches: [ALICE_LAUNCH],
      seats: [seat({ entLan: 40002, productCode: '1045', quantity: 40, operatorName: 'ALICE' })],
    });

    // Delphi holds the seat: the row says so instead of letting the operator change what the company has.
    expect(screen.getByTestId('massas-settled-111')).toBeInTheDocument();
    expect(screen.queryByTitle(/Editar|Editar lançamento/i)).not.toBeInTheDocument();
  });

  it('does not double count a launch the ERP already has', () => {
    renderTable({
      launches: [ALICE_LAUNCH],
      seats: [seat({ entLan: 40001, productCode: '1045', quantity: 40, operatorName: 'ALICE' })],
    });

    const collective = screen.getByTestId('massas-collective-summary');
    // One reconciled row: four boxes, never eight.
    expect(within(collective).getAllByText('4 cx').length).toBeGreaterThan(0);
    expect(within(collective).queryAllByText('8 cx')).toHaveLength(0);
  });
});
