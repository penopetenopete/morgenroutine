package de.jannes.morgenroutine;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Daueranzeige "Training läuft": erlaubt der App, mit gesperrtem Bildschirm weiterzuarbeiten. */
public class WorkoutService extends Service {
    private static final String CHANNEL = "workout";
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = WorkoutNotif.build(this);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(WorkoutNotif.ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(WorkoutNotif.ID, n);
        }
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "training:workout");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(3 * 60 * 60 * 1000L); // höchstens 3 Stunden
        }
        SpotifyCore.get(this); // native Spotify-Steuerung starten (setzt Auto-Wechsel ggf. fort)
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
