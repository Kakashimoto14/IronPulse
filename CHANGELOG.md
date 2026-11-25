# IronPulse Changelog

## v1.2.0
- **Studio Ecorché Anatomical Upgrade:** Upgraded both the 60 FPS animated Male/Female exercise tutor (multi-strand fiber striations + live on-stage contraction % telemetry bar) and the Front/Back Recovery Heatmap (sculpted anatomical Bézier muscle polygons with fat-thumb touch targeting).
- **Interactive Canvas Analytics (`charts.js`):** Added high-DPI **Estimated 1RM Strength Trend** line charts and a **Bodyweight & Tape Measurements** tracker (`Chest`, `Arms`, `Forearms`, `Waist`, `Thighs` in cm).
- **Custom Split & Workout Editor:** Added `EDIT SPLIT` on the Today dashboard to rename days, adjust set counts, add/remove any of the 41 movements, or create custom specialist days.
- **Live Audio Tempo Metronome:** Added a `BEEP` toggle in Active Workout Focus Mode synced to the animated tutor phases (`ECCENTRIC` → `PAUSE` → `DRIVE`) using Android's non-intrusive notification stream (never pauses Spotify).
- **Native Android Home Screen Widget (`IronPulseWidgetProvider`):** Zero-dependency Android widget displaying today's scheduled workout, discipline badge, readiness %, and session counter—auto-synced whenever you train.
- **CI Fix:** Permanently fixed escaped `newline="\n"` in `scripts/build.sh` manifest staging and added dual IndexedDB snapshot mirroring in `db.js`.

## v1.1.0
- In-app GitHub Releases OTA Updater (`ApkFileProvider`, `updater.js`, background APK downloader + installer) and unified `version.json` version control.

## v1.0.0
- Initial IronPulse release: 60 FPS animated Male & Female tutor, 41 exercises across 8 disciplines, 6-step onboarding, double progression, kinetic FX, and Gradle-free GitHub Actions APK pipeline.
