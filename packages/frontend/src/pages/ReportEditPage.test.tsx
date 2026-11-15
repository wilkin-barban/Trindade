import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import type { CategoryType } from '../components/reports/CategorySection';

/**
 * What the edit screen sends when it saves.
 *
 * A report records the day, so the day's "no" has to travel: leaving a task unmarked used to remove it from the
 * body, and the server then deleted its row -- the report forgot the answer instead of keeping it. These tests
 * hold the body the page builds, and they hold it through the screen: the buttons are pressed, the payload that
 * leaves is what is asserted.
 */
const patch = vi.fn();
const get = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
    post: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  apiUrl: (path: string) => path,
  ApiClientError: class ApiClientError extends Error {},
}));

const { ReportEditPage } = await import('./ReportEditPage');

function task(id: number, categoryId: number, taskType: 'check' | 'temperature' = 'check', namePt = `Tarefa ${id}`) {
  return {
    id,
    category_id: categoryId,
    name_pt: namePt,
    name_es: `Tarea ${id}`,
    task_type: taskType,
    sort_order: id,
    temperature_readings: taskType === 'temperature' ? 1 : 0,
  };
}

const CATEGORIES: CategoryType[] = [
  { id: 1, parent_category_id: null, name_pt: 'Higiene', name_es: 'Higiene', sort_order: 1, tasks: [task(1, 1), task(2, 1)] },
  { id: 2, parent_category_id: null, name_pt: 'Temperaturas', name_es: 'Temperaturas', sort_order: 2, tasks: [task(5, 2, 'temperature', 'Temperaturas')] },
];

/** A report from the cutoff on, with a category hanging below Recebimento: the mirror answers the parent. */
const CATEGORIES_AFTER_CUTOFF: CategoryType[] = [
  ...CATEGORIES,
  { id: 4, parent_category_id: null, name_pt: 'Recebimento', name_es: 'Recepción', sort_order: 4, tasks: [task(43, 4)] },
  { id: 41, parent_category_id: 4, name_pt: 'Recebimento de congelados', name_es: 'Recepción de congelados', sort_order: 5, tasks: [task(410, 41)] },
];

function photoFile(name: string) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });
}

const REPORT = {
  id: 7,
  turno: 'tarde' as const,
  report_date: '2026-05-04',
  notes: '',
  created_at: '2026-05-04 12:00:00',
  updated_at: '2026-05-04 12:00:00',
  items: [
    { task_id: 1, checked: true, task_type: 'check' },
    { task_id: 2, checked: false, task_type: 'check' },
  ],
  temperatures: [{ location: 'Temperaturas', readingIndex: 1, value: -18 }],
  canEdit: true,
};

const REPORT_AFTER_CUTOFF = {
  ...REPORT,
  report_date: '2026-11-02',
  items: [
    ...REPORT.items,
    { task_id: 410, checked: true, task_type: 'check' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reports/7']}>
      <Routes>
        <Route path="/reports/:id" element={<ReportEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  get.mockReset();
  patch.mockReset();
  patch.mockResolvedValue({ report: { id: 7 } });
  get.mockImplementation(async (url: string) => {
    if (url === '/reports/7') return { report: REPORT };
    if (url === '/reports/categories') return { categories: CATEGORIES };
    if (url.endsWith('/photos')) return { photos: [] };
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

describe('ReportEditPage — the body it saves', () => {
  it('sends a row for every task, marked or not, and no row for a temperature task', async () => {
    renderPage();

    const save = await screen.findByTestId('update-report-btn');
    fireEvent.click(save);

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [url, body] = patch.mock.calls[0] as [string, { items: { taskId: number; checked: boolean }[] }];
    expect(url).toBe('/reports/7');
    expect(body.items).toEqual([
      { taskId: 1, checked: true },
      { taskId: 2, checked: false },
    ]);
    expect(body.items.some((item) => item.taskId === 5)).toBe(false);
  });

  it('does not ask the Quadrada checklist in Cajas Assaí but keeps the small-box one', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/reports/7') return { report: REPORT };
      if (url === '/reports/categories') {
        return {
          categories: [
            ...CATEGORIES,
            { id: 9, parent_category_id: null, name_pt: 'Caixas pequenas', name_es: 'Cajas pequeñas', sort_order: 7, tasks: [task(60, 9, 'check', 'Quadrada')] },
            { id: 10, parent_category_id: null, name_pt: 'Caixas Assai', name_es: 'Cajas Assai', sort_order: 8, tasks: [task(66, 10, 'check', 'Quadrada'), task(67, 10, 'check', 'Nhoque Kg')] },
          ],
        };
      }
      if (url.endsWith('/photos')) return { photos: [] };
      if (url === '/reports/products') return { assai: ['Nhoque Kg'], normal: ['Nhoque 400g'] };
      return {};
    });
    renderPage();

    expect(await screen.findByTestId('check-task-67')).toBeInTheDocument();
    expect(screen.queryByTestId('check-task-66')).not.toBeInTheDocument();
    expect(screen.getByTestId('check-task-60')).toBeInTheDocument();
  });

  it('offers the product boxes the server answered when editing', async () => {
    const withProducts = {
      ...REPORT,
      items: [...REPORT.items, { task_id: 61, checked: false, task_type: 'check_assai' }],
      selectedProducts: [],
    };
    get.mockImplementation(async (url: string) => {
      if (url === '/reports/7') return { report: withProducts };
      if (url === '/reports/categories') {
        return {
          categories: [
            ...CATEGORIES,
            { id: 3, parent_category_id: null, name_pt: 'Caixas', name_es: 'Cajas', sort_order: 3, tasks: [{ ...task(61, 3), task_type: 'check_assai' as const }] },
          ],
        };
      }
      if (url.endsWith('/photos')) return { photos: [] };
      if (url === '/reports/products') return { assai: ['Nhoque Kg'], normal: ['Nhoque 400g'] };
      return {};
    });
    renderPage();

    expect(await screen.findByTestId('product-task-61-Nhoque Kg')).toBeInTheDocument();
  });

  it('draws the mirror over Recebimento without dropping the categories below it', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/reports/7') return { report: REPORT_AFTER_CUTOFF };
      if (url === '/reports/categories') return { categories: CATEGORIES_AFTER_CUTOFF };
      if (url.endsWith('/photos')) return { photos: [] };
      if (url === '/reports/products') return { assai: ['Nhoque Kg'], normal: ['Nhoque 400g'] };
      return {};
    });
    renderPage();

    await screen.findByTestId('box-type-switch-41');
    expect(screen.getByTestId('check-task-410')).toBeInTheDocument();
    expect(screen.getByTestId('check-task-410')).toBeChecked();
    // The category's own checklist is the mirror's business from the cutoff on.
    expect(screen.queryByTestId('check-task-43')).not.toBeInTheDocument();
  });

  it('keeps the row of a task the operator unmarked in this session', async () => {
    renderPage();

    const first = await screen.findByTestId('check-task-1');
    expect(first).toBeChecked();
    fireEvent.click(first);
    fireEvent.click(screen.getByTestId('update-report-btn'));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [, body] = patch.mock.calls[0] as [string, { items: { taskId: number; checked: boolean }[] }];
    expect(body.items).toEqual([
      { taskId: 1, checked: false },
      { taskId: 2, checked: false },
    ]);
  });
});

/**
 * The phone the operators actually carry: 16 px fields so iOS does not zoom on focus, and 44 px targets.
 *
 * The photo the report already has is revealed on hover on a desktop; a phone has no hover, so on the small
 * screen it is simply there -- an invisible 44 px button over the photo would be a trap, not a target.
 */
describe('ReportEditPage — the phone, 390 px', () => {
  it('keeps the notes field at 16 px on the phone and only shrinks it from sm', async () => {
    renderPage();

    const notes = await screen.findByTestId('notes-textarea');
    const classes = notes.className.split(/\s+/);

    expect(classes).toContain('text-base');
    expect(classes).not.toContain('text-sm');
    expect(classes).toContain('sm:text-sm');
    // The field keeps the rest of its look, disabled state included.
    expect(classes).toContain('w-full');
    expect(classes).toContain('disabled:cursor-not-allowed');
  });

  it('gives the remove-photo button a 44 px target without growing the badge', async () => {
    renderPage();

    fireEvent.change(await screen.findByTestId('report-photo-input'), {
      target: { files: [photoFile('a.jpg')] },
    });
    const remove = screen.getByTestId('remove-pending-photo-btn');
    const classes = remove.className.split(/\s+/);

    expect(classes).toContain('h-11');
    expect(classes).toContain('w-11');
    expect(remove.querySelector('span')?.className.split(/\s+/)).toContain('h-5');

    fireEvent.click(remove);
    expect(screen.queryByTestId('remove-pending-photo-btn')).not.toBeInTheDocument();
  });

  it('gives the delete button of a saved photo a 44 px target and shows it on the phone', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/reports/7') return { report: REPORT };
      if (url === '/reports/categories') return { categories: CATEGORIES };
      if (url.endsWith('/photos')) return { photos: [{ id: 11, url: '/reports/photos/11' }] };
      return {};
    });
    renderPage();

    const remove = await screen.findByTestId('delete-existing-photo-btn');
    const classes = remove.className.split(/\s+/);

    expect(classes).toContain('h-11');
    expect(classes).toContain('w-11');
    // Hidden behind a hover a phone does not have: the reveal is the desktop's, from `sm` on.
    expect(classes).toContain('opacity-100');
    expect(classes).toContain('sm:opacity-0');
    expect(classes).toContain('sm:group-hover:opacity-100');
  });
});
