package com.kakashimoto.ironpulse;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class IronPulseBridge {
    private final Activity activity;
    private final WebView webView;
    private final Vibrator vibrator;
    private ToneGenerator toneGen;
    private volatile boolean isDownloading = false;

    public IronPulseBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        try {
            this.toneGen = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 75);
        } catch (Exception ignored) {
            this.toneGen = null;
        }
    }

    private void pulse(long[] timings, int[] amplitudes) {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1));
            } else {
                vibrator.vibrate(timings, -1);
            }
        } catch (Exception ignored) {}
    }

    private void evalJs(final String script) {
        activity.runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(script, null);
            }
        });
    }

    private static String toB64(String text) {
        byte[] data = (text == null ? "" : text).getBytes(StandardCharsets.UTF_8);
        return Base64.encodeToString(data, Base64.NO_WRAP);
    }

    private HttpURLConnection openFollowingRedirects(String urlStr, String acceptHeader) throws Exception {
        String current = urlStr;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setRequestProperty("User-Agent", "IronPulse-Android/" + BuildConfig.VERSION_NAME);
            if (acceptHeader != null) {
                conn.setRequestProperty("Accept", acceptHeader);
            }
            int code = conn.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) {
                    throw new Exception("Redirect missing Location header");
                }
                current = new URL(new URL(current), loc).toString();
                continue;
            }
            return conn;
        }
        throw new Exception("Too many HTTP redirects");
    }

    @JavascriptInterface
    public void vibrateLight() {
        pulse(new long[]{0, 22}, new int[]{0, 90});
    }

    @JavascriptInterface
    public void vibrateSetDone() {
        pulse(new long[]{0, 45, 35, 30}, new int[]{0, 180, 0, 120});
    }

    @JavascriptInterface
    public void vibratePR() {
        pulse(new long[]{0, 70, 50, 70, 50, 140}, new int[]{0, 220, 0, 220, 0, 255});
    }

    @JavascriptInterface
    public void vibrateRestEnd() {
        pulse(new long[]{0, 90, 70, 90}, new int[]{0, 240, 0, 240});
    }

    @JavascriptInterface
    public void setKeepScreenOn(final boolean keepOn) {
        activity.runOnUiThread(() -> {
            if (keepOn) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    @JavascriptInterface
    public void playTone(String kind) {
        if (toneGen == null) return;
        try {
            switch (kind) {
                case "tick":
                    toneGen.startTone(ToneGenerator.TONE_PROP_BEEP, 45);
                    break;
                case "peak":
                    toneGen.startTone(ToneGenerator.TONE_PROP_ACK, 85);
                    break;
                case "rest":
                    toneGen.startTone(ToneGenerator.TONE_PROP_BEEP2, 180);
                    break;
                case "pr":
                    toneGen.startTone(ToneGenerator.TONE_CDMA_CONFIRM, 240);
                    break;
                default:
                    toneGen.startTone(ToneGenerator.TONE_PROP_BEEP, 50);
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void shareBackup(String jsonPayload) {
        activity.runOnUiThread(() -> {
            try {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(Intent.EXTRA_SUBJECT, "IronPulse Workout Backup");
                share.putExtra(Intent.EXTRA_TEXT, jsonPayload);
                activity.startActivity(Intent.createChooser(share, "Export IronPulse Backup"));
            } catch (Exception e) {
                copyToClipboard(jsonPayload);
            }
        });
    }

    @JavascriptInterface
    public void copyToClipboard(String text) {
        activity.runOnUiThread(() -> {
            ClipboardManager cb = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cb != null) {
                cb.setPrimaryClip(ClipData.newPlainText("IronPulse", text));
                Toast.makeText(activity, "Copied backup JSON to clipboard", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public String getVersion() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public int getVersionCode() {
        return BuildConfig.VERSION_CODE;
    }

    @JavascriptInterface
    public String getDefaultRepo() {
        return BuildConfig.GITHUB_REPO;
    }

    @JavascriptInterface
    public void openExternalUrl(final String url) {
        activity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(activity, "Unable to open browser URL", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void checkGitHubRelease(final String repoInput) {
        final String repo = (repoInput == null || repoInput.trim().isEmpty())
                ? BuildConfig.GITHUB_REPO
                : repoInput.trim();

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String apiUrl = "https://api.github.com/repos/" + repo + "/releases/latest";
                conn = openFollowingRedirects(apiUrl, "application/vnd.github+json");
                int status = conn.getResponseCode();
                InputStream stream = (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (stream != null) {
                    byte[] buf = new byte[4096];
                    int read;
                    while ((read = stream.read(buf)) != -1) {
                        out.write(buf, 0, read);
                    }
                    stream.close();
                }
                String body = out.toString("UTF-8");
                if (status == 200) {
                    final String b64 = toB64(body);
                    evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onReleaseCheckResult('" + b64 + "')");
                } else if (status == 404) {
                    final String b64 = toB64("NO_RELEASE_YET");
                    evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onReleaseCheckError('" + b64 + "')");
                } else {
                    final String b64 = toB64("GitHub API HTTP " + status);
                    evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onReleaseCheckError('" + b64 + "')");
                }
            } catch (Exception e) {
                final String msg = e.getMessage() != null ? e.getMessage() : "Network unavailable";
                final String b64 = toB64(msg);
                evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onReleaseCheckError('" + b64 + "')");
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @JavascriptInterface
    public void downloadAndInstallApk(final String downloadUrl) {
        if (isDownloading) return;
        isDownloading = true;

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = openFollowingRedirects(downloadUrl, "application/octet-stream");
                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new Exception("Download failed (HTTP " + status + ")");
                }
                long total = conn.getContentLengthLong();
                File target = ApkFileProvider.getUpdateApkFile(activity);
                File partFile = new File(target.getParentFile(), ApkFileProvider.APK_FILENAME + ".part");
                if (partFile.exists()) partFile.delete();

                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream fos = new FileOutputStream(partFile)) {
                    byte[] buf = new byte[16384];
                    long downloaded = 0;
                    int read;
                    long lastPush = 0;
                    while ((read = in.read(buf)) != -1) {
                        fos.write(buf, 0, read);
                        downloaded += read;
                        long now = System.currentTimeMillis();
                        if (now - lastPush >= 120) {
                            lastPush = now;
                            int pct = total > 0 ? (int) Math.min(99, (downloaded * 100L) / total) : 50;
                            evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onDownloadProgress(" + pct + "," + downloaded + "," + total + ")");
                        }
                    }
                    fos.flush();
                }

                if (target.exists()) target.delete();
                if (!partFile.renameTo(target)) {
                    throw new Exception("Failed to finalize update APK file");
                }

                evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onDownloadComplete()");
                installDownloadedApk();
            } catch (Exception e) {
                final String msg = e.getMessage() != null ? e.getMessage() : "Download failed";
                final String b64 = toB64(msg);
                evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onDownloadError('" + b64 + "')");
            } finally {
                isDownloading = false;
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @JavascriptInterface
    public void installDownloadedApk() {
        activity.runOnUiThread(() -> {
            try {
                File apkFile = ApkFileProvider.getUpdateApkFile(activity);
                if (!apkFile.exists()) {
                    Toast.makeText(activity, "Downloaded APK not found. Please download again.", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
                    Toast.makeText(activity, "Allow IronPulse to install updates, then return and tap Install.", Toast.LENGTH_LONG).show();
                    Intent permIntent = new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName())
                    );
                    permIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(permIntent);
                    evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onInstallPermissionNeeded()");
                    return;
                }

                Uri apkUri = ApkFileProvider.getUpdateApkUri();
                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(installIntent);
            } catch (Exception e) {
                final String msg = e.getMessage() != null ? e.getMessage() : "Installer launch failed";
                final String b64 = toB64(msg);
                evalJs("window.IronPulseUpdater && window.IronPulseUpdater.onDownloadError('" + b64 + "')");
            }
        });
    }

    public void release() {
        if (toneGen != null) {
            try {
                toneGen.release();
            } catch (Exception ignored) {}
            toneGen = null;
        }
    }
}
