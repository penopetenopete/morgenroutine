package de.jannes.morgenroutine;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.SystemClock;
import android.os.Handler;
import android.os.HandlerThread;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Spotify-Steuerung im nativen Teil der App. Läuft in einem eigenen Thread im Hintergrunddienst
 * weiter, auch wenn Android die Web-Seite bei gesperrtem Bildschirm einfriert.
 * Gleiche Logik wie im Spotify-Labor (spotify-labor.html, Funktion switchTo).
 */
public class SpotifyCore {
    public static final String CLIENT_ID = "e4b95d44f2f6410e8e80483e9f3f82c0";
    private static SpotifyCore instance;

    private final SharedPreferences prefs;
    private final Handler worker;
    private JSONObject st;   // Zustand: tok, music, pod, podSrc, pl, device, rewind, mode, active, auto
    private JSONArray log;
    private Runnable autoTask;
    private Runnable planTask;
    private final Handler toneHandler;
    private static final Object TONE = new Object();
    /** Wird von MainActivity gesetzt. Töne spielt der native Teil nur, wenn die App nicht sichtbar ist
     *  (sonst piept die Seite selbst). */
    public static volatile boolean appVisible = true;

    public static synchronized SpotifyCore get(Context c) {
        if (instance == null) instance = new SpotifyCore(c.getApplicationContext());
        return instance;
    }

    private SpotifyCore(Context c) {
        prefs = c.getSharedPreferences("spotify_core", Context.MODE_PRIVATE);
        try { st = new JSONObject(prefs.getString("state", "{}")); } catch (JSONException e) { st = new JSONObject(); }
        try { log = new JSONArray(prefs.getString("log", "[]")); } catch (JSONException e) { log = new JSONArray(); }
        HandlerThread t = new HandlerThread("spotify");
        t.start();
        worker = new Handler(t.getLooper());
        HandlerThread tt = new HandlerThread("tones");
        tt.start();
        toneHandler = new Handler(tt.getLooper());
        if (st.has("auto")) scheduleAuto(); // Auto-Wechsel nach Neustart fortsetzen
        if (st.has("plan")) schedulePlan(); // Smart-Plan nach Neustart fortsetzen
    }

    public void post(Runnable r) { worker.post(r); }

    // ---------- Zustand ----------
    private synchronized void save() {
        prefs.edit().putString("state", st.toString()).putString("log", log.toString()).apply();
    }

    public synchronized JSONObject snapshotState() {
        try {
            JSONObject o = new JSONObject(st.toString());
            o.remove("tok");
            o.put("hasAuth", st.has("tok"));
            o.put("log", new JSONArray(log.toString()));
            return o;
        } catch (JSONException e) { return new JSONObject(); }
    }

    public synchronized void setConfig(JSONObject cfg) {
        try {
            String[] keys = {"pl", "podSrc", "pod", "music", "device", "rewind"};
            for (String k : keys) if (cfg.has(k)) {
                if (cfg.isNull(k)) st.remove(k); else st.put(k, cfg.get(k));
            }
        } catch (JSONException ignored) { }
        save();
    }

    public synchronized void setAuth(String access, String refresh, long exp) {
        try {
            JSONObject t = new JSONObject();
            t.put("access", access); t.put("refresh", refresh); t.put("exp", exp);
            st.put("tok", t);
        } catch (JSONException ignored) { }
        save();
    }

    public synchronized void logout() { st.remove("tok"); save(); }

    public synchronized void addLog(String text, String kind) {
        try {
            JSONObject e = new JSONObject();
            e.put("t", System.currentTimeMillis()); e.put("text", text); e.put("kind", kind == null ? "" : kind);
            JSONArray n = new JSONArray();
            n.put(e);
            for (int i = 0; i < log.length() && i < 199; i++) n.put(log.get(i));
            log = n;
        } catch (JSONException ignored) { }
        save();
    }

    public synchronized void clearLog() { log = new JSONArray(); save(); }

    // ---------- Auto-Wechsel (Test) ----------
    public synchronized void startAuto(int everySec) {
        try {
            JSONObject a = new JSONObject();
            a.put("every", everySec);
            a.put("next", System.currentTimeMillis() + everySec * 1000L);
            st.put("auto", a);
        } catch (JSONException ignored) { }
        save();
        addLog("Auto-Wechsel gestartet (alle " + everySec + " s, nativ)", "");
        scheduleAuto();
    }

    public synchronized void stopAuto() {
        st.remove("auto");
        if (autoTask != null) worker.removeCallbacks(autoTask);
        autoTask = null;
        save();
        addLog("Auto-Wechsel gestoppt", "");
    }

    private synchronized void scheduleAuto() {
        if (autoTask != null) worker.removeCallbacks(autoTask);
        JSONObject a = st.optJSONObject("auto");
        if (a == null) return;
        long delay = Math.max(0, a.optLong("next") - System.currentTimeMillis());
        autoTask = () -> {
            JSONObject cur;
            synchronized (SpotifyCore.this) {
                cur = st.optJSONObject("auto");
                if (cur == null) return;
                try { cur.put("next", System.currentTimeMillis() + cur.optInt("every", 30) * 1000L); } catch (JSONException ignored) { }
                save();
            }
            switchTo("music".equals(st.optString("active")) ? "podcast" : "music", "Auto");
            scheduleAuto();
        };
        worker.postDelayed(autoTask, delay);
    }

    // ---------- Smart-Plan: geplante Wechsel (z. B. Satz → Musik, Pause → Podcast) ----------
    /** events: [{at: Zeitpunkt in ms, target: "music"|"podcast", label: "…"}], ersetzt den bisherigen Plan. */
    public synchronized void setPlan(JSONArray events) {
        try { st.put("plan", events); } catch (JSONException ignored) { }
        save();
        addLog("Smart an: " + events.length() + " Wechsel geplant", "");
        schedulePlan();
    }

    public synchronized void clearPlan() {
        if (planTask != null) worker.removeCallbacks(planTask);
        planTask = null;
        boolean had = st.has("plan");
        st.remove("plan");
        save();
        if (had) addLog("Smart aus", "");
    }

    private synchronized void schedulePlan() {
        if (planTask != null) worker.removeCallbacks(planTask);
        planTask = null;
        JSONArray plan = st.optJSONArray("plan");
        if (plan == null || plan.length() == 0) { st.remove("plan"); save(); return; }
        long delay = Math.max(0, plan.optJSONObject(0).optLong("at") - System.currentTimeMillis());
        planTask = () -> {
            JSONObject ev;
            synchronized (SpotifyCore.this) {
                JSONArray pl = st.optJSONArray("plan");
                if (pl == null || pl.length() == 0) return;
                ev = pl.optJSONObject(0); pl.remove(0);
                long now = System.currentTimeMillis();
                // verpasste Wechsel überspringen, nur der jüngste zählt
                while (pl.length() > 0 && pl.optJSONObject(0).optLong("at") <= now) { ev = pl.optJSONObject(0); pl.remove(0); }
                if (pl.length() == 0) st.remove("plan");
                save();
            }
            String target = ev.optString("target");
            if (!target.equals(st.optString("active"))) switchTo(target, ev.optString("label", "Smart"));
            schedulePlan();
        };
        worker.postDelayed(planTask, delay);
    }

    // ---------- Workout aus der App: geplante Phasen + Töne ----------
    /** events: aus app.js plannedEvents(): {at, typ:"phase", phase:"work"|"rest"|"done", pauseSek, …} und {at, typ:"ton"}. */
    public synchronized void setEvents(JSONArray events, boolean sound) {
        try { st.put("events", events); } catch (JSONException ignored) { }
        save();
        rebuildSmart();
        scheduleTones(sound ? events : new JSONArray());
    }

    public synchronized void clearEvents() {
        st.remove("events");
        save();
        toneHandler.removeCallbacksAndMessages(TONE);
        if (planTask != null) worker.removeCallbacks(planTask);
        planTask = null;
        st.remove("plan");
        save();
    }

    public synchronized void setSound(boolean on) {
        try { st.put("sound", on); } catch (JSONException ignored) { }
        save();
        JSONArray ev = st.optJSONArray("events");
        scheduleTones(on && ev != null ? ev : new JSONArray());
    }

    public synchronized boolean soundOn() { return st.optBoolean("sound", true); }

    public synchronized void setSmart(boolean on, int shortSec) {
        try { st.put("smart", on); st.put("short", shortSec); } catch (JSONException ignored) { }
        save();
        addLog(on ? "Smart an" : "Smart aus", "");
        rebuildSmart();
    }

    /** Smart-Regel: Satz → Musik, Pause → Podcast (kurze Pausen bleiben Musik, offene Pausen = Podcast). */
    static String smartTarget(String phase, int pauseSek, int shortSec) {
        if ("work".equals(phase)) return "music";
        if ("rest".equals(phase)) return (pauseSek == 0 || pauseSek >= shortSec) ? "podcast" : "music";
        return null;
    }

    private synchronized void rebuildSmart() {
        JSONArray ev = st.optJSONArray("events");
        if (!st.optBoolean("smart") || ev == null) {
            if (planTask != null) worker.removeCallbacks(planTask);
            planTask = null; st.remove("plan"); save();
            return;
        }
        int shortSec = st.optInt("short", 20);
        JSONArray plan = new JSONArray();
        String last = null;
        for (int i = 0; i < ev.length(); i++) {
            JSONObject e = ev.optJSONObject(i);
            if (e == null || !"phase".equals(e.optString("typ"))) continue;
            String target = smartTarget(e.optString("phase"), e.optInt("pauseSek", 0), shortSec);
            if (target == null || target.equals(last)) continue;
            last = target;
            try {
                JSONObject p = new JSONObject();
                p.put("at", e.optLong("at")); p.put("target", target);
                p.put("label", "Smart · " + ("work".equals(e.optString("phase")) ? "Satz" : "Pause"));
                plan.put(p);
            } catch (JSONException ignored) { }
        }
        try { st.put("plan", plan); } catch (JSONException ignored) { }
        save();
        schedulePlan();
    }

    private void scheduleTones(JSONArray ev) {
        toneHandler.removeCallbacksAndMessages(TONE);
        long now = System.currentTimeMillis();
        for (int i = 0; i < ev.length(); i++) {
            JSONObject e = ev.optJSONObject(i);
            if (e == null) continue;
            long delay = e.optLong("at") - now;
            if (delay < -300) continue;
            int tone;
            if ("ton".equals(e.optString("typ"))) tone = ToneGenerator.TONE_PROP_BEEP;
            else if ("work".equals(e.optString("phase"))) tone = ToneGenerator.TONE_PROP_BEEP2;
            else if ("done".equals(e.optString("phase"))) tone = ToneGenerator.TONE_PROP_ACK;
            else continue;
            final int t = tone;
            toneHandler.postAtTime(() -> beep(t), TONE, SystemClock.uptimeMillis() + Math.max(0, delay));
        }
    }

    private long lastToneLog = 0;
    private void beep(int tone) {
        if (appVisible) return;
        try {
            ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_MUSIC, 90);
            boolean ok = tg.startTone(tone, 200);
            toneHandler.postDelayed(tg::release, 600);
            if (!ok || System.currentTimeMillis() - lastToneLog > 20000) { lastToneLog = System.currentTimeMillis(); addLog(ok ? "Ton im Hintergrund gespielt" : "Ton im Hintergrund ging nicht", ok ? "o" : "e"); }
        } catch (Exception e) { addLog("Ton-Fehler: " + e.getMessage(), "e"); }
    }

    // ---------- Steuerknöpfe ----------
    /** action: prev | next | toggle | back15 | fwd30. Muss im Worker-Thread laufen. */
    public String control(String action) {
        try {
            switch (action) {
                case "prev": withDevice(() -> api("POST", "/me/player/previous" + dq("?"), null)); break;
                case "next": withDevice(() -> api("POST", "/me/player/next" + dq("?"), null)); break;
                case "toggle": {
                    JSONObject p = api("GET", "/me/player", null);
                    if (p != null && p.optBoolean("is_playing")) withDevice(() -> api("PUT", "/me/player/pause" + dq("?"), null));
                    else withDevice(() -> api("PUT", "/me/player/play" + dq("?"), null));
                    break;
                }
                case "back15": case "fwd30": {
                    JSONObject p = api("GET", "/me/player?additional_types=episode", null);
                    long pos = p == null ? 0 : p.optLong("progress_ms");
                    final long to = Math.max(0, pos + ("back15".equals(action) ? -15000 : 30000));
                    withDevice(() -> api("PUT", "/me/player/seek?position_ms=" + to + dq("&"), null));
                    break;
                }
                default: return "Unbekannte Aktion";
            }
            return null;
        } catch (Exception e) { return explain(e); }
    }

    // ---------- Web API ----------
    static class ApiException extends Exception {
        final int status; final String reason;
        ApiException(int status, String msg, String reason) { super(status + ": " + msg); this.status = status; this.reason = reason; }
    }

    private String token() throws Exception {
        JSONObject t;
        synchronized (this) { t = st.optJSONObject("tok"); }
        if (t == null) throw new ApiException(0, "Nicht verbunden – erst Schritt 1.", null);
        if (System.currentTimeMillis() > t.optLong("exp")) refresh();
        synchronized (this) { return st.getJSONObject("tok").getString("access"); }
    }

    public String freshToken() throws Exception { return token(); }

    private void refresh() throws Exception {
        String rt;
        synchronized (this) { rt = st.getJSONObject("tok").getString("refresh"); }
        String body = "client_id=" + CLIENT_ID + "&grant_type=refresh_token&refresh_token=" + URLEncoder.encode(rt, "UTF-8");
        HttpURLConnection c = (HttpURLConnection) new URL("https://accounts.spotify.com/api/token").openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(10000); c.setReadTimeout(15000);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        c.setDoOutput(true);
        try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        String txt = read(code < 400 ? c.getInputStream() : c.getErrorStream());
        if (code >= 400) throw new ApiException(code, "Token-Erneuerung fehlgeschlagen: " + txt, null);
        JSONObject j = new JSONObject(txt);
        setAuth(j.getString("access_token"), j.optString("refresh_token", rt),
                System.currentTimeMillis() + (j.optLong("expires_in", 3600) - 60) * 1000L);
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096]; int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    private JSONObject api(String method, String path, JSONObject body) throws Exception { return api(method, path, body, false); }

    private JSONObject api(String method, String path, JSONObject body, boolean retry) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.spotify.com/v1" + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(10000); c.setReadTimeout(15000);
        c.setRequestProperty("Authorization", "Bearer " + token());
        c.setRequestProperty("Content-Type", "application/json");
        if (!"GET".equals(method)) {
            byte[] data = body == null ? new byte[0] : body.toString().getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(data.length);
            try (OutputStream os = c.getOutputStream()) { os.write(data); }
        }
        int code = c.getResponseCode();
        if (code == 401 && !retry) { refresh(); return api(method, path, body, true); }
        if (code == 429 && !retry) {
            int w = 1; try { w = Integer.parseInt(c.getHeaderField("Retry-After")); } catch (Exception ignored) { }
            Thread.sleep(w * 1000L); return api(method, path, body, true);
        }
        if (code == 204) return null;
        String txt = read(code < 400 ? c.getInputStream() : c.getErrorStream());
        if (code >= 400) {
            String msg = txt, reason = null;
            try {
                JSONObject e = new JSONObject(txt).optJSONObject("error");
                if (e != null) { msg = e.optString("message", txt); reason = e.optString("reason", null); }
            } catch (JSONException ignored) { }
            throw new ApiException(code, msg, reason);
        }
        if (txt.trim().isEmpty()) return null;
        try { return new JSONObject(txt); } catch (JSONException e) { return null; }
    }

    private synchronized String dq(String sep) {
        JSONObject d = st.optJSONObject("device");
        if (d == null) return "";
        try { return sep + "device_id=" + URLEncoder.encode(d.optString("id"), "UTF-8"); } catch (Exception e) { return ""; }
    }

    static String explain(Exception e) {
        if (e instanceof ApiException) {
            ApiException a = (ApiException) e;
            if (a.status == 404) return "Kein aktives Spotify-Gerät. Spotify am Handy öffnen, kurz Play drücken, dann nochmal.";
            if (a.status == 403) return ("PREMIUM_REQUIRED".equals(a.reason) ? "Spotify meldet: Premium nötig. " : "Zugriff verweigert (403). ")
                    + "Evtl. in der Spotify-Entwickler-App unter „User Management“ dein Konto eintragen.";
        }
        return e.getMessage() == null ? e.toString() : e.getMessage();
    }

    // ---------- Kernlogik: Stand merken & umschalten ----------
    private JSONObject snapshot() throws Exception {
        JSONObject p = api("GET", "/me/player?additional_types=episode", null);
        if (p == null || p.optJSONObject("item") == null) return null;
        JSONObject item = p.getJSONObject("item");
        synchronized (this) {
            JSONObject dev = p.optJSONObject("device");
            if (dev != null && !dev.isNull("id") && !st.has("device")) {
                JSONObject d = new JSONObject(); d.put("id", dev.getString("id")); d.put("name", dev.optString("name")); st.put("device", d);
            }
            JSONObject ctx = p.optJSONObject("context");
            if ("track".equals(item.optString("type"))) {
                JSONObject m = new JSONObject();
                m.put("track", item.optString("uri")); m.put("name", item.optString("name")); m.put("pos", p.optLong("progress_ms"));
                m.put("at", System.currentTimeMillis());
                if (ctx != null) { m.put("ctx", ctx.optString("uri")); m.put("ctxType", ctx.optString("type")); }
                st.put("music", m);
            } else if ("episode".equals(item.optString("type"))) {
                JSONObject e = new JSONObject();
                e.put("episode", item.optString("uri")); e.put("name", item.optString("name")); e.put("pos", p.optLong("progress_ms"));
                e.put("at", System.currentTimeMillis());
                st.put("pod", e);
            }
            st.put("shuffle", p.optBoolean("shuffle_state"));
            save();
        }
        return p;
    }

    private static boolean resumable(JSONObject ctx) {
        if (ctx == null) return false;
        String type = ctx.optString("type"), uri = ctx.optString("uri");
        return "album".equals(type) || ("playlist".equals(type) && !uri.startsWith("spotify:playlist:37i9"));
    }

    private String podcastEpisode() throws Exception {
        JSONObject pod, src;
        synchronized (this) { pod = st.optJSONObject("pod"); src = st.optJSONObject("podSrc"); }
        if (pod != null && pod.has("episode")) return pod.getString("episode");
        if (src == null) throw new Exception("Noch keine Podcast-Folge gemerkt. Kurz in Spotify eine Folge anmachen oder oben eine wählen.");
        if ("episode".equals(src.optString("type"))) return src.getString("uri");
        if ("show".equals(src.optString("type"))) {
            JSONObject j = api("GET", "/shows/" + src.optString("id") + "/episodes?limit=1&market=DE", null);
            JSONArray items = j == null ? null : j.optJSONArray("items");
            if (items != null && items.length() > 0) return items.getJSONObject(0).getString("uri");
        }
        throw new Exception("Keine Folge gefunden – bitte eine Folge wählen.");
    }

    private long podPos(String ep) {
        synchronized (this) {
            JSONObject pod = st.optJSONObject("pod");
            if (pod == null || !ep.equals(pod.optString("episode"))) return 0;
            return Math.max(0, pod.optLong("pos") - st.optInt("rewind", 2) * 1000L);
        }
    }

    private interface Op { void run() throws Exception; }

    /** Führt einen Spotify-Befehl aus. Meldet Spotify "kein aktives Gerät" (z. B. nach Skippen auf dem
     *  Sperrbildschirm), wird das Handy neu gesucht, aktiviert und bis zu 3-mal neu versucht. */
    private void withDevice(Op op) throws Exception {
        for (int attempt = 0; ; attempt++) {
            try { op.run(); return; }
            catch (ApiException e) {
                if (e.status != 404 || attempt >= 2) throw e;
                recoverDevice(attempt);
            }
        }
    }

    private void recoverDevice(int attempt) throws Exception {
        Thread.sleep(attempt == 0 ? 600 : 1500);
        JSONObject j = api("GET", "/me/player/devices", null);
        JSONArray list = j == null ? null : j.optJSONArray("devices");
        JSONObject cur;
        synchronized (this) { cur = st.optJSONObject("device"); }
        JSONObject pick = null;
        if (list != null) {
            for (int pass = 0; pass < 3 && pick == null; pass++) {
                for (int i = 0; i < list.length() && pick == null; i++) {
                    JSONObject d = list.getJSONObject(i);
                    if (pass == 0 && cur != null && cur.optString("id").equals(d.optString("id"))) pick = d;
                    if (pass == 1 && cur != null && cur.optString("name").equals(d.optString("name"))) pick = d;
                    if (pass == 2 && "Smartphone".equalsIgnoreCase(d.optString("type"))) pick = d;
                }
            }
        }
        if (pick == null) {
            addLog("Gerät nicht gefunden (Versuch " + (attempt + 1) + ") – warte kurz", "w");
            return;
        }
        synchronized (this) {
            JSONObject d = new JSONObject(); d.put("id", pick.getString("id")); d.put("name", pick.optString("name"));
            st.put("device", d); save();
        }
        addLog("Gerät nicht aktiv – aktiviere " + pick.optString("name") + " (Versuch " + (attempt + 1) + ")", "w");
        JSONObject t = new JSONObject(); t.put("device_ids", new JSONArray().put(pick.getString("id"))); t.put("play", false);
        try { api("PUT", "/me/player", t); } catch (ApiException ignored) { }
        Thread.sleep(800);
    }

    private void play(JSONObject body) throws Exception {
        withDevice(() -> api("PUT", "/me/player/play" + dq("?"), body));
    }

    private void seekTo(long ms) throws Exception {
        if (ms > 2000) { Thread.sleep(700); withDevice(() -> api("PUT", "/me/player/seek?position_ms=" + ms + dq("&"), null)); }
    }

    /** Muss im Worker-Thread laufen. Gibt null bei Erfolg zurück, sonst die Fehlermeldung. */
    public String switchTo(String target, String why) { return switchTo(target, why, null); }

    /** forceMusic: in der App gewählte Musik (Playlist oder Song), die sofort laufen soll. */
    public String switchTo(String target, String why, JSONObject forceMusic) {
        long t0 = System.currentTimeMillis();
        try {
            JSONObject p = null;
            try { p = snapshot(); } catch (ApiException e) { if (e.status != 404) addLog("Stand lesen fehlgeschlagen: " + e.getMessage(), "w"); }
            if (forceMusic != null) synchronized (this) { st.put("music", forceMusic); st.remove("mode"); save(); }
            JSONObject item = p == null ? null : p.optJSONObject("item");
            String itemType = item == null ? "" : item.optString("type");
            JSONObject music;
            String modeStr;
            synchronized (this) { music = st.optJSONObject("music"); modeStr = st.optString("mode", ""); }

            if ("music".equals(target) && "queue".equals(modeStr) && "episode".equals(itemType) && music != null) {
                // Folge überspringen → der eingereihte Song kommt, dann läuft Mix/Radio normal weiter
                withDevice(() -> api("POST", "/me/player/next" + dq("?"), null));
                seekTo(music.optLong("pos"));
                setMode(null);
            } else if ("podcast".equals(target) && "track".equals(itemType) && !resumable(p.optJSONObject("context"))) {
                String ep = podcastEpisode();
                long pos = podPos(ep);
                final String trackUri = item.optString("uri");
                withDevice(() -> api("POST", "/me/player/queue?uri=" + URLEncoder.encode(ep, "UTF-8") + dq("&"), null));
                withDevice(() -> api("POST", "/me/player/queue?uri=" + URLEncoder.encode(trackUri, "UTF-8") + dq("&"), null));
                withDevice(() -> api("POST", "/me/player/next" + dq("?"), null));
                seekTo(pos);
                setMode("queue");
                JSONObject ctx = p.optJSONObject("context");
                addLog("Musikquelle (" + (ctx != null ? ctx.optString("type") : "Einzelsong/Radio") + ") bleibt erhalten – Podcast dazwischengeschoben", "");
            } else if ("music".equals(target)) {
                setMode(null);
                JSONObject pl;
                synchronized (this) { pl = st.optJSONObject("pl"); }
                if (music != null && music.has("ctx") && !music.has("track")) {
                    play(new JSONObject().put("context_uri", music.getString("ctx")));
                } else if (music != null && music.has("track") && music.has("ctx")) {
                    JSONObject b = new JSONObject();
                    b.put("context_uri", music.getString("ctx"));
                    b.put("offset", new JSONObject().put("uri", music.getString("track")));
                    b.put("position_ms", music.optLong("pos"));
                    try { play(b); }
                    catch (ApiException e) {
                        if (e.status == 404 || e.status == 403) throw e;
                        addLog("Quelle (" + music.optString("ctxType", "?") + ") nicht fortsetzbar – spiele nur den Song", "w");
                        JSONObject b2 = new JSONObject();
                        b2.put("uris", new JSONArray().put(music.getString("track"))); b2.put("position_ms", music.optLong("pos"));
                        play(b2);
                    }
                } else if (music != null && music.has("track")) {
                    JSONObject b = new JSONObject();
                    b.put("uris", new JSONArray().put(music.getString("track"))); b.put("position_ms", music.optLong("pos"));
                    play(b);
                } else if (pl != null) {
                    play(new JSONObject().put("context_uri", pl.getString("uri")));
                } else throw new Exception("Noch keine Musik gemerkt. Kurz in Spotify Musik anmachen, dann umschalten.");
            } else {
                setMode(null);
                String ep = podcastEpisode();
                JSONObject b = new JSONObject();
                b.put("uris", new JSONArray().put(ep)); b.put("position_ms", podPos(ep));
                play(b);
            }
            synchronized (this) { st.put("active", target); save(); }
            JSONObject m;
            synchronized (this) { m = st.optJSONObject("music"); }
            String label = "music".equals(target) ? "Musik" + (m != null && m.has("ctxType") ? " [" + m.optString("ctxType") + "]" : "") : "Podcast";
            addLog("→ " + label + " (" + (System.currentTimeMillis() - t0) + " ms)" + (why != null ? " · " + why : ""), "o");
            return null;
        } catch (Exception e) {
            String m = explain(e);
            addLog("Umschalten fehlgeschlagen: " + m, "e");
            return m;
        }
    }

    private synchronized void setMode(String m) {
        try { if (m == null) st.remove("mode"); else st.put("mode", m); } catch (JSONException ignored) { }
        save();
    }
}
