package com.trindade.app.di

import com.trindade.app.aero.AeroAuditOutbox
import com.trindade.app.aero.AeroAuditOutboxPort
import com.trindade.app.aero.AeroDispatcher
import com.trindade.app.aero.AeroErpAdapter
import com.trindade.app.aero.AeroErpPort
import com.trindade.app.aero.AeroMirrorAdapter
import com.trindade.app.aero.AeroMirrorPort
import com.trindade.app.aero.AeroReachability
import com.trindade.app.aero.AeroReachabilityPort
import com.trindade.app.aero.AeroSettingsPort
import com.trindade.app.aero.AeroQueuePort
import com.trindade.app.aero.AeroQueueStore
import com.trindade.app.aero.AeroSettingsStore
import com.trindade.app.aero.TabletAckPort
import com.trindade.app.aero.TabletAckStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AeroModule {

    /**
     * The two ports, bound by hand instead of `@Binds`.
     *
     * The adapters are the only two classes that know both a client and a port, and building the dispatcher
     * here keeps the sequence testable: a test constructs [AeroDispatcher] with its own fakes and never needs
     * Hilt, OkHttp or a device.
     */
    @Provides
    @Singleton
    fun provideErpPort(adapter: AeroErpAdapter): AeroErpPort = adapter

    @Provides
    @Singleton
    fun provideMirrorPort(adapter: AeroMirrorAdapter): AeroMirrorPort = adapter

    @Provides
    @Singleton
    fun provideAuditOutbox(store: AeroAuditOutbox): AeroAuditOutboxPort = store

    @Provides
    @Singleton
    fun provideSettingsPort(store: AeroSettingsStore): AeroSettingsPort = store

    /**
     * La cola de lo que la planta todavía no tiene.
     *
     * Es del dispositivo y no del día: una cola por teléfono, compartida por el lote y por el reintento de una
     * fila, para que las dos puertas escriban la misma lista.
     */
    @Provides
    @Singleton
    fun provideQueuePort(store: AeroQueueStore): AeroQueuePort = store

    @Provides
    @Singleton
    fun provideTabletAckPort(store: TabletAckStore): TabletAckPort = store

    @Provides
    @Singleton
    fun provideReachabilityPort(reachability: AeroReachability): AeroReachabilityPort = reachability

    /**
     * The dispatcher, with the network gate the app runs before every trip.
     *
     * The reachability port goes in here rather than in each screen: one place asks whether this phone is on
     * the plant's network, so a launch, a day's read and a report's sync are all stopped by the same rule.
     */
    @Provides
    @Singleton
    fun provideDispatcher(
        erp: AeroErpPort,
        mirror: AeroMirrorPort,
        reachability: AeroReachabilityPort,
    ): AeroDispatcher = AeroDispatcher(erp = erp, mirror = mirror, reachability = reachability)
}
