package com.trindade.app.di

import com.trindade.app.reports.AndroidPhotoCompressor
import com.trindade.app.reports.HttpReportPhotoFiles
import com.trindade.app.reports.ReportPhotoFiles
import com.trindade.app.reports.PhotoCompressor
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ReportsModule {

    /**
     * Bound as the interface so the scaling decision can be tested on the JVM, the same reason
     * TokenStore is one. Hilt still constructs the Android implementation, which owns the Bitmap work.
     */
    @Binds
    @Singleton
    abstract fun bindPhotoCompressor(compressor: AndroidPhotoCompressor): PhotoCompressor

    /** Las fotos del reporte que viajan con el texto: la descarga vive en Android, la costura no. */
    @Binds
    abstract fun bindReportPhotoFiles(files: HttpReportPhotoFiles): ReportPhotoFiles
}
