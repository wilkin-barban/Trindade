import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/config';
import type { MassasLaunchDayView } from '../lib/massas';
import { saoPauloDaysAgo, saoPauloYesterday } from '../lib/date';

/**
 * The history picks its day the way the count does: a panel and a strip of the days that have launches.
 *
 * Four things are asserted here because they are the four ways this screen can lie to the operator: the
 * strip has to show the days that have launches with their units (which is how a person recognises a day),
 * a chip has to change the table it governs, the chosen day has to survive in the URL so a link -- the
 * launch screen and the report both build one -- opens the day it names, and yesterday has to be offered
 * even when the endpoint never listed it, because a day with nothing is still a day worth opening.
 *
 * A day with nothing is asserted too: an empty day and a failed read are different sentences, and a failed
 * day list must not take the day field down with it.
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
  it('offers the day through the same panel the count uses, with one chip per day', async () => {
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

    // The panel field carries the archive window: thirty days back, and never today.
    const field = await screen.findByTestId('massas-history-date');
    expect(field).toHaveAttribute('type', 'date');
    const todayInSaoPaulo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const yesterdayInSaoPaulo = new Date(`${todayInSaoPaulo}T12:00:00Z`);
    yesterdayInSaoPaulo.setUTCDate(yesterdayInSaoPaulo.getUTCDate() - 1);
    expect(field).toHaveAttribute('max', yesterdayInSaoPaulo.toISOString().slice(0, 10));
    expect(field).toHaveAttribute('min', saoPauloDaysAgo(30));

    // One chip per day, day and units, the way the count writes them.
    expect(await screen.findByTestId('massas-history-days')).toBeInTheDocument();
    expect(screen.getByTestId('massas-history-day-2026-10-27')).toHaveTextContent('27/10 · 70');
    expect(screen.getByTestId('massas-history-day-2026-10-26')).toHaveTextContent('26/10 · 20');

    // The two-line card that used to live here is gone, not renamed.
    expect(screen.queryByText('Escolha o dia')).not.toBeInTheDocument();
  });

  it('offers yesterday even when the endpoint never listed it, without claiming it was empty', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.startsWith('/massas-launch/history')) return { days: [] };
      if (url.startsWith('/massas-launch?')) return dayView(url.split('date=')[1], 'MASSA DE PASTEL');
      return { date: '2026-10-27', movements: [] };
    });

    renderPage();

    const yesterday = saoPauloYesterday();
    const chip = await screen.findByTestId(`massas-history-day-${yesterday}`);
    // A day nobody read has no count: printing 0 would state a fact the endpoint never gave.
    expect(chip).toHaveTextContent(/^\d{2}\/\d{2}$/);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toBeDisabled();
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

    await waitFor(() => expect(screen.getByTestId('massas-history-day-2026-10-26')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('massas-history-day-2026-10-26'));

    // The name is the table's own header and its rows: what matters is that the day it shows changed.
    expect((await screen.findAllByText('MASSA DE QUEIJO')).length).toBeGreaterThan(0);
    await waitFor(() => expect(currentUrl).toBe('/massas-history?date=2026-10-26'));
  });

  it('drops a stale answer that arrives after a newer one', async () => {
    const resolvers: Record<string, (view: MassasLaunchDayView) => void> = {};
    get.mockImplementation((url: string) => {
      if (url.startsWith('/massas-launch/history')) {
        return Promise.resolve({
          days: [
            { date: '2026-10-27', productsCount: 1, totalBoxes: 3, totalUnits: 30, operatorsCount: 1 },
            { date: '2026-10-26', productsCount: 1, totalBoxes: 3, totalUnits: 30, operatorsCount: 1 },
          ],
        });
      }
      if (url.startsWith('/massas-launch?')) {
        const date = url.split('date=')[1];
        if (date === '2026-10-27' || date === '2026-10-26') {
          return new Promise<MassasLaunchDayView>((resolve) => {
            resolvers[date] = resolve;
          });
        }
        return Promise.resolve(dayView(date, 'MASSA DE PASTEL'));
      }
      return Promise.resolve({ date: '2026-10-27', movements: [] });
    });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('massas-history-day-2026-10-27')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('massas-history-day-2026-10-27'));
    // Both reads are in flight before either answers: that is the race the screen has to survive.
    await waitFor(() => expect(resolvers['2026-10-27']).toBeDefined());
    fireEvent.click(screen.getByTestId('massas-history-day-2026-10-26'));
    await waitFor(() => expect(resolvers['2026-10-26']).toBeDefined());

    // The second tap answers first; the first one lands afterwards carrying a day the operator already left.
    resolvers['2026-10-26'](dayView('2026-10-26', 'MASSA DE QUEIJO'));
    expect((await screen.findAllByText('MASSA DE QUEIJO')).length).toBeGreaterThan(0);

    resolvers['2026-10-27'](dayView('2026-10-27', 'MASSA DE PASTEL VELHA'));
    // Let the late answer run everything it wanted to run, and then look: it asked for a day nobody is on.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('MASSA DE PASTEL VELHA')).toBeNull();
    expect(screen.queryAllByText('MASSA DE QUEIJO').length).toBeGreaterThan(0);
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

    // The panel survives the failure: the field is still the way to reach any day.
    expect(await screen.findByText(/No se pudieron leer los días/)).toBeInTheDocument();
    expect(screen.getByTestId('massas-history-date')).toBeInTheDocument();
    expect(screen.getByTestId(`massas-history-day-${saoPauloYesterday()}`)).toBeInTheDocument();
    expect((await screen.findAllByText('MASSA DE PASTEL')).length).toBeGreaterThan(0);
  });
});
