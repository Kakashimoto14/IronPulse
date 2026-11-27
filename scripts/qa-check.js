'use strict';

const assert = require('assert');
const Data = require('../assets/www/js/data/exercises.js');
const Prog = require('../assets/www/js/engine/progression.js');
const Builder = require('../assets/www/js/engine/program-builder.js');
const Kin = require('../assets/www/js/engine/kinematics.js');

console.log('=== IronPulse Automated QA & Sports-Science Integrity Check ===');

// 1. Verify Exercise Database Integrity
assert(Data.EXERCISES.length >= 34, 'Expected at least 34 exercises, got ' + Data.EXERCISES.length);
const seenIds = new Set();
for (const ex of Data.EXERCISES) {
  assert(!seenIds.has(ex.id), 'Duplicate exercise id: ' + ex.id);
  seenIds.add(ex.id);
  assert(ex.name && ex.name.length > 2, 'Missing name on ' + ex.id);
  assert(Kin.PROFILES[ex.kinematics], 'Missing kinematics profile "' + ex.kinematics + '" for ' + ex.id);
  assert(ex.primary.length > 0, 'Missing primary muscles on ' + ex.id);
  for (const m of [...ex.primary, ...ex.secondary, ...ex.stabilizers]) {
    assert(Data.MUSCLES[m], 'Unknown muscle id "' + m + '" in ' + ex.id);
  }
  assert(ex.cues.length >= 3, 'Expected >= 3 coaching cues on ' + ex.id);
  assert(ex.mistakes.length >= 1, 'Expected >= 1 Form Doctor mistake/fix on ' + ex.id);
  assert(ex.ladder && ex.ladder.easier && ex.ladder.harder, 'Missing progression ladder on ' + ex.id);
  for (const sw of ex.swapIds) {
    assert(Data.EXERCISE_MAP[sw], 'Broken swapId "' + sw + '" on ' + ex.id);
  }
}
console.log('[PASS] Exercise database (' + Data.EXERCISES.length + ' movements, muscle maps, kinematics & swap graphs valid)');

// 2. Verify Onboarding Program Generator across all 8 disciplines x 2 sexes x 5 equipment x 3 levels
const disciplines = Object.keys(Data.DISCIPLINES);
assert.strictEqual(disciplines.length, 8, 'Expected all 8 disciplines');
const sexes = ['male', 'female'];
const equips = ['hybrid', 'gym', 'calisthenics', 'dumbbell', 'armwrestling'];
const exps = ['beginner', 'intermediate', 'advanced'];
let combos = 0;

for (const disc of disciplines) {
  for (const sex of sexes) {
    for (const eq of equips) {
      for (const exp of exps) {
        const plan = Builder.generateProgram({
          sex, discipline: disc, equipment: eq, experience: exp,
          daysPerWeek: 4, sessionMinutes: 60, recoveryMode: 'shift',
          jointSafeguards: ['shoulders']
        });
        assert(plan.days.length === 4, 'Expected 4 days for ' + disc);
        for (const day of plan.days) {
          assert(day.exercises.length >= 3, 'Too few exercises on day for ' + disc + '/' + eq);
          for (const item of day.exercises) {
            assert(Data.EXERCISE_MAP[item.exerciseId], 'Invalid exercise generated: ' + item.exerciseId);
            assert(item.sets >= 2, 'Invalid set count');
          }
        }
        combos++;
      }
    }
  }
}
console.log('[PASS] Program generator verified across ' + combos + ' onboarding combinations (8 disciplines x Male/Female x Equipment x Experience)');

// 3. Verify Sports-Science Progression & Fatigue Math
assert.strictEqual(Prog.epley1RM(100, 1), 100);
assert(Prog.epley1RM(100, 10) > 130 && Prog.epley1RM(100, 10) < 135, 'Epley 1RM formula check failed');

const recBw = Prog.recommendNextTarget([{ sets: [{ done: true, warmup: false, weight: 0, reps: 12, rir: '1-2' }] }], [8, 12], true, 'compound');
assert(recBw.reps === 14, 'Bodyweight double-progression check failed');

const recLoad = Prog.recommendNextTarget([{ sets: [{ done: true, warmup: false, weight: 60, reps: 10, rir: '1-2' }] }], [6, 10], false, 'compound');
assert(recLoad.weight === 62.5 && recLoad.reps === 6, 'Weighted compound load jump check failed');

const fatigue = Prog.computeMuscleFatigue([{
  completedAt: Date.now() - 3600000,
  exercises: [{ exerciseId: 'aw_belt_pronation', sets: [{ done: true, warmup: false }, { done: true, warmup: false }, { done: true, warmup: false }] }]
}], Data.EXERCISE_MAP, Date.now(), 'shift');
assert(fatigue.pronators > 30 && fatigue.pronators <= 100, 'Fatigue heatmap calculation failed');

const fTier = Prog.evaluateStrengthTier('female', 55, 55, 'press');
const mTier = Prog.evaluateStrengthTier('male', 65, 65, 'press');
assert(fTier.tier === 'ADVANCED' && mTier.tier === 'NOVICE', 'Sex-adjusted relative strength standard mismatch');

console.log('[PASS] 1RM math, double progression, fatigue decay & Male/Female strength standards verified');

// 4. Verify Version Control & OTA Updater SemVer Logic
const fs = require('fs');
const Updater = require('../assets/www/js/engine/updater.js');
const rootVer = JSON.parse(fs.readFileSync('version.json', 'utf8'));
const webVer = JSON.parse(fs.readFileSync('assets/www/version.json', 'utf8'));
assert(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(rootVer.version), 'Invalid SemVer in version.json: ' + rootVer.version);
assert.strictEqual(rootVer.version, webVer.version, 'Root version.json and assets/www/version.json out of sync');
assert.strictEqual(rootVer.tag, 'v' + rootVer.version, 'Tag must equal v<version>');
assert.strictEqual(Updater.compareSemver('v1.2.0', '1.1.0'), 1);
assert.strictEqual(Updater.compareSemver('v1.10.0', 'v1.2.0'), 1);
assert.strictEqual(Updater.compareSemver('v1.1.0', '1.1.0'), 0);
assert.strictEqual(Updater.compareSemver('1.0.9', '1.1.0'), -1);
console.log('[PASS] Version control (v' + rootVer.version + ') & OTA SemVer comparator verified');


// 5. Verify v1.2.0 Native Widget & Charts Asset Integrity
assert(fs.existsSync('android/src/com/kakashimoto/ironpulse/IronPulseWidgetProvider.java'), 'Missing IronPulseWidgetProvider.java');
assert(fs.existsSync('android/res/layout/widget_ironpulse.xml'), 'Missing widget_ironpulse.xml');
assert(fs.existsSync('android/res/xml/ironpulse_widget_info.xml'), 'Missing ironpulse_widget_info.xml');
assert(fs.existsSync('assets/www/js/engine/charts.js'), 'Missing charts.js');
const manifestXml = fs.readFileSync('android/AndroidManifest.xml', 'utf8');
assert(manifestXml.includes('IronPulseWidgetProvider'), 'Widget provider not registered in AndroidManifest.xml');
console.log('[PASS] Native Android Home Screen Widget & Analytics Charts verified');


// 6. Verify v2.0.0 Real 3D WebGL Sculpted Meshes & 3D Kinematics Coverage
const Kin3D = require('../assets/www/js/engine/kinematics-3d.js');
assert(fs.existsSync('assets/www/js/data/mesh-male.js'), 'Missing 3D male mesh');
assert(fs.existsSync('assets/www/js/data/mesh-female.js'), 'Missing 3D female mesh');
assert(fs.existsSync('assets/www/js/engine/webgl-3d.js'), 'Missing WebGL 3D engine');
for (const ex of Data.EXERCISES) {
  assert(Kin3D.PROFILES[ex.kinematics], 'Missing 3D kinematics profile for ' + ex.id + ' (' + ex.kinematics + ')');
}
console.log('[PASS] 3D WebGL sculpted Male/Female meshes & all 3D exercise kinematics verified');

console.log('=== ALL QA CHECKS PASSED ===');
