# IronPulse Changelog

## v3.0.0 — Studio Avatars & Biomechanical IK Engine
- **New skinned glTF 2.0 athletes (`models/ironpulse-{male,female}.glb`, embedded as `assets/www/js/data/avatar-*.js`):** The v2 marching-cubes "clay" meshes are retired. A new offline asset pipeline (`tools/avatar/`) sculpts each body from ~160 anatomical primitives: three deltoid heads, a clavicular/sternal pectoral split, lat wings, a rectus abdominis grid, obliques, erectors, the quad sweep with VMO teardrop, two-head calves, real fingers and thumbs, sneakers with cupsoles, and a ponytail and sports bra for the female athlete. The pipeline meshes at 4.5 mm, diffuses skin weights across the surface, decimates with quadric error metrics to 30k vertices, bakes hemisphere AO and exports standard skinned `.glb` files (27-bone rig with clavicles, finger/thumb/toe joints and KHR_mesh_quantization normals).
- **Zero-dependency glTF loader (`gltf-loader.js`):** Parses `.glb` offline (no Three.js or CDN needed). It maps native, Mixamo and MPFB/Rigify bone names onto the IronPulse rig, so a future CC0 studio model can be swapped in.
- **Biomechanical IK motion engine (`kinematics-3d.js`, rewritten):** Hand-guessed Euler poses are replaced by world-space constraints solved every frame with analytic 2-bone IK and pole/aim vectors. Hands stay locked to bars, handles, ropes and pads, and feet stay planted with flat soles. Benches, seats, knee pads and steps are fitted to the skinned mesh so backs and glutes rest flush. All 41 exercises have dedicated clips, e.g.:
  - **Presses:** vertical-forearm bench and incline paths with about 52–56° elbow tuck.
  - **Overhead press:** bar path held over midfoot.
  - **Lateral raise:** scapular-plane raise.
  - **Face pull:** finishes in external rotation.
  - **Pulls:** dead-hang to chin-over-bar pull-ups and chin-ups.
  - **Rows:** 48° hinge rows and a bench-supported one-arm row.
  - **Squats and lunges:** below-parallel squats with the bar over midfoot, a true RDL hinge, a shin-grazing deadlift, Bulgarian split squat and pistol.
  - **Arm wrestling:** anchored-elbow pronation, cupping, rising, back- and side-pressure.
  - **Athletic and combat:** KB hip snap with straight arms, a box jump with landing and step-down, and a rear-foot-pivot cross with the guard hand pinned.
  - **Core:** pelvic-curl leg raise and a hollow forearm plank.
- **Studio renderer (`webgl-3d.js`):** Per-pixel anatomical muscle map generated from the avatar's region table, with anti-aliased borders, muscle seams and fibre shading. Primary is Vermilion `#F43A26`, Secondary is Indigo `#4F6BFF` and Stabilizers are muted cyan. Also adds key, fill and rim lights with a hemisphere ambient and baked AO, ACES tone-mapping, soft contact shadows, materialised equipment (hex dumbbells, Olympic bar with collars, cable towers and rope, AW table with peg and strap), and tight view-dependent auto-framing over the whole rep so head, feet and plates are never cropped.
- **Automated biomechanics QA (`scripts/biomech-check.js`, wired into `qa-check.js`):** 41 exercises × male/female × 48 frames. It CPU-skins the shipped mesh and asserts:
  - grip lock ≤ 6 mm, rigid bone lengths, and planted feet with no skating;
  - no penetration of the floor, benches or plates;
  - flush support contact.
  - **Coaching rules:** forearm verticality, elbow tuck, depth below parallel, bar or load over midfoot, pinned upper arms, plank line, RDL knee limit, straight-arm KB, anchored AW elbow, face-pull external rotation, lateral-raise height, pelvic curl, and guard hand on the cheek.

## v2.2.0
- **Full-Body 3D Auto-Framing & Pinch-to-Zoom (`webgl-3d.js`, `app.js`):** Adjusted 3D camera distance (`3.75m`, `34°` FOV) and aspect-ratio compensation so the full head-to-sneakers body and barbell plates fit cleanly inside every viewport without cropping, plus two-finger pinch-to-zoom.
- **Zero Armpit Spikes / Zero Hip Tearing (4-Bone GPU Skinning + 10-Pass Geodesic Weight Diffusion):** Replaced hard coordinate branch cutoffs with continuous nearest-bone softmin weights diffused across 10 mesh-graph Laplacian passes, mathematically keeping max posed edge length under 5.5cm even at 82° Bench Press flexion.
- **Organic Anatomical Re-Sculpt & Baked 3D Cavity AO:** Removed blocky rectangular chest primitives and male waist-hip shelves in favor of smooth organic swept pectorals, continuous athletic obliques, natural integrated abs, and multi-scale SDF Ambient Occlusion baked per vertex for studio-grade muscle valley depth.
- **Smart Exercise Camera Presets:** Lying movements (Bench Press, Incline Press) now use flattering upper-chest/3/4/side camera presets instead of pointing up from the foot of the bench.

## v2.1.0
- **Heroic Muscular Male & Hourglass Curvy Female 3D Sculpt Overhaul:** Re-engineered both watertight 3D meshes (`21,940` tris Male / `18,008` tris Female) with wider bounding volumes (100% complete hands & forearms, zero clipping), silk-smooth analytical SDF gradient normals, square-cut male pectorals, deep spinal furrow, cannonball deltoids, sweeping quads/calves, and feminine hourglass waist, sculpted glutes, athletic bust, and flowing ponytail.
- **Per-Pixel 4K Sportswear & Anatomical Muscle Shader (`webgl-3d.js`):** Replaced vertex-grid clothing and box-cut muscle stripes with smooth per-pixel `smoothstep` hems (zero jagged shorts edges!) and curved anatomical muscle silhouettes (fan-shaped pectorals, teardrop delts, sculpted 6-pack abs) rendered with Lyfta-grade Vermilion-Red Primary + Electric Indigo-Blue Secondary contrast.
- **Lyfta-Grade Exercise UX (`app.js`, `app.css`):** Added segmented **About | History | Progress** tabs inside every exercise modal, **Favorites (`★`)** bookmarking & filter chip, **Quick Train** 1-tap solo exercise launch, eye-level heroic camera framing, and a **STUDIO BG / DARK BG** toggle.

## v2.0.0
- **Real 3D WebGL Sculpted Faceless Human Engine (`webgl-3d.js`, `kinematics-3d.js`, `mesh-male.js`, `mesh-female.js`):** Completely replaced 2D flat/puppet drawings with real watertight 18,000-triangle volumetric sculpted 3D Male & Female faceless anatomical meshes rendered at 60 FPS in WebGL with 17-bone GPU skeletal skinning.
- **360° Touch-Orbit & GPU 3D Muscle Picking:** Spin the 3D human figure freely with your finger on the Dashboard, Tutor Explorer, Exercise Modal, and Active Workout Logger; tap any muscle directly on the 3D body to filter exercises.
- **Dual Studio Looks (`SCULPT` & `SKIN`):** Switch live between matte alabaster 3D ecorché marble and warm athletic skin + charcoal sportswear, both featuring pulsing procedural 3D crimson muscle-fiber striations on active muscles.
- **Real 3D Gym Equipment:** WebGL-rendered Olympic barbells with stacked iron plates, dumbbells, flat & incline benches, cable towers, pull-up rack, dip bars, and arm-wrestling competition table anchored dynamically to the 3D athlete's hands.

## v1.3.0
- **Premium Fitness SaaS UI/UX Overhaul:** Complete visual redesign inspired by Hevy, Fitbod, and Ladder—soft elevated dark cards (`#090A0E` / `#12141B`), `14–22px` rounded geometry, glass-blur floating bottom navigation pill, bottom-sheet drag handles, clean humanist typography, and restrained soft-tinted muscle badges.
- **Realistic Athletic Human Animator (`rig-renderer.js` v3.0 & `bodymap.js` v3.0):** Replaced geometric robot coloring with warm athletic skin shading, dark sportswear (gym shorts + female athletic top), 3/4 foreshortened Olympic barbells/benches/cable towers, and anatomical crimson-red muscle fiber overlays strictly on targeted muscles.

## v1.2.1
- **Signing Key Conflict Guard:** `IronPulseBridge.getSigningSha256()` + `scripts/build.sh` now stamp and compare APK signing SHA-256 fingerprints before launch, displaying a clear 1-tap backup prompt if signing keys differ instead of an unexplained Android package conflict.
- **Zero-Error Termux Automation (`scripts/termux-setup-keystore.sh` & `scripts/termux-release.sh`):** 1-command permanent production keystore generator for Termux and 1-command Git sync/commit/tag/push script that never wipes `.git` or loses `origin`.

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
