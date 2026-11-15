package com.lyricflow.app.startup

import org.junit.Assert.assertEquals
import org.junit.Test

class DisplayScaleTest {
    @Test
    fun snapsToTheOfferedSizes() {
        assertEquals(0.85f, DisplayScale.clamp(0.5f))
        assertEquals(0.92f, DisplayScale.clamp(0.9f))
        assertEquals(1f, DisplayScale.clamp(1f))
        assertEquals(1.08f, DisplayScale.clamp(3f))
    }

    @Test
    fun badValuesFallBackToTheDefault() {
        assertEquals(1f, DisplayScale.clamp(Float.NaN))
        assertEquals(1f, DisplayScale.clamp(Float.POSITIVE_INFINITY))
        assertEquals(1f, DisplayScale.clamp(0f))
        assertEquals(1f, DisplayScale.clamp(-1f))
    }

    @Test
    fun scalesFromTheDeviceDensityEveryTime() {
        // A 2.0 / 320dpi emulator at the smallest size: computed from the device value, so applying twice is the same.
        assertEquals(1.7f, DisplayScale.scaledDensity(2f, 0.85f), 0.0001f)
        assertEquals(272, DisplayScale.scaledDpi(320, 0.85f))
        assertEquals(320, DisplayScale.scaledDpi(320, 1f))
        assertEquals(1, DisplayScale.scaledDpi(0, 0.85f))
    }
    @Test
    fun fractionalDeviceDensitiesUseTheSameRoundedDpiForLayoutAndDrawing() {
        // Refreshed view contexts derive their scale from configuration DPI; native mounts use metrics density.
        // A 420dpi phone on Small rounds to 386dpi; using the unrounded float produces a different coordinate space.
        assertEquals(386, DisplayScale.scaledDpi(420, 0.92f))
        assertEquals(386f / 160f, DisplayScale.scaledDensity(2.625f, 0.92f), 0.00001f)
        for (dpi in listOf(240, 280, 320, 420, 440, 480)) {
            for (scale in DisplayScale.CHOICES) {
                val layoutDensity = DisplayScale.scaledDpi(dpi, scale) / 160f
                val drawingDensity = DisplayScale.scaledDensity(dpi / 160f, scale)
                assertEquals(720f, (720f / layoutDensity) * drawingDensity, 0.001f)
                assertEquals(1600f, (1600f / layoutDensity) * drawingDensity, 0.001f)
            }
        }
    }
    @Test
    fun freshInstallDefaultKeepsTheDeviceDensity() {
        for (dpi in listOf(240, 280, 320, 420, 440, 480)) {
            assertEquals(dpi, DisplayScale.scaledDpi(dpi, DisplayScale.DEFAULT))
            assertEquals(dpi / 160f, DisplayScale.scaledDensity(dpi / 160f, DisplayScale.DEFAULT), 0.00001f)
        }
    }
}
