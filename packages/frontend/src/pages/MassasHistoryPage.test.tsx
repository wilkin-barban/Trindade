import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import type { MassasLaunchDayView } from '../lib/massas';

/**
 * The history picks its day from a list, not from a calendar.
 *
 * Three things are asserted here because they are the three ways this screen can lie to the operator: the
 * list has to show the day that has launches (with its totals, which is how a person recognises a day), a
 * click has to change the table it governs, and the chosen day has to survive in the URL so a link -- the
 * launch screen and the report both build one -- opens the day it names.
 *
 * A day with nothing is asserted too: an empty day and a failed read are different sentences, and the page
 * used to render neither.
 */
const get = vi.fn();

vi.mock('../api/client', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
  ApiClientError: class ApiClientError extends Error {},
}));

const { MassasHistoryPage } = await import('./MassasHistoryPage');

function dayView(date: string, productName: string | null): MassasLaunchDayView {
  const launches = productName
    ? [
        {
          id: 1,
          launch_date: date,
          product_code: '1192',
          product_name: productName,
          boxes: 3,
          units: 30,
          user_id: 1,
          username: 'wilkin',
          display_name: 'Wilkin',
          created_at: `${date}T10:00:00.000Z`,
          updated_at: `${date}T10:00:00.000Z`,
        },
      ]
    : [];
  return {
    date,
    products: productName
      ? [{ code: '1192', name: productName, unitsPerBox: 10, totalBoxes: 3, totalUnits: 30 }]
      : [],
    launches,
    totalBoxes: productName ? 3 : 0,
    totalUnits: productName ? 30 : 0,
  };
}

let currentUrl = '';

function UrlProbe() {
  const location = useLocation();
  currentUrl = `${location.pathname}${location.search}`;
  return null;
}

function renderPage(initialUrl = '/massas-history') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <MassasHistoryPage />
      <UrlProbe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  get.mockReset();
  currentUrl = '';
  await i18n.changeLanguage('es');
});

describe('MassasHistoryPage', () => {
  it('lists the days that have launches instead of a calendar', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) {
        return {
          days: [
            { date: '2026-10-27', productsCount: 2, totalBoxes: 7, totalUnits: 70, operatorsCount: 3 },
            { date: '2026-10-26', productsCount: 1, totalBoxes: 2, totalUnits: 20, operatorsCount: 1 },
          ],
        };
      }
      if (url.startsWith('/massas-launch?')) return dayView(url.split('date=')[1], 'MASSA DE PASTEL');
      return { date: '2026-10-27', movements: [] };
    });

    renderPage();

    const list = await screen.findByTestId('massas-day-list');
    expect(list).toBeInTheDocument();
    // Yesterday is always offered; the day with launches carries its own totals.
    expect(await screen.findByText('7 caj · 70 u · 2 prod · 3 oper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ayer/ })).toBeInTheDocument();
  });

  it('changes the table when another day is clicked, and keeps the day in the URL', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) {
        return {
          days: [
            { date: '2026-10-27', productsCount: 1, totalBoxes: 3, totalUnits: 30, operatorsCount: 1 },
            { date: '2026-10-26', productsCount: 1, totalBoxes: 3, totalUnits: 30, operatorsCount: 1 },
          ],
        };
      }
      if (url.startsWith('/massas-launch?')) {
        const date = url.split('date=')[1];
        return dayView(date, date === '2026-10-26' ? 'MASSA DE QUEIJO' : 'MASSA DE PASTEL');
      }
      return { date: '2026-10-27', movements: [] };
    });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('massas-day-2026-10-26')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('massas-day-2026-10-26'));

    // The name is the table's own header and its rows: what matters is that the day it shows changed.
    expect((await screen.findAllByText('MASSA DE QUEIJO')).length).toBeGreaterThan(0);
    await waitFor(() => expect(currentUrl).toBe('/massas-history?date=2026-10-26'));
  });

  it('opens the day named in the URL', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) return { days: [] };
      if (url.startsWith('/massas-launch?')) {
        const date = url.split('date=')[1];
        return dayView(date, date === '2026-10-20' ? 'MASSA DE PIZZA' : 'MASSA DE PASTEL');
      }
      return { date: '2026-10-20', movements: [] };
    });

    renderPage('/massas-history?date=2026-10-20');

    expect((await screen.findAllByText('MASSA DE PIZZA')).length).toBeGreaterThan(0);
    expect(get).toHaveBeenCalledWith('/massas-launch?date=2026-10-20');
  });

  it('says the day is empty instead of looking like a failed read', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) return { days: [] };
      if (url.startsWith('/massas-launch?')) return dayView('2026-10-27', null);
      return { date: '2026-10-27', movements: [] };
    });

    renderPage();

    expect(await screen.findByTestId('massas-history-empty')).toHaveTextContent(
      'No hay lanzamientos registrados en ese día.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps yesterday when the day list cannot be read', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) throw new Error('offline');
      if (url.startsWith('/massas-launch?')) return dayView('2026-10-27', 'MASSA DE PASTEL');
      return { date: '2026-10-27', movements: [] };
    });

    renderPage();

    expect(await screen.findByText(/No se pudieron leer los días/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ayer/ })).toBeInTheDocument();
    expect((await screen.findAllByText('MASSA DE PASTEL')).length).toBeGreaterThan(0);
  });
});
