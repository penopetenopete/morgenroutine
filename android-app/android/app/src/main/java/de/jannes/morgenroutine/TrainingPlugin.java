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

    @PluginMethod
    public void startAuto(PluginCall call) { core().startAuto(call.getInt("every", 30)); call.resolve(); }

    @PluginMethod
    public void stopAuto(PluginCall call) { core().stopAuto(); call.resolve(); }

    @PluginMethod
    public void addLog(PluginCall call) { core().addLog(call.getString("text", ""), call.getString("kind", "")); call.resolve(); }

    @PluginMethod
    public void clearLog(PluginCall call) { core().clearLog(); call.resolve(); }
}
