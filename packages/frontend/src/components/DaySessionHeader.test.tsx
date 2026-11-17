import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DaySessionHeader } from './DaySessionHeader';

describe('DaySessionHeader', () => {
  it('renders salida header with date, operator, session label and history navigation', () => {
    render(
      <MemoryRouter>
        <DaySessionHeader
          date="2026-11-13"
          historyHref="/salida-history"
          username="wilkin"
          testIdPrefix="salida"
          title="Salida / Baixa"
          subtitle="Baja de insumos"
          help={<div>Help</div>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('salida-launch-header')).toBeInTheDocument();
    expect(screen.getByTestId('salida-date').textContent).toMatch(/13\/11\/2026/);
    expect(screen.getByTestId('salida-operator').textContent).toContain('wilkin');
    expect(screen.getByTestId('salida-operator').textContent).toMatch(/Sesión|Sessão/);
    expect(screen.getByTestId('salida-nav-history')).toBeInTheDocument();
    expect(screen.getByTestId('salida-launch-help')).toBeInTheDocument();
  });

  it('renders massas header with massas-* test ids and links to massas history', () => {
    render(
      <MemoryRouter>
        <DaySessionHeader
          date="2026-11-13"
          historyHref="/massas-history"
          username="jaime"
          testIdPrefix="massas"
          title="Lançamento de Massas"
          subtitle="Controle de produção"
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('massas-launch-header')).toBeInTheDocument();
    expect(screen.getByTestId('massas-date').textContent).toMatch(/13\/11\/2026/);
    expect(screen.getByTestId('massas-operator').textContent).toContain('jaime');
    expect(screen.getByTestId('massas-operator').textContent).toMatch(/Sesión|Sessão/);
    expect(screen.getByTestId('massas-nav-history')).toBeInTheDocument();
  });
});
