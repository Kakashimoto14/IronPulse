# IronPulse Changelog

## v1.1.0
- **In-App OTA Updater (GitHub Releases):** Automatically checks `Kakashimoto14/IronPulse` latest GitHub Release on launch and on-demand in the **Athlete** tab.
- **Native APK Downloader & Installer:** Zero-dependency `ApkFileProvider` + `IronPulseBridge` background downloader with live progress bar (`0%–100%`), Android 8+ "Allow from this source" permission guidance, and browser fallback.
- **Unified Version Control (`version.json`):** `scripts/build.sh` dynamically generates `BuildConfig.java`, stamps `AndroidManifest.xml`, syncs `assets/www/version.json`, and names the APK `IronPulse-v<version>.apk` automatically from `version.json` or the pushed `v*` Git tag.

## v1.0.0
- Initial IronPulse release: 60 FPS animated Male & Female anatomical tutor, 41 research-backed exercises across 8 disciplines (including Arm Wrestling & Combat), 6-step onboarding, double-progression engine, kinetic FX, and Gradle-free GitHub Actions APK pipeline.
