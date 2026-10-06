package de.jannes.morgenroutine;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrainingPlugin.class);
        super.onCreate(savedInstanceState);
        // Schrift wie in Chrome: Android-Schriftgröße nicht zusätzlich auf die Seite anwenden (sonst alles zu groß/gequetscht)
        if (bridge != null && bridge.getWebView() != null) bridge.getWebView().getSettings().setTextZoom(100);
        // Android 13+: Benachrichtigungen erlauben (Steuerung auf dem Sperrbildschirm)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7);
        // Test-Version: Dienst "Training läuft" startet mit der App und hält sie im Hintergrund wach.
        Intent i = new Intent(this, WorkoutService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    @Override
    public void onResume() {
        super.onResume();
        SpotifyCore.appVisible = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        SpotifyCore.appVisible = false;
        keepJsRunning();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepJsRunning();
    }

    // Die Web-Seite soll auch bei gesperrtem Bildschirm weiterrechnen (Timer, Spotify-Wechsel).
    private void keepJsRunning() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().onResume();
            bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onDestroy() {
        stopService(new Intent(this, WorkoutService.class));
        super.onDestroy();
    }
}
