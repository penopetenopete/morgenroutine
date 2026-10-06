package de.jannes.morgenroutine;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Knöpfe der Benachrichtigung (auch auf dem Sperrbildschirm) → App. */
public class NotifReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (a == null || !a.startsWith("training.")) return;
        TrainingPlugin.sendAction(a.substring(9));
    }
}
