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
