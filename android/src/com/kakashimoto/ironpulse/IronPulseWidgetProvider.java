package com.kakashimoto.ironpulse;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class IronPulseWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "ironpulse_widget_prefs";

    public static void saveSnapshotAndRefresh(
            Context context,
            String dayTitle,
            String focus,
            String discipline,
            String readiness,
            String sessionsLabel
    ) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit()
            .putString("dayTitle", dayTitle != null ? dayTitle : "READY TO TRAIN")
            .putString("focus", focus != null ? focus : "Tap to start session")
            .putString("discipline", discipline != null ? discipline : "IRONPULSE")
            .putString("readiness", readiness != null ? readiness : "100%")
            .putString("sessionsLabel", sessionsLabel != null ? sessionsLabel : "0 DONE")
            .apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, IronPulseWidgetProvider.class);
        int[] ids = mgr.getAppWidgetIds(cn);
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                updateWidget(context, mgr, id);
            }
        }
    }

    private static void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_ironpulse);

        views.setTextViewText(R.id.widget_day_title, sp.getString("dayTitle", "IRONPULSE"));
        views.setTextViewText(R.id.widget_focus, sp.getString("focus", "Tap to start your session"));
        views.setTextViewText(R.id.widget_discipline, sp.getString("discipline", "STRENGTH"));
        views.setTextViewText(R.id.widget_readiness, sp.getString("readiness", "100%"));
        views.setTextViewText(R.id.widget_sessions, sp.getString("sessionsLabel", "0 DONE"));

        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                context,
                0,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pi);

        mgr.updateAppWidget(widgetId, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int widgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId);
        }
    }
}
