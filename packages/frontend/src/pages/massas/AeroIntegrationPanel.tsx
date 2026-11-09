import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Plug, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  aeroBridgeCallbackFor,
  aeroEndpoint,
  aeroMissingSetup,
  aeroSettingsReady,
  buildAeroBridgeTriggerUrl,
  clearAeroSettings,
  DEFAULT_AERO_SETTINGS,
  normalizeAeroWsUrl,
  parseAeroCallback,
  saveAeroSettings,
  type AeroSettings,
} from '../../lib/aero-integration';
import {
  deleteAeroVaultSettings,
  fetchAeroVaultSettings,
  requestAeroBridgeTicket,
  saveAeroVaultSettings,
  type AeroVaultSettings,
} from '../../lib/aero-vault';
import { connectionVerdictTone, type AeroResultTone } from '../../lib/aero-feedback';
import { AeroResultDialog } from './AeroResultDialog';
import { newAeroAttempt, postAeroAuditEvent } from '../../lib/aero-audit';
import {
  aeroTestRequestedEvent,
  aeroTestResultEvent,
  clearAeroPendingTest,
  clearAeroTestOutcome,
  loadAeroPendingTest,
  loadAeroTestOutcome,
  type AeroTestOutcome,
} from '../../lib/aero-test';
import { AeroShortcutDialog } from './AeroShortcutDialog';
import { AeroDeviceBanner } from '../../components/aero/AeroDeviceBanner';
import { useDevice } from '../../contexts/DeviceContext';
import { canControlAero } from '../../lib/device-detection';

interface AeroIntegrationPanelProps {
  settings: AeroSettings;
  onSettingsSaved: (settings: AeroSettings) => void;
  /** The address is the plant's: only the integration owner may move it (S12). */
  canEditUrl?: boolean;
  /** The credentials are the operator's own; nobody else types them (S13). */
  canEditCredentials?: boolean;
  /** What the phone brought back from the test shortcut, handed down by the page that owns the callback. */
  testOutcome?: AeroTestOutcome | null;
  onTestOutcomeHandled?: () => void;
}

type Notice = { tone: 'ok' | 'warn' | 'error'; text: string };

/**
 * What the server said about the vault, as this panel draws it.
 *
 * `loading` is a state of its own on purpose: the panel must not say «sin configurar» while it is still asking,
 * because that sentence sends the operator to retype an address the server already has.
 */
type VaultState =
  | { status: 'loading'; settings: null }
  | { status: 'ready'; settings: AeroVaultSettings }
  | { status: 'error'; settings: null };

const EMPTY_VAULT: AeroVaultSettings = {
  configured: false,
  wsUrl: null,
  username: null,
  hasPassword: false,
  updatedAt: null,
};

/**
 * The company WebService settings, kept in the server's vault and shown to nobody else.
 *
 * The password is not a field this page can hold: it is typed once, sent once and stored encrypted by the API.
 * Every visit starts with an empty input, because filling it with the stored secret is exactly the thing this
 * change removes -- and leaving it empty on save means "keep the one you have", not "clear it".
 *
 * The panel owns three operations and each one is a round trip: read the vault, write it, delete it. The
 * connection test is no longer a request from the browser -- Safari cannot reach the plant's LAN from an HTTPS
 * page -- so it asks for a `test` ticket and lets the shortcut prove the credentials server side.
 */
export function AeroIntegrationPanel({
  settings,
  onSettingsSaved,
  canEditUrl = false,
  canEditCredentials = true,
  testOutcome,
  onTestOutcomeHandled,
}: AeroIntegrationPanelProps) {
  const { t } = useTranslation();
  // El sistema operativo decide si este panel puede mover algo. En una computadora la integración se ve
  // entera y deshabilitada: esconderla haría creer que no existe, y el banner al lado explica qué dispositivo
  // sí la tiene. Los permisos por rol siguen aplicando encima de esto.
  const device = useDevice();
  const deviceLimited = !canControlAero(device);
  // El atajo vuelve siempre a la pantalla de lanzamiento; cuando el panel vive en el Panel Admin, el veredicto
  // llega por almacenamiento y no por props.
  const [storedOutcome, setStoredOutcome] = useState<AeroTestOutcome | null>(() =>
    testOutcome === undefined ? loadAeroTestOutcome() : null,
  );
  /** One read per arrival: a second effect run would report the same test twice. */
  const callbackHandled = useRef(false);
  const [vault, setVault] = useState<VaultState>({ status: 'loading', settings: null });
  /** One read per mount: re-reading after a save would overwrite what the save just answered. */
  const vaultSynced = useRef(false);
  const [draft, setDraft] = useState({
    wsUrl: settings.wsUrl,
    username: settings.username,
    // Always empty. The stored password is never handed to this input, on this visit or any other.
    password: '',
  });
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null);
  // El veredicto del test viaja desde otra app: sin esta ventana el operario vuelve a una pantalla idéntica
  // a la que dejó y no sabe si la conexión quedó probada.
  const [testResult, setTestResult] = useState<{ tone: AeroResultTone; message: string } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  /** Un veredicto que llegó del teléfono pide scroll: el aviso nace fuera de la pantalla. */
  const scrollToNotice = useRef(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);

  /**
   * The integration as the server sees it, merged over what this phone remembers locally.
   *
   * The server wins on the three fields it owns -- address, user, and whether a password exists -- and the
   * phone keeps its own preferences. That is what lets a second tab, a duplicated tab or a different device of
   * the same owner draw the panel without asking for a secret.
   */
  const effective: AeroSettings = useMemo(
    () => ({
      ...settings,
      // En cuanto el servidor contesta, es él quien manda también cuando dice que no hay nada: si el cofre se
      // borró desde otro dispositivo, quedarse con la URL cacheada mostraría «configurado» sobre un cofre vacío.
      wsUrl: vault.status === 'ready' ? (vault.settings.wsUrl ?? '') : settings.wsUrl,
      username: vault.status === 'ready' ? (vault.settings.username ?? '') : settings.username,
      hasPassword: vault.status === 'ready' ? vault.settings.hasPassword : settings.hasPassword,
    }),
    [settings, vault],
  );

  const vaultLoading = vault.status === 'loading';
  const vaultFailed = vault.status === 'error';
  const ready = vault.status === 'ready' && aeroSettingsReady(effective);
  const missing = aeroMissingSetup(effective);
  const hasPassword = vault.status === 'ready' && vault.settings.hasPassword;

  const normalizedUrl = useMemo(() => normalizeAeroWsUrl(draft.wsUrl), [draft.wsUrl]);
  const destination = useMemo(
    () => (normalizedUrl ? aeroEndpoint(normalizedUrl, 'usuarios') : draft.wsUrl.trim()),
    [normalizedUrl, draft.wsUrl],
  );

  /** Reads the vault. Retried by the operator when the API did not answer. */
  const loadVault = useCallback(async () => {
    setVault({ status: 'loading', settings: null });
    try {
      const stored = await fetchAeroVaultSettings();
      setVault({ status: 'ready', settings: stored });
    } catch {
      setVault({ status: 'error', settings: null });
      setNotice({ tone: 'error', text: t('massas.aero.vaultError') });
    }
  }, [t]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  /**
   * Copies what the server answered into the local cache, once per mount.
   *
   * The address and the user are not secrets and the phone keeps them so a reload draws the panel before the
   * API answers; the password is not among them, and `hasPassword` is left out of the payload on purpose.
   */
  useEffect(() => {
    if (vault.status !== 'ready' || vaultSynced.current) return;
    vaultSynced.current = true;
    const stored = vault.settings;
    if (!stored.configured) return;
    setDraft((current) => ({
      wsUrl: stored.wsUrl ?? current.wsUrl,
      username: stored.username ?? current.username,
      password: '',
    }));
    onSettingsSaved(
      saveAeroSettings({
        ...settings,
        wsUrl: stored.wsUrl ?? settings.wsUrl,
        username: stored.username ?? settings.username,
        hasPassword: stored.hasPassword,
      }),
    );
  }, [onSettingsSaved, settings, vault]);

  const handleSave = async () => {
    setNotice(null);
    if (!normalizedUrl || !draft.username.trim()) {
      setNotice({ tone: 'error', text: t('massas.aero.invalid') });
      return;
    }

    setBusy('save');
    try {
      // An empty input is not a password: the vault client omits the key, so «guardar» without typing keeps
      // whatever the server already has, and the address can be fixed without knowing the secret.
      const saved = await saveAeroVaultSettings({
        wsUrl: normalizedUrl,
        username: draft.username.trim(),
        password: draft.password,
      });
      setVault({ status: 'ready', settings: saved });
      setDraft({ wsUrl: normalizedUrl, username: draft.username.trim(), password: '' });
      onSettingsSaved(
        saveAeroSettings({
          ...effective,
          wsUrl: normalizedUrl,
          username: draft.username.trim(),
          hasPassword: saved.hasPassword,
        }),
      );
      setNotice({ tone: 'ok', text: t('massas.aero.saved') });
    } catch {
      setNotice({ tone: 'error', text: t('massas.aero.vaultSaveError') });
    } finally {
      setBusy(null);
    }
  };

  /**
   * The connection test, in the only channel that can reach the WebService.
   *
   * The browser cannot: it never has the password and Safari refuses a plain-HTTP target from an HTTPS page.
   * The shortcut redeems a `test` ticket, rings `/usuarios/`, reads the `success` field and comes back with it.
   * The attempt is written before the phone leaves, because a test that never reports is still a fact.
   */
  const handleTest = async () => {
    setNotice(null);

    if (!normalizedUrl || !draft.username.trim() || !hasPassword) {
      // A `requested` line carries no error: the attempt did not fail, it never became an attempt.
      void postAeroAuditEvent({
        ...aeroTestRequestedEvent({ destinationUrl: draft.wsUrl.trim(), reason: null }),
        note: 'via=ticket reason=invalid_config',
      });
      setNotice({ tone: 'error', text: t('massas.aero.testInvalid') });
      return;
    }

    // One attempt id for the pair: the requested line and whatever result follows are the same action.
    const attempt = newAeroAttempt();
    setBusy('test');

    try {
      const ticket = await requestAeroBridgeTicket({
        action: 'test',
        payloads: [{}],
        // The shortcut comes back to the tab that asked, not to the launch page: the panel lives in Admin now,
        // and a callback aimed at /massas-launch lands on a page with no panel to draw the verdict in.
        callbackPath: aeroBridgeCallbackFor('test', `${window.location.pathname}?tab=integration`),
      });

      await postAeroAuditEvent({
        ...aeroTestRequestedEvent({ destinationUrl: destination, reason: null }),
        note: 'via=ticket',
        ...attempt,
      });

      setNotice({ tone: 'warn', text: t('massas.aero.testShortcutOpening') });
      window.location.href = buildAeroBridgeTriggerUrl({
        name: effective.shortcutName,
        ticket: ticket.ticket,
        ticketUrl: ticket.ticketUrl,
      });
      return;
    } catch {
      // The ticket was refused: nothing left the page, and the line says which step stopped.
      await postAeroAuditEvent({
        ...aeroTestRequestedEvent({ destinationUrl: destination, reason: null }),
        note: 'via=ticket',
        error: 'AERO_TICKET_REFUSED',
        ...attempt,
      });
      setNotice({ tone: 'error', text: t('massas.aero.vaultTicketError') });
      setBusy(null);
    }
  };

  /**
   * The verdict the phone brought back to this very tab.
   *
   * The launch page also reads this callback, and when the panel lived there that was enough. Now the panel
   * is in Admin, so the shortcut returns to Admin and this is the only reader: the query is consumed and
   * stripped first, because a pull-to-refresh in the factory must not replay a test that already happened.
   */
  useEffect(() => {
    if (callbackHandled.current) return;
    const parsed = parseAeroCallback(window.location.search);
    if (!parsed || parsed.kind !== 'test') return;
    callbackHandled.current = true;
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);

    const pending = loadAeroPendingTest();
    const destinationUrl = pending?.destinationUrl ?? destination;
    clearAeroPendingTest();
    void postAeroAuditEvent(
      aeroTestResultEvent({ verdict: parsed.verdict, raw: parsed.raw, destinationUrl }),
    );
    setStoredOutcome({ verdict: parsed.verdict, raw: parsed.raw, destinationUrl });
  }, [destination]);

  /**
   * The verdict the phone brought back.
   *
   * It still scrolls itself into view: the operator returns to the page after using another app, and an
   * answer below the fold reads as no answer at all.
   */
  useEffect(() => {
    const outcome = testOutcome ?? storedOutcome;
    if (!outcome) return;
    setBusy(null);
    const text =
      outcome.verdict === 'ok'
        ? t('massas.aero.testShortcutOk')
        : outcome.verdict === 'error'
          ? t('massas.aero.testShortcutError')
          : t('massas.aero.testShortcutUnknown');
    setNotice({
      tone: outcome.verdict === 'ok' ? 'ok' : outcome.verdict === 'error' ? 'error' : 'warn',
      text,
    });
    setTestResult({ tone: connectionVerdictTone(outcome.verdict), message: text });
    scrollToNotice.current = true;
    // El veredicto se consumió: guardarlo haría que el panel lo repita en la próxima visita.
    clearAeroTestOutcome();
    setStoredOutcome(null);
    onTestOutcomeHandled?.();
  }, [testOutcome, storedOutcome, onTestOutcomeHandled, t]);

  /**
   * El veredicto se lee solo si se ve.
   *
   * El operario vuelve de otra app y aterriza en la parte de arriba de la página: un aviso a media
   * pantalla de distancia es un resultado que no existe. Se desplaza una vez, cuando el aviso ya está en
   * el DOM, y no en cada re-render.
   */
  useEffect(() => {
    if (!scrollToNotice.current || !notice) return;
    scrollToNotice.current = false;
    noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [notice]);

  /**
   * Deletes the vault of the owner, and only then forgets it here.
   *
   * A local clear that ran ahead of the server would leave the phone saying «sin configurar» while the API
   * still holds the encrypted password, which is the worst of both states.
   */
  const handleClear = async () => {
    if (!window.confirm(t('massas.aero.clearConfirm'))) return;
    setBusy('clear');
    setNotice(null);
    try {
      await deleteAeroVaultSettings();
      setVault({ status: 'ready', settings: EMPTY_VAULT });
      clearAeroSettings();
      setDraft({ wsUrl: '', username: '', password: '' });
      onSettingsSaved(DEFAULT_AERO_SETTINGS);
      setNotice({ tone: 'warn', text: t('massas.aero.cleared') });
    } catch {
      setNotice({ tone: 'error', text: t('massas.aero.vaultClearError') });
    } finally {
      setBusy(null);
    }
  };

  const badge = vaultLoading
    ? { text: t('massas.aero.vaultLoading'), tone: 'bg-gray-100 text-gray-500', ready: false }
    : vaultFailed
      ? { text: t('massas.aero.vaultUnavailable'), tone: 'bg-red-50 text-red-700', ready: false }
      : ready
        ? { text: t('massas.aero.configured'), tone: 'bg-green-50 text-green-700', ready: true }
        : {
            text:
              missing === 'password'
                ? t('massas.aero.passwordPending')
                : t('massas.aero.notConfigured'),
            tone: 'bg-gray-100 text-gray-500',
            ready: false,
          };

  return (
    <Card className="border-gray-200 shadow-sm overflow-hidden">
      {/* En un teléfono el título no entra junto a la insignia: se cortaba en "Configuración I..." y
          el panel dejaba de decir qué era. Debajo de `sm` el título ocupa su renglón y la insignia baja
          alineada con el texto. */}
      <div className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Plug className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight text-gray-900 sm:truncate">
              {t('massas.aero.panelTitle')}
            </span>
            <span className="hidden sm:block text-xs text-gray-500 truncate">{t('massas.aero.panelHint')}</span>
          </span>
        </span>
        <span className="order-last flex w-full shrink-0 items-center gap-2 pl-6 sm:order-none sm:w-auto sm:pl-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}
            data-testid="aero-state"
            data-vault-status={vault.status}
          >
            {badge.ready && <ShieldCheck className="h-3 w-3" />}
            {badge.text}
          </span>
        </span>
      </div>

      {deviceLimited && (
        <div className="border-t border-gray-100 px-4 pt-3">
          <AeroDeviceBanner device={device} />
        </div>
      )}

      <div id="aero-integration-body" className="border-t border-gray-100 px-4 pb-4 pt-4 space-y-4">
        {/* Mientras el servidor no conteste, el panel no opina: un estado neutro evita las dos mentiras
            posibles -- «sin configurar» y «configurado» -- sobre un cofre que todavía no se leyó. */}
        {vaultLoading && (
          <p className="flex items-center gap-2 text-xs text-gray-500" data-testid="aero-vault-loading">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('massas.aero.vaultLoading')}
          </p>
        )}

        {vaultFailed && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            data-testid="aero-vault-error"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{t('massas.aero.vaultError')}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadVault()}
              className="h-9 shrink-0 gap-1.5 px-2 text-xs font-semibold"
              data-testid="aero-vault-retry"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('massas.aero.vaultRetry')}
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="aero-ws-url" className="block text-xs font-semibold text-gray-600">
            {t('massas.aero.urlLabel')}
          </label>
          <Input
            id="aero-ws-url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('massas.aero.urlPlaceholder')}
            value={draft.wsUrl}
            onChange={(event) => setDraft((current) => ({ ...current, wsUrl: event.target.value }))}
            disabled={!canEditUrl || deviceLimited}
            readOnly={!canEditUrl || deviceLimited}
            aria-describedby="aero-ws-url-note"
            className="h-11 text-base read-only:bg-gray-50 read-only:text-gray-600"
            data-testid="aero-ws-url"
          />
          <p id="aero-ws-url-note" className="text-[11px] text-gray-500 leading-relaxed">
            {deviceLimited
              ? t('massas.aero.deviceLocked')
              : canEditUrl
                ? t('massas.aero.urlEditable')
                : t('massas.aero.urlLocked')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="aero-ws-user" className="block text-xs font-semibold text-gray-600">
              {t('massas.aero.userLabel')}
            </label>
            <Input
              id="aero-ws-user"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              value={draft.username}
              onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
              disabled={!canEditCredentials || deviceLimited}
              readOnly={!canEditCredentials}
              className="h-11 text-base"
              data-testid="aero-ws-user"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aero-ws-pass" className="block text-xs font-semibold text-gray-600">
              {t('massas.aero.passwordLabel')}
            </label>
            <Input
              id="aero-ws-pass"
              type="password"
              // The browser must not offer a stored password here: this input is a new secret or nothing.
              autoComplete="new-password"
              placeholder={hasPassword ? t('massas.aero.passwordKeepPlaceholder') : ''}
              value={draft.password}
              onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
              disabled={!canEditCredentials || deviceLimited}
              readOnly={!canEditCredentials}
              className="h-11 text-base"
              data-testid="aero-ws-pass"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">{t('massas.aero.fieldsHint')}</p>

        {/* El campo nace vacío siempre: la contraseña guardada vive cifrada en el servidor y no vuelve.
            Decirlo acá evita que un campo vacío se lea como «la app la perdió». */}
        <p className="text-[11px] text-gray-500 leading-relaxed" data-testid="aero-pass-notice">
          {hasPassword ? t('massas.aero.passwordStored') : t('massas.aero.passwordNotStored')}
        </p>

        {notice && (
          <p
            ref={noticeRef}
            data-testid="aero-notice"
            role="status"
            className={`text-xs sm:text-sm rounded-lg border px-3 py-2 ${
              notice.tone === 'ok'
                ? 'bg-green-50 border-green-200 text-green-800'
                : notice.tone === 'warn'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {notice.text}
          </p>
        )}

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleTest()}
            disabled={busy !== null || deviceLimited || vaultLoading}
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto font-semibold"
            data-testid="aero-test"
          >
            {busy === 'test' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy === 'test' ? t('massas.aero.testing') : t('massas.aero.test')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy !== null || deviceLimited || vaultLoading}
            className="min-h-[44px] w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            data-testid="aero-save"
          >
            {t('massas.aero.save')}
          </Button>
          <Button
            type="button"
            onClick={() => setShortcutOpen(true)}
            disabled={deviceLimited}
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto font-semibold"
            data-testid="aero-shortcut-open"
          >
            {t('massas.aero.shortcut')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleClear()}
            disabled={busy !== null || deviceLimited}
            variant="ghost"
            className="min-h-[44px] w-full sm:w-auto sm:ml-auto text-red-600 hover:bg-red-50 font-semibold"
          >
            {t('massas.aero.clear')}
          </Button>
        </div>
      </div>

      <AeroResultDialog
        open={testResult !== null}
        tone={testResult?.tone ?? 'ok'}
        title={t(testResult?.tone === 'ok' ? 'massas.aero.resultTestOkTitle' : testResult?.tone === 'warn' ? 'massas.aero.resultTestWarnTitle' : 'massas.aero.resultTestErrorTitle')}
        message={testResult?.message ?? ''}
        onClose={() => setTestResult(null)}
        testId="aero-test-result-modal"
      />

      <AeroShortcutDialog open={shortcutOpen} onClose={() => setShortcutOpen(false)} settings={effective} />
    </Card>
  );
}
