package com.lyricflow.app.startup

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import android.util.DisplayMetrics
import kotlin.math.roundToInt

/**
 * The listener's Display size (Settings → Player → Display size): the whole app drawn a little smaller or larger,
 * text, icons, spacing and the native bars together, like Android's own Display size but for LuvLyrics only.
 *
 * It works on the density the app reads. React Native keeps a reference to the context's DisplayMetrics
 * (DisplayMetricsHolder), and native views convert dp and sp from the same object, so setting density,
 * scaledDensity and densityDpi there before React starts scales everything alike. Configuration.densityDpi must
 * agree too: recreated view contexts derive their metrics from it. The Application and MainActivity apply the size
 * again before passing a configuration change on. The value is computed from the device's own density each time,
 * so applying twice changes nothing.
 */
object DisplayScale {
    private const val PREFS = "luvlyrics_display"
    private const val KEY = "scale"

    /** The sizes offered in Settings, smallest first. Anything else is snapped to the nearest one. */
    val CHOICES = floatArrayOf(0.85f, 0.92f, 1f, 1.08f)
    const val DEFAULT = 1f

    /** The nearest offered size; bad values give the default. */
    fun clamp(scale: Float): Float {
        if (scale.isNaN() || scale.isInfinite() || scale <= 0f) return DEFAULT
        return CHOICES.minByOrNull { kotlin.math.abs(it - scale) } ?: DEFAULT
    }

    /** The density the app uses for a device density and a chosen size. */
    fun scaledDensity(deviceDensity: Float, scale: Float): Float =
        scaledDpi((deviceDensity * DisplayMetrics.DENSITY_DEFAULT).roundToInt(), scale).toFloat() / DisplayMetrics.DENSITY_DEFAULT

    /** densityDpi for a device dpi and a chosen size, never below 1. */
    fun scaledDpi(deviceDpi: Int, scale: Float): Int = (deviceDpi * clamp(scale)).roundToInt().coerceAtLeast(1)

    fun read(context: Context): Float =
        clamp(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getFloat(KEY, DEFAULT))

    /** Saves the size; it takes effect when the UI is next built (MainActivity recreates itself for that). */
    fun write(context: Context, scale: Float): Float {
        val value = clamp(scale)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putFloat(KEY, value).commit()
        return value
    }

    /** A copied configuration: child view contexts must inherit the same density as React's pixel conversions. */
    fun configuration(context: Context, source: Configuration): Configuration =
        Configuration(source).apply {
            densityDpi = scaledDpi(Resources.getSystem().displayMetrics.densityDpi, read(context))
        }

    /** Updates configuration and metrics together, so a refreshed themed context cannot restore the old density. */
    @Suppress("DEPRECATION")
    fun apply(context: Context, resources: Resources = context.resources, source: Configuration = resources.configuration) {
        val config = configuration(context, source)
        val metrics = DisplayMetrics().apply {
            setTo(resources.displayMetrics)
            densityDpi = config.densityDpi
            density = config.densityDpi.toFloat() / DisplayMetrics.DENSITY_DEFAULT
            scaledDensity = density * (config.fontScale.takeIf { it > 0f } ?: 1f)
        }
        // This app intentionally changes density on its existing React host as well as the activity. A new
        // configuration context alone would leave that host's resources at the previous Display size.
        resources.updateConfiguration(config, metrics)
    }
}
