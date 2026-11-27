# IronPulse — Offline Anatomical Strength Tutor & Workout Tracker

**Repository:** [https://github.com/Kakashimoto14/IronPulse](https://github.com/Kakashimoto14/IronPulse)  
**Package ID:** `com.kakashimoto.ironpulse`  
**Platform:** Android 8.0+ (100% Offline APK compiled via Gradle-Free GitHub Actions)

---

## Core Engineering Highlights

- **v3 Studio 3D Tutor (skinned glTF athletes + biomechanical IK):** Male and female athletes ship as skinned glTF 2.0 `.glb` assets (27-bone rig with clavicles, fingers, thumbs and toes). They are driven by an analytic 2-bone IK engine: hands stay locked to bars and handles, feet stay planted, and benches are fitted flush to the skinned body. Muscle highlighting is per pixel: **Primary (Vermilion `#F43A26`)**, **Secondary (Indigo `#4F6BFF`)** and **Stabilizers (cyan)**. Studio lighting, 360° orbit, pinch zoom and tap-a-muscle are included, with tempo controls and phase scrubbing. All 41 exercises are verified frame by frame by `scripts/biomech-check.js`.
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

## 3D Engine Architecture (v3.0.0)

| Layer | File | Role |
|---|---|---|
| Avatar assets | `models/ironpulse-{male,female}.glb` → `assets/www/js/data/avatar-*.js` | Skinned glTF 2.0 binaries (base64-embedded so `file://` WebView loading needs no XHR) |
| Asset pipeline | `tools/avatar/build.py` (+ `body.py`, `sdf.py`) | Offline, deterministic: anatomical sculpt → marching cubes → diffusion skin weights → QEM decimation → AO bake → `.glb` |
| Loader | `assets/www/js/engine/gltf-loader.js` | Zero-dependency GLB parser and bone-name mapper (native / Mixamo / MPFB-Rigify aliases) |
| Motion | `assets/www/js/engine/kinematics-3d.js` | World-space constraint clips for every exercise, 2-bone IK with pole/aim vectors, mesh-fitted supports |
| Renderer | `assets/www/js/engine/webgl-3d.js` | WebGL1 GPU skinning, per-pixel muscle map, studio lighting, contact shadows, auto-framing |
| Verification | `scripts/biomech-check.js` (run by `qa-check.js`) | 41 exercises × 2 sexes × 48 frames: grip lock, bone lengths, planted feet, zero clipping, coaching rules |

Rebuild the avatars after editing the sculpt (Python 3 + numpy, scipy, scikit-image):

```bash
python3 tools/avatar/build.py all            # ~3 min, rewrites models/*.glb and assets/www/js/data/avatar-*.js
python3 tools/avatar/build.py --regions-only # fast path: only the muscle-highlight table
node scripts/biomech-check.js --verbose      # per-exercise biomechanics report
node tools/render/contact-sheet.js out.png "barbell_bench,barbell_squat" "0,0.48"   # headless render review (needs Playwright)
```

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
