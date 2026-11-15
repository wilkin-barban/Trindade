import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/config';
import { SalidaPhotoPicker, type SalidaPendingPhoto } from './SalidaPhotoPicker';

/**
 * The picker on the phone.
 *
 * Apple asks 44x44 px for anything a finger has to hit, and the badge that says "remove" was 36 px: the extra
 * hit area is padding around the same badge, so the picture is unchanged and the target is not. This is a class
 * assertion, not a measurement: jsdom does not lay out, but the declaration is what the rule is written in.
 */
function photo(id: string): SalidaPendingPhoto {
  return {
    id,
    file: new File([new Uint8Array([0xff, 0xd8, 0xff])], `${id}.jpg`, { type: 'image/jpeg' }),
    previewUrl: `blob:salida/${id}`,
  };
}

function renderPicker(onRemove = vi.fn()) {
  render(
    <SalidaPhotoPicker
      photos={[photo('a')]}
      onAdd={vi.fn()}
      onRemove={onRemove}
      error=""
    />,
  );
  return onRemove;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('SalidaPhotoPicker — the phone, 390 px', () => {
  it('gives the remove button a 44 px target without growing the round badge', () => {
    renderPicker();

    const remove = screen.getByTestId('salida-photo-remove-a');
    const classes = remove.className.split(/\s+/);
    const badge = remove.querySelector('span');
    const badgeClasses = badge?.className.split(/\s+/) ?? [];

    // h-11/w-11 is 2.75rem, the 44 px floor; the badge inside keeps the 36 px it always had.
    expect(classes).toContain('h-11');
    expect(classes).toContain('w-11');
    expect(classes).not.toContain('h-9');
    expect(classes).not.toContain('w-9');
    expect(badgeClasses).toContain('h-9');
    expect(badgeClasses).toContain('w-9');
    expect(badgeClasses).toContain('rounded-full');
    // The badge sits at the corner the badge always sat at: the hit area grew to the left and down.
    expect(classes).toContain('items-start');
    expect(classes).toContain('justify-end');
  });

  it('keeps the label and the test id, and still reports the removal', async () => {
    const onRemove = renderPicker();

    const remove = screen.getByTestId('salida-photo-remove-a');
    expect(remove).toHaveAccessibleName(await i18n.t('salida.photoRemove'));

    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith('a');
  });
});
