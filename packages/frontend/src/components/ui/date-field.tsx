import { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDateLabel } from '../../lib/date';

interface DateFieldProps {
  id: string;
  /** Accessible name. Never drawn: the trigger shows the day itself and a calendar icon. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  testId?: string;
  className?: string;
  /**
   * `inline` is the compact box beside other controls; `panel` is a full-width surface whose whole body is
   * the day. The panel exists because a ten-character date is the smallest thing to read on a screen that
   * asks for it with the largest control: the day becomes the biggest text, its name sits above it at label
   * size, and the surface -- not a word inside it -- is what opens the calendar.
   */
  variant?: 'inline' | 'panel';
}

/**
 * A date field that looks the same on every phone.
 *
 * A bare `<input type="date">` cannot be trusted with the layout: WebKit draws its text from the
 * operating system's locale, so a pt-BR iPhone renders "28 de out. de 2026" and the control claims an
 * intrinsic width of roughly 250px no matter what the flex container around it says. `min-w-0` cannot
 * shrink it and no CSS reaches the shadow text, so it spilled out of its slot and the next control was
 * painted on top of its right border.
 *
 * The fix is the pattern mobile web settled on: the box the operator sees is ours (a compact
 * `28/10/2026` with a calendar icon, ~135px, sized by our own text), and the native input sits on top
 * of it, transparent and stretched, so it owns the tap and opens the system wheel. Tapping anywhere on
 * the box is tapping the real control, which keeps `showPicker`, keyboard handling, min/max and every
 * accessibility behaviour of the native element.
 *
 * `overflow-hidden` is load-bearing: it clips the invisible input to the trigger box, so a residual
 * intrinsic width can never extend the tap target over the control that sits beside it.
 *
 * On a phone the tap opens the system wheel by itself, but on a desktop browser clicking a date input
 * only focuses it: the calendar opens from the tiny icon inside the field, which here is invisible. So
 * the click and the two keys that mean "open it" call `showPicker()` explicitly. It needs transient
 * user activation and throws without it, so the call is guarded and the browser that cannot do it keeps
 * the native behaviour.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  testId,
  className,
  variant = 'inline',
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Opens the native calendar from the click the operator just made.
   *
   * A browser without `showPicker` (Safari shipped it late) keeps whatever its own click does; a browser
   * that has it but refuses the call -- no user activation, cross-origin iframe -- also keeps it, because
   * the only thing lost then is an attempt, not the control.
   */
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    const showPicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
    if (typeof showPicker !== 'function') return;
    try {
      showPicker.call(input);
    } catch {
      // The field is still focusable and typable; the calendar just did not open.
    }
  };

  const panel = variant === 'panel';

  return (
    <div
      className={cn(
        'relative overflow-hidden border border-gray-300 bg-white text-gray-900 transition-colors',
        'focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30',
        panel
          ? 'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left'
          : 'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium sm:h-10',
        className,
      )}
      data-variant={variant}
    >
      <span className={panel ? 'flex min-w-0 flex-col' : 'contents'}>
        {panel && <span className="text-xs text-gray-500">{label}</span>}
        <span
          aria-hidden="true"
          className={cn('tabular-nums', panel ? 'truncate text-lg font-semibold' : '')}
        >
          {formatDateLabel(value)}
        </span>
      </span>
      <Calendar
        className={cn('shrink-0 text-gray-500', panel ? 'h-5 w-5 text-blue-600' : 'h-4 w-4')}
        aria-hidden="true"
      />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openPicker();
        }}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
      />
    </div>
  );
}
