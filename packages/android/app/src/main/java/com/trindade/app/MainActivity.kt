package com.trindade.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.trindade.app.network.GuestReadonlyNotice
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.res.painterResource
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.trindade.app.admin.AdminPanelRoute
import com.trindade.app.auth.AuthRepository
import com.trindade.app.auth.LoginRoute
import com.trindade.app.auth.ProfileRoute
import com.trindade.app.auth.RegisterRoute
import com.trindade.app.auth.RolePolicy
import com.trindade.app.dashboard.DashboardRoute
import com.trindade.app.loading.LoadingEditRoute
import com.trindade.app.loading.LoadingHistoryRoute
import com.trindade.app.loading.LoadingRoute
import com.trindade.app.loading.LoadingShareRoute
import com.trindade.app.reports.ReportDetailRoute
import com.trindade.app.reports.ReportEditRoute
import com.trindade.app.reports.ReportGeneratorRoute
import com.trindade.app.reports.ReportsHistoryRoute
import com.trindade.app.ui.components.ShareCardMode
import com.trindade.app.ui.theme.TrindadeTheme
import com.trindade.app.assai.AssaiCalculatorScreen
import com.trindade.app.share.ShareAppScreen
import com.trindade.app.stock.StockCalculatorScreen
import com.trindade.app.stock.StockHistoryScreen
import com.trindade.app.ui.components.DeveloperCredit
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Target report opened with a specific viewing mode. */
data class OpenReportTarget(
    val id: Int,
    val mode: ShareCardMode? = null,
)

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    /**
     * The surfaces this build can draw.
     *
     * A tab is a screen, not a place in the menu: the histories and the two catalog surfaces live inside
     * the tab that owns them, so several of these are reached from a drawer entry or a module action rather
     * than from the tab row. [TAB_DESTINATIONS] is what the row shows and [DRAWER_ENTRIES] is what the
     * drawer lists; neither is the whole enum.
     */
    enum class Tab(@StringRes val label: Int) {
        DASHBOARD(R.string.nav_dashboard),
        REPORTS(R.string.nav_reports),
        LOADING(R.string.nav_loading),
        MASSAS_LAUNCH(R.string.massas_title),
        SALIDA(R.string.nav_salida),
        ADMIN(R.string.admin_panel_title),
        ASSAI(R.string.nav_assai),
        STOCK_COUNTER(R.string.nav_stock_counter),
        SHARE(R.string.nav_share),
    }

    /**
     * The screens that live *inside* a tab rather than beside it.
     *
     * The four histories -- massas, reports, loading and stock -- are the same tab's surface in another state,
     * so a drawer entry that opens one says so with an overlay instead of pretending the history is a tab of
     * its own. The stock history was the last one still drawn as a tab, and the row, which does not carry it,
     * answered every visit by falling back to its first item: opening the history moved the selection to the
     * Dashboard while the screen under it was the counter's.
     */
    enum class Overlay {
        MASSAS_HISTORY,
        REPORTS_HISTORY,
        LOADING_HISTORY,
        STOCK_HISTORY,
        ADMIN_AUDIT,
        SALIDA_HISTORY,
    }

    /** One tab, and the overlay the visit opens on top of it. */
    data class NavTarget(val tab: Tab, val overlay: Overlay? = null)

    /** A labelled, icon-bearing navigation destination and the [NavTarget] it leads to. */
    data class Destination(
        val entryPoint: RolePolicy.EntryPoint,
        @StringRes val label: Int,
        @DrawableRes val icon: Int,
        val target: NavTarget,
    )

    /** A drawer row: either a destination or the heading of the group under it. */
    sealed interface DrawerEntry {
        data class Link(val destination: Destination) : DrawerEntry

        data class Section(@StringRes val label: Int) : DrawerEntry
    }

    companion object {
        /**
         * Which row tab draws the current one, or null when the row does not carry it.
         *
         * The row is drawn from [TAB_DESTINATIONS] and the app has more surfaces than that, so the answer has to
         * admit "none selected". The old expression coerced a missing tab to index 0, which is the Dashboard: every
         * surface the row did not carry -- the stock history, before it became the counter's overlay -- was drawn
         * as a jump to the Dashboard while the screen under it was something else entirely.
         */
        /**
         * Qué entrada de la fila representa la visita actual.
         *
         * La pestaña sola no alcanza desde que Salida y su historial comparten `Tab.SALIDA`: con dos entradas y
         * una comparación por pestaña, abrir el historial marcaba el lanzamiento. Se compara también el overlay,
         * y una entrada sin overlay (el lanzamiento) no coincide con una visita que sí lleva uno.
         */
        /**
         * La superposición que la visita actual a Masas representa, o null cuando no es una visita al archivo.
         *
         * El archivo abre en el día de planta, así que al entrar `massasHistoryOpen` queda en false y es
         * `massasDayFromList` el que dice que la pantalla es el histórico: una regla sola para las dos formas de
         * estar en el archivo, y la fila de arriba apunta a la entrada correcta en ambas.
         */
        fun massasVisitOverlay(historyOpen: Boolean, dayFromList: Boolean): Overlay? =
            if (historyOpen || dayFromList) Overlay.MASSAS_HISTORY else null

        fun selectedTabIndex(
            tabs: List<Destination>,
            current: Tab,
            overlay: Overlay? = null,
        ): Int? = tabs
            .indexOfFirst { it.target.tab == current && it.target.overlay == overlay }
            .takeIf { it >= 0 }

        /**
         * The tab row, in the order it shows them.
         *
         * What the app *has* is this list; whether a role may see one is `RolePolicy`'s answer, asked in the shell
         * below. The histories and the two catalog surfaces are deliberately absent: they hang off the module
         * that owns them, so a row of eight stays readable on a phone.
         */
        val TAB_DESTINATIONS = listOf(
            Destination(RolePolicy.EntryPoint.DASHBOARD, R.string.nav_dashboard, R.drawable.ic_dashboard, NavTarget(Tab.DASHBOARD)),
            Destination(RolePolicy.EntryPoint.REPORTS, R.string.nav_reports, R.drawable.ic_reports, NavTarget(Tab.REPORTS)),
            Destination(RolePolicy.EntryPoint.LOADING, R.string.nav_loading, R.drawable.ic_truck, NavTarget(Tab.LOADING)),
            Destination(RolePolicy.EntryPoint.MASSAS_LAUNCH, R.string.massas_title, R.drawable.ic_layers, NavTarget(Tab.MASSAS_LAUNCH)),
            // El archivo de Masas, junto al lanzamiento: la web los tiene en ese orden y el histórico es una
            // pantalla de uso diario, no una entrada escondida en el cajón. Comparte pestaña con el lanzamiento,
            // así que la fila se resuelve por pestaña **y** overlay, como Salida y su historial.
            Destination(
                RolePolicy.EntryPoint.MASSAS_HISTORY,
                R.string.massas_history_title,
                R.drawable.ic_history,
                NavTarget(Tab.MASSAS_LAUNCH, Overlay.MASSAS_HISTORY),
            ),
            // Salida y su historial viven en la barra: la web los tiene en el mismo orden, y una pantalla que sólo
            // existe en el cajón es una pantalla que la mitad de la planta no encuentra. Comparten pestaña, así que
            // la fila se resuelve por pestaña **y** overlay.
            Destination(RolePolicy.EntryPoint.SALIDA, R.string.nav_salida, R.drawable.ic_package_minus, NavTarget(Tab.SALIDA)),
            Destination(
                RolePolicy.EntryPoint.SALIDA_HISTORY,
                R.string.nav_salida_history,
                R.drawable.ic_history,
                NavTarget(Tab.SALIDA, Overlay.SALIDA_HISTORY),
            ),
            Destination(RolePolicy.EntryPoint.ASSAI_ORDER, R.string.nav_assai, R.drawable.ic_calculator, NavTarget(Tab.ASSAI)),
            Destination(RolePolicy.EntryPoint.STOCK_COUNTER, R.string.nav_stock_counter, R.drawable.ic_boxes, NavTarget(Tab.STOCK_COUNTER)),
            Destination(RolePolicy.EntryPoint.ADMIN_PANEL, R.string.admin_panel_title, R.drawable.ic_admin, NavTarget(Tab.ADMIN)),
            Destination(RolePolicy.EntryPoint.SHARE_APP, R.string.nav_share, R.drawable.ic_share, NavTarget(Tab.SHARE)),
        )

        /**
         * The drawer, in the web application's order and with its icons.
         *
         * The drawer is the directory and the row is the shortcut bar: this is where every surface appears,
         * including the four histories the row no longer carries. The role filter runs over the links, and a
         * section heading whose links all filtered out disappears with them -- which is how a worker gets
         * `Painel Admin` without an empty `Administração` group above nothing.
         */
        val DRAWER_ENTRIES = listOf(
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.DASHBOARD, R.string.nav_dashboard, R.drawable.ic_dashboard, NavTarget(Tab.DASHBOARD))),
            DrawerEntry.Section(R.string.nav_section_operations),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.REPORTS, R.string.nav_reports, R.drawable.ic_reports, NavTarget(Tab.REPORTS))),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.LOADING, R.string.nav_loading, R.drawable.ic_truck, NavTarget(Tab.LOADING))),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.MASSAS_LAUNCH, R.string.massas_title, R.drawable.ic_layers, NavTarget(Tab.MASSAS_LAUNCH))),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.SALIDA, R.string.nav_salida, R.drawable.ic_package_minus, NavTarget(Tab.SALIDA))),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.ASSAI_ORDER, R.string.nav_assai, R.drawable.ic_calculator, NavTarget(Tab.ASSAI))),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.STOCK_COUNTER, R.string.nav_stock_counter, R.drawable.ic_boxes, NavTarget(Tab.STOCK_COUNTER))),
            DrawerEntry.Link(
                Destination(
                    RolePolicy.EntryPoint.MASSAS_HISTORY,
                    R.string.massas_history_title,
                    R.drawable.ic_calendar,
                    NavTarget(Tab.MASSAS_LAUNCH, Overlay.MASSAS_HISTORY),
                ),
            ),
            DrawerEntry.Link(
                Destination(
                    RolePolicy.EntryPoint.SALIDA_HISTORY,
                    R.string.nav_salida_history,
                    R.drawable.ic_history,
                    NavTarget(Tab.SALIDA, Overlay.SALIDA_HISTORY),
                ),
            ),
            DrawerEntry.Link(
                Destination(
                    RolePolicy.EntryPoint.STOCK_HISTORY,
                    R.string.nav_stock_history,
                    R.drawable.ic_archive,
                    NavTarget(Tab.STOCK_COUNTER, Overlay.STOCK_HISTORY),
                ),
            ),
            DrawerEntry.Link(
                Destination(
                    RolePolicy.EntryPoint.REPORTS,
                    R.string.history_title,
                    R.drawable.ic_file_clock,
                    NavTarget(Tab.REPORTS, Overlay.REPORTS_HISTORY),
                ),
            ),
            DrawerEntry.Link(
                Destination(
                    RolePolicy.EntryPoint.LOADING,
                    R.string.loading_history_title,
                    R.drawable.ic_history,
                    NavTarget(Tab.LOADING, Overlay.LOADING_HISTORY),
                ),
            ),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.SHARE_APP, R.string.nav_share, R.drawable.ic_share, NavTarget(Tab.SHARE))),
            DrawerEntry.Section(R.string.nav_section_administration),
            DrawerEntry.Link(Destination(RolePolicy.EntryPoint.ADMIN_PANEL, R.string.admin_panel_title, R.drawable.ic_admin, NavTarget(Tab.ADMIN))),
            DrawerEntry.Link(
                Destination(
                    RolePolicy.EntryPoint.AUDIT,
                    R.string.admin_section_audit,
                    R.drawable.ic_audit,
                    NavTarget(Tab.ADMIN, Overlay.ADMIN_AUDIT),
                ),
            ),
        )
    }

    @Inject
    lateinit var authRepository: AuthRepository

    @Inject
    lateinit var updateRepository: com.trindade.app.update.UpdateRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TrindadeTheme {
                AppRoot {
                    var signedIn by remember { mutableStateOf(authRepository.hasSession()) }
                    var updateAvailable by remember { mutableStateOf(false) }
                    var showMandatoryUpdateDialog by remember { mutableStateOf(false) }
                    var openReportTarget by remember { mutableStateOf<OpenReportTarget?>(null) }
                    var registerOpen by remember { mutableStateOf(false) }
                    var editingReportId by remember { mutableStateOf<Int?>(null) }
                    var editingScheduleId by remember { mutableStateOf<Int?>(null) }
                    var editingScheduleDay by remember { mutableStateOf<String?>(null) }
                    var loadingStale by remember { mutableStateOf(false) }
                    var profileOpen by remember { mutableStateOf(false) }
                    var historyOpen by remember { mutableStateOf(false) }
                    var loadingHistoryOpen by remember { mutableStateOf(false) }
                    var loadingShareDay by remember { mutableStateOf<String?>(null) }
                    // El día que se acaba de cerrar se comparte con Editar; el que viene del histórico, no.
                    var loadingShareSaved by remember { mutableStateOf(false) }
                    var massasHistoryOpen by remember { mutableStateOf(false) }
                    var salidaHistoryOpen by remember { mutableStateOf(false) }
                    var stockHistoryOpen by remember { mutableStateOf(false) }
                    var massasLaunchDay by remember { mutableStateOf<String?>(null) }
                    var massasDayFromHistory by remember { mutableStateOf(false) }
                    // El día se abrió desde la lista del histórico (hoy o pasado). Es lo que decide si la pantalla
                    // muestra las operaciones y el share; `massasDayFromHistory` sólo dice si es de solo lectura.
                    var massasDayFromList by remember { mutableStateOf(false) }
                    var loadingDay by remember { mutableStateOf<String?>(null) }
                    var loadingDayFromHistory by remember { mutableStateOf(false) }
                    var tab by remember { mutableStateOf(Tab.DASHBOARD) }
                    // La sección del panel que el cajón pidió abrir (Auditoria llega así). Vive acá y no en
                    // AdminPanelRoute porque el pedido nace fuera del panel: el cajón lo deja hecho y el
                    // panel lo consume una sola vez.
                    var adminRequestedSection by remember { mutableStateOf<com.trindade.app.admin.AdminSection?>(null) }
                    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
                    val role = remember(signedIn) { authRepository.sessionRole() }
                    // El nombre viaja al ERP en cada documento: se guarda con la sesión, como el rol.
                    val sessionUsername = remember(signedIn) { authRepository.sessionUsername() }
                    val sessionKey = remember(signedIn) { authRepository.sessionGeneration.toString() }
                    val sessionScope = rememberCoroutineScope()
                    val lifecycleOwner = LocalLifecycleOwner.current

                    val checkAppUpdate: suspend () -> Unit = {
                        if (signedIn) {
                            val release = updateRepository.latestRelease()
                            if (release != null) {
                                val availability = com.trindade.app.update.UpdateDetector.checkUpdate(
                                    release = release,
                                    currentVersionName = com.trindade.app.BuildConfig.APP_VERSION_NAME,
                                    currentBuildTimeMillis = com.trindade.app.BuildConfig.BUILD_TIME,
                                    installedSizeBytes = com.trindade.app.update.InstalledAppInfo.getInstalledApkSize(this@MainActivity),
                                    currentBuildNumber = com.trindade.app.BuildConfig.APP_VERSION_CODE,
                                )
                                updateAvailable = availability.isUpdateAvailable
                                if (availability.isUpdateAvailable) {
                                    showMandatoryUpdateDialog = true
                                }
                            }
                        }
                    }

                    LaunchedEffect(signedIn) {
                        checkAppUpdate()
                    }

                    DisposableEffect(lifecycleOwner, signedIn) {
                        val observer = LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_RESUME && signedIn) {
                                sessionScope.launch {
                                    checkAppUpdate()
                                }
                            }
                        }
                        lifecycleOwner.lifecycle.addObserver(observer)
                        onDispose {
                            lifecycleOwner.lifecycle.removeObserver(observer)
                        }
                    }
                    // Para cerrar la sesión de verdad al salir al login: limpiar sólo el estado de la
                    // pantalla dejaría el token vivo en el dispositivo.

                    fun endSession() {
                        profileOpen = false
                        registerOpen = false
                        openReportTarget = null
                        editingReportId = null
                        editingScheduleId = null
                        editingScheduleDay = null
                        loadingStale = false
                        historyOpen = false
                        loadingHistoryOpen = false
                        loadingShareDay = null
                        loadingShareSaved = false
                        massasHistoryOpen = false
                        salidaHistoryOpen = false
                        stockHistoryOpen = false
                        massasLaunchDay = null
                        massasDayFromHistory = false
                        massasDayFromList = false
                        loadingDay = null
                        loadingDayFromHistory = false
                        adminRequestedSection = null
                        tab = Tab.DASHBOARD
                        signedIn = false
                        updateAvailable = false
                        showMandatoryUpdateDialog = false
                    }

                    val onBackReportEdit = { editingReportId = null }
                    val onBackLoadingEdit = {
                        editingScheduleId = null
                        editingScheduleDay = null
                    }
                    val onBackReportDetail = { openReportTarget = null }
                    val onBackProfile = { profileOpen = false }
                    val onBackReportsHistory = { historyOpen = false }
                    val onBackLoadingHistory = { loadingHistoryOpen = false }
                    val onBackLoadingDay = {
                        loadingDay = null
                        if (loadingDayFromHistory) {
                            loadingDayFromHistory = false
                            loadingHistoryOpen = true
                        } else {
                            tab = Tab.DASHBOARD
                        }
                    }
                    val onBackLoadingTab = { tab = Tab.DASHBOARD }
                    val onBackAssaiTab = { tab = Tab.DASHBOARD }
                    val onBackShareTab = { tab = Tab.DASHBOARD }
                    // El Historial de Masas abre en HOY con todas sus operaciones, como la web; el archivo de
                    // fechas (Hoy + cinco + todas) queda detrás del Volver. Entrar a una lista de días para
                    // después buscar el de hoy era un rodeo.
                    val openMassasHistory = {
                        tab = Tab.MASSAS_LAUNCH
                        massasHistoryOpen = false
                        massasLaunchDay = com.trindade.app.massas.MassasLaunchViewModel.saopauloToday()
                        massasDayFromList = true
                        massasDayFromHistory = false
                    }
                    val onBackMassasLaunchTab = {
                        // Cualquier día abierto desde el historial vuelve al historial —la lista de fechas—, no al
                        // lanzamiento: hoy también, que era el caso que caía en el Dashboard.
                        if (massasDayFromList) {
                            massasDayFromList = false
                            massasDayFromHistory = false
                            massasLaunchDay = null
                            massasHistoryOpen = true
                        } else {
                            tab = Tab.DASHBOARD
                        }
                    }
                    // Una entrada de la navegación es su destino entero, y la fila de arriba y el cajón abren por
                    // el mismo camino: un histórico no puede quedar tapado por su módulo, ni abrirse el
                    // lanzamiento en su lugar. Salir de toda superposición antes de pintar el destino nuevo es
                    // parte de lo mismo: una que sobreviviera a su visita taparía la pantalla que se pidió.
                    val openDestination: (Destination) -> Unit = { entry ->
                        val target = entry.target
                        massasHistoryOpen = false
                        historyOpen = false
                        loadingHistoryOpen = false
                        stockHistoryOpen = false
                        salidaHistoryOpen = false
                        adminRequestedSection = null
                        if (target.tab != Tab.LOADING) {
                            loadingDay = null
                            loadingDayFromHistory = false
                        }
                        if (target.tab != Tab.MASSAS_LAUNCH) {
                            massasLaunchDay = null
                            massasDayFromHistory = false
                        }
                        // La entrada de Lanzamiento y la del archivo comparten pestaña: lo que las separa es
                        // `massasDayFromList`, y una visita al lanzamiento tiene que soltarlo. Si no, tocar
                        // «Lançamento de Massas» desde un día del archivo volvía a dibujar ese mismo día.
                        if (target.overlay != Overlay.MASSAS_HISTORY) {
                            massasDayFromList = false
                            if (target.tab == Tab.MASSAS_LAUNCH) massasLaunchDay = null
                        }
                        when (target.overlay) {
                            Overlay.MASSAS_HISTORY -> openMassasHistory()
                            Overlay.REPORTS_HISTORY -> historyOpen = true
                            Overlay.LOADING_HISTORY -> loadingHistoryOpen = true
                            Overlay.STOCK_HISTORY -> stockHistoryOpen = true
                            Overlay.SALIDA_HISTORY -> salidaHistoryOpen = true
                            Overlay.ADMIN_AUDIT -> adminRequestedSection =
                                com.trindade.app.admin.AdminSection.AUDIT
                            null -> Unit
                        }
                        tab = target.tab
                    }
                    val onBackReportsTab = { tab = Tab.DASHBOARD }
                    val onBackAdminTab = { tab = Tab.DASHBOARD }
                    val onBackRegister = { registerOpen = false }

                    when {
                        !signedIn && registerOpen -> {
                            BackHandler(onBack = onBackRegister)
                            RegisterRoute(
                                onBackToLogin = onBackRegister,
                            )
                        }
                        !signedIn -> LoginRoute(
                            onSignedIn = { signedIn = true },
                            onNavigateToRegister = { registerOpen = true },
                        )
                        updateAvailable -> {
                            BackHandler(enabled = true) {
                                showMandatoryUpdateDialog = true
                            }
                            ProfileRoute(
                                onBack = { showMandatoryUpdateDialog = true },
                                onSignedOut = { endSession() },
                                isMandatoryUpdate = true,
                            )
                        }
                        editingReportId != null -> {
                            BackHandler(onBack = onBackReportEdit)
                            ReportEditRoute(
                                reportId = editingReportId!!,
                                onBack = onBackReportEdit,
                                onSaved = onBackReportEdit,
                            )
                        }
                        editingScheduleId != null -> {
                            BackHandler(onBack = onBackLoadingEdit)
                            LoadingEditRoute(
                                scheduleId = editingScheduleId!!,
                                date = editingScheduleDay!!,
                                sessionKey = sessionKey,
                                onBack = onBackLoadingEdit,
                                onSaved = {
                                    onBackLoadingEdit()
                                    loadingStale = true
                                },
                            )
                        }
                        openReportTarget != null -> {
                            BackHandler(onBack = onBackReportDetail)
                            ReportDetailRoute(
                                reportId = openReportTarget!!.id,
                                mode = openReportTarget!!.mode,
                                onEdit = {
                                    val targetId = openReportTarget!!.id
                                    if (openReportTarget!!.mode == ShareCardMode.SAVED) {
                                        openReportTarget = null
                                    }
                                    editingReportId = targetId
                                },
                                onBack = onBackReportDetail,
                            )
                        }
                        loadingShareDay != null -> {
                            // La vista de compartir tiene dos orígenes y por eso dos salidas: el día que se
                            // acaba de cerrar vuelve a su grilla, mientras que el que se abrió desde el
                            // histórico vuelve al histórico. Editar, en cambio, lleva a la grilla del día en los
                            // dos casos: es donde el día se corrige, y si el botón se dibuja lo decide la
                            // tarjeta -- hoy y con el lote activo, nunca en el pasado.
                            val openLoadingEditor = { day: String ->
                                loadingShareDay = null
                                loadingShareSaved = false
                                loadingDay = day
                                loadingDayFromHistory = false
                                tab = Tab.LOADING
                            }
                            val closeLoadingShare = {
                                loadingShareDay = null
                                if (loadingShareSaved) {
                                    loadingShareSaved = false
                                } else {
                                    loadingHistoryOpen = true
                                }
                            }
                            BackHandler(onBack = closeLoadingShare)
                            LoadingShareRoute(
                                date = loadingShareDay!!,
                                onBack = closeLoadingShare,
                                mode = if (loadingShareSaved) ShareCardMode.SAVED else ShareCardMode.FROM_HISTORY,
                                onEdit = { openLoadingEditor(loadingShareDay!!) },
                            )
                        }
                        profileOpen -> {
                            BackHandler(onBack = onBackProfile)
                            ProfileRoute(
                                onBack = onBackProfile,
                                onSignedOut = { endSession() },
                            )
                        }
                        historyOpen -> {
                            BackHandler(onBack = onBackReportsHistory)
                            ReportsHistoryRoute(
                                onBack = onBackReportsHistory,
                                onOpenReport = { openReportTarget = OpenReportTarget(it, ShareCardMode.FROM_HISTORY) },
                            )
                        }
                        loadingHistoryOpen -> {
                            BackHandler(onBack = onBackLoadingHistory)
                            LoadingHistoryRoute(
                                onBack = onBackLoadingHistory,
                                onOpenDay = { date ->
                                    loadingHistoryOpen = false
                                    loadingShareDay = date
                                },
                            )
                        }
                        massasHistoryOpen -> {
                            // El atrás físico del archivo vuelve al día que se estaba leyendo; el camino visible
                            // es la barra superior, porque el «Voltar» duplicado se retiró.
                            val onBackMassasHistory = { massasHistoryOpen = false }
                            BackHandler(onBack = onBackMassasHistory)
                            val historyViewModel: com.trindade.app.massas.MassasHistoryViewModel = hiltViewModel()
                            com.trindade.app.massas.MassasHistoryScreen(
                                viewModel = historyViewModel,
                                onSelectDate = { date ->
                                    massasHistoryOpen = false
                                    massasLaunchDay = date
                                    val isToday = date == com.trindade.app.massas.MassasLaunchViewModel.saopauloToday()
                                    massasDayFromHistory = !isToday
                                    massasDayFromList = true
                                    tab = Tab.MASSAS_LAUNCH
                                },
                            )
                        }
                        loadingDay != null -> {
                            BackHandler(onBack = onBackLoadingDay)
                            LoadingRoute(
                                onBack = onBackLoadingDay,
                                onOpenHistory = {
                                    loadingDay = null
                                    loadingDayFromHistory = false
                                    loadingHistoryOpen = true
                                },
                                // Salvar Horario abre la vista de compartir del día, que es donde viven Compartir,
                                // el PDF, Editar y los fleteros. El día ya está guardado fila por fila: esta acción
                                // no escribe, y por eso no hay aquí una llamada de escritura que pueda fallar.
                                onSaveDay = { day ->
                                    loadingShareSaved = true
                                    loadingShareDay = day
                                },
                                onEditEntry = { id, day ->
                                    editingScheduleId = id
                                    editingScheduleDay = day
                                },
                                stale = loadingStale,
                                onStaleRead = { loadingStale = false },
                                date = loadingDay!!,
                            )
                        }
                        else -> MainAppShell(
                            role = role,
                            currentTab = tab,
                            currentOverlay = when {
                                // El archivo se abre en el día de planta, así que `massasHistoryOpen` queda en
                                // false mientras se lee un día del archivo: sin `massasDayFromList` la fila
                                // seguía marcando Lanzamiento sobre una pantalla que ya era el histórico.
                                massasVisitOverlay(massasHistoryOpen, massasDayFromList) != null ->
                                    Overlay.MASSAS_HISTORY
                                historyOpen -> Overlay.REPORTS_HISTORY
                                loadingHistoryOpen -> Overlay.LOADING_HISTORY
                                stockHistoryOpen -> Overlay.STOCK_HISTORY
                                salidaHistoryOpen -> Overlay.SALIDA_HISTORY
                                else -> null
                            },
                            onSelectTab = { tab = it },
                            onOpenProfile = { profileOpen = true },
                            onGoToLogin = {
                                // El aviso manda al login y la sesión se cierra de verdad: endSession limpia
                                // el estado de la pantalla y el repositorio borra el token del dispositivo, que
                                // es lo que el botón promete.
                                endSession()
                                sessionScope.launch { authRepository.logout() }
                            },
                            updateAvailable = updateAvailable,
                            tabDestinations = TAB_DESTINATIONS,
                            drawerEntries = DRAWER_ENTRIES,
                            onSelectDestination = openDestination,
                            onSelectDrawerEntry = openDestination,
                            drawerState = drawerState,
                        ) {
                            when (tab) {
                                Tab.ASSAI -> {
                                    BackHandler(enabled = !drawerState.isOpen, onBack = onBackAssaiTab)
                                    AssaiCalculatorScreen()
                                }
                                Tab.SALIDA -> {
                                    // El atrás físico cierra el archivo antes de salir del módulo: la pantalla ya
                                    // no dibuja un «Voltar», y sin esto el único gesto de vuelta sería irse a
                                    // otra pestaña.
                                    BackHandler(enabled = !drawerState.isOpen) {
                                        if (salidaHistoryOpen) salidaHistoryOpen = false else tab = Tab.DASHBOARD
                                    }
                                    val salidaViewModel: com.trindade.app.salida.SalidaViewModel = hiltViewModel()
                                    if (salidaHistoryOpen) {
                                        com.trindade.app.salida.SalidaHistoryScreen(
                                            viewModel = salidaViewModel,
                                            // El día vacío de hoy ofrece lanzar la primera baja: vuelve a la
                                            // pantalla de lanzamiento, no al tablero.
                                            onLaunch = { salidaHistoryOpen = false },
                                        )
                                    } else {
                                        com.trindade.app.salida.SalidaLaunchScreen(
                                            viewModel = salidaViewModel,
                                            username = sessionUsername,
                                            onOpenHistory = { salidaHistoryOpen = true },
                                        )
                                    }
                                }
                                Tab.SHARE -> {
                                    BackHandler(enabled = !drawerState.isOpen, onBack = onBackShareTab)
                                    ShareAppScreen()
                                }
                                Tab.MASSAS_LAUNCH -> {
                                    BackHandler(enabled = !drawerState.isOpen, onBack = onBackMassasLaunchTab)
                                    val massasViewModel: com.trindade.app.massas.MassasLaunchViewModel = hiltViewModel()
                                    // Las fechas rápidas del día abierto del historial salen del archivo del
                                    // servidor -- `/massas-launch/history` -- y no de un calendario local, igual que
                                    // en la web. La vista de día comparte el ViewModel del historial, así que la
                                    // lectura es la misma que la lista reusa al volver: una sola, no dos.
                                    val massasHistoryDates: List<String> = if (massasDayFromList) {
                                        val historyViewModel: com.trindade.app.massas.MassasHistoryViewModel =
                                            hiltViewModel()
                                        val historyState by historyViewModel.state.collectAsState()
                                        historyState.days.map { it.date }
                                    } else {
                                        emptyList()
                                    }
                                    LaunchedEffect(massasLaunchDay) {
                                        if (massasLaunchDay != null) {
                                            massasViewModel.loadDay(massasLaunchDay!!)
                                        } else {
                                            massasViewModel.loadDay(com.trindade.app.massas.MassasLaunchViewModel.saopauloToday())
                                        }
                                    }
                                    com.trindade.app.massas.MassasLaunchScreen(
                                        viewModel = massasViewModel,
                                        onNavigateToHistory = { openMassasHistory() },
                                        onBackToHistory = if (massasDayFromList) onBackMassasLaunchTab else null,
                                        // Hoy abierto desde el histórico también muestra operaciones y share; el
                                        // pasado es exactamente lo mismo, en modo de solo lectura.
                                        origin = if (massasDayFromList) {
                                            com.trindade.app.massas.MassasOrigin.HISTORY
                                        } else {
                                            com.trindade.app.massas.MassasOrigin.LAUNCH
                                        },
                                        // Las fechas rápidas del día abierto del historial: el día sigue viviendo en
                                        // este estado, así que el que el operario eligió sobrevive a salir de la
                                        // pestaña y volver, y el atrás físico del teléfono ve el día correcto.
                                        onSelectDay = { date ->
                                            massasLaunchDay = date
                                            massasDayFromList = true
                                            massasDayFromHistory =
                                                date != com.trindade.app.massas.MassasLaunchViewModel.saopauloToday()
                                        },
                                        historyDates = massasHistoryDates,
                                    )
                                }
                                // O histórico mostra o que o dia produziu; a correção acontece na
                                // calculadora, que é onde a contagem é feita. É uma superfície do módulo, não
                                // uma pestaña: a fila continua apontando para a calculadora enquanto se lê um
                                // dia passado, como já fazem os históricos de massas, relatório e horário.
                                Tab.STOCK_COUNTER -> {
                                    val stockHistoryOn = stockHistoryOpen
                                    val onBackStockHistory = { stockHistoryOpen = false }
                                    if (stockHistoryOn) {
                                        BackHandler(enabled = !drawerState.isOpen, onBack = onBackStockHistory)
                                        StockHistoryScreen(onBack = onBackStockHistory)
                                    } else {
                                        BackHandler(enabled = !drawerState.isOpen) { tab = Tab.DASHBOARD }
                                        StockCalculatorScreen(
                                            role = role,
                                            onOpenHistory = { stockHistoryOpen = true },
                                        )
                                    }
                                }
                                Tab.DASHBOARD -> DashboardRoute(
                                    sessionKey = sessionKey,
                                    onOpenReport = { openReportTarget = OpenReportTarget(it, mode = null) },
                                    // La tarjeta abre la tarjeta de compartir del último reporte; Editar lleva al
                                    // editor, y el permiso ya lo decidió el servidor en el resumen.
                                    onOpenReportShare = {
                                        openReportTarget = OpenReportTarget(it, mode = ShareCardMode.SAVED)
                                    },
                                    onEditLatestReport = { editingReportId = it },
                                    // El lote activo abre su ShareCard en modo día, con Editar que vuelve a la grilla.
                                    onOpenScheduleShare = { day ->
                                        loadingShareSaved = true
                                        loadingShareDay = day
                                    },
                                    onEditActiveSchedule = { day ->
                                        loadingShareSaved = false
                                        loadingShareDay = null
                                        loadingDay = day
                                        tab = Tab.LOADING
                                    },
                                    onOpenReports = { tab = Tab.REPORTS },
                                    onOpenLoading = { tab = Tab.LOADING },
                                    // A day that is not today's is opened as the day it is, which is the
                                    // same screen the loading history uses for the same purpose.
                                    onOpenLoadingDay = { day ->
                                        loadingDay = day
                                        loadingDayFromHistory = false
                                        tab = Tab.LOADING
                                    },
                                    // Las tres calculadoras ya son pestañas: el acceso directo solo cambia de
                                    // pestaña, igual que el menú.
                                    onOpenStock = { tab = Tab.STOCK_COUNTER },
                                    onOpenAssai = { tab = Tab.ASSAI },
                                    onOpenShare = { tab = Tab.SHARE },
                                    onOpenMassas = {
                                        tab = Tab.MASSAS_LAUNCH
                                        massasHistoryOpen = false
                                        massasLaunchDay = null
                                        massasDayFromHistory = false
                                        massasDayFromList = false
                                    },
                                    // La tarjeta del dashboard entra por el mismo camino que el cajón: hoy con
                                    // origen historial, sin grilla de lanzamiento.
                                    onOpenMassasHistory = { openMassasHistory() },
                                    // La séptima tarjeta entra por el mismo camino que el cajón: la pestaña
                                    // ya existe y la tarjeta solo decide si abre el lanzamiento o el
                                    // histórico, que son las dos puertas de `Tab.SALIDA`.
                                    onOpenSalida = {
                                        tab = Tab.SALIDA
                                        salidaHistoryOpen = false
                                    },
                                    onOpenSalidaHistory = {
                                        tab = Tab.SALIDA
                                        salidaHistoryOpen = true
                                    },
                                )
                                Tab.REPORTS -> {
                                    BackHandler(enabled = !drawerState.isOpen, onBack = onBackReportsTab)
                                    ReportGeneratorRoute(
                                        onCreated = { openReportTarget = OpenReportTarget(it, mode = ShareCardMode.SAVED) },
                                        onOpenHistory = { historyOpen = true },
                                    )
                                }
                                Tab.LOADING -> {
                                    BackHandler(enabled = !drawerState.isOpen, onBack = onBackLoadingTab)
                                    LoadingRoute(
                                        onBack = onBackLoadingTab,
                                        onOpenHistory = { loadingHistoryOpen = true },
                                        onEditEntry = { id, day ->
                                            editingScheduleId = id
                                            editingScheduleDay = day
                                        },
                                        stale = loadingStale,
                                        onStaleRead = { loadingStale = false },
                                    )
                                }
                                Tab.ADMIN -> {
                                    BackHandler(enabled = !drawerState.isOpen, onBack = onBackAdminTab)
                                    AdminPanelRoute(
                                        sessionKey = sessionKey,
                                        onBack = onBackAdminTab,
                                        openSection = adminRequestedSection,
                                        onOpenSectionHandled = { adminRequestedSection = null },
                                    )
                                }
                            }
                        }
                    }

                    if (updateAvailable && showMandatoryUpdateDialog) {
                        AlertDialog(
                            onDismissRequest = { /* Bloqueo obligatorio: tocar fuera no descarta */ },
                            title = {
                                Text(
                                    text = stringResource(R.string.mandatory_update_title),
                                    fontWeight = FontWeight.Bold,
                                )
                            },
                            text = {
                                Text(
                                    text = stringResource(R.string.mandatory_update_message),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            },
                            confirmButton = {
                                Button(
                                    onClick = { showMandatoryUpdateDialog = false },
                                ) {
                                    Text(
                                        text = stringResource(R.string.mandatory_update_action),
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

/**
 * The top-level root container wrapping all application destinations (both signed-in destinations and login).
 *
 * Edge-to-edge display ([ComponentActivity.enableEdgeToEdge]) renders window contents behind system bars.
 * Applying [safeDrawingPadding] exactly once at this single application root ensures that all screens
 * (including login, profile, report forms, histories, and top-level tab destinations) are inset away
 * from the status bar, display cutout (camera hole punch on devices like Pixel 8), and navigation bar /
 * gesture area, while preventing double-insets on nested screens and avoiding clipping of bottom actions.
 */
@Composable
fun AppRoot(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding(),
        ) {
            content()
        }
    }
}

/**
 * The persistent top-level app shell for signed-in operators.
 *
 * Stateless and Hilt-free so the Compose test lane can render it directly with a synthetic role and
 * verify tab indicator semantics, header actions, and role-based destination filtering without an
 * activity or dependency container.
 *
 * The shell keeps the branded header with the menu and profile actions at the top, followed by an active
 * Material3 [PrimaryScrollableTabRow] showing the destinations permitted for [role] by [RolePolicy] and a
 * drawer listing every surface the role may open, and renders [content] in the remaining body space.
 */
@Composable
fun MainAppShell(
    role: String?,
    currentTab: MainActivity.Tab,
    onSelectTab: (MainActivity.Tab) -> Unit,
    /**
     * A dónde lleva una entrada de la fila, entera.
     *
     * La pestaña sola no identifica una entrada: Masas y su histórico comparten `Tab.MASSAS_LAUNCH`, y Salida y
     * el suyo comparten `Tab.SALIDA`. Con el callback viejo -- la pestaña -- tocar el histórico abría el
     * lanzamiento y dejaba dos entradas encendidas. El default conserva a las pruebas que sólo miran la fila.
     */
    onSelectDestination: (MainActivity.Destination) -> Unit = { onSelectTab(it.target.tab) },
    onOpenProfile: () -> Unit,
    // El aviso del invitado ofrece ir al login, y el login vive en MainActivity, no acá: el callback
    // entra por parámetro. Con default para que las pruebas del armazón no tengan que saber de sesiones.
    onGoToLogin: () -> Unit = {},
    updateAvailable: Boolean = false,
    modifier: Modifier = Modifier,
    // La superposición que ocupa la pantalla, si hay una: sin esto el cajón marcaría como elegido el
    // módulo padre del histórico que se está leyendo, y dos filas quedarían encendidas a la vez.
    currentOverlay: MainActivity.Overlay? = null,
    tabDestinations: List<MainActivity.Destination> = MainActivity.TAB_DESTINATIONS,
    drawerEntries: List<MainActivity.DrawerEntry> = MainActivity.DRAWER_ENTRIES,
    // El cajón llega a superficies que no son pestañas -- tres históricos y la auditoría --, así que el
    // armazón avisa el destino entero y deja a la actividad decidir cómo se abre. El default sirve a las
    // pruebas que sólo quieren ver la fila moverse.
    onSelectDrawerEntry: (MainActivity.Destination) -> Unit = { onSelectTab(it.target.tab) },
    drawerState: DrawerState = rememberDrawerState(initialValue = DrawerValue.Closed),
    content: @Composable () -> Unit,
) {
    // El aviso del invitado, en un solo lugar: puede intentar una mutación desde cualquier pantalla,
    // así que el rechazo no puede depender de que cada pantalla se acuerde de mostrarlo. Se atienden
    // los dos momentos -- el aviso que llega en vivo y el que esperó a que esto se montara -- porque
    // un rechazo ocurrido durante el arranque no puede perderse en silencio.
    var guestReadonlyNotice by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        guestReadonlyNotice = GuestReadonlyNotice.takePending()
        GuestReadonlyNotice.messages.collect { guestReadonlyNotice = it }
    }
    guestReadonlyNotice?.let { message ->
        AlertDialog(
            onDismissRequest = { guestReadonlyNotice = null },
            // El candado en el color primario: el aviso se lee de un vistazo, sin depender del texto.
            icon = {
                Icon(
                    // painterResource y no Icons.Filled.Lock: el proyecto no depende de
                    // material-icons, y sumar una librería entera por un candado sería pagar para
                    // siempre por un adorno. El vector vive en res/drawable/ic_lock.xml.
                    painter = painterResource(R.drawable.ic_lock),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp),
                )
            },
            title = {
                Text(
                    text = stringResource(R.string.guest_readonly_title),
                    style = MaterialTheme.typography.titleLarge,
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = stringResource(R.string.guest_readonly_intro),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    // El mensaje es el del servidor, sin traducir: es el literal de la directiva y una
                    // sola cadena para los dos lados. Va en su propio contenedor suave, como en la web.
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { guestReadonlyNotice = null }) {
                    Text(stringResource(R.string.guest_readonly_dismiss))
                }
            },
            // El secundario lleva al login: limpia el aviso antes de salir, si no reaparecería al llegar.
            dismissButton = {
                TextButton(
                    onClick = {
                        guestReadonlyNotice = null
                        onGoToLogin()
                    },
                ) {
                    Text(stringResource(R.string.guest_readonly_go_to_login))
                }
            },
        )
    }

    val visibleTabs = remember(role, tabDestinations) {
        val allowed = RolePolicy.visibleEntryPoints(role)
        tabDestinations.filter { it.entryPoint in allowed }
    }
    val visibleDrawer = remember(role, drawerEntries) {
        val allowed = RolePolicy.visibleEntryPoints(role)
        val shown = mutableListOf<MainActivity.DrawerEntry>()
        // Un encabezado se dibuja sólo si alguna fila lo sigue: el filtro por rol puede vaciar un grupo
        // entero, y un título sobre nada es una promesa que la pantalla no cumple.
        var pendingSection: MainActivity.DrawerEntry.Section? = null
        drawerEntries.forEach { entry ->
            when (entry) {
                is MainActivity.DrawerEntry.Section -> pendingSection = entry
                is MainActivity.DrawerEntry.Link -> if (entry.destination.entryPoint in allowed) {
                    pendingSection?.let {
                        shown += it
                        pendingSection = null
                    }
                    shown += entry
                }
            }
        }
        shown
    }
    val selectedIndex = MainActivity.selectedTabIndex(visibleTabs, currentTab, currentOverlay)
    val activeTarget = MainActivity.NavTarget(currentTab, currentOverlay)
    val scope = rememberCoroutineScope()

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.widthIn(min = 320.dp, max = 320.dp),
            ) {
                if (drawerState.isOpen || drawerState.isAnimationRunning) {
                    Column(
                        modifier = Modifier
                            .testTag("navigation_drawer_sheet")
                            .verticalScroll(rememberScrollState())
                            .padding(vertical = 12.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.nav_brand_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 16.dp),
                        )
                        visibleDrawer.forEach { entry ->
                            when (entry) {
                                is MainActivity.DrawerEntry.Section -> Text(
                                    text = stringResource(entry.label),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(start = 28.dp, top = 16.dp, bottom = 8.dp),
                                )
                                is MainActivity.DrawerEntry.Link -> {
                                    val destination = entry.destination
                                    NavigationDrawerItem(
                                        label = {
                                            Text(
                                                text = stringResource(destination.label),
                                                style = MaterialTheme.typography.labelLarge,
                                            )
                                        },
                                        icon = {
                                            Icon(
                                                painter = painterResource(destination.icon),
                                                contentDescription = null,
                                                modifier = Modifier.size(24.dp),
                                            )
                                        },
                                        selected = destination.target == activeTarget,
                                        onClick = {
                                            onSelectDrawerEntry(destination)
                                            scope.launch { drawerState.close() }
                                        },
                                        modifier = Modifier
                                            .padding(NavigationDrawerItemDefaults.ItemPadding)
                                            .defaultMinSize(minHeight = 48.dp),
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                        // El credito va al pie del cajon desplegable: ahi no estorba a ninguna pantalla y no hay
                        // tres copias que puedan quedar viejas por separado.
                        DeveloperCredit()
                    }
                }
            }
        },
        modifier = modifier,
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(
                            onClick = { scope.launch { drawerState.open() } },
                            modifier = Modifier
                                .testTag("header_menu_button")
                                .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.ic_menu),
                                contentDescription = stringResource(R.string.nav_menu),
                                modifier = Modifier.size(24.dp),
                            )
                        }
                        Text(
                            text = stringResource(R.string.nav_brand_title),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .padding(horizontal = 8.dp),
                        )
                        IconButton(
                            onClick = onOpenProfile,
                            modifier = Modifier
                                .testTag("header_profile_button")
                                .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                        ) {
                            Box {
                                Icon(
                                    painter = painterResource(R.drawable.ic_profile),
                                    contentDescription = stringResource(R.string.profile_title),
                                    modifier = Modifier.size(24.dp),
                                )
                                // El punto de la actualización disponible: el perfil es donde se descarga,
                                // y el ícono lo avisa sin agregar una palabra al encabezado.
                                if (updateAvailable) {
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .size(8.dp)
                                            .background(MaterialTheme.colorScheme.error, CircleShape),
                                    )
                                }
                            }
                        }
                    }

                    if (visibleTabs.isNotEmpty()) {
                        PrimaryScrollableTabRow(
                            selectedTabIndex = selectedIndex ?: 0,
                            modifier = Modifier.fillMaxWidth(),
                            edgePadding = 0.dp,
                            minTabWidth = 120.dp,
                            containerColor = MaterialTheme.colorScheme.surface,
                            contentColor = MaterialTheme.colorScheme.primary,
                        ) {
                            visibleTabs.forEach { destination ->
                                val isActive = destination.target == activeTarget
                                Tab(
                                    selected = isActive,
                                    onClick = { onSelectDestination(destination) },
                                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                                    text = {
                                        Text(
                                            text = stringResource(destination.label),
                                            maxLines = 1,
                                            style = if (isActive) {
                                                MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)
                                            } else {
                                                MaterialTheme.typography.labelLarge
                                            },
                                            color = if (isActive) {
                                                MaterialTheme.colorScheme.primary
                                            } else {
                                                MaterialTheme.colorScheme.onSurfaceVariant
                                            },
                                        )
                                    },
                                )
                            }
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) {
                content()
            }
        }
    }

    BackHandler(enabled = drawerState.isOpen) {
        scope.launch { drawerState.close() }
    }
}
