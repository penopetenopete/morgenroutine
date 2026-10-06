package de.jannes.morgenroutine;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
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
                s.put("from", e.optLong("at"));
                if ("reps".equals(art)) { s.put("start", e.optLong("at")); s.put("main", "Fertig ✓"); }
                else { if (end > 0) s.put("end", end); s.put("main", ""); }
            } else {
                String lab = "set".equals(art) ? "Satzpause" : "side".equals(art) ? "Seitenwechsel" : "umbau".equals(art) ? "Umbau" : "link".equals(art) ? "Pause" : "Nächste Übung";
                s.put("titel", lab + " · gleich: " + ex);
                s.put("text", saetze > 1 ? "Satz " + satz + "/" + saetze : "");
                s.put("from", e.optLong("at"));
                if (end > 0) s.put("end", end); else s.put("start", e.optLong("at"));
                s.put("main", "next".equals(art) ? "Nächste Übung ▶" : "set".equals(art) ? "Nächster Satz" : "Weiter");
            }
        } catch (Exception ignored) { }
        return s;
    }

    private static MediaSession session;
    private static Bitmap art;

    /** Mediensteuerung wie bei Spotify: groß auf dem Sperrbildschirm, Knöpfe ohne Aufklappen, Fortschrittsbalken = Timer. */
    private static MediaSession session(Context c) {
        if (session == null) {
            session = new MediaSession(c.getApplicationContext(), "training");
            session.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { TrainingPlugin.sendAction("resume"); }
                @Override public void onPause() { TrainingPlugin.sendAction("pause"); }
                @Override public void onSkipToNext() { TrainingPlugin.sendAction("next"); }
                @Override public void onCustomAction(String action, android.os.Bundle extras) { TrainingPlugin.sendAction(action); }
            });
        }
        return session;
    }

    private static Bitmap art(Context c) {
        if (art == null) { try { art = BitmapFactory.decodeResource(c.getResources(), R.mipmap.ic_launcher_foreground); } catch (Exception ignored) { } }
        return art;
    }

    private static void updateSession(Context c, JSONObject s) {
        MediaSession ms = session(c);
        if (s == null) { ms.setActive(false); return; }
        boolean paused = s.optBoolean("paused");
        long from = s.optLong("from", 0), end = s.optLong("end", 0), now = System.currentTimeMillis();
        long dur = (end > 0 && from > 0 && end > from) ? end - from : -1;
        long pos = from > 0 ? Math.max(0, (paused ? s.optLong("pausedAt", now) : now) - from) : 0;
        if (dur > 0) pos = Math.min(pos, dur);
        MediaMetadata.Builder m = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, s.optString("titel", "Training"))
                .putString(MediaMetadata.METADATA_KEY_ARTIST, paused ? "Pausiert" + (s.optString("text").isEmpty() ? "" : " · " + s.optString("text")) : s.optString("text", ""))
                .putString(MediaMetadata.METADATA_KEY_ALBUM, s.optString("workout", ""))
                .putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
        Bitmap a = art(c); if (a != null) m.putBitmap(MediaMetadata.METADATA_KEY_ART, a);
        ms.setMetadata(m.build());
        PlaybackState.Builder p = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | (s.optBoolean("canNext", true) ? PlaybackState.ACTION_SKIP_TO_NEXT : 0))
                .setState(paused ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_PLAYING, pos, paused || dur <= 0 ? 0f : 1f);
        String main = s.optString("main", "");
        if (!main.isEmpty()) p.addCustomAction(new PlaybackState.CustomAction.Builder("main", main, mainIcon(main)).build());
        ms.setPlaybackState(p.build());
        ms.setActive(true);
    }

    private static int mainIcon(String label) { return label.contains("✓") ? R.drawable.ic_tr_done : R.drawable.ic_tr_go; }

    static synchronized Notification build(Context c) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_media_play).setContentIntent(pi).setOngoing(true)
                .setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC).setCategory("workout")
                .setShowWhen(false);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
        JSONObject s = state;
        updateSession(c, s);
        if (s == null) {
            return b.setContentTitle("Training").setContentText("Bereit – Timer und Spotify laufen auch bei gesperrtem Bildschirm").build();
        }
        boolean paused = s.optBoolean("paused");
        String text = s.optString("text", "");
        b.setContentTitle(s.optString("titel", "Training"));
        b.setContentText(paused ? "Pausiert" + (text.isEmpty() ? "" : " · " + text) : text);
        if (!s.optString("workout").isEmpty()) b.setSubText(s.optString("workout"));
        Bitmap a = art(c); if (a != null) b.setLargeIcon(a);
        boolean done = "Workout fertig".equals(s.optString("titel"));
        // Knöpfe (ältere Android-Versionen nehmen diese, ab Android 13 kommen sie aus der Mediensitzung)
        java.util.List<Integer> compact = new java.util.ArrayList<>();
        int n = 0;
        String main = s.optString("main", "");
        if (!main.isEmpty()) { b.addAction(action(c, "main", main, mainIcon(main))); compact.add(n++); }
        if (!done) { b.addAction(action(c, paused ? "resume" : "pause", paused ? "Weiter" : "Pause", paused ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)); compact.add(n++); }
        if (!done && s.optBoolean("canNext", true)) { b.addAction(action(c, "next", "Überspringen", android.R.drawable.ic_media_next)); compact.add(n++); }
        int[] cv = new int[compact.size()]; for (int i = 0; i < cv.length; i++) cv[i] = compact.get(i);
        b.setStyle(new Notification.MediaStyle().setMediaSession(session(c).getSessionToken()).setShowActionsInCompactView(cv));
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
