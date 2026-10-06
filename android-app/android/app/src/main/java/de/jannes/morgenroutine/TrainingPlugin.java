package de.jannes.morgenroutine;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** Brücke zwischen Web-Seite und nativer Spotify-Steuerung (window.Capacitor.Plugins.Training). */
@CapacitorPlugin(name = "Training")
public class TrainingPlugin extends Plugin {

    private SpotifyCore core() { return SpotifyCore.get(getContext()); }

    private static TrainingPlugin instance;
    @Override public void load() { instance = this; }

    /** Knopf aus der Benachrichtigung an die Seite weitergeben ("main" | "pause" | "resume" | "next"). */
    static void sendAction(String what) {
        TrainingPlugin p = instance; if (p == null) return;
        JSObject d = new JSObject(); d.put("action", what);
        p.notifyListeners("notifAction", d, true);
        if (p.getBridge() != null && p.getBridge().getWebView() != null) {
            p.getBridge().getWebView().post(() -> { p.getBridge().getWebView().onResume(); p.getBridge().getWebView().resumeTimers(); });
        }
    }

    /** Aktueller Stand für die Benachrichtigung (null/leer = kein Workout). */
    @PluginMethod
    public void setNotif(PluginCall call) {
        JSObject s = call.getObject("state");
        WorkoutNotif.setState(getContext(), s == null || s.length() == 0 ? null : s);
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        try { call.resolve(JSObject.fromJSONObject(core().snapshotState())); }
        catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void setAuth(PluginCall call) {
        core().setAuth(call.getString("access"), call.getString("refresh"), call.getLong("exp", 0L));
        call.resolve();
    }

    @PluginMethod
    public void logout(PluginCall call) { core().logout(); call.resolve(); }

    @PluginMethod
    public void getToken(PluginCall call) {
        core().post(() -> {
            try { JSObject r = new JSObject(); r.put("access", core().freshToken()); call.resolve(r); }
            catch (Exception e) { call.reject(SpotifyCore.explain(e)); }
        });
    }

    @PluginMethod
    public void setConfig(PluginCall call) {
        try { core().setConfig(new JSONObject(call.getString("config", "{}"))); call.resolve(); }
        catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void switchTo(PluginCall call) {
        String target = call.getString("target", "music");
        core().post(() -> {
            String err = core().switchTo(target, null);
            JSObject r = new JSObject();
            r.put("ok", err == null);
            if (err != null) r.put("error", err);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void playMusic(PluginCall call) {
        JSONObject m;
        try { m = new JSONObject(call.getString("music", "{}")); } catch (Exception e) { call.reject(e.getMessage()); return; }
        core().post(() -> {
            String err = core().switchTo("music", "Auswahl", m);
            JSObject r = new JSObject();
            r.put("ok", err == null);
            if (err != null) r.put("error", err);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        try { core().setPlan(new org.json.JSONArray(call.getString("events", "[]"))); call.resolve(); }
        catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void clearPlan(PluginCall call) { core().clearPlan(); call.resolve(); }

    @PluginMethod
    public void control(PluginCall call) {
        String action = call.getString("action", "toggle");
        core().post(() -> {
            String err = core().control(action);
            JSObject r = new JSObject();
            r.put("ok", err == null);
            if (err != null) r.put("error", err);
            call.resolve(r);
        });
    }

    /** Aufruf aus app.js syncNative(): geplante Phasen/Töne des laufenden Workouts. */
    @PluginMethod
    public void scheduleEvents(PluginCall call) {
        try {
            org.json.JSONArray ev = call.getArray("events");
            core().setEvents(ev == null ? new org.json.JSONArray() : ev, call.getBoolean("sound", core().soundOn()));
            WorkoutNotif.setEvents(getContext(), ev);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void clearEvents(PluginCall call) { core().clearEvents(); call.resolve(); }

    @PluginMethod
    public void setSound(PluginCall call) { core().setSound(call.getBoolean("on", true)); call.resolve(); }

    @PluginMethod
    public void setSmart(PluginCall call) {
        core().setSmart(call.getBoolean("on", false), call.getInt("short", 20));
        call.resolve();
    }

    @PluginMethod
    public void startAuto(PluginCall call) { core().startAuto(call.getInt("every", 30)); call.resolve(); }

    @PluginMethod
    public void stopAuto(PluginCall call) { core().stopAuto(); call.resolve(); }

    @PluginMethod
    public void addLog(PluginCall call) { core().addLog(call.getString("text", ""), call.getString("kind", "")); call.resolve(); }

    @PluginMethod
    public void clearLog(PluginCall call) { core().clearLog(); call.resolve(); }
}
