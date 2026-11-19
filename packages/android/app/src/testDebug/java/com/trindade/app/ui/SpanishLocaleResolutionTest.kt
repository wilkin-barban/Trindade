package com.trindade.app.ui

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.trindade.app.R
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
class SpanishLocaleResolutionTest {

    @Test
    @Config(qualifiers = "es")
    fun `spanish locale resolves strings correctly from values-es`() {
        val context: Context = ApplicationProvider.getApplicationContext()

        assertEquals("Usuario", context.getString(R.string.login_username))
        assertEquals("Contraseña", context.getString(R.string.login_password))
        assertEquals("Ingresar", context.getString(R.string.login_submit))
        assertEquals("Lanzamiento de Masas", context.getString(R.string.massas_title))
        assertEquals("Panel de Control", context.getString(R.string.nav_dashboard))
        assertEquals("Reportes", context.getString(R.string.nav_reports))
        assertEquals("Horarios", context.getString(R.string.nav_loading))
        assertEquals("Guardar reporte", context.getString(R.string.report_submit))
        assertEquals("Masa del día", context.getString(R.string.report_massas_day_title))
        assertEquals("Entendido", context.getString(R.string.help_dialog_understood))
        assertEquals("Ayuda", context.getString(R.string.help_button_label))

        // Salida y sus fotos: los textos salen de recursos en los dos idiomas, sin español escondido en la UI
        // portuguesa ni portugués escondido en la española.
        assertEquals("Salida / Baja", context.getString(R.string.salida_title))
        assertEquals("Historial de Salidas", context.getString(R.string.salida_history_title))
        assertEquals("Lanzar salida (2)", context.getString(R.string.salida_launch_with_count, 2))
        assertEquals("Lanzar salida", context.getString(R.string.salida_launch))
        assertEquals("Ninguna salida registrada hoy.", context.getString(R.string.salida_history_empty_today))
        assertEquals("Borrar foto", context.getString(R.string.salida_photo_delete))
        assertEquals("Agregar fotos", context.getString(R.string.report_photos_add))
        assertEquals("Fotos (1/3)", context.getString(R.string.report_photos_pending_count, 1, 3))

        // La calculadora es femenina y en español no lleva la palabra portuguesa.
        assertEquals("Calculadora de Stock", context.getString(R.string.nav_stock_counter))
        assertEquals("Historial de Conteo", context.getString(R.string.nav_stock_history))
        assertEquals("Salidas / Bajas", context.getString(R.string.salida_report_block))
        assertEquals(
            "3 días",
            context.resources.getQuantityString(R.plurals.salida_history_days, 3, 3),
        )

        // El mensaje de WhatsApp de Salida: las mismas etiquetas que pasa la web, y el bloque de compartir.
        assertEquals("Salidas del día", context.getString(R.string.salida_day_share_title))
        assertEquals("Movimientos", context.getString(R.string.salida_day_share_movements))
        assertEquals("Embalajes", context.getString(R.string.salida_block_embalagens))
        assertEquals("Materia Prima", context.getString(R.string.salida_block_materia_prima))
        assertEquals("Compartir por WhatsApp", context.getString(R.string.salida_share_title))
        assertEquals("Vista previa", context.getString(R.string.salida_share_preview))
        assertEquals(
            "Ninguna salida registrada en este día.",
            context.getString(R.string.salida_none_this_day),
        )

        // Format string test
        val formattedUnits = context.getString(R.string.massas_calculated_units_format, 100, 10)
        assertEquals("= 100 unidades (10 un/cx)", formattedUnits)
    }

    @Test
    @Config(qualifiers = "pt-rBR")
    fun `default or pt-BR locale resolves strings from values`() {
        val context: Context = ApplicationProvider.getApplicationContext()

        assertEquals("Usuário", context.getString(R.string.login_username))
        assertEquals("Senha", context.getString(R.string.login_password))
        assertEquals("Entrar", context.getString(R.string.login_submit))
        assertEquals("Lançamento de Massas", context.getString(R.string.massas_title))
        assertEquals("Dashboard", context.getString(R.string.nav_dashboard))
        assertEquals("Relatórios", context.getString(R.string.nav_reports))
        assertEquals("Horários", context.getString(R.string.nav_loading))
        assertEquals("Salvar relatório", context.getString(R.string.report_submit))
        assertEquals("Massa do dia", context.getString(R.string.report_massas_day_title))
        assertEquals("Entendido", context.getString(R.string.help_dialog_understood))
        assertEquals("Ajuda", context.getString(R.string.help_button_label))

        // El portugués es el idioma de la planta y de los dos locales: la UI portuguesa no puede decir
        // "Salida / Baixa" ni "Lanzar salida", y el botón cuenta productos, como la web.
        assertEquals("Saída / Baixa", context.getString(R.string.salida_title))
        assertEquals("Histórico de Saídas", context.getString(R.string.salida_history_title))
        assertEquals("Lançar saída (2)", context.getString(R.string.salida_launch_with_count, 2))
        assertEquals("Lançar saída", context.getString(R.string.salida_launch))
        assertEquals("Nenhuma saída registrada hoje.", context.getString(R.string.salida_history_empty_today))
        assertEquals("Excluir foto", context.getString(R.string.salida_photo_delete))
        assertEquals("Adicionar fotos", context.getString(R.string.report_photos_add))
        assertEquals("Fotos (1/3)", context.getString(R.string.report_photos_pending_count, 1, 3))

        assertEquals("Calculadora de Estoque", context.getString(R.string.nav_stock_counter))
        // El bloque del Relatório en la UI portuguesa dice portugués.
        assertEquals("Saídas / Baixas", context.getString(R.string.salida_report_block))
        assertEquals(
            "3 dias",
            context.resources.getQuantityString(R.plurals.salida_history_days, 3, 3),
        )

        // El portugués de la planta, tal como lo publica la web en su tabla de bloques.
        assertEquals("Saídas do dia", context.getString(R.string.salida_day_share_title))
        assertEquals("Movimentos", context.getString(R.string.salida_day_share_movements))
        assertEquals("Embalagens", context.getString(R.string.salida_block_embalagens))
        assertEquals("Matéria-Prima", context.getString(R.string.salida_block_materia_prima))
        assertEquals("Compartilhar por WhatsApp", context.getString(R.string.salida_share_title))
        assertEquals("Pré-visualização", context.getString(R.string.salida_share_preview))
        assertEquals(
            "Nenhuma saída registrada neste dia.",
            context.getString(R.string.salida_none_this_day),
        )

        // Format string test
        val formattedUnits = context.getString(R.string.massas_calculated_units_format, 100, 10)
        assertEquals("= 100 unidades (10 un/cx)", formattedUnits)
    }
}
