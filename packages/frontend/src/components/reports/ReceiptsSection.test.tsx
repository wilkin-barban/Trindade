import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';

const get = vi.fn();

vi.mock('../../api/client', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
  },
}));

vi.mock('../../lib/aero-vault', () => ({
  fetchAeroVaultSettings: vi.fn(async () => ({ configured: false, wsUrl: null, username: null, hasPassword: false })),
}));

const { ReceiptsSection } = await import('./ReceiptsSection');

describe('ReceiptsSection ERP text repair', () => {
  beforeEach(async () => {
    get.mockReset();
    await i18n.changeLanguage('es');
  });

  it('renders mojibake supply descriptions and operator names cleanly as UTF-8', async () => {
    get.mockResolvedValue({
      date: '2026-11-26',
      migrated: true,
      syncedAt: '2026-11-26T18:00:00.000Z',
      receipts: [
        {
          entLan: 901,
          productCode: '001074',
          productDesc: 'AĂ\u0087UCAR 5 KG',
          quantity: 162,
          operatorName: 'GUSTAVO H',
          entryDate: '2026-11-26',
        },
        {
          entLan: 902,
          productCode: '001236',
          productDesc: '320 G PĂO DE ALHO',
          quantity: 12,
          operatorName: 'JOĂ\u0083O',
          entryDate: '2026-11-26',
        },
      ],
    });

    render(
      <MemoryRouter>
        <ReceiptsSection date="2026-11-26" readOnly />
      </MemoryRouter>,
    );

    expect(await screen.findByText('AÇUCAR 5 KG')).toBeInTheDocument();
    expect(screen.getByText('GUSTAVO H')).toBeInTheDocument();
    expect(screen.getByText('320 G PÃO DE ALHO')).toBeInTheDocument();
    expect(screen.getByText('JOÃO')).toBeInTheDocument();
    expect(screen.queryByText(/AĂ/)).not.toBeInTheDocument();
  });
});
