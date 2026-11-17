import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShareCard } from './ShareCard';

/**
 * The card a report becomes once it is saved.
 *
 * What the operator needs is the message exactly as the group receives it, and four decisions: send, print, fix,
 * close. Copying is deliberately absent -- the share sheet already carries the text and a second copy button made
 * the card read like two tools for one job.
 */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const base = {
  title: 'Relatório — Turno Tarde',
  subtitle: '2026-11-16 · Wilkin',
  text: '🌅 *RELATÓRIO — TURNO DA TARDE*\n\n📅 *Data:* 16/11/2026',
  onShare: vi.fn(),
  onPdf: vi.fn(),
  onEdit: vi.fn(),
  onClose: vi.fn(),
};

function renderCard(overrides: Partial<React.ComponentProps<typeof ShareCard>> = {}) {
  return render(<ShareCard {...base} {...overrides} />);
}

describe('ShareCard', () => {
  it('shows the message the plant will read, verbatim', () => {
    renderCard();

    const text = screen.getByTestId('report-share-text');
    expect(text.textContent).toBe(base.text);
    expect(screen.getByTestId('report-share-subtitle').textContent).toBe(base.subtitle);
  });

  it('offers the four decisions and no copy button', () => {
    renderCard();

    expect(screen.getByTestId('report-share-whatsapp')).toBeTruthy();
    expect(screen.getByTestId('report-share-pdf')).toBeTruthy();
    expect(screen.getByTestId('report-share-edit')).toBeTruthy();
    expect(screen.getByTestId('report-share-close')).toBeTruthy();
    // The share sheet already carries the text: a copy button here was a second tool for the same job.
    expect(screen.queryByTestId('report-share-copy')).toBeNull();
    expect(screen.queryByText(/copiar/i)).toBeNull();
  });

  it('fires each action from its own button', () => {
    renderCard();

    fireEvent.click(screen.getByTestId('report-share-whatsapp'));
    fireEvent.click(screen.getByTestId('report-share-pdf'));
    fireEvent.click(screen.getByTestId('report-share-edit'));
    fireEvent.click(screen.getByTestId('report-share-close'));

    expect(base.onShare).toHaveBeenCalledTimes(1);
    expect(base.onPdf).toHaveBeenCalledTimes(1);
    expect(base.onEdit).toHaveBeenCalledTimes(1);
    expect(base.onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the actions while the message loads and says so instead of showing an empty card', () => {
    renderCard({ loading: true });

    expect(screen.getByTestId('report-share-loading')).toBeTruthy();
    expect((screen.getByTestId('report-share-whatsapp') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('report-share-pdf') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the failure instead of an empty message when the text cannot be read', () => {
    renderCard({ error: 'offline' });

    expect(screen.getByTestId('report-share-error').textContent).toBe('offline');
    expect((screen.getByTestId('report-share-whatsapp') as HTMLButtonElement).disabled).toBe(true);
  });
});
