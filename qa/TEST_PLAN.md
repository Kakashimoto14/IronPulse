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

## v3.0.0 — 3D Avatar & Biomechanics Verification
1. `node scripts/qa-check.js` loads both glTF avatars (rig completeness, normalised skin weights, muscle region table), confirms offline script wiring (no CDN `src=`) and runs `scripts/biomech-check.js`.
2. Biomechanics gate (must report 82/82): grip/IK error ≤ 6 mm, bone drift ≤ 1.5 mm, no floor penetration > 8 mm, bench/pad compression ≤ 16 mm (torso) / 12 mm (limbs), equipment overlap ≤ 12 mm, flush back/seat/knee contact ≤ 14 mm, planted feet (no skating), plus per-exercise coaching rules.
3. Visual review: `node tools/render/contact-sheet.js out.png "<exerciseIds>" "0,0.25,0.48" male` renders the real WebGL scene headlessly (SwiftShader) for frame-by-frame inspection.
4. On device (Redmi Note 14 Pro 5G / Android 14): open Tutor → any exercise → verify 360° orbit, pinch zoom, FRONT/3/4/SIDE presets, SCULPT/SKIN toggle, tap-a-muscle on the Explorer, scrubber phases, and smooth playback at 0.5x/1.0x/FAST.
