# IronPulse v1.0 — QA Engineering Test Plan

## 1. Automated Integrity Suite (`node scripts/qa-check.js`)
Executed automatically in GitHub Actions prior to APK compilation:
- Validates all 40 exercises have valid muscle group IDs, kinematics profile mappings, tempo strings, cues, mistakes/fixes, and equipment tags.
- Validates onboarding program generation across all **8 disciplines × 2 sexes (Male/Female) × 5 equipment profiles × 3 experience levels** (240 combinations) with zero empty days or undefined exercise references.
- Validates Epley 1RM math, bodyweight (`0 kg`) progressive overload fallback, RIR autoregulation rules, and 72-hour fatigue decay bounds (`0..100`).

## 2. Mobile Device & APK Verification Checklist (Redmi Note 14 Pro 5G / Android 14+)
- [ ] Cold launch loads under 400ms in Airplane Mode (100% offline).
- [ ] First-run onboarding animates live Male/Female preview when toggled.
- [ ] Active Workout Logger keeps screen awake (`FLAG_KEEP_SCREEN_ON`) and releases wake lock on finish.
- [ ] Completing a set triggers spark FX + tactile haptic pulse + starts rest timer without pausing Spotify.
- [ ] Exceeding previous best triggers PR IGNITION stamp + ember burst + `vibratePR()`.
- [ ] Force-closing app mid-session restores exact active workout state from persistence on reopen.
- [ ] Hardware Back button closes modals/returns from active session before exiting the app.
- [ ] JSON Backup Export copies/shares clean valid JSON and re-imports cleanly.
