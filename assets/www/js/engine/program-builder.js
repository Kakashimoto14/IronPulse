(function (root) {
  'use strict';

  function getData() {
    if (typeof module !== 'undefined' && module.exports) {
      return require('../data/exercises.js');
    }
    return root.IronPulseData;
  }

  function equipmentAllowed(exEquip, userEquip) {
    if (userEquip === 'hybrid' || userEquip === 'gym') {
      return true;
    }
    if (userEquip === 'armwrestling') {
      return ['armwrestling', 'bodyweight', 'calisthenics', 'dumbbell'].indexOf(exEquip) !== -1;
    }
    if (userEquip === 'dumbbell') {
      return ['dumbbell', 'bodyweight', 'combat'].indexOf(exEquip) !== -1;
    }
    if (userEquip === 'calisthenics') {
      return ['bodyweight', 'calisthenics'].indexOf(exEquip) !== -1;
    }
    return true;
  }

  function resolveSafeExercise(exId, profile, data, seen) {
    var ex = data.EXERCISE_MAP[exId];
    if (!ex) return 'pushup_standard';

    var used = seen || {};
    var injuries = profile.jointSafeguards || [];

    function isCandidateOk(cand, checkSafe) {
      if (!cand || used[cand.id]) return false;
      if (!equipmentAllowed(cand.equipment, profile.equipment)) return false;
      if (checkSafe && cand.jointStress.some(function (j) { return injuries.indexOf(j) !== -1; })) return false;
      return true;
    }

    if (isCandidateOk(ex, true)) return ex.id;

    for (var i = 0; i < (ex.swapIds || []).length; i++) {
      if (isCandidateOk(data.EXERCISE_MAP[ex.swapIds[i]], true)) return ex.swapIds[i];
    }

    for (var k = 0; k < (ex.swapIds || []).length; k++) {
      if (isCandidateOk(data.EXERCISE_MAP[ex.swapIds[k]], false)) return ex.swapIds[k];
    }

    // Fallback to unused compatible movement targeting same primary muscle
    for (var m = 0; m < data.EXERCISES.length; m++) {
      var c1 = data.EXERCISES[m];
      if (isCandidateOk(c1, true) && c1.primary.some(function (pm) { return ex.primary.indexOf(pm) !== -1; })) {
        return c1.id;
      }
    }

    // Final fallback: any unused equipment-compatible movement
    for (var n = 0; n < data.EXERCISES.length; n++) {
      if (isCandidateOk(data.EXERCISES[n], true)) return data.EXERCISES[n].id;
    }
    for (var p = 0; p < data.EXERCISES.length; p++) {
      if (isCandidateOk(data.EXERCISES[p], false)) return data.EXERCISES[p].id;
    }
    return 'pushup_standard';
  }

  function buildTemplatesByDiscipline(discipline) {
    var map = {
      strength: [
        { name: 'UPPER FORCE A', focus: 'Horizontal Press & Heavy Row', list: ['barbell_bench', 'barbell_row', 'barbell_ohp', 'pullup', 'triceps_pushdown'] },
        { name: 'LOWER FORCE A', focus: 'Squat & Posterior Chain', list: ['barbell_squat', 'romanian_deadlift', 'bulgarian_split_squat', 'standing_calf_raise', 'hanging_leg_raise'] },
        { name: 'UPPER FORCE B', focus: 'Overhead Strength & Pulls', list: ['barbell_ohp', 'chinup', 'db_incline_press', 'db_row', 'hammer_curl'] },
        { name: 'LOWER FORCE B', focus: 'Deadlift & Unilateral Drive', list: ['conventional_deadlift', 'goblet_squat', 'bulgarian_split_squat', 'standing_calf_raise', 'ab_plank_hollow'] }
      ],
      mass: [
        { name: 'PUSH HYPERTROPHY', focus: 'Chest, Delts & Triceps', list: ['db_incline_press', 'barbell_bench', 'lateral_raise', 'cable_fly', 'triceps_pushdown'] },
        { name: 'PULL HYPERTROPHY', focus: 'Lats, Mid-Back & Biceps', list: ['pullup', 'db_row', 'lat_pulldown', 'face_pull', 'incline_db_curl', 'hammer_curl'] },
        { name: 'LEGS & CORE MASS', focus: 'Quads, Hamstrings & Calves', list: ['barbell_squat', 'romanian_deadlift', 'bulgarian_split_squat', 'standing_calf_raise', 'hanging_leg_raise'] },
        { name: 'UPPER PUMP & ARMS', focus: 'Upper Shelf & Arm Volume', list: ['db_incline_press', 'chinup', 'db_shoulder_press', 'lateral_raise', 'incline_db_curl', 'pushup_diamond'] }
      ],
      aesthetics: [
        { name: 'V-TAPER UPPER', focus: 'Upper Pec, Side Delts & Lat Width', list: ['db_incline_press', 'pullup', 'lateral_raise', 'cable_fly', 'face_pull', 'incline_db_curl'] },
        { name: 'ATHLETIC LOWER', focus: 'Quad Sweep, Glutes & Calves', list: ['barbell_squat', 'romanian_deadlift', 'bulgarian_split_squat', 'standing_calf_raise', 'hanging_leg_raise'] },
        { name: 'DELTS, BACK & ARMS', focus: 'Width, Symmetry & Arm Detail', list: ['lat_pulldown', 'db_shoulder_press', 'lateral_raise', 'db_row', 'hammer_curl', 'triceps_pushdown'] },
        { name: 'SCULPT & CORE', focus: 'Chest Shelf, Rear Delts & Tight Waist', list: ['pushup_decline', 'chinup', 'lateral_raise', 'face_pull', 'ab_plank_hollow'] }
      ],
      armwrestling: [
        { name: 'TOPROLL & PRONATION', focus: 'Pronation, Rising & Back Pressure', list: ['aw_belt_pronation', 'aw_rising_lift', 'aw_back_pressure', 'hammer_curl', 'chinup'] },
        { name: 'HOOK & SIDE PRESSURE', focus: 'Cupping, Internal Rotation & Core', list: ['aw_rolling_cup', 'aw_side_pressure', 'barbell_bench', 'db_row', 'aw_fat_grip_hold'] },
        { name: 'FOUNDATION & TENDON', focus: 'Full-Body Power & Forearm Blood-Flow', list: ['conventional_deadlift', 'pullup', 'db_incline_press', 'aw_fat_grip_hold', 'face_pull'] },
        { name: 'TABLE VECTOR PEAK', focus: 'High-Tension Cup, Pronation & Drag', list: ['aw_belt_pronation', 'aw_rolling_cup', 'aw_back_pressure', 'aw_rising_lift', 'hanging_leg_raise'] }
      ],
      calisthenics: [
        { name: 'UPPER PUSH & CORE', focus: 'Push Leverage & Hollow Armor', list: ['pushup_decline', 'weighted_dip', 'pike_pushup', 'pushup_diamond', 'ab_plank_hollow'] },
        { name: 'PULL & POSTERIOR', focus: 'Pull-Up Strength & Mid-Back', list: ['pullup', 'chinup', 'inverted_row', 'aw_fat_grip_hold', 'hanging_leg_raise'] },
        { name: 'LEGS & EXPLOSIVE', focus: 'Unilateral Legs & Jump Drive', list: ['bodyweight_pistol', 'box_jump', 'bulgarian_split_squat', 'standing_calf_raise', 'ab_plank_hollow'] },
        { name: 'FULL-BODY SKILL', focus: 'Push-Pull Superset Conditioning', list: ['pullup', 'weighted_dip', 'pushup_standard', 'inverted_row', 'hanging_leg_raise'] }
      ],
      athletic: [
        { name: 'EXPLOSIVE LOWER', focus: 'Jump RFD & Posterior Drive', list: ['box_jump', 'barbell_squat', 'kb_swing', 'bulgarian_split_squat', 'ab_plank_hollow'] },
        { name: 'UPPER POWER', focus: 'Pressing Force & Pull Speed', list: ['barbell_ohp', 'pullup', 'db_incline_press', 'db_row', 'rotational_punch'] },
        { name: 'TOTAL POWER & CORE', focus: 'Hinge Speed & Anti-Rotation', list: ['conventional_deadlift', 'medball_slam', 'weighted_dip', 'inverted_row', 'hanging_leg_raise'] },
        { name: 'UNILATERAL ENGINE', focus: 'Single-Leg Stability & Shoulders', list: ['bulgarian_split_squat', 'kb_swing', 'db_shoulder_press', 'face_pull', 'standing_calf_raise'] }
      ],
      combat: [
        { name: 'KNOCKOUT ROTATION', focus: 'Punch Power, Core Snap & Guard', list: ['rotational_punch', 'medball_slam', 'pushup_standard', 'guard_shadow_burn', 'hanging_leg_raise'] },
        { name: 'CLINCH & PULL POWER', focus: 'Grappling Back, Grip & Hips', list: ['pullup', 'kb_swing', 'db_row', 'aw_fat_grip_hold', 'ab_plank_hollow'] },
        { name: 'FOOTWORK & DRIVE', focus: 'Explosive Legs & Shoulder Stamina', list: ['box_jump', 'bulgarian_split_squat', 'rotational_punch', 'guard_shadow_burn', 'standing_calf_raise'] },
        { name: 'FIGHT ENGINE CIRCUIT', focus: 'Anaerobic Round Strength', list: ['medball_slam', 'chinup', 'pushup_decline', 'kb_swing', 'ab_plank_hollow'] }
      ],
      powerbuilding: [
        { name: 'BENCH & UPPER MASS', focus: 'Heavy Bench + Upper Hypertrophy', list: ['barbell_bench', 'db_incline_press', 'barbell_row', 'lateral_raise', 'triceps_pushdown'] },
        { name: 'SQUAT & LEG VOLUME', focus: 'Heavy Squat + Posterior Growth', list: ['barbell_squat', 'romanian_deadlift', 'bulgarian_split_squat', 'standing_calf_raise', 'hanging_leg_raise'] },
        { name: 'OHP & BACK WIDTH', focus: 'Heavy Press + Lats & Arms', list: ['barbell_ohp', 'pullup', 'db_row', 'face_pull', 'incline_db_curl', 'hammer_curl'] },
        { name: 'DEADLIFT & ARMS', focus: 'Heavy Pull + Hypertrophy Finisher', list: ['conventional_deadlift', 'weighted_dip', 'lat_pulldown', 'cable_fly', 'ab_plank_hollow'] }
      ]
    };
    return map[discipline] || map.mass;
  }

  function generateProgram(profile) {
    var data = getData();
    var disc = data.DISCIPLINES[profile.discipline] || data.DISCIPLINES.mass;
    var daysCount = Math.min(6, Math.max(2, Number(profile.daysPerWeek) || 4));
    var templates = buildTemplatesByDiscipline(disc.id);

    var baseCompoundSets = profile.experience === 'beginner' ? 3 : profile.experience === 'advanced' ? 4 : 4;
    var baseIsoSets = profile.experience === 'beginner' ? 2 : 3;
    if (profile.recoveryMode === 'shift') {
      baseCompoundSets = Math.max(2, baseCompoundSets - 1);
    }

    var maxExPerDay = profile.sessionMinutes <= 35 ? 4 : profile.sessionMinutes <= 50 ? 5 : 6;

    var days = [];
    for (var d = 0; d < daysCount; d++) {
      var tpl = templates[d % templates.length];
      var seen = {};
      var dayExercises = [];

      for (var i = 0; i < tpl.list.length && dayExercises.length < maxExPerDay; i++) {
        var resolvedId = resolveSafeExercise(tpl.list[i], profile, data, seen);
        if (seen[resolvedId]) continue;
        seen[resolvedId] = true;
        var ex = data.EXERCISE_MAP[resolvedId];
        var isCompound = ex.category === 'compound';
        var repRange = (disc.id === 'powerbuilding' && dayExercises.length === 0)
          ? [4, 6]
          : (isCompound ? disc.repRange : disc.isoRepRange);

        dayExercises.push({
          exerciseId: ex.id,
          sets: isCompound ? baseCompoundSets : baseIsoSets,
          repRange: repRange,
          rest: isCompound ? disc.restCompound : disc.restIso,
          tempo: ex.tempo || disc.tempo,
          rirTarget: disc.rirTarget
        });
      }

      days.push({
        dayNumber: d + 1,
        title: tpl.name + (d >= templates.length ? ' II' : ''),
        focus: tpl.focus,
        exercises: dayExercises
      });
    }

    return {
      disciplineId: disc.id,
      disciplineName: disc.name,
      scienceNote: disc.scienceNote,
      generatedAt: Date.now(),
      days: days
    };
  }

  var exported = { generateProgram: generateProgram, resolveSafeExercise: resolveSafeExercise };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    root.IronPulseProgram = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
