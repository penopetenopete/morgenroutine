package de.jannes.morgenroutine;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Benachrichtigung „Training läuft“ mit Übung, Satz, laufender Uhr und Knöpfen – auch auf dem Sperrbildschirm.
 * Die App schickt den aktuellen Stand (setState) und die geplanten Phasen (setEvents). Laufen Pausen ab,
 * während die Seite schläft, schaltet die Anzeige anhand der geplanten Phasen selbst weiter.
 * Knöpfe → NotifReceiver → TrainingPlugin → Ereignis "notifAction" in der App.
 */
public final class WorkoutNotif {
    static final String CHANNEL = "workout_live";
    static final int ID = 1;
    private static final Object TOKEN = new Object();
    private static final Handler H = new Handler(Looper.getMainLooper());
    private static JSONObject state;          // aktueller Stand aus der App, null = kein Workout
    private static JSONArray events;          // geplante Phasen ab jetzt (aus plannedEvents)

    private WorkoutNotif() { }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Training läuft", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    /** Stand aus der App (null = kein Workout). */
    static synchronized void setState(Context c, JSONObject s) {
        state = s;
        H.removeCallbacksAndMessages(TOKEN);
        post(c);
        scheduleAuto(c);
    }

    static synchronized void setEvents(Context c, JSONArray ev) {
        events = ev;
        H.removeCallbacksAndMessages(TOKEN);
        scheduleAuto(c);
    }

    /** Bei jeder geplanten Phase die Anzeige selbst umstellen (falls die App gerade schläft). */
    private static void scheduleAuto(Context c) {
        if (events == null || state == null || state.optBoolean("paused")) return;
        long now = System.currentTimeMillis();
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null || !"phase".equals(e.optString("typ"))) continue;
            long at = e.optLong("at");
            if (at <= now + 300) continue;
            long end = 0;
            for (int j = i + 1; j < events.length(); j++) {
                JSONObject n = events.optJSONObject(j);
                if (n != null && "phase".equals(n.optString("typ"))) { end = n.optLong("at"); break; }
            }
            final JSONObject s = fromEvent(e, end);
            final Context app = c.getApplicationContext();
            H.postAtTime(() -> { synchronized (WorkoutNotif.class) { if (state != null && !state.optBoolean("paused")) { state = s; post(app); } } },
                    TOKEN, android.os.SystemClock.uptimeMillis() + (at - now));
        }
    }

    /** Stand aus einem geplanten Phasen-Ereignis ableiten (gleiche Texte wie in der App). */
    private static JSONObject fromEvent(JSONObject e, long end) {
        JSONObject s = new JSONObject();
        try {
            String phase = e.optString("phase"), art = e.optString("art");
            String ex = e.optString("uebung");
            int satz = e.optInt("satz", 1), saetze = e.optInt("saetze", 1);
            s.put("workout", e.optString("workout"));
            if ("done".equals(phase)) { s.put("titel", "Workout fertig"); s.put("text", "App öffnen für die Statistik"); return s; }
            if ("work".equals(phase)) {
                s.put("titel", ex);
                s.put("text", (saetze > 1 ? "Satz " + satz + "/" + saetze : "") + ("reps".equals(art) ? " · Wiederholungen" : ""));
                if ("reps".equals(art)) { s.put("start", e.optLong("at")); s.put("main", "Fertig ✓"); }
                else { if (end > 0) s.put("end", end); s.put("main", ""); }
            } else {
                String lab = "set".equals(art) ? "Satzpause" : "side".equals(art) ? "Seitenwechsel" : "umbau".equals(art) ? "Umbau" : "link".equals(art) ? "Pause" : "Nächste Übung";
                s.put("titel", lab + " · gleich: " + ex);
                s.put("text", saetze > 1 ? "Satz " + satz + "/" + saetze : "");
                if (end > 0) s.put("end", end); else s.put("start", e.optLong("at"));
                s.put("main", "next".equals(art) ? "Nächste Übung ▶" : "set".equals(art) ? "Nächster Satz" : "Weiter");
            }
        } catch (Exception ignored) { }
        return s;
    }

    static synchronized Notification build(Context c) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_media_play).setContentIntent(pi).setOngoing(true)
                .setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC).setCategory(Notification.CATEGORY_WORKOUT)
                .setShowWhen(false);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
        JSONObject s = state;
        if (s == null) {
            return b.setContentTitle("Training").setContentText("Bereit – Timer und Spotify laufen auch bei gesperrtem Bildschirm").build();
        }
        boolean paused = s.optBoolean("paused");
        String text = s.optString("text", "");
        b.setContentTitle(s.optString("titel", "Training"));
        b.setContentText(paused ? "Pausiert" + (text.isEmpty() ? "" : " · " + text) : text);
        if (!s.optString("workout").isEmpty()) b.setSubText(s.optString("workout"));
        long end = s.optLong("end", 0), start = s.optLong("start", 0);
        if (!paused && (end > 0 || start > 0)) {
            b.setShowWhen(true).setUsesChronometer(true).setWhen(end > 0 ? end : start);
            if (Build.VERSION.SDK_INT >= 24 && end > 0) b.setChronometerCountDown(true);
        }
        String main = s.optString("main", "");
        if (!main.isEmpty()) b.addAction(action(c, "main", main, android.R.drawable.ic_media_play));
        if (!"Workout fertig".equals(s.optString("titel")))
            b.addAction(action(c, paused ? "resume" : "pause", paused ? "Weiter" : "Pause", paused ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause));
        if (s.optBoolean("canNext", true) && !"Workout fertig".equals(s.optString("titel")))
            b.addAction(action(c, "next", "⏭", android.R.drawable.ic_media_next));
        return b.build();
    }

    private static Notification.Action action(Context c, String what, String label, int icon) {
        Intent i = new Intent(c, NotifReceiver.class).setAction("training." + what);
        PendingIntent p = PendingIntent.getBroadcast(c, what.hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(c, icon), label, p).build();
    }

    static void post(Context c) {
        try {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            nm.notify(ID, build(c));
        } catch (Exception ignored) { }
    }
}
