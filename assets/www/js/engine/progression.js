(function (root) {
  'use strict';

  function epley1RM(weight, reps) {
    var w = Number(weight) || 0;
    var r = Number(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return Math.round(w * 10) / 10;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  }

  function generateWarmups(workingWeight, isBodyweight) {
    var w = Number(workingWeight) || 0;
    if (isBodyweight || w <= 20) {
      return [
        { label: 'W1', weight: 0, reps: 8, note: 'Controlled groove & joint prep' },
        { label: 'W2', weight: Math.max(0, Math.round(w * 0.5)), reps: 5, note: 'Activation ramp' }
      ];
    }
    function round25(val) {
      return Math.max(5, Math.round(val / 2.5) * 2.5);
    }
    return [
      { label: 'W1', weight: round25(w * 0.5), reps: 8, note: '50% neural groove' },
      { label: 'W2', weight: round25(w * 0.7), reps: 5, note: '70% tension ramp' },
      { label: 'W3', weight: round25(w * 0.85), reps: 2, note: '85% CNS primer' }
    ];
  }

  function recommendNextTarget(historyEntries, repRange, isBodyweight, category) {
    var minR = (repRange && repRange[0]) || 6;
    var maxR = (repRange && repRange[1]) || 12;
    if (!historyEntries || historyEntries.length === 0) {
      return {
        weight: isBodyweight ? 0 : (category === 'compound' ? 20 : 8),
        reps: minR,
        badge: 'BASELINE SET',
        reason: 'Establish clean technique at ' + minR + '-' + maxR + ' reps.'
      };
    }

    var last = historyEntries[historyEntries.length - 1];
    var workingSets = (last.sets || []).filter(function (s) { return s.done && !s.warmup; });
    if (workingSets.length === 0) {
      return {
        weight: isBodyweight ? 0 : 20,
        reps: minR,
        badge: 'BASELINE SET',
        reason: 'Complete all working sets to unlock auto-progression.'
      };
    }

    var topWeight = Math.max.apply(null, workingSets.map(function (s) { return Number(s.weight) || 0; }));
    var minDoneReps = Math.min.apply(null, workingSets.map(function (s) { return Number(s.reps) || 0; }));
    var avgRir = workingSets.reduce(function (acc, s) {
      var v = s.rir === '0' ? 0 : s.rir === '1-2' ? 1.5 : 3;
      return acc + v;
    }, 0) / workingSets.length;

    // Double progression check
    if (minDoneReps >= maxR && avgRir >= 0.8) {
      if (isBodyweight) {
        return {
          weight: topWeight,
          reps: maxR + 2,
          badge: '+2 REPS / NEXT LEVERAGE',
          reason: 'Hit top of range cleanly. Push +2 reps or add load/harder variation.'
        };
      }
      var jump = category === 'compound' ? 2.5 : 1.25;
      var nextW = Math.round((topWeight + jump) * 4) / 4;
      return {
        weight: nextW,
        reps: minR,
        badge: 'LOAD UP +' + jump + ' KG',
        reason: 'Cleared ' + maxR + ' reps across sets. Progress load and build back from ' + minR + ' reps.'
      };
    }

    if (avgRir < 0.5 && minDoneReps < minR) {
      return {
        weight: topWeight,
        reps: minR,
        badge: 'HOLD & CONSOLIDATE',
        reason: 'Last session hit max failure below range. Hold weight and own crisp form.'
      };
    }

    return {
      weight: topWeight,
      reps: Math.min(maxR, minDoneReps + 1),
      badge: 'PUSH +1 REP',
      reason: 'Double progression: add 1 clean rep per set until you clear ' + maxR + ' reps.'
    };
  }

  function computeMuscleFatigue(sessions, exerciseMap, nowTs, recoveryMode) {
    var now = nowTs || Date.now();
    var decayHours = recoveryMode === 'shift' ? 76 : 60; // Shift/irregular sleep needs slightly longer recovery window
    var fatigue = {};

    (sessions || []).forEach(function (sess) {
      var ageHours = Math.max(0, (now - (sess.completedAt || now)) / 3600000);
      if (ageHours > decayHours * 1.5) return;
      var decay = Math.max(0, 1 - ageHours / decayHours);

      (sess.exercises || []).forEach(function (item) {
        var ex = exerciseMap[item.exerciseId];
        if (!ex) return;
        var hardSets = (item.sets || []).filter(function (s) { return s.done && !s.warmup; }).length;
        if (hardSets <= 0) return;

        ex.primary.forEach(function (m) {
          fatigue[m] = Math.min(100, (fatigue[m] || 0) + hardSets * 14 * decay);
        });
        ex.secondary.forEach(function (m) {
          fatigue[m] = Math.min(100, (fatigue[m] || 0) + hardSets * 6.5 * decay);
        });
      });
    });

    Object.keys(fatigue).forEach(function (k) {
      fatigue[k] = Math.round(Math.min(100, Math.max(0, fatigue[k])));
    });
    return fatigue;
  }

  function evaluateStrengthTier(sex, bodyweightKg, lift1RM, liftType) {
    var bw = Math.max(40, Number(bodyweightKg) || 65);
    var ratio = (Number(lift1RM) || 0) / bw;
    var isFemale = sex === 'female';
    var tables = {
      press: isFemale ? [0.45, 0.70, 0.95, 1.20] : [0.75, 1.10, 1.45, 1.80],
      squat: isFemale ? [0.75, 1.15, 1.50, 1.90] : [1.10, 1.55, 2.00, 2.50],
      hinge: isFemale ? [0.95, 1.35, 1.75, 2.15] : [1.35, 1.85, 2.35, 2.85]
    };
    var t = tables[liftType] || tables.press;
    if (ratio >= t[3]) return { tier: 'ELITE', ratio: ratio.toFixed(2) };
    if (ratio >= t[2]) return { tier: 'ADVANCED', ratio: ratio.toFixed(2) };
    if (ratio >= t[1]) return { tier: 'INTERMEDIATE', ratio: ratio.toFixed(2) };
    if (ratio >= t[0]) return { tier: 'NOVICE', ratio: ratio.toFixed(2) };
    return { tier: 'FOUNDATION', ratio: ratio.toFixed(2) };
  }

  function shouldSuggestDeload(sessions) {
    if (!sessions || sessions.length < 6) return false;
    var recent = sessions.slice(-6);
    var totalHardSets = 0;
    var maxEffortCount = 0;
    recent.forEach(function (s) {
      (s.exercises || []).forEach(function (ex) {
        (ex.sets || []).forEach(function (st) {
          if (st.done && !st.warmup) {
            totalHardSets++;
            if (st.rir === '0') maxEffortCount++;
          }
        });
      });
    });
    return totalHardSets >= 70 && (maxEffortCount / Math.max(1, totalHardSets)) >= 0.45;
  }

  var exported = {
    epley1RM: epley1RM,
    generateWarmups: generateWarmups,
    recommendNextTarget: recommendNextTarget,
    computeMuscleFatigue: computeMuscleFatigue,
    evaluateStrengthTier: evaluateStrengthTier,
    shouldSuggestDeload: shouldSuggestDeload
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    root.IronPulseProgression = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
