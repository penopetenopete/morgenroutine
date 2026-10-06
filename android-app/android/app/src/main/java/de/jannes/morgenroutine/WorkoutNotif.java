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
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Steuerung auf dem Sperrbildschirm (Mediensteuerung wie bei Spotify).
 * Titel = was gerade ist + Restzeit (zählt jede Sekunde mit), Text = Übung · Satz · Seite.
 * Zwei Knöpfe: Pause/Weiter und ✓ (Fertig bzw. weiter zum nächsten Schritt).
 * Laufen Pausen ab, während die Seite schläft, schaltet die Anzeige anhand der geplanten Phasen selbst weiter.
 * Knöpfe → TrainingPlugin.sendAction → Ereignis "notifAction" in der App.
 */
public final class WorkoutNotif {
    static final String CHANNEL = "workout_live";
    static final int ID = 1;
    private static final Object AUTO = new Object();
    private static final Object TICK = new Object();
    private static final Handler H = new Handler(Looper.getMainLooper());
    private static JSONObject state;          // aktueller Stand, null = kein Workout
    private static JSONArray events;          // geplante Phasen ab jetzt
    private static Context app;
    private static MediaSession session;
    private static Bitmap art;

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

    static synchronized void setState(Context c, JSONObject s) {
        app = c.getApplicationContext();
        state = s;
        H.removeCallbacksAndMessages(AUTO);
        post(app);
        scheduleAuto();
        tick();
    }

    static synchronized void setEvents(Context c, JSONArray ev) {
        app = c.getApplicationContext();
        events = ev;
        H.removeCallbacksAndMessages(AUTO);
        scheduleAuto();
    }

    /** Jede Sekunde Restzeit im Titel aktualisieren (läuft nativ, auch wenn die Seite schläft). */
    private static void tick() {
        H.removeCallbacksAndMessages(TICK);
        JSONObject s = state;
        if (s == null || s.optBoolean("paused") || (s.optLong("end", 0) <= 0 && s.optLong("start", 0) <= 0)) return;
        long now = System.currentTimeMillis(), next = 1000 - (now % 1000) + 20;
        H.postAtTime(() -> { synchronized (WorkoutNotif.class) { if (app != null && state != null) post(app); tick(); } },
                TICK, SystemClock.uptimeMillis() + next);
    }

    private static void scheduleAuto() {
        if (events == null || state == null || state.optBoolean("paused") || app == null) return;
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
            H.postAtTime(() -> { synchronized (WorkoutNotif.class) { if (state != null && !state.optBoolean("paused")) { state = s; post(app); tick(); } } },
                    AUTO, SystemClock.uptimeMillis() + (at - now));
        }
    }

    /** Stand aus einem geplanten Phasen-Ereignis (gleiche Texte wie in der App). */
    private static JSONObject fromEvent(JSONObject e, long end) {
        JSONObject s = new JSONObject();
        try {
            String phase = e.optString("phase"), art = e.optString("art");
            int satz = e.optInt("satz", 1), saetze = e.optInt("saetze", 1);
            long at = e.optLong("at");
            s.put("workout", e.optString("workout"));
            s.put("ex", e.optString("uebung"));
            s.put("detail", saetze > 1 ? "Satz " + satz + "/" + saetze : "");
            s.put("from", at);
            if ("done".equals(phase)) { s.put("label", "Workout fertig"); s.put("ex", "App öffnen für die Statistik"); s.put("done", true); return s; }
            if ("work".equals(phase)) {
                if ("reps".equals(art)) { s.put("label", "Wiederholungen"); s.put("start", at); s.put("main", "Fertig"); }
                else { s.put("label", "Halten"); if (end > 0) s.put("end", end); }
            } else {
                s.put("label", "set".equals(art) ? "Satzpause" : "side".equals(art) ? "Seitenwechsel" : "umbau".equals(art) ? "Umbau" : "link".equals(art) ? "Pause" : "Als Nächstes");
                if (end > 0) s.put("end", end); else s.put("start", at);
                s.put("main", "next".equals(art) ? "Nächste Übung" : "Weiter");
            }
        } catch (Exception ignored) { }
        return s;
    }

    private static String mmss(long ms) {
        long t = Math.max(0, ms) / 1000;
        return t / 60 + ":" + String.format(java.util.Locale.ROOT, "%02d", t % 60);
    }

    /** Titel: „Halten · noch 0:42“, „Satzpause · noch 1:12“, „Wiederholungen · 0:35“. */
    private static String title(JSONObject s) {
        boolean paused = s.optBoolean("paused");
        long now = paused ? s.optLong("pausedAt", System.currentTimeMillis()) : System.currentTimeMillis();
        long end = s.optLong("end", 0), start = s.optLong("start", 0);
        String lab = s.optString("label", "Training");
        String t = end > 0 ? "noch " + (end - now > 0 && end - now < 10000 ? ((end - now + 999) / 1000) + " s" : mmss(end - now + 999)) : start > 0 ? mmss(now - start) : "";
        return (paused ? "Pausiert · " : "") + lab + (t.isEmpty() ? "" : " · " + t);
    }

    private static String text(JSONObject s) {
        String ex = s.optString("ex", ""), d = s.optString("detail", "");
        return ex + (d.isEmpty() ? "" : (ex.isEmpty() ? "" : " · ") + d);
    }

    private static MediaSession session(Context c) {
        if (session == null) {
            session = new MediaSession(c.getApplicationContext(), "training");
            session.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { TrainingPlugin.sendAction("resume"); }
                @Override public void onPause() { TrainingPlugin.sendAction("pause"); }
                @Override public void onSkipToNext() { TrainingPlugin.sendAction("go"); }
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
        boolean paused = s.optBoolean("paused"), done = s.optBoolean("done");
        long from = s.optLong("from", 0), end = s.optLong("end", 0), now = System.currentTimeMillis();
        long dur = (end > 0 && from > 0 && end > from) ? end - from : -1;
        long pos = from > 0 ? Math.max(0, (paused ? s.optLong("pausedAt", now) : now) - from) : 0;
        if (dur > 0) pos = Math.min(pos, dur);
        MediaMetadata.Builder m = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title(s))
                .putString(MediaMetadata.METADATA_KEY_ARTIST, text(s))
                .putString(MediaMetadata.METADATA_KEY_ALBUM, s.optString("workout", ""))
                .putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
        Bitmap a = art(c); if (a != null) m.putBitmap(MediaMetadata.METADATA_KEY_ART, a);
        ms.setMetadata(m.build());
        PlaybackState.Builder p = new PlaybackState.Builder()
                .setActions(done ? 0 : PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE)
                .setState(paused ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_PLAYING, pos, paused || dur <= 0 ? 0f : 1f);
        if (!done) p.addCustomAction(new PlaybackState.CustomAction.Builder("go", goLabel(s), R.drawable.ic_tr_done).build());
        ms.setPlaybackState(p.build());
        ms.setActive(true);
    }

    /** ✓-Knopf: Hauptaktion der App (Fertig, Nächster Satz, Nächste Übung …), sonst weiter zum nächsten Schritt. */
    private static String goLabel(JSONObject s) {
        String main = s.optString("main", "");
        return main.isEmpty() ? "Weiter" : main;
    }

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
        boolean paused = s.optBoolean("paused"), done = s.optBoolean("done");
        b.setContentTitle(title(s)).setContentText(text(s));
        if (!s.optString("workout").isEmpty()) b.setSubText(s.optString("workout"));
        Bitmap a = art(c); if (a != null) b.setLargeIcon(a);
        if (!done) {
            b.addAction(action(c, paused ? "resume" : "pause", paused ? "Weiter" : "Pause", paused ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause));
            b.addAction(action(c, "go", goLabel(s), R.drawable.ic_tr_done));
            b.setStyle(new Notification.MediaStyle().setMediaSession(session(c).getSessionToken()).setShowActionsInCompactView(0, 1));
        } else {
            b.setStyle(new Notification.MediaStyle().setMediaSession(session(c).getSessionToken()));
        }
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
