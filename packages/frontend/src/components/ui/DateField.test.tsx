import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateField } from './date-field';

/**
 * The calendar has to open from a click on a desktop, and this is the only place that can be said without a
 * browser: the native input is invisible and stretched over the box the operator sees, so the click lands on
 * the input and the component is the one that asks the platform to open the picker.
 *
 * jsdom has no picker, so the native method is stubbed. What is asserted is that the component calls it on
 * the gestures that mean "open", that it never throws when the browser lacks it, and that the field keeps
 * reporting the ISO day it was given.
 */
describe('DateField', () => {
  const originalShowPicker = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');

  function installShowPicker(): ReturnType<typeof vi.fn> {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      writable: true,
      value: showPicker,
    });
    return showPicker;
  }

  function removeShowPicker(): void {
    // Safari before 16 has no showPicker at all: the component must keep working there.
    delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).showPicker;
  }

  beforeEach(() => {
    removeShowPicker();
  });

  afterEach(() => {
    if (originalShowPicker) {
      Object.defineProperty(HTMLInputElement.prototype, 'showPicker', originalShowPicker);
    } else {
      removeShowPicker();
    }
    vi.restoreAllMocks();
  });

  it('opens the native calendar when the control is clicked', () => {
    const showPicker = installShowPicker();
    render(<DateField id="day" label="Data" value="2026-10-28" onChange={() => {}} testId="day" />);

    fireEvent.click(screen.getByTestId('day'));

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('opens it from Enter and from Space, and keeps the page from scrolling', () => {
    const showPicker = installShowPicker();
    render(<DateField id="day" label="Data" value="2026-10-28" onChange={() => {}} testId="day" />);
    const input = screen.getByTestId('day');

    const enter = fireEvent.keyDown(input, { key: 'Enter' });
    const space = fireEvent.keyDown(input, { key: ' ' });

    expect(showPicker).toHaveBeenCalledTimes(2);
    // `fireEvent` returns false when the event was cancelled, which is what stops Space from scrolling.
    expect(enter).toBe(false);
    expect(space).toBe(false);
  });

  it('ignores the keys that do not mean open', () => {
    const showPicker = installShowPicker();
    render(<DateField id="day" label="Data" value="2026-10-28" onChange={() => {}} testId="day" />);

    fireEvent.keyDown(screen.getByTestId('day'), { key: 'Tab' });

    expect(showPicker).not.toHaveBeenCalled();
  });

  it('keeps the field usable where the browser has no showPicker', () => {
    const onChange = vi.fn();
    render(<DateField id="day" label="Data" value="2026-10-28" onChange={onChange} testId="day" />);
    const input = screen.getByTestId('day');

    expect(() => fireEvent.click(input)).not.toThrow();

    fireEvent.change(input, { target: { value: '2026-10-29' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-29');
  });

  it('swallows the refusal a browser without user activation throws', () => {
    const showPicker = vi.fn(() => {
      throw new DOMException('showPicker() requires a user gesture', 'NotAllowedError');
    });
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      configurable: true,
      writable: true,
      value: showPicker,
    });
    render(<DateField id="day" label="Data" value="2026-10-28" onChange={() => {}} testId="day" />);

    expect(() => fireEvent.click(screen.getByTestId('day'))).not.toThrow();
    expect(showPicker).toHaveBeenCalled();
  });

  it('shows the day it was given and names the control for a screen reader', () => {
    render(<DateField id="day" label="Data do relatório" value="2026-10-28" onChange={() => {}} />);

    expect(screen.getByLabelText('Data do relatório')).toHaveValue('2026-10-28');
    expect(screen.getByText('28/10/2026')).toBeInTheDocument();
  });

  it('renders a month through the same visible trigger', () => {
    render(<DateField id="month" label="Mês" value="2026-10" onChange={() => {}} type="month" testId="month" />);

    expect(screen.getByTestId('month')).toHaveAttribute('type', 'month');
    expect(screen.getByTestId('month')).toHaveValue('2026-10');
    expect(screen.getByText('10/2026')).toBeInTheDocument();
  });

  it('never shows an empty box when the filter has no value yet', () => {
    render(
      <>
        <DateField id="day" label="Data" value="" onChange={() => {}} variant="panel" />
        <DateField id="month" label="Mês" value="" onChange={() => {}} type="month" variant="panel" />
      </>,
    );

    expect(screen.getByText('dd/mm/aaaa')).toBeInTheDocument();
    expect(screen.getByText('mm/aaaa')).toBeInTheDocument();
  });
});
