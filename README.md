# IronPulse — Offline Anatomical Strength Tutor & Workout Tracker

**Repository:** [https://github.com/Kakashimoto14/IronPulse](https://github.com/Kakashimoto14/IronPulse)  
**Package ID:** `com.kakashimoto.ironpulse`  
**Platform:** Android 8.0+ (100% Offline APK compiled via Gradle-Free GitHub Actions)

---

## Core Engineering Highlights

- **60 FPS Animated Male & Female Anatomical Tutor:** Sculpted multi-segment human rigs performing real exercise kinematics with phase-synced **Primary (Crimson)**, **Secondary (Amber)**, and **Stabilizer (Cobalt)** muscle firing, tempo speed controls (`0.5x` / `1.0x` / `TEMPO`), phase scrubbing, and force-vector callouts.
- **Anti-Slop Industrial Mobile UI:** Matte iron (`#0B0C0E`), cast plate (`#15171A`), gym chalk (`#F4F4F2`), and signal crimson (`#E11D2E`) — zero AI gradients, engineered for one-handed thumb control with kinetic set-completion sparks, PR Ignition effects, and haptic feedback.
- **First-Run Athlete Calibration (6-Step Onboarding):** Customizes your weekly split around Male/Female biomechanics, experience level, available equipment, schedule, sleep/shift recovery profile, and joint safeguards.
- **8 Research-Backed Training Disciplines:**
  1. **Strength Training** (NSCA heavy load 3–6 reps, long rest, neural force drive)
  2. **Mass Gain / Hypertrophy** (Schoenfeld 12–20 weekly hard sets, full ROM, double progression)
  3. **Aesthetics / V-Taper** (Proportional upper-pec, side-delt, lat width & arm focus)
  4. **Arm Wrestling** (Table vectors: Cupping, Belt Pronation, Rising, Back Pressure, Side Pressure & tendon blood-flow conditioning)
  5. **Calisthenics / Relative Strength** (Leverage progressions & bodyweight ladders)
  6. **Athletic Power & Conditioning** (Rate of Force Development + unilateral stability)
  7. **Combat / Boxing Conditioning** (Rotational punch power, high-guard shoulder endurance, neck/core armor)
  8. **Powerbuilding** (Heavy strength primary lifts + hypertrophy accessories)

---

## GitHub Actions APK Setup (Gradle-Free `d8` Pipeline)

This repository builds a verified, signed Android APK automatically on every push to `main` or version tag (`v*`) using `ubuntu-24.04` + pinned Android SDK `build-tools;34.0.0` (`aapt`, `javac --release 11`, `d8`, `zipalign`, `apksigner`).

### Optional Production Signing Secrets
In **GitHub Repo → Settings → Secrets and variables → Actions**, add:
- `KEYSTORE_B64` — Base64-encoded `.jks` / `.keystore` file
- `KEYSTORE_PASS` — Keystore password
- `KEY_ALIAS` — *(Optional)* Key alias
- `KEY_PASS` — *(Optional)* Key password
- `EXPECTED_SHA256` — *(Optional)* Certificate SHA-256 fingerprint verification

> If signing secrets are not yet configured, the workflow automatically generates a fallback debug keystore so your very first push still produces an installable APK artifact.

### Creating a Release
```bash
git tag v1.0.0
git push origin v1.0.0
```
GitHub Actions will run `node scripts/qa-check.js`, compile `dist/IronPulse-v1.0.0.apk`, verify the signature, and attach it to a GitHub Release automatically.

### Browser Preview (PC / Mobile Testing)
Open `assets/www/index.html` directly in Chrome/Edge DevTools (mobile viewport `390x844`) to preview and debug UI, animations, and onboarding without waiting for an APK build.
