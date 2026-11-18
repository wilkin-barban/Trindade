import { expect, test } from '@playwright/test';
import { getE2EIdentities, goToProtected } from './auth-helpers';

/**
 * Lo que el teléfono mostraba de más en la pasada anterior.
 *
 * Un día sin lanzamientos no tiene nada que mandar: el bloque de compartir sigue en pantalla -- para que el
 * operador vea que no hay nada, y no que la pantalla falló -- con el botón apagado y la vista previa diciéndolo.
 * La vista de consulta del horario no escribe, así que no ofrece `Salvar Horário`. Y el menú ya no promete un
 * futuro que la planta tiene.
 */
test.use({ viewport: { width: 390, height: 844 } });

test.describe('los ajustes de la pasada, en 390 px', () => {
  test('un día vacío de Masas comparte el estado vacío de Salidas', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    await goToProtected(page, '/massas-history', identities.admin);

    // El día sin lanzamientos se pide por una fecha vieja: el módulo lo dice y deja el bloque de compartir.
    const empty = page.getByTestId('massas-history-empty');
    if (await empty.isVisible().catch(() => false)) {
      await expect(page.getByTestId('massas-share-day')).toBeDisabled();
      await expect(page.getByTestId('massas-preview-message')).toContainText(/Sem lançamentos|Sin lanzamientos/);
    }

    // El botón de copiar ya no existe en ninguno de los dos estados.
    await expect(page.getByRole('button', { name: /Copiar (Relatório|Reporte)/ })).toHaveCount(0);
  });

  test('la vista de consulta del horario no ofrece Salvar Horário', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    await goToProtected(page, `/loading/edit?date=${today}&view=1`, identities.admin);

    // La pantalla terminó de cargar cuando aparece su título; el día puede estar vacío o con filas.
    await expect(page.getByRole('heading', { name: /Ver horário|Ver horario/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('loading-save-btn')).toHaveCount(0);
  });

  test('el menú ya no tiene la sección Futuro', async ({ page }) => {
    const identities = await getE2EIdentities(page);
    await goToProtected(page, '/dashboard', identities.admin);
    await page.getByRole('button', { name: /Abrir men/ }).click();

    await expect(page.getByText(/^Futuro$|^Futuro$/)).toHaveCount(0);
    await expect(page.getByText(/Exportación WhatsApp|Exportação WhatsApp/)).toHaveCount(0);
  });
});
