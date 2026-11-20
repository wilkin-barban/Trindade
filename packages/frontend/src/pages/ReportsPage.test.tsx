import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import type { CategoryType } from '../components/reports/CategorySection';

/**
 * The report the operator files: which sections it draws, and with which questions.
 *
 * Two things this file holds. Recebimento is answered by the ERP mirror from the cutoff on, so its own checklist
 * is not drawn -- but the categories an administrator hung below it are, because a child is its own category
 * with its own answers and replacing the parent's checklist is not replacing them. And the box types are drawn
 * as switches, one per type, with their blocks under them.
 */
const get = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {},
}));

// The day the report is about, fixed: the Recebimento section changes hands on a date, and a test that read the
// machine's clock would answer differently before and after it.
vi.mock('../lib/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/date')>()),
  saoPauloToday: () => '2026-11-02',
}));

const { ReportsPage } = await import('./ReportsPage');

function task(id: number, categoryId: number, namePt: string) {
  return {
    id,
    category_id: categoryId,
    name_pt: namePt,
    name_es: namePt,
    task_type: 'check' as const,
    sort_order: id,
    temperature_readings: 0,
  };
}

const CATEGORIES: CategoryType[] = [
  { id: 1, parent_category_id: null, name_pt: 'Higiene', name_es: 'Higiene', sort_order: 1, tasks: [task(1, 1, 'Pátio')] },
  { id: 4, parent_category_id: null, name_pt: 'Recebimento', name_es: 'Recepción', sort_order: 4, tasks: [task(43, 4, 'Recebimento de farinha')] },
  { id: 41, parent_category_id: 4, name_pt: 'Recebimento de congelados', name_es: 'Recepción de congelados', sort_order: 5, tasks: [task(410, 41, 'Conferência do congelado')] },
  { id: 3, parent_category_id: null, name_pt: 'Caixas', name_es: 'Cajas', sort_order: 3, tasks: [{ ...task(61, 3, 'Montagem Assai'), task_type: 'check_assai' as const }] },
  { id: 5, parent_category_id: null, name_pt: 'Caixas pequenas', name_es: 'Cajas pequeñas', sort_order: 6, tasks: [{ ...task(62, 5, 'Montagem Normal'), task_type: 'check_normal' as const }] },
  // The two box checklists the plant answers by hand: small boxes keep their Quadrada task, Assaí does not
  // ask it. The server answers both; the rule is this screen's, and it is pinned below.
  { id: 9, parent_category_id: null, name_pt: 'Caixas pequenas', name_es: 'Cajas pequeñas', sort_order: 7, tasks: [{ ...task(60, 9, 'Quadrada') }] },
  { id: 10, parent_category_id: null, name_pt: 'Caixas Assai', name_es: 'Cajas Assai', sort_order: 8, tasks: [{ ...task(66, 10, 'Quadrada') }, task(67, 10, 'Nhoque Kg')] },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  );
}

function photoFile(name: string) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });
}

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/reports/categories') return { categories: CATEGORIES };
    if (url === '/reports/turno') return { turno: 'tarde' };
    if (url === '/reports/products') return { assai: ['Nhoque Kg', 'Quadrada'], normal: ['Nhoque 400g', 'Quadrada'] };
    return {};
  });
  // jsdom has no object URLs: the preview of a picked photo is a name here, and nothing else uses it.
  let objects = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: () => `blob:report/${++objects}`,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
  await i18n.changeLanguage('es');
});

describe('ReportsPage — sections', () => {
  it('draws the categories the operator has to answer', async () => {
    renderPage();

    expect(await screen.findByTestId('check-task-1')).toBeInTheDocument();
  });

  it('leaves Recebimento to the mirror but keeps the categories hanging below it', async () => {
    renderPage();

    // The mirror answers the category itself, so its own checklist is not a question of this form any more.
    await screen.findByTestId('box-type-switch-41');
    expect(screen.queryByTestId('check-task-43')).not.toBeInTheDocument();

    // Its child is a category of its own, with its own answer.
    expect(screen.getByTestId('box-type-switch-41')).toBeChecked();
    expect(screen.getByTestId('check-task-410')).toBeInTheDocument();
  });

  it('offers the product boxes the server answered, not a copy kept here', async () => {
    renderPage();

    expect(await screen.findByTestId('product-task-61-Nhoque Kg')).toBeInTheDocument();
  });

  it('leaves Quadrada out of the Assaí task and keeps it in Cajas pequeñas', async () => {
    renderPage();

    // The plant counts Quadrada in the small-box task, not in Assaí: the server still offers it for both.
    await screen.findByTestId('product-task-61-Nhoque Kg');
    expect(screen.queryByTestId('product-task-61-Quadrada')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-task-62-Quadrada')).toBeInTheDocument();
    expect(screen.getByTestId('product-task-62-Nhoque 400g')).toBeInTheDocument();
  });

  it('does not ask the Quadrada checklist in Cajas Assaí but keeps it in Cajas pequeñas', async () => {
    renderPage();

    // Task 66 is the Assaí checklist answer: it must not be a question of this form.
    await screen.findByTestId('check-task-67');
    expect(screen.queryByTestId('check-task-66')).not.toBeInTheDocument();
    expect(screen.getByTestId('check-task-60')).toBeInTheDocument();
  });

  it('keeps the form and says so when the product offer cannot be read', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/reports/categories') return { categories: CATEGORIES };
      if (url === '/reports/turno') return { turno: 'tarde' };
      if (url === '/reports/products') throw new Error('offline');
      return {};
    });
    renderPage();

    // One banner per section that asks for the offer: the Assaí task and the small-box task both do now.
    expect((await screen.findAllByTestId('report-products-unavailable')).length).toBeGreaterThan(0);
    // The rest of the report is still a report: one missing offer does not take the other sections down.
    expect(screen.getByTestId('check-task-1')).toBeInTheDocument();
    expect(screen.queryByTestId('product-task-61-Nhoque Kg')).not.toBeInTheDocument();
  });

  it('reads the categories and the turno once, and nothing else to draw the form', async () => {
    renderPage();
    await screen.findByTestId('check-task-1');

    const asked = get.mock.calls.map(([url]) => url as string);
    expect(asked).toContain('/reports/categories');
    expect(asked).toContain('/reports/turno');
  });
});

/**
 * The phone the operators actually carry.
 *
 * iOS Safari zooms the whole page when a field under 16 px takes focus, and Apple asks 44x44 px for a tappable
 * control. Both are class declarations, so both are asserted here rather than measured in a browser.
 */
describe('ReportsPage — the phone, 390 px', () => {
  it('keeps the notes field at 16 px on the phone and only shrinks it from sm', async () => {
    renderPage();

    const notes = await screen.findByTestId('notes-textarea');
    const classes = notes.className.split(/\s+/);

    // 16 px where the phone reads it; the desktop size is the `sm` one, never the base.
    expect(classes).toContain('text-base');
    expect(classes).not.toContain('text-sm');
    expect(classes).toContain('sm:text-sm');
    // The field is still the field: the rest of the look did not travel with the font size.
    expect(classes).toContain('w-full');
    expect(classes).toContain('resize-y');
  });

  it('gives the remove-photo button a 44 px target without growing the badge', async () => {
    renderPage();

    fireEvent.change(await screen.findByTestId('report-photo-input'), {
      target: { files: [photoFile('a.jpg')] },
    });
    const remove = screen.getByTestId('remove-pending-photo-btn');
    const classes = remove.className.split(/\s+/);

    // h-11/w-11 is 2.75rem: the 44 px floor. The round badge inside stays 20 px (h-5/w-5).
    expect(classes).toContain('h-11');
    expect(classes).toContain('w-11');
    expect(classes).not.toContain('h-9');
    expect(remove.querySelector('span')?.className.split(/\s+/)).toContain('h-5');

    fireEvent.click(remove);
    expect(screen.queryByTestId('remove-pending-photo-btn')).not.toBeInTheDocument();
  });
  it('keeps the day of salidas in its own card, outside the ERP movements card', async () => {
    // Two records, two cards: inside the massas block the exit list read as part of "Massas do dia" and the
    // phone layout stacked a third section into a block that already had two.
    renderPage();

    // The categories arrive asynchronously: the ERP card only exists once the page knows where to place it.
    const salidaCard = await screen.findByTestId('salida-report-section');

    // Three records, three cards, under the one sync action that refreshes them.
    for (const other of ['massas-block', 'receipts-block', 'report-massas-card', 'report-receipts-card']) {
      const block = screen.queryByTestId(other);
      if (block) expect(block.contains(salidaCard)).toBe(false);
    }
    expect(screen.getByTestId('report-massas-card')).toBeTruthy();
    // El botón que refresca el día es la primera opción del formulario: arriba del turno y fuera de las tarjetas.
    const sync = screen.getByTestId('erp-movements-sync');
    const form = screen.getByTestId('report-builder-form');
    expect(form.contains(sync)).toBe(true);
    expect(screen.getByTestId('erp-movements-sync-block')).toContainElement(sync);
    // Una sola instancia, y el encabezado de las tarjetas ya no lo repite.
    expect(screen.getAllByTestId('erp-movements-sync')).toHaveLength(1);
    expect(screen.getByTestId('erp-movements-header').contains(sync)).toBe(false);
    for (const card of ['report-massas-card', 'report-receipts-card', 'salida-report-section']) {
      const element = screen.queryByTestId(card);
      if (element) expect(element.contains(sync)).toBe(false);
    }
  });


});
