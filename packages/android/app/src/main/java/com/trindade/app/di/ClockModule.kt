package com.trindade.app.di

import android.os.SystemClock
import com.trindade.app.ui.DayClock
import com.trindade.app.ui.saoPauloLocalDate
import com.trindade.app.update.Clock
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ClockModule {

    /**
     * The system clock, bound as the interface so the update check's cache can be exercised with a fake
     * one.
     *
     * [SystemClock.elapsedRealtime] rather than [System.currentTimeMillis], and that choice is the whole of
     * what this provider has to get right. The cache measures how long ago it wrote its answer by
     * subtracting two readings, so a reading that can move *backwards* breaks it: an NTP correction or a
     * time change made by hand is enough to make the difference negative, the freshness comparison stays
     * true, the cached answer is served as fresh and the API is never asked -- which bounds the thirty
     * minutes the constant promises by the lifetime of the process instead. `elapsedRealtime` counts
     * monotonic milliseconds since boot and cannot do that. It is an Android API, which is why the binding
     * is here and not in [Clock]: the interface states the requirement, this is the implementation that
     * meets it.
     */
    @Provides
    @Singleton
    fun provideClock(): Clock = Clock { SystemClock.elapsedRealtime() }

    /**
     * Today in São Paulo, bound beside the elapsed-realtime clock and for a different question.
     *
     * The update cache asks how long ago it wrote something; the loading grid asks which day it is, and
     * that one has to be São Paulo's date whatever the phone's timezone says. Two clocks, two questions,
     * and keeping them apart is what stops a monotonic reading from being subtracted against a calendar.
     */
    @Provides
    @Singleton
    fun provideDayClock(): DayClock = DayClock { saoPauloLocalDate().toString() }
}
