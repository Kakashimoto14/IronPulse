(function (root) {
  'use strict';

  var Data = root.IronPulseData;
  var Prog = root.IronPulseProgression;
  var Builder = root.IronPulseProgram;
  var Rig = root.IronPulseRig;
  var BodyMap = root.IronPulseBodyMap;
  var Charts = root.IronPulseCharts;
  var FX = root.IronPulseFX;
  var selectedChartEx = '';
  var selectedMetricKey = 'weightKg';
  var DB = root.IronPulseDB;
  var Updater = root.IronPulseUpdater;
  var Native = DB.Native;
  var updateModalOpen = false;

  var state = DB.loadState();
  var currentTab = 'today';
  var tutorSearch = '';
  var tutorMuscleFilter = 'all';
  var tutorEquipFilter = 'all';
  var activeLoops = [];
  var restTimerInterval = null;
  var sessionClockInterval = null;
  var activeWorkoutExerciseIdx = 0;
  var obStep = 1;
  var obDraft = null;
  var modalOpen = false;
  var victoryOpen = false;

  function stopAllLoops() {
    while (activeLoops.length > 0) {
      var lp = activeLoops.pop();
      if (lp && lp.stop) lp.stop();
    }
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function unitLabel() {
    return state.profile.unit === 'lb' ? 'LB' : 'KG';
  }

  function displayWeight(kg) {
    var v = Number(kg) || 0;
    if (state.profile.unit === 'lb') return Math.round(v * 2.20462 * 2) / 2;
    return v;
  }

  function toKg(val) {
    var v = Number(val) || 0;
    if (state.profile.unit === 'lb') return Math.round((v / 2.20462) * 4) / 4;
    return v;
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncTopBar() {
    var disc = Data.DISCIPLINES[state.profile.discipline] || Data.DISCIPLINES.strength;
    var sub = document.getElementById('top-discipline-label');
    if (sub) sub.textContent = disc.short + ' • ' + state.profile.daysPerWeek + 'D/WK';
    var mBtn = document.getElementById('btn-model-male');
    var fBtn = document.getElementById('btn-model-female');
    if (mBtn && fBtn) {
      mBtn.classList.toggle('active', state.profile.sex !== 'female');
      fBtn.classList.toggle('active', state.profile.sex === 'female');
    }
  }

  function syncWidgetSnapshot() {
    if (!state.program || !state.program.days || state.program.days.length === 0) return;
    var dayIdx = Math.min(state.selectedDayIndex || 0, state.program.days.length - 1);
    var day = state.program.days[dayIdx];
    var disc = Data.DISCIPLINES[state.profile.discipline] || Data.DISCIPLINES.strength;
    var fatigue = Prog.computeMuscleFatigue(state.sessions, Data.EXERCISE_MAP, Date.now(), state.profile.recoveryMode);
    var avgFat = Object.keys(fatigue).length
      ? Math.round(Object.keys(fatigue).reduce(function (a, k) { return a + fatigue[k]; }, 0) / Object.keys(fatigue).length)
      : 0;
    var readiness = Math.max(40, 100 - Math.round(avgFat * 0.6));
    Native.updateWidget(
      day.title,
      day.focus + ' • ' + day.exercises.length + ' lifts',
      disc.short,
      readiness + '%',
      state.sessions.length + ' DONE'
    );
  }

  function setModelSex(sex) {
    state.profile.sex = sex === 'female' ? 'female' : 'male';
    DB.saveState(state);
    Native.vibrateLight();
    syncTopBar();
    if (state.activeWorkout) renderActiveWorkoutBody();
    else renderTab(currentTab, true);
  }

  // ============================================================
  // 1. FIRST-RUN 6-STEP ATHLETE CALIBRATION ONBOARDING
  // ============================================================
  function openOnboarding(isRecalibrate) {
    obStep = 1;
    obDraft = JSON.parse(JSON.stringify(state.profile));
    if (!isRecalibrate && (!obDraft.name || obDraft.name === 'Athlete')) {
      obDraft.name = '';
    }
    var el = document.getElementById('onboarding-overlay');
    el.classList.add('open');
    renderOnboardingStep();
  }

  function renderOnboardingStep() {
    stopAllLoops();
    var titles = [
      '',
      'ANATOMICAL PROFILE',
      'TRAINING DISCIPLINE',
      'EXPERIENCE LEVEL',
      'EQUIPMENT ACCESS',
      'SCHEDULE & RECOVERY',
      'JOINT SAFEGUARDS'
    ];
    document.getElementById('ob-step-kicker').textContent = 'STEP ' + obStep + ' OF 6';
    document.getElementById('ob-step-title').textContent = titles[obStep];
    var bar = document.getElementById('ob-step-bar');
    bar.innerHTML = '';
    for (var i = 1; i <= 6; i++) {
      var seg = document.createElement('div');
      seg.className = 'ob-step-seg' + (i < obStep ? ' done' : i === obStep ? ' current' : '');
      bar.appendChild(seg);
    }

    document.getElementById('ob-back').style.visibility = obStep === 1 ? 'hidden' : 'visible';
    document.getElementById('ob-next').textContent = obStep === 6 ? 'BUILD MY PROTOCOL' : 'CONTINUE';

    var box = document.getElementById('ob-content');
    box.className = 'ob-content view-enter';

    if (obStep === 1) {
      box.innerHTML =
        '<div class="tutor-stage" style="margin-bottom:14px;">' +
          '<div class="tutor-canvas-wrap" style="aspect-ratio:16/10;"><canvas id="ob-preview-canvas"></canvas>' +
          '<div class="stage-hud-top">' +
            '<span class="stage-hud-chip"><span class="phase-dot live-dot"></span>LIVE ' + obDraft.sex.toUpperCase() + ' RIG</span>' +
            '<span class="stage-hud-chip">60 FPS ANATOMY</span>' +
          '</div></div>' +
        '</div>' +
        '<div class="option-grid" style="margin-bottom:14px;">' +
          '<button type="button" class="option-card btn-tactile ' + (obDraft.sex === 'male' ? 'selected' : '') + '" data-ob-sex="male">' +
            '<div class="option-card-title">MALE MODEL</div><div class="option-card-sub">Broad clavicle &amp; male strength standards</div>' +
          '</button>' +
          '<button type="button" class="option-card btn-tactile ' + (obDraft.sex === 'female' ? 'selected' : '') + '" data-ob-sex="female">' +
            '<div class="option-card-title">FEMALE MODEL</div><div class="option-card-sub">Athletic female anatomy &amp; strength standards</div>' +
          '</button>' +
        '</div>' +
        '<label class="field-label">ATHLETE NAME / CALLSIGN</label>' +
        '<input id="ob-name" class="iron-input" type="text" placeholder="e.g. Aaron" value="' + esc(obDraft.name) + '" />' +
        '<div class="form-grid-2">' +
          '<div><label class="field-label">AGE</label><input id="ob-age" class="iron-input mono" type="number" min="13" max="85" value="' + esc(obDraft.age) + '" /></div>' +
          '<div><label class="field-label">UNIT SYSTEM</label><div class="option-grid" style="gap:6px;">' +
            '<button type="button" class="btn btn-sm btn-tactile ' + (obDraft.unit === 'kg' ? 'btn-primary' : 'btn-secondary') + '" data-ob-unit="kg">KG</button>' +
            '<button type="button" class="btn btn-sm btn-tactile ' + (obDraft.unit === 'lb' ? 'btn-primary' : 'btn-secondary') + '" data-ob-unit="lb">LB</button>' +
          '</div></div>' +
        '</div>' +
        '<div class="form-grid-2">' +
          '<div><label class="field-label">HEIGHT (CM)</label><input id="ob-height" class="iron-input mono" type="number" min="120" max="230" value="' + esc(obDraft.heightCm) + '" /></div>' +
          '<div><label class="field-label">BODYWEIGHT (KG)</label><input id="ob-weight" class="iron-input mono" type="number" min="35" max="200" value="' + esc(obDraft.weightKg) + '" /></div>' +
        '</div>';

      // Start live animated preview canvas
      var cv = document.getElementById('ob-preview-canvas');
      var previewEx = Data.EXERCISE_MAP.barbell_ohp;
      var lp = Rig.createTutorLoop(cv, function () {
        return { exercise: previewEx, sex: obDraft.sex, opts: { showVectors: true } };
      });
      activeLoops.push(lp);

      box.querySelectorAll('[data-ob-sex]').forEach(function (btn) {
        btn.onclick = function () {
          obDraft.sex = btn.getAttribute('data-ob-sex');
          Native.vibrateLight();
          renderOnboardingStep();
        };
      });
      box.querySelectorAll('[data-ob-unit]').forEach(function (btn) {
        btn.onclick = function () {
          obDraft.unit = btn.getAttribute('data-ob-unit');
          Native.vibrateLight();
          renderOnboardingStep();
        };
      });
    } else if (obStep === 2) {
      var html2 = '<div class="h-kicker" style="margin-bottom:10px;">RESEARCH-BACKED PROTOCOLS (CHOOSE PRIMARY FOCUS)</div><div class="option-grid">';
      Object.keys(Data.DISCIPLINES).forEach(function (k) {
        var d = Data.DISCIPLINES[k];
        html2 += '<button type="button" class="option-card btn-tactile ' + (obDraft.discipline === d.id ? 'selected' : '') + '" data-ob-disc="' + d.id + '">' +
          '<div class="option-card-title">' + esc(d.name) + '</div>' +
          '<div class="option-card-sub">' + esc(d.tagline) + '</div>' +
          '<div class="mono" style="font-size:10px;color:var(--signal-crimson);margin-top:6px;">' + d.repRange[0] + '-' + d.repRange[1] + ' REPS • ' + d.rirTarget + '</div>' +
        '</button>';
      });
      html2 += '</div>';
      box.innerHTML = html2;
      box.querySelectorAll('[data-ob-disc]').forEach(function (btn) {
        btn.onclick = function () {
          obDraft.discipline = btn.getAttribute('data-ob-disc');
          Native.vibrateLight();
          renderOnboardingStep();
        };
      });
    } else if (obStep === 3) {
      var exps = [
        { id: 'beginner', title: 'BEGINNER (0–6 MOS)', sub: '3 compound sets, rapid linear learning curve & extra technique cues.' },
        { id: 'intermediate', title: 'INTERMEDIATE (6–24 MOS)', sub: '4 compound sets, double progression & structured hypertrophy volume.' },
        { id: 'advanced', title: 'ADVANCED (2+ YEARS)', sub: 'Higher weekly set density, tight RIR autoregulation & deload monitoring.' }
      ];
      box.innerHTML = '<div class="option-grid single">' + exps.map(function (e) {
        return '<button type="button" class="option-card btn-tactile ' + (obDraft.experience === e.id ? 'selected' : '') + '" data-ob-exp="' + e.id + '">' +
          '<div class="option-card-title">' + e.title + '</div><div class="option-card-sub">' + e.sub + '</div></button>';
      }).join('') + '</div>';
      box.querySelectorAll('[data-ob-exp]').forEach(function (btn) {
        btn.onclick = function () {
          obDraft.experience = btn.getAttribute('data-ob-exp');
          Native.vibrateLight();
          renderOnboardingStep();
        };
      });
    } else if (obStep === 4) {
      var eqs = [
        { id: 'hybrid', title: 'HYBRID (GYM + HOME)', sub: 'Unlocks full gym lifts, calisthenics, arm-wrestling & combat tools.' },
        { id: 'gym', title: 'FULL COMMERCIAL GYM', sub: 'Barbells, racks, dumbbells, cables & machines.' },
        { id: 'calisthenics', title: 'CALISTHENICS / HOME BAR', sub: 'Bodyweight leverage progressions, pull-up bar & dips.' },
        { id: 'dumbbell', title: 'HOME DUMBBELLS & BENCH', sub: 'Dumbbells, adjustable bench & bodyweight staples.' },
        { id: 'armwrestling', title: 'ARM-WRESTLING KIT + HOME', sub: 'Judo belt/strap, loading pin/cable, fat grips, pull-up bar & dumbbells.' }
      ];
      box.innerHTML = '<div class="option-grid single">' + eqs.map(function (e) {
        return '<button type="button" class="option-card btn-tactile ' + (obDraft.equipment === e.id ? 'selected' : '') + '" data-ob-eq="' + e.id + '">' +
          '<div class="option-card-title">' + e.title + '</div><div class="option-card-sub">' + e.sub + '</div></button>';
      }).join('') + '</div>';
      box.querySelectorAll('[data-ob-eq]').forEach(function (btn) {
        btn.onclick = function () {
          obDraft.equipment = btn.getAttribute('data-ob-eq');
          Native.vibrateLight();
          renderOnboardingStep();
        };
      });
    } else if (obStep === 5) {
      box.innerHTML =
        '<label class="field-label">TRAINING DAYS PER WEEK</label>' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:16px;">' +
        [2, 3, 4, 5, 6].map(function (d) {
          return '<button type="button" class="btn btn-sm btn-tactile ' + (obDraft.daysPerWeek === d ? 'btn-primary' : 'btn-secondary') + '" data-ob-days="' + d + '">' + d + 'D</button>';
        }).join('') + '</div>' +
        '<label class="field-label">TARGET SESSION DURATION</label>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px;">' +
        [30, 45, 60, 90].map(function (m) {
          return '<button type="button" class="btn btn-sm btn-tactile ' + (obDraft.sessionMinutes === m ? 'btn-primary' : 'btn-secondary') + '" data-ob-mins="' + m + '">' + m + 'M</button>';
        }).join('') + '</div>' +
        '<label class="field-label">RECOVERY &amp; SLEEP REALITY</label>' +
        '<div class="option-grid single">' +
          '<button type="button" class="option-card btn-tactile ' + (obDraft.recoveryMode === 'standard' ? 'selected' : '') + '" data-ob-rec="standard">' +
            '<div class="option-card-title">STANDARD SLEEP (7–9 HRS)</div><div class="option-card-sub">Full hypertrophy volume ceiling &amp; 60h fatigue recovery window.</div>' +
          '</button>' +
          '<button type="button" class="option-card btn-tactile ' + (obDraft.recoveryMode === 'shift' ? 'selected' : '') + '" data-ob-rec="shift">' +
            '<div class="option-card-title">NIGHT SHIFT / IRREGULAR SLEEP</div><div class="option-card-sub">Smart 20% volume cap &amp; extended 76h recovery heatmap to prevent burnout.</div>' +
          '</button>' +
        '</div>';

      box.querySelectorAll('[data-ob-days]').forEach(function (b) {
        b.onclick = function () { obDraft.daysPerWeek = Number(b.getAttribute('data-ob-days')); Native.vibrateLight(); renderOnboardingStep(); };
      });
      box.querySelectorAll('[data-ob-mins]').forEach(function (b) {
        b.onclick = function () { obDraft.sessionMinutes = Number(b.getAttribute('data-ob-mins')); Native.vibrateLight(); renderOnboardingStep(); };
      });
      box.querySelectorAll('[data-ob-rec]').forEach(function (b) {
        b.onclick = function () { obDraft.recoveryMode = b.getAttribute('data-ob-rec'); Native.vibrateLight(); renderOnboardingStep(); };
      });
    } else if (obStep === 6) {
      var joints = [
        { id: 'shoulders', title: 'SENSITIVE SHOULDERS', sub: 'Auto-swaps heavy overhead / wide-bar shear for joint-friendly pressing.' },
        { id: 'elbows', title: 'ELBOWS / WRIST TENDONS', sub: 'Flags high-torque elbow/tendon stress and recommends safer alternatives.' },
        { id: 'lower_back', title: 'LOWER BACK CARE', sub: 'Prioritizes braced, spine-friendly variations over heavy axial shear.' },
        { id: 'knees', title: 'KNEE PROTECTION', sub: 'Swaps high-impact jump / deep-shear movements for controlled strength.' }
      ];
      var chosen = obDraft.jointSafeguards || [];
      box.innerHTML =
        '<div class="h-kicker" style="margin-bottom:10px;">OPTIONAL — TAP ANY AREA TO PROTECT (OR SKIP IF 100% HEALTHY)</div>' +
        '<div class="option-grid single">' + joints.map(function (j) {
          var isSel = chosen.indexOf(j.id) !== -1;
          return '<button type="button" class="option-card btn-tactile ' + (isSel ? 'selected' : '') + '" data-ob-joint="' + j.id + '">' +
            '<div class="option-card-title">' + j.title + (isSel ? ' [PROTECTED]' : '') + '</div>' +
            '<div class="option-card-sub">' + j.sub + '</div></button>';
        }).join('') + '</div>';

      box.querySelectorAll('[data-ob-joint]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-ob-joint');
          var idx = obDraft.jointSafeguards.indexOf(id);
          if (idx === -1) obDraft.jointSafeguards.push(id);
          else obDraft.jointSafeguards.splice(idx, 1);
          Native.vibrateLight();
          renderOnboardingStep();
        };
      });
    }
  }

  function captureStep1Inputs() {
    var n = document.getElementById('ob-name');
    var a = document.getElementById('ob-age');
    var h = document.getElementById('ob-height');
    var w = document.getElementById('ob-weight');
    if (n) obDraft.name = (n.value || '').trim() || 'Athlete';
    if (a) obDraft.age = Math.max(13, Math.min(85, Number(a.value) || 20));
    if (h) obDraft.heightCm = Math.max(120, Math.min(230, Number(h.value) || 173));
    if (w) obDraft.weightKg = Math.max(35, Math.min(200, Number(w.value) || 60));
  }

  document.getElementById('ob-back').onclick = function () {
    if (obStep > 1) {
      if (obStep === 1) captureStep1Inputs();
      obStep--;
      Native.vibrateLight();
      renderOnboardingStep();
    }
  };

  document.getElementById('ob-next').onclick = function () {
    if (obStep === 1) captureStep1Inputs();
    if (obStep < 6) {
      obStep++;
      Native.vibrateLight();
      renderOnboardingStep();
    } else {
      stopAllLoops();
      state.profile = obDraft;
      state.program = Builder.generateProgram(state.profile);
      state.selectedDayIndex = 0;
      state.onboarded = true;
      if (state.bodyLogs.length === 0) {
        state.bodyLogs.push({ date: todayStr(), weightKg: state.profile.weightKg });
      }
      DB.saveState(state);
      document.getElementById('onboarding-overlay').classList.remove('open');
      Native.vibratePR();
      FX.emitVictoryBlast();
      syncTopBar();
      renderTab('today', true);
    }
  };

  // ============================================================
  // 2. TAB ROUTER & VIEWS
  // ============================================================
  function renderTab(tab, force) {
    if (!force && tab === currentTab) return;
    currentTab = tab;
    stopAllLoops();

    document.querySelectorAll('.dock-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });

    var main = document.getElementById('main-view');
    main.classList.remove('view-enter');
    void main.offsetWidth;
    main.classList.add('view-enter');
    main.scrollTop = 0;

    if (tab === 'today') renderToday(main);
    else if (tab === 'tutor') renderTutor(main);
    else if (tab === 'progress') renderProgress(main);
    else if (tab === 'profile') renderProfile(main);
  }

  // --- TAB 1: TODAY DASHBOARD ---
  function renderToday(main) {
    if (!state.program) {
      state.program = Builder.generateProgram(state.profile);
      DB.saveState(state);
    }
    var days = state.program.days;
    var dayIdx = Math.min(state.selectedDayIndex || 0, days.length - 1);
    var day = days[dayIdx];
    var fatigue = Prog.computeMuscleFatigue(state.sessions, Data.EXERCISE_MAP, Date.now(), state.profile.recoveryMode);
    var deloadAlert = Prog.shouldSuggestDeload(state.sessions);

    // Daily hydration/creatine reset
    var tStr = todayStr();
    if (!state.hydration || state.hydration.date !== tStr) {
      state.hydration = { date: tStr, waterCups: 0, creatineTaken: false };
      DB.saveState(state);
    }

    var totalSessions = state.sessions.length;
    var totalPrs = Object.keys(state.prs || {}).length;
    var avgFatigue = Object.keys(fatigue).length
      ? Math.round(Object.keys(fatigue).reduce(function (a, k) { return a + fatigue[k]; }, 0) / Object.keys(fatigue).length)
      : 0;
    var readiness = Math.max(40, 100 - Math.round(avgFatigue * 0.6));

    var resumeBanner = state.activeWorkout
      ? '<div class="plate plate-amber stagger-item" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
          '<div><div class="h-kicker" style="color:var(--signal-amber);">IN-PROGRESS SESSION SAVED</div>' +
          '<div class="h-section">' + esc(state.activeWorkout.title) + '</div></div>' +
          '<button type="button" id="btn-resume-active" class="btn btn-primary btn-sm btn-tactile">RESUME</button>' +
        '</div>'
      : '';

    var deloadHtml = deloadAlert
      ? '<div class="plate plate-amber stagger-item"><div class="h-kicker" style="color:var(--signal-amber);">AUTOREGULATION ADVISORY</div>' +
        '<div style="font-size:13px;margin-top:4px;">High cumulative CNS strain detected over recent sessions. Consider a 1-week Deload (same loads, 40% fewer sets).</div></div>'
      : '';

    var dayStripHtml = '<div class="day-strip">' + days.map(function (d, idx) {
      return '<button type="button" class="day-pill btn-tactile ' + (idx === dayIdx ? 'active' : '') + '" data-day-idx="' + idx + '">' +
        '<div class="day-pill-num">DAY ' + d.dayNumber + '</div>' +
        '<div class="day-pill-name">' + esc(d.title.split(' ')[0]) + '</div>' +
      '</button>';
    }).join('') + '</div>';

    var exListHtml = day.exercises.map(function (item, idx) {
      var ex = Data.EXERCISE_MAP[item.exerciseId];
      var hist = DB.getExerciseHistory(state, item.exerciseId);
      var rec = Prog.recommendNextTarget(hist, item.repRange, ex.bodyweight, ex.category);
      return '<div class="ex-row btn-tactile stagger-item" data-open-ex="' + ex.id + '">' +
        '<div>' +
          '<div class="ex-row-title">' + (idx + 1) + '. ' + esc(ex.name) + '</div>' +
          '<div class="ex-row-meta">' + item.sets + ' SETS × ' + item.repRange[0] + '-' + item.repRange[1] + ' REPS • REST ' + fmtTime(item.rest) + ' • ' + item.tempo + '</div>' +
          '<div class="badge-row" style="margin-top:6px;">' +
            '<span class="badge badge-primary">' + esc((Data.MUSCLES[ex.primary[0]] || {}).name || ex.primary[0]) + '</span>' +
            '<span class="badge badge-olive">' + esc(rec.badge) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="mono" style="font-size:11px;color:var(--signal-crimson);font-weight:800;">TUTOR →</div>' +
      '</div>';
    }).join('');

    var upSt = Updater ? Updater.getStatus() : null;
    var updateBanner = (upSt && upSt.state === 'update_available' && upSt.latest)
      ? '<div class="plate plate-crimson stagger-item" style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--signal-crimson-dim);">' +
          '<div><div class="h-kicker" style="color:#FF8C96;">⚡ NEW RELEASE AVAILABLE</div>' +
          '<div class="h-section">IRONPULSE ' + esc(upSt.latest.tag) + '</div>' +
          '<div class="mono" style="font-size:11px;color:var(--ink-dim);">Installed v' + esc(upSt.currentVersion) + ' → ' + esc(upSt.latest.tag) + '</div></div>' +
          '<button type="button" id="btn-dash-open-update" class="btn btn-primary btn-sm btn-tactile">UPDATE</button>' +
        '</div>'
      : '';

    main.innerHTML =
      updateBanner +
      resumeBanner +
      deloadHtml +
      '<div class="plate plate-crimson stagger-item">' +
        '<div class="plate-header">' +
          '<div>' +
            '<div class="h-kicker">READY TO TRAIN, ' + esc(state.profile.name.toUpperCase()) + '</div>' +
            '<div class="h-display" style="margin-top:3px;">' + esc(day.title) + '</div>' +
            '<div style="font-size:13px;color:var(--ink-slate);margin-top:4px;">' + esc(day.focus) + '</div>' +
          '</div>' +
          '<span class="badge badge-primary">' + esc(state.program.disciplineName) + '</span>' +
        '</div>' +
        dayStripHtml +
        '<div style="display:flex;gap:8px;">' +
          '<button type="button" id="btn-start-session" class="btn btn-primary btn-tactile" style="flex:1;">⚡ START SESSION</button>' +
          '<button type="button" id="btn-edit-split" class="btn btn-secondary btn-sm btn-tactile" style="min-height:48px;">EDIT SPLIT</button>' +
        '</div>' +
      '</div>' +

      '<div class="stat-grid-3 stagger-item">' +
        '<div class="stat-cell"><div class="stat-val" style="color:var(--signal-olive);">' + readiness + '%</div><div class="stat-lbl">READINESS</div></div>' +
        '<div class="stat-cell"><div class="stat-val">' + totalSessions + '</div><div class="stat-lbl">SESSIONS</div></div>' +
        '<div class="stat-cell"><div class="stat-val" style="color:var(--signal-amber);">' + totalPrs + '</div><div class="stat-lbl">PRs SET</div></div>' +
      '</div>' +

      '<div class="h-kicker" style="margin:6px 0 8px;">TODAY\'S PRESCRIBED PROTOCOL (' + day.exercises.length + ' MOVEMENTS)</div>' +
      exListHtml +

      '<div class="plate stagger-item" style="margin-top:14px;">' +
        '<div class="plate-header">' +
          '<div><div class="h-kicker">LIVE RECOVERY HEATMAP (' + state.profile.sex.toUpperCase() + ')</div><div class="h-section">TAP ANY MUSCLE TO STUDY</div></div>' +
          '<div class="badge-row"><span class="badge badge-primary">HOT</span><span class="badge badge-secondary">REC</span><span class="badge badge-olive">READY</span></div>' +
        '</div>' +
        '<div class="bodymap-wrap">' +
          '<div class="bodymap-panel"><div class="h-kicker" style="margin-bottom:4px;">ANTERIOR (FRONT)</div><canvas id="dash-map-front"></canvas></div>' +
          '<div class="bodymap-panel"><div class="h-kicker" style="margin-bottom:4px;">POSTERIOR (BACK)</div><canvas id="dash-map-back"></canvas></div>' +
        '</div>' +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header"><div><div class="h-kicker">DAILY FUEL &amp; RECOVERY</div><div class="h-section">HYDRATION &amp; CREATINE</div></div></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
          '<div><div class="mono" style="font-size:18px;font-weight:800;">' + state.hydration.waterCups + ' / 10 CUPS</div><div class="stat-lbl">WATER INTAKE</div></div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" id="btn-add-water" class="btn btn-secondary btn-sm btn-tactile">+1 CUP</button>' +
            '<button type="button" id="btn-toggle-creatine" class="btn btn-sm btn-tactile ' + (state.hydration.creatineTaken ? 'btn-primary' : 'btn-secondary') + '">' + (state.hydration.creatineTaken ? '✓ 5G CREATINE' : 'LOG 5G CREATINE') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Wire events
    var dashUpBtn = document.getElementById('btn-dash-open-update');
    if (dashUpBtn) dashUpBtn.onclick = function () { Native.vibrateLight(); openUpdateModal(); };

    var resBtn = document.getElementById('btn-resume-active');
    if (resBtn) resBtn.onclick = function () { openActiveWorkoutUI(); };

    document.getElementById('btn-start-session').onclick = function () {
      startNewWorkoutSession(day);
    };
    document.getElementById('btn-edit-split').onclick = function () {
      Native.vibrateLight();
      openSplitEditorModal(dayIdx);
    };
    syncWidgetSnapshot();

    main.querySelectorAll('[data-day-idx]').forEach(function (b) {
      b.onclick = function () {
        state.selectedDayIndex = Number(b.getAttribute('data-day-idx'));
        DB.saveState(state);
        Native.vibrateLight();
        renderToday(main);
      };
    });

    main.querySelectorAll('[data-open-ex]').forEach(function (row) {
      row.onclick = function () {
        Native.vibrateLight();
        openExerciseTutorModal(row.getAttribute('data-open-ex'));
      };
    });

    document.getElementById('btn-add-water').onclick = function () {
      state.hydration.waterCups = Math.min(20, state.hydration.waterCups + 1);
      DB.saveState(state);
      Native.vibrateLight();
      renderToday(main);
    };

    document.getElementById('btn-toggle-creatine').onclick = function () {
      state.hydration.creatineTaken = !state.hydration.creatineTaken;
      DB.saveState(state);
      Native.vibrateSetDone();
      renderToday(main);
    };

    BodyMap.drawBodyMap(document.getElementById('dash-map-front'), 'front', state.profile.sex, fatigue, null, function (muscleId) {
      tutorMuscleFilter = muscleId;
      Native.vibrateLight();
      renderTab('tutor', true);
    });
    BodyMap.drawBodyMap(document.getElementById('dash-map-back'), 'back', state.profile.sex, fatigue, null, function (muscleId) {
      tutorMuscleFilter = muscleId;
      Native.vibrateLight();
      renderTab('tutor', true);
    });
  }

  // --- TAB 2: ANIMATED TUTOR & 40-EXERCISE LIBRARY ---
  function renderTutor(main) {
    var fatigue = Prog.computeMuscleFatigue(state.sessions, Data.EXERCISE_MAP, Date.now(), state.profile.recoveryMode);
    var equipFilters = [
      { id: 'all', label: 'ALL (' + Data.EXERCISES.length + ')' },
      { id: 'gym', label: 'GYM' },
      { id: 'dumbbell', label: 'DUMBBELL' },
      { id: 'calisthenics', label: 'CALISTHENICS' },
      { id: 'bodyweight', label: 'BODYWEIGHT' },
      { id: 'armwrestling', label: 'ARM WRESTLING' },
      { id: 'combat', label: 'COMBAT' }
    ];

    var filtered = Data.EXERCISES.filter(function (ex) {
      if (tutorEquipFilter !== 'all' && ex.equipment !== tutorEquipFilter) return false;
      if (tutorMuscleFilter !== 'all') {
        var hit = ex.primary.indexOf(tutorMuscleFilter) !== -1 || ex.secondary.indexOf(tutorMuscleFilter) !== -1;
        if (!hit) return false;
      }
      if (tutorSearch.trim()) {
        var q = tutorSearch.toLowerCase();
        var inName = ex.name.toLowerCase().indexOf(q) !== -1;
        var inMusc = ex.primary.concat(ex.secondary).some(function (m) {
          return ((Data.MUSCLES[m] && Data.MUSCLES[m].name) || m).toLowerCase().indexOf(q) !== -1;
        });
        if (!inName && !inMusc) return false;
      }
      return true;
    });

    var activeMuscleLabel = tutorMuscleFilter === 'all' ? 'ALL MUSCLES' : ((Data.MUSCLES[tutorMuscleFilter] || {}).name || tutorMuscleFilter).toUpperCase();

    main.innerHTML =
      '<div class="plate stagger-item">' +
        '<div class="plate-header">' +
          '<div><div class="h-kicker">INTERACTIVE ANATOMICAL EXPLORER</div><div class="h-section">TAP MUSCLE: ' + esc(activeMuscleLabel) + '</div></div>' +
          (tutorMuscleFilter !== 'all' ? '<button type="button" id="btn-clear-muscle" class="btn btn-secondary btn-sm btn-tactile">CLEAR</button>' : '') +
        '</div>' +
        '<div class="bodymap-wrap">' +
          '<div class="bodymap-panel"><div class="h-kicker" style="margin-bottom:4px;">FRONT</div><canvas id="tutor-map-front"></canvas></div>' +
          '<div class="bodymap-panel"><div class="h-kicker" style="margin-bottom:4px;">BACK</div><canvas id="tutor-map-back"></canvas></div>' +
        '</div>' +
      '</div>' +

      '<div style="margin-bottom:10px;">' +
        '<input id="tutor-search-input" class="iron-input" type="search" placeholder="Search movement, arm wrestling, chest, delts..." value="' + esc(tutorSearch) + '" />' +
      '</div>' +

      '<div class="chip-scroller">' + equipFilters.map(function (f) {
        return '<button type="button" class="filter-chip btn-tactile ' + (tutorEquipFilter === f.id ? 'active' : '') + '" data-eq-filter="' + f.id + '">' + f.label + '</button>';
      }).join('') + '</div>' +

      '<div class="h-kicker" style="margin-bottom:8px;">SHOWING ' + filtered.length + ' ANIMATED TUTOR GUIDES</div>' +
      (filtered.length === 0
        ? '<div class="plate"><div style="color:var(--ink-slate);">No exercises match that filter. Tap CLEAR to reset.</div></div>'
        : filtered.map(function (ex) {
            return '<div class="ex-row btn-tactile" data-open-ex="' + ex.id + '">' +
              '<div>' +
                '<div class="ex-row-title">' + esc(ex.name) + '</div>' +
                '<div class="ex-row-meta">' + ex.equipment.toUpperCase() + ' • TEMPO ' + ex.tempo + ' • REST ' + fmtTime(ex.rest) + '</div>' +
                '<div class="badge-row" style="margin-top:6px;">' +
                  ex.primary.map(function (m) { return '<span class="badge badge-primary">' + esc((Data.MUSCLES[m] || {}).name || m) + '</span>'; }).join('') +
                  ex.secondary.slice(0, 2).map(function (m) { return '<span class="badge badge-secondary">' + esc((Data.MUSCLES[m] || {}).name || m) + '</span>'; }).join('') +
                '</div>' +
              '</div>' +
              '<div class="mono" style="font-size:11px;color:var(--signal-crimson);font-weight:800;">PLAY ▶</div>' +
            '</div>';
          }).join(''));

    var clr = document.getElementById('btn-clear-muscle');
    if (clr) clr.onclick = function () { tutorMuscleFilter = 'all'; renderTutor(main); };

    document.getElementById('tutor-search-input').oninput = function (e) {
      tutorSearch = e.target.value;
      renderTutor(main);
      var inp = document.getElementById('tutor-search-input');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    };

    main.querySelectorAll('[data-eq-filter]').forEach(function (b) {
      b.onclick = function () {
        tutorEquipFilter = b.getAttribute('data-eq-filter');
        Native.vibrateLight();
        renderTutor(main);
      };
    });

    main.querySelectorAll('[data-open-ex]').forEach(function (row) {
      row.onclick = function () {
        Native.vibrateLight();
        openExerciseTutorModal(row.getAttribute('data-open-ex'));
      };
    });

    BodyMap.drawBodyMap(document.getElementById('tutor-map-front'), 'front', state.profile.sex, fatigue, tutorMuscleFilter, function (m) {
      tutorMuscleFilter = tutorMuscleFilter === m ? 'all' : m;
      Native.vibrateLight();
      renderTutor(main);
    });
    BodyMap.drawBodyMap(document.getElementById('tutor-map-back'), 'back', state.profile.sex, fatigue, tutorMuscleFilter, function (m) {
      tutorMuscleFilter = tutorMuscleFilter === m ? 'all' : m;
      Native.vibrateLight();
      renderTutor(main);
    });
  }

  // --- TAB 3: PROGRESS, 1RM STANDARDS & VOLUME ANALYTICS ---
  function renderProgress(main) {
    var totalVolKg = 0;
    var weeklySetsByGroup = {};
    var weekAgo = Date.now() - 7 * 86400000;

    state.sessions.forEach(function (s) {
      totalVolKg += Number(s.totalVolumeKg) || 0;
      if ((s.completedAt || 0) >= weekAgo) {
        (s.exercises || []).forEach(function (item) {
          var ex = Data.EXERCISE_MAP[item.exerciseId];
          if (!ex) return;
          var doneSets = (item.sets || []).filter(function (st) { return st.done && !st.warmup; }).length;
          ex.primary.forEach(function (m) {
            var grp = (Data.MUSCLES[m] && Data.MUSCLES[m].group) || m;
            weeklySetsByGroup[grp] = (weeklySetsByGroup[grp] || 0) + doneSets;
          });
        });
      }
    });

    // Strength Standards based on logged PRs
    var benchPR = (state.prs.barbell_bench && state.prs.barbell_bench.e1rm) || 0;
    var squatPR = (state.prs.barbell_squat && state.prs.barbell_squat.e1rm) || 0;
    var deadPR = (state.prs.conventional_deadlift && state.prs.conventional_deadlift.e1rm) || 0;
    var bTier = Prog.evaluateStrengthTier(state.profile.sex, state.profile.weightKg, benchPR, 'press');
    var sTier = Prog.evaluateStrengthTier(state.profile.sex, state.profile.weightKg, squatPR, 'squat');
    var dTier = Prog.evaluateStrengthTier(state.profile.sex, state.profile.weightKg, deadPR, 'hinge');

    var groups = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Forearms', 'Core'];
    var volBars = groups.map(function (g) {
      var sets = weeklySetsByGroup[g] || 0;
      var pct = Math.min(100, Math.round((sets / 16) * 100));
      var col = sets >= 10 ? 'var(--signal-olive)' : sets >= 4 ? 'var(--signal-amber)' : 'var(--signal-crimson)';
      return '<div style="margin-bottom:9px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">' +
          '<span style="font-weight:700;">' + g.toUpperCase() + '</span>' +
          '<span class="mono" style="color:var(--ink-slate);">' + sets + ' / 16 SETS</span>' +
        '</div>' +
        '<div style="height:7px;background:var(--bg-knurl);border:1px solid var(--line-steel);">' +
          '<div style="height:100%;width:' + pct + '%;background:' + col + ';transition:width 350ms var(--ease-spring);"></div>' +
        '</div>' +
      '</div>';
    }).join('');

    var prList = Object.keys(state.prs || {}).map(function (exId) {
      var ex = Data.EXERCISE_MAP[exId];
      var pr = state.prs[exId];
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px solid var(--line-steel);">' +
        '<div><div style="font-weight:700;">' + esc(ex ? ex.name : exId) + '</div>' +
        '<div class="mono" style="font-size:11px;color:var(--ink-slate);">BEST: ' + displayWeight(pr.weight) + ' ' + unitLabel() + ' × ' + pr.reps + '</div></div>' +
        '<span class="badge badge-secondary mono">1RM ' + displayWeight(pr.e1rm) + ' ' + unitLabel() + '</span>' +
      '</div>';
    }).join('');

    var recentHist = state.sessions.slice().reverse().slice(0, 6).map(function (s) {
      var dt = new Date(s.completedAt || Date.now());
      return '<div style="display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line-steel);">' +
        '<div><div style="font-weight:700;">' + esc(s.title) + '</div>' +
        '<div class="mono" style="font-size:11px;color:var(--ink-slate);">' + dt.toLocaleDateString() + ' • ' + fmtTime(s.durationSec || 0) + ' • ' + (s.completedSets || 0) + ' SETS</div></div>' +
        '<div class="mono" style="font-weight:800;color:var(--ink-chalk);">' + Math.round(displayWeight(s.totalVolumeKg || 0)) + ' ' + unitLabel() + '</div>' +
      '</div>';
    }).join('');

    main.innerHTML =
      '<div class="stat-grid-3 stagger-item">' +
        '<div class="stat-cell"><div class="stat-val">' + state.sessions.length + '</div><div class="stat-lbl">WORKOUTS</div></div>' +
        '<div class="stat-cell"><div class="stat-val">' + Math.round(displayWeight(totalVolKg)) + '</div><div class="stat-lbl">TOTAL ' + unitLabel() + '</div></div>' +
        '<div class="stat-cell"><div class="stat-val" style="color:var(--signal-amber);">' + Object.keys(state.prs || {}).length + '</div><div class="stat-lbl">ACTIVE PRs</div></div>' +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header"><div><div class="h-kicker">' + state.profile.sex.toUpperCase() + ' RELATIVE STRENGTH TIERS</div><div class="h-section">BODYWEIGHT-ADJUSTED 1RM</div></div></div>' +
        '<div class="stat-grid-3" style="margin-bottom:0;">' +
          '<div class="stat-cell"><div class="stat-lbl">BENCH PRESS</div><div class="stat-val" style="font-size:16px;">' + (benchPR ? displayWeight(benchPR) + ' ' + unitLabel() : '--') + '</div><div class="mono" style="font-size:10px;color:var(--signal-crimson);margin-top:2px;">' + bTier.tier + ' (' + bTier.ratio + 'x)</div></div>' +
          '<div class="stat-cell"><div class="stat-lbl">BACK SQUAT</div><div class="stat-val" style="font-size:16px;">' + (squatPR ? displayWeight(squatPR) + ' ' + unitLabel() : '--') + '</div><div class="mono" style="font-size:10px;color:var(--signal-crimson);margin-top:2px;">' + sTier.tier + ' (' + sTier.ratio + 'x)</div></div>' +
          '<div class="stat-cell"><div class="stat-lbl">DEADLIFT</div><div class="stat-val" style="font-size:16px;">' + (deadPR ? displayWeight(deadPR) + ' ' + unitLabel() : '--') + '</div><div class="mono" style="font-size:10px;color:var(--signal-crimson);margin-top:2px;">' + dTier.tier + ' (' + dTier.ratio + 'x)</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header">' +
          '<div><div class="h-kicker">STRENGTH TELEMETRY</div><div class="h-section">ESTIMATED 1RM TREND</div></div>' +
        '</div>' +
        '<select id="chart-ex-select" class="iron-select" style="margin-bottom:10px;"></select>' +
        '<div class="chart-box"><canvas id="chart-1rm-canvas"></canvas></div>' +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header">' +
          '<div><div class="h-kicker">PHYSIQUE &amp; ARM-WRESTLING TAPE</div><div class="h-section">BODY METRICS TREND</div></div>' +
          '<button type="button" id="btn-log-measure" class="btn btn-primary btn-sm btn-tactile">+ LOG TAPE</button>' +
        '</div>' +
        '<div class="chip-scroller" style="margin-bottom:8px;padding-bottom:4px;">' +
          [
            { k: 'weightKg', lbl: 'WEIGHT' },
            { k: 'chestCm', lbl: 'CHEST' },
            { k: 'armsCm', lbl: 'ARMS' },
            { k: 'forearmsCm', lbl: 'FOREARMS' },
            { k: 'waistCm', lbl: 'WAIST' },
            { k: 'thighsCm', lbl: 'THIGHS' }
          ].map(function (m) {
            return '<button type="button" class="filter-chip btn-tactile ' + (selectedMetricKey === m.k ? 'active' : '') + '" data-metric-k="' + m.k + '">' + m.lbl + '</button>';
          }).join('') +
        '</div>' +
        '<div class="chart-box"><canvas id="chart-body-canvas"></canvas></div>' +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header"><div><div class="h-kicker">7-DAY HYPERTROPHY VOLUME</div><div class="h-section">HARD SETS PER MUSCLE GROUP</div></div></div>' +
        volBars +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header"><div><div class="h-kicker">PERSONAL RECORDS</div><div class="h-section">PR HALL OF FAME</div></div></div>' +
        (prList || '<div style="color:var(--ink-slate);font-size:13px;">Complete your first session to ignite Personal Records.</div>') +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header"><div><div class="h-kicker">TRAINING LOG</div><div class="h-section">RECENT SESSIONS</div></div></div>' +
        (recentHist || '<div style="color:var(--ink-slate);font-size:13px;">No workouts logged yet. Start today\'s session from the TODAY tab.</div>') +
      '</div>';

    // Populate 1RM chart dropdown & draw charts
    var loggedIds = [];
    state.sessions.forEach(function (s) {
      (s.exercises || []).forEach(function (it) {
        if (loggedIds.indexOf(it.exerciseId) === -1) loggedIds.push(it.exerciseId);
      });
    });
    var defaults = ['barbell_bench', 'barbell_squat', 'conventional_deadlift', 'aw_belt_pronation', 'pullup'];
    defaults.forEach(function (id) { if (loggedIds.indexOf(id) === -1) loggedIds.push(id); });
    if (!selectedChartEx || loggedIds.indexOf(selectedChartEx) === -1) selectedChartEx = loggedIds[0];

    var selEl = document.getElementById('chart-ex-select');
    if (selEl) {
      selEl.innerHTML = loggedIds.map(function (id) {
        var exObj = Data.EXERCISE_MAP[id];
        return '<option value="' + id + '"' + (id === selectedChartEx ? ' selected' : '') + '>' + esc(exObj ? exObj.name : id) + '</option>';
      }).join('');
      selEl.onchange = function () {
        selectedChartEx = selEl.value;
        draw1RMChart();
      };
    }

    function draw1RMChart() {
      var hist = DB.getExerciseHistory(state, selectedChartEx);
      var pts = [];
      hist.forEach(function (h) {
        var best = 0;
        (h.sets || []).forEach(function (st) {
          if (st.done && !st.warmup) {
            var val = st.weight > 0 ? Prog.epley1RM(st.weight, st.reps) : st.reps;
            if (val > best) best = val;
          }
        });
        if (best > 0) {
          var dt = new Date(h.date || Date.now());
          var exObj = Data.EXERCISE_MAP[selectedChartEx];
          pts.push({
            label: (dt.getMonth() + 1) + '/' + dt.getDate(),
            value: (exObj && exObj.bodyweight && best < 40) ? best : displayWeight(best)
          });
        }
      });
      Charts.drawLineChart(document.getElementById('chart-1rm-canvas'), pts, {
        color: '#E11D2E',
        unit: unitLabel(),
        emptyText: 'LOG ' + ((Data.EXERCISE_MAP[selectedChartEx] || {}).name || 'LIFT').toUpperCase() + ' TO PLOT 1RM'
      });
    }

    function drawBodyMetricChart() {
      var pts = [];
      if (selectedMetricKey === 'weightKg') {
        (state.bodyLogs || []).forEach(function (b) {
          pts.push({ label: String(b.date || '').slice(5), value: displayWeight(b.weightKg) });
        });
      } else {
        (state.measurements || []).forEach(function (m) {
          var val = Number(m[selectedMetricKey]);
          if (val > 0) pts.push({ label: String(m.date || '').slice(5), value: val });
        });
      }
      Charts.drawLineChart(document.getElementById('chart-body-canvas'), pts, {
        color: selectedMetricKey === 'weightKg' ? '#22C55E' : '#D97706',
        unit: selectedMetricKey === 'weightKg' ? unitLabel() : 'CM',
        emptyText: 'TAP + LOG TAPE TO TRACK MEASUREMENTS'
      });
    }

    draw1RMChart();
    drawBodyMetricChart();

    main.querySelectorAll('[data-metric-k]').forEach(function (btn) {
      btn.onclick = function () {
        selectedMetricKey = btn.getAttribute('data-metric-k');
        Native.vibrateLight();
        renderProgress(main);
      };
    });

    var logMeasBtn = document.getElementById('btn-log-measure');
    if (logMeasBtn) {
      logMeasBtn.onclick = function () {
        Native.vibrateLight();
        openMeasurementsModal();
      };
    }
  }

  // --- TAB 4: ATHLETE PROFILE & CALIBRATION ---
  function renderProfile(main) {
    var p = state.profile;
    var disc = Data.DISCIPLINES[p.discipline] || Data.DISCIPLINES.strength;

    main.innerHTML =
      '<div class="plate plate-crimson stagger-item">' +
        '<div class="plate-header">' +
          '<div><div class="h-kicker">ATHLETE DOSSIER</div><div class="h-display">' + esc(p.name) + '</div></div>' +
          '<span class="badge badge-primary">' + p.sex.toUpperCase() + '</span>' +
        '</div>' +
        '<div class="stat-grid-3">' +
          '<div class="stat-cell"><div class="stat-val">' + p.heightCm + '</div><div class="stat-lbl">HEIGHT CM</div></div>' +
          '<div class="stat-cell"><div class="stat-val">' + displayWeight(p.weightKg) + '</div><div class="stat-lbl">WEIGHT ' + unitLabel() + '</div></div>' +
          '<div class="stat-cell"><div class="stat-val">' + p.daysPerWeek + 'D</div><div class="stat-lbl">PER WEEK</div></div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--ink-dim);margin-bottom:10px;"><strong>Protocol:</strong> ' + esc(disc.name) + ' • <strong>Equipment:</strong> ' + esc(p.equipment.toUpperCase()) + ' • <strong>Recovery:</strong> ' + (p.recoveryMode === 'shift' ? 'Shift/Irregular Sleep' : 'Standard Sleep') + '</div>' +
        '<div style="font-size:12px;color:var(--ink-slate);background:var(--bg-knurl);border:1px solid var(--line-steel);padding:10px;margin-bottom:12px;">' + esc(disc.scienceNote) + '</div>' +
        '<button type="button" id="btn-recalibrate" class="btn btn-primary btn-full btn-tactile">RE-CALIBRATE WORKOUT PLAN</button>' +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header"><div><div class="h-kicker">BODYWEIGHT CHECK-IN</div><div class="h-section">LOG CURRENT WEIGHT</div></div></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input id="inp-log-bw" class="iron-input mono" type="number" step="0.1" value="' + displayWeight(p.weightKg) + '" />' +
          '<button type="button" id="btn-save-bw" class="btn btn-secondary btn-tactile" style="flex:0 0 110px;">UPDATE</button>' +
        '</div>' +
      '</div>' +

      '<div class="plate stagger-item" id="profile-update-plate">' +
        buildUpdatePlateHtml() +
      '</div>' +

      '<div class="plate stagger-item">' +
        '<div class="plate-header"><div><div class="h-kicker">OFFLINE DATA PORTABILITY</div><div class="h-section">BACKUP &amp; RESTORE</div></div></div>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
          '<button type="button" id="btn-export-json" class="btn btn-secondary btn-sm btn-tactile" style="flex:1;">EXPORT JSON</button>' +
          '<button type="button" id="btn-import-json" class="btn btn-secondary btn-sm btn-tactile" style="flex:1;">IMPORT JSON</button>' +
        '</div>' +
        '<div class="mono" style="font-size:11px;color:var(--ink-slate);">IronPulse v' + esc(Updater.getCurrentVersion()) + ' (build ' + Updater.getCurrentVersionCode() + ')' + (Updater.getInstalledSigningSha256() ? ' • KEY ' + Updater.getInstalledSigningSha256().slice(0, 8).toUpperCase() : '') + '</div>' +
      '</div>';

    document.getElementById('btn-recalibrate').onclick = function () {
      Native.vibrateLight();
      openOnboarding(true);
    };
    wireUpdatePlateEvents();

    document.getElementById('btn-save-bw').onclick = function () {
      var v = Number(document.getElementById('inp-log-bw').value);
      if (v > 25) {
        state.profile.weightKg = toKg(v);
        state.bodyLogs.push({ date: todayStr(), weightKg: state.profile.weightKg });
        DB.saveState(state);
        Native.vibrateSetDone();
        FX.emitSetSparks();
        renderProfile(main);
      }
    };

    document.getElementById('btn-export-json').onclick = function () {
      var json = Native.exportBackup(state);
      openSimpleModal('BACKUP EXPORTED', 'JSON PAYLOAD', '<textarea class="iron-input mono" style="height:200px;font-size:11px;">' + esc(json) + '</textarea>');
    };

    document.getElementById('btn-import-json').onclick = function () {
      openSimpleModal('RESTORE BACKUP', 'PASTE BACKUP JSON',
        '<textarea id="import-json-area" class="iron-input mono" style="height:180px;font-size:11px;" placeholder="Paste IronPulse JSON backup here..."></textarea>' +
        '<button type="button" id="btn-confirm-import" class="btn btn-primary btn-full btn-tactile" style="margin-top:10px;">RESTORE DATA</button>'
      );
      document.getElementById('btn-confirm-import').onclick = function () {
        try {
          var parsed = JSON.parse(document.getElementById('import-json-area').value);
          if (parsed && parsed.profile) {
            state = parsed;
            DB.saveState(state);
            closeModal();
            syncTopBar();
            renderTab('today', true);
            Native.vibratePR();
          }
        } catch (e) {
          alert('Invalid JSON format.');
        }
      };
    };
  }

  // ============================================================
  // 3. ANIMATED EXERCISE TUTOR MODAL (60 FPS + FORM DOCTOR)
  // ============================================================
  function openSimpleModal(kicker, title, html) {
    modalOpen = true;
    document.getElementById('modal-kicker').textContent = kicker;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-backdrop').classList.add('open');
  }

  function closeModal() {
    modalOpen = false;
    updateModalOpen = false;
    stopAllLoops();
    document.getElementById('modal-backdrop').classList.remove('open');
    // Restart active workout loop if active session is open underneath
    if (state.activeWorkout && document.getElementById('active-overlay').classList.contains('open')) {
      mountActiveTutorCanvas();
    }
  }

  function openExerciseTutorModal(exId) {
    var ex = Data.EXERCISE_MAP[exId];
    if (!ex) return;
    stopAllLoops();

    var html =
      '<div class="tutor-stage">' +
        '<div class="tutor-canvas-wrap"><canvas id="modal-tutor-canvas"></canvas>' +
          '<div class="stage-hud-top">' +
            '<span class="stage-hud-chip"><span class="phase-dot live-dot"></span><span id="modal-phase-lbl">ECCENTRIC</span></span>' +
            '<span class="stage-hud-chip">' + state.profile.sex.toUpperCase() + ' • ' + ex.tempo + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="tutor-controls">' +
          '<button type="button" id="modal-play-btn" class="btn btn-secondary btn-sm btn-tactile">PAUSE</button>' +
          '<div class="speed-group">' +
            '<button type="button" class="speed-btn" data-spd="0.5">0.5X</button>' +
            '<button type="button" class="speed-btn active" data-spd="1">1.0X</button>' +
            '<button type="button" class="speed-btn" data-spd="1.4">FAST</button>' +
          '</div>' +
        '</div>' +
        '<div class="phase-scrubber">' +
          '<input id="modal-scrubber" type="range" min="0" max="100" value="0" />' +
          '<div class="phase-labels"><span>SETUP</span><span>ECCENTRIC</span><span>PEAK</span><span>LOCKOUT</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="badge-row" style="margin-bottom:12px;">' +
        ex.primary.map(function (m) { return '<span class="badge badge-primary">PRIMARY: ' + esc((Data.MUSCLES[m] || {}).name || m) + '</span>'; }).join('') +
        ex.secondary.map(function (m) { return '<span class="badge badge-secondary">SYNERGIST: ' + esc((Data.MUSCLES[m] || {}).name || m) + '</span>'; }).join('') +
        ex.stabilizers.map(function (m) { return '<span class="badge badge-stabilizer">STAB: ' + esc((Data.MUSCLES[m] || {}).name || m) + '</span>'; }).join('') +
      '</div>' +

      '<div class="plate" style="padding:12px;margin-bottom:10px;">' +
        '<div class="h-kicker" style="color:var(--signal-cobalt);margin-bottom:4px;">BREATHING &amp; BRACING PROTOCOL</div>' +
        '<div style="font-size:13px;">' + esc(ex.breathing) + '</div>' +
      '</div>' +

      '<div class="h-kicker" style="margin-bottom:6px;">BIOMECHANICAL EXECUTION CUES</div>' +
      '<ul class="cue-list" style="margin-bottom:14px;">' +
        ex.cues.map(function (c, i) {
          return '<li class="cue-item"><span class="cue-num">' + (i + 1) + '</span><span>' + esc(c) + '</span></li>';
        }).join('') +
      '</ul>' +

      '<div class="h-kicker" style="margin-bottom:6px;">FORM DOCTOR — FIX COMMON MISTAKES</div>' +
      ex.mistakes.map(function (m) {
        return '<div class="mistake-box"><div class="mistake-bad">✕ ' + esc(m.bad) + '</div><div class="mistake-fix">✓ ' + esc(m.fix) + '</div></div>';
      }).join('') +

      '<div class="plate" style="padding:12px;margin-top:12px;margin-bottom:0;">' +
        '<div class="h-kicker" style="margin-bottom:6px;">PROGRESSION LADDER</div>' +
        '<div class="mono" style="font-size:11px;color:var(--ink-slate);">EASIER: <span style="color:var(--ink-chalk);">' + esc(ex.ladder.easier) + '</span></div>' +
        '<div class="mono" style="font-size:11px;color:var(--signal-crimson);margin:3px 0;">CURRENT: <strong>' + esc(ex.ladder.current) + '</strong></div>' +
        '<div class="mono" style="font-size:11px;color:var(--signal-olive);">NEXT LEVEL: ' + esc(ex.ladder.harder) + '</div>' +
      '</div>';

    openSimpleModal(ex.equipment.toUpperCase() + ' TUTOR', ex.name, html);

    var cv = document.getElementById('modal-tutor-canvas');
    var scrub = document.getElementById('modal-scrubber');
    var pLbl = document.getElementById('modal-phase-lbl');
    var loop = Rig.createTutorLoop(cv, function () {
      return { exercise: ex, sex: state.profile.sex, opts: { showVectors: true } };
    }, function (frame, u) {
      if (pLbl) pLbl.textContent = frame.phase;
      if (scrub && !loop.isPaused()) scrub.value = Math.round(u * 100);
    });
    activeLoops.push(loop);

    document.getElementById('modal-play-btn').onclick = function (e) {
      var next = !loop.isPaused();
      loop.setPaused(next);
      e.target.textContent = next ? 'PLAY' : 'PAUSE';
      Native.vibrateLight();
    };

    scrub.oninput = function () {
      loop.setPaused(true);
      document.getElementById('modal-play-btn').textContent = 'PLAY';
      loop.setProgress(Number(scrub.value) / 100);
    };

    document.querySelectorAll('#modal-body .speed-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#modal-body .speed-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        loop.setSpeed(Number(b.getAttribute('data-spd')));
        Native.vibrateLight();
      };
    });
  }

  // ============================================================
  // 4. ACTIVE WORKOUT LOGGER (FOCUS MODE + HYPE FX + TEMPO RAIL)
  // ============================================================
  function startNewWorkoutSession(day) {
    var exercises = day.exercises.map(function (item) {
      var ex = Data.EXERCISE_MAP[item.exerciseId];
      var hist = DB.getExerciseHistory(state, item.exerciseId);
      var rec = Prog.recommendNextTarget(hist, item.repRange, ex.bodyweight, ex.category);
      var sets = [];
      for (var i = 0; i < item.sets; i++) {
        sets.push({
          warmup: false,
          weight: rec.weight,
          reps: rec.reps,
          rir: '1-2',
          done: false,
          isPR: false
        });
      }
      return {
        exerciseId: ex.id,
        repRange: item.repRange,
        rest: item.rest,
        tempo: item.tempo,
        targetBadge: rec.badge,
        targetReason: rec.reason,
        sets: sets
      };
    });

    state.activeWorkout = {
      title: day.title,
      focus: day.focus,
      startedAt: Date.now(),
      exercises: exercises,
      newPRs: []
    };
    activeWorkoutExerciseIdx = 0;
    DB.saveState(state);
    Native.vibrateSetDone();
    openActiveWorkoutUI();
  }

  function openActiveWorkoutUI() {
    if (!state.activeWorkout) return;
    Native.setKeepScreenOn(true);
    document.getElementById('active-session-title').textContent = state.activeWorkout.title;
    document.getElementById('active-overlay').classList.add('open');
    startSessionClock();
    renderActiveWorkoutBody();
  }

  function startSessionClock() {
    if (sessionClockInterval) clearInterval(sessionClockInterval);
    function updateClock() {
      if (!state.activeWorkout) return;
      var sec = Math.floor((Date.now() - state.activeWorkout.startedAt) / 1000);
      var el = document.getElementById('active-clock');
      if (el) el.textContent = fmtTime(sec);
    }
    updateClock();
    sessionClockInterval = setInterval(updateClock, 1000);
  }

  var restRemaining = 0;
  var restTotal = 90;
  function triggerRestTimer(seconds) {
    restTotal = Math.max(15, seconds || 90);
    restRemaining = restTotal;
    var bar = document.getElementById('rest-bar');
    bar.style.display = 'flex';
    if (restTimerInterval) clearInterval(restTimerInterval);
    function tickRest() {
      document.getElementById('rest-countdown').textContent = fmtTime(restRemaining);
      document.getElementById('rest-progress').style.width = Math.max(0, (restRemaining / restTotal) * 100) + '%';
      if (restRemaining <= 0) {
        clearInterval(restTimerInterval);
        restTimerInterval = null;
        bar.style.display = 'none';
        Native.vibrateRestEnd();
        Native.playTone('rest');
      }
      restRemaining--;
    }
    tickRest();
    restTimerInterval = setInterval(tickRest, 1000);
  }

  document.getElementById('btn-rest-minus').onclick = function () { restRemaining = Math.max(1, restRemaining - 15); Native.vibrateLight(); };
  document.getElementById('btn-rest-plus').onclick = function () { restRemaining += 15; restTotal = Math.max(restTotal, restRemaining); Native.vibrateLight(); };
  document.getElementById('btn-rest-skip').onclick = function () {
    if (restTimerInterval) clearInterval(restTimerInterval);
    restTimerInterval = null;
    document.getElementById('rest-bar').style.display = 'none';
    Native.vibrateLight();
  };

  function mountActiveTutorCanvas() {
    stopAllLoops();
    if (!state.activeWorkout) return;
    var item = state.activeWorkout.exercises[activeWorkoutExerciseIdx];
    var ex = Data.EXERCISE_MAP[item.exerciseId];
    var cv = document.getElementById('active-tutor-canvas');
    if (!cv || !ex) return;

    var phaseEl = document.getElementById('active-phase-lbl');
    var segEcc = document.getElementById('tseg-ecc');
    var segPau = document.getElementById('tseg-pau');
    var segCon = document.getElementById('tseg-con');
    var segTop = document.getElementById('tseg-top');

    var lastPhase = '';
    var lp = Rig.createTutorLoop(cv, function () {
      return { exercise: ex, sex: state.profile.sex, opts: { showVectors: true } };
    }, function (frame) {
      if (phaseEl) phaseEl.textContent = frame.phase;
      if (state.tempoBeepOn && frame.phase !== lastPhase) {
        lastPhase = frame.phase;
        if (frame.phase === 'DRIVE / LOCKOUT') Native.playTone('peak');
        else if (frame.phase === 'ECCENTRIC' || frame.phase === 'PEAK TENSION') Native.playTone('tick');
      }
      if (segEcc) {
        segEcc.className = 'tempo-seg' + (frame.phase === 'ECCENTRIC' ? ' active-ecc' : '');
        segPau.className = 'tempo-seg' + (frame.phase === 'PEAK TENSION' ? ' active-pause' : '');
        segCon.className = 'tempo-seg' + (frame.phase === 'DRIVE / LOCKOUT' ? ' active-con' : '');
        segTop.className = 'tempo-seg' + (frame.phase === 'RESET / BRACE' ? ' active-top' : '');
      }
    });
    activeLoops.push(lp);
  }

  function renderActiveWorkoutBody() {
    var aw = state.activeWorkout;
    if (!aw) return;
    var item = aw.exercises[activeWorkoutExerciseIdx];
    var ex = Data.EXERCISE_MAP[item.exerciseId];
    var body = document.getElementById('active-body');

    var pills = '<div class="day-strip">' + aw.exercises.map(function (it, idx) {
      var doneCount = it.sets.filter(function (s) { return s.done && !s.warmup; }).length;
      var workCount = it.sets.filter(function (s) { return !s.warmup; }).length;
      var allDone = doneCount >= workCount && workCount > 0;
      return '<button type="button" class="day-pill btn-tactile ' + (idx === activeWorkoutExerciseIdx ? 'active' : '') + '" data-aw-ex="' + idx + '">' +
        '<div class="day-pill-num">' + (allDone ? '✓ DONE' : (doneCount + '/' + workCount + ' SETS')) + '</div>' +
        '<div class="day-pill-name">' + esc((Data.EXERCISE_MAP[it.exerciseId].name.split(' ')[0])) + '</div>' +
      '</button>';
    }).join('') + '</div>';

    var setRows = item.sets.map(function (st, sIdx) {
      var label = st.warmup ? 'W' : String(item.sets.slice(0, sIdx + 1).filter(function (x) { return !x.warmup; }).length);
      return '<div class="set-row ' + (st.done ? 'done' : '') + (st.warmup ? ' warmup' : '') + '" data-set-idx="' + sIdx + '">' +
        '<div class="set-num">' + label + (st.isPR ? '<div class="pr-tag" style="font-size:9px;color:var(--signal-amber);">PR</div>' : '') + '</div>' +
        '<div class="stepper">' +
          '<button type="button" data-w-step="-2.5">−</button>' +
          '<input type="number" step="0.5" data-w-inp value="' + displayWeight(st.weight) + '" />' +
          '<button type="button" data-w-step="2.5">+</button>' +
        '</div>' +
        '<div class="stepper">' +
          '<button type="button" data-r-step="-1">−</button>' +
          '<input type="number" data-r-inp value="' + st.reps + '" />' +
          '<button type="button" data-r-step="1">+</button>' +
        '</div>' +
        '<button type="button" class="rir-btn btn-tactile" data-rir-cycle>' + esc(st.rir) + ' RIR</button>' +
        '<button type="button" class="set-check btn-tactile" data-set-toggle>' + (st.done ? '✓' : '') + '</button>' +
      '</div>';
    }).join('');

    body.innerHTML =
      pills +
      '<div class="tutor-stage">' +
        '<div class="tutor-canvas-wrap" style="aspect-ratio:16/10;"><canvas id="active-tutor-canvas"></canvas>' +
          '<div class="stage-hud-top">' +
            '<span class="stage-hud-chip"><span class="phase-dot live-dot"></span><span id="active-phase-lbl">ECCENTRIC</span></span>' +
            '<span class="stage-hud-chip">TEMPO ' + esc(item.tempo) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="tempo-rail">' +
        '<div id="tseg-ecc" class="tempo-seg">ECCENTRIC</div>' +
        '<div id="tseg-pau" class="tempo-seg">PAUSE</div>' +
        '<div id="tseg-con" class="tempo-seg">DRIVE</div>' +
        '<div id="tseg-top" class="tempo-seg">BRACE</div>' +
      '</div>' +

      '<div class="plate" style="padding:14px;">' +
        '<div class="plate-header" style="margin-bottom:8px;">' +
          '<div>' +
            '<div class="h-section">' + esc(ex.name) + '</div>' +
            '<div class="badge-row" style="margin-top:5px;">' +
              '<span class="badge badge-olive">' + esc(item.targetBadge) + '</span>' +
              '<span class="badge badge-primary">' + esc((Data.MUSCLES[ex.primary[0]] || {}).name || ex.primary[0]) + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:5px;">' +
            '<button type="button" id="btn-aw-beep" class="btn btn-sm btn-tactile ' + (state.tempoBeepOn ? 'btn-primary' : 'btn-secondary') + '">' + (state.tempoBeepOn ? 'BEEP ON' : 'BEEP') + '</button>' +
            '<button type="button" id="btn-aw-form" class="btn btn-secondary btn-sm btn-tactile">CUES</button>' +
            '<button type="button" id="btn-aw-swap" class="btn btn-secondary btn-sm btn-tactile">SWAP</button>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--ink-slate);margin-bottom:10px;">' + esc(item.targetReason) + '</div>' +

        '<div class="set-table-head">' +
          '<div style="text-align:center;">SET</div><div>' + unitLabel() + '</div><div>REPS</div><div>EFFORT</div><div style="text-align:center;">LOG</div>' +
        '</div>' +
        setRows +

        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button type="button" id="btn-add-warmup" class="btn btn-ghost btn-sm btn-tactile" style="flex:1;">+ WARM-UP RAMP</button>' +
          '<button type="button" id="btn-add-set" class="btn btn-secondary btn-sm btn-tactile" style="flex:1;">+ ADD SET</button>' +
        '</div>' +
      '</div>';

    mountActiveTutorCanvas();

    // Wire switch exercise
    body.querySelectorAll('[data-aw-ex]').forEach(function (b) {
      b.onclick = function () {
        activeWorkoutExerciseIdx = Number(b.getAttribute('data-aw-ex'));
        Native.vibrateLight();
        renderActiveWorkoutBody();
      };
    });

    document.getElementById('btn-aw-beep').onclick = function () {
      state.tempoBeepOn = !state.tempoBeepOn;
      DB.saveState(state);
      Native.vibrateLight();
      if (state.tempoBeepOn) Native.playTone('tick');
      renderActiveWorkoutBody();
    };
    document.getElementById('btn-aw-form').onclick = function () {
      openExerciseTutorModal(ex.id);
    };

    document.getElementById('btn-aw-swap').onclick = function () {
      var swaps = (ex.swapIds || []).map(function (id) { return Data.EXERCISE_MAP[id]; }).filter(Boolean);
      var swapHtml = '<div class="option-grid single">' + swaps.map(function (s) {
        return '<button type="button" class="option-card btn-tactile" data-pick-swap="' + s.id + '">' +
          '<div class="option-card-title">' + esc(s.name) + '</div>' +
          '<div class="option-card-sub">' + s.equipment.toUpperCase() + ' • Targets ' + esc((Data.MUSCLES[s.primary[0]] || {}).name || s.primary[0]) + '</div>' +
        '</button>';
      }).join('') + '</div>';
      openSimpleModal('EQUIPMENT SWAPPER', 'REPLACE ' + ex.name, swapHtml);
      document.querySelectorAll('[data-pick-swap]').forEach(function (b) {
        b.onclick = function () {
          var newId = b.getAttribute('data-pick-swap');
          item.exerciseId = newId;
          DB.saveState(state);
          closeModal();
          Native.vibrateSetDone();
          renderActiveWorkoutBody();
        };
      });
    };

    document.getElementById('btn-add-warmup').onclick = function () {
      var firstWork = item.sets.find(function (s) { return !s.warmup; });
      var wups = Prog.generateWarmups(firstWork ? firstWork.weight : 20, ex.bodyweight);
      wups.reverse().forEach(function (w) {
        item.sets.unshift({ warmup: true, weight: w.weight, reps: w.reps, rir: '3+', done: false, isPR: false });
      });
      DB.saveState(state);
      Native.vibrateLight();
      renderActiveWorkoutBody();
    };

    document.getElementById('btn-add-set').onclick = function () {
      var last = item.sets[item.sets.length - 1] || { weight: ex.bodyweight ? 0 : 20, reps: item.repRange[0], rir: '1-2' };
      item.sets.push({ warmup: false, weight: last.weight, reps: last.reps, rir: last.rir, done: false, isPR: false });
      DB.saveState(state);
      Native.vibrateLight();
      renderActiveWorkoutBody();
    };

    // Wire individual set controls
    body.querySelectorAll('.set-row').forEach(function (row) {
      var sIdx = Number(row.getAttribute('data-set-idx'));
      var st = item.sets[sIdx];

      row.querySelectorAll('[data-w-step]').forEach(function (btn) {
        btn.onclick = function () {
          var delta = Number(btn.getAttribute('data-w-step'));
          st.weight = Math.max(0, Math.round((Number(st.weight) + delta) * 4) / 4);
          row.querySelector('[data-w-inp]').value = displayWeight(st.weight);
          DB.saveState(state);
          Native.vibrateLight();
        };
      });

      row.querySelector('[data-w-inp]').onchange = function (e) {
        st.weight = Math.max(0, toKg(e.target.value));
        DB.saveState(state);
      };

      row.querySelectorAll('[data-r-step]').forEach(function (btn) {
        btn.onclick = function () {
          var delta = Number(btn.getAttribute('data-r-step'));
          st.reps = Math.max(1, (Number(st.reps) || 1) + delta);
          row.querySelector('[data-r-inp]').value = st.reps;
          DB.saveState(state);
          Native.vibrateLight();
        };
      });

      row.querySelector('[data-r-inp]').onchange = function (e) {
        st.reps = Math.max(1, Number(e.target.value) || 1);
        DB.saveState(state);
      };

      row.querySelector('[data-rir-cycle]').onclick = function (e) {
        var order = ['3+', '1-2', '0'];
        st.rir = order[(order.indexOf(st.rir) + 1) % order.length];
        e.target.textContent = st.rir + ' RIR';
        DB.saveState(state);
        Native.vibrateLight();
      };

      row.querySelector('[data-set-toggle]').onclick = function (evt) {
        st.done = !st.done;
        if (st.done) {
          var rect = evt.target.getBoundingClientRect();
          // PR Detection on working sets
          var isNewPR = false;
          if (!st.warmup) {
            var score = ex.bodyweight && st.weight === 0 ? st.reps : Prog.epley1RM(st.weight, st.reps);
            var prev = state.prs[ex.id];
            var prevScore = prev ? (ex.bodyweight && prev.weight === 0 ? prev.reps : prev.e1rm) : 0;
            if (score > prevScore && score > 0) {
              isNewPR = true;
              st.isPR = true;
              state.prs[ex.id] = { weight: st.weight, reps: st.reps, e1rm: Prog.epley1RM(st.weight, st.reps), date: Date.now() };
              aw.newPRs.push({ name: ex.name, weight: st.weight, reps: st.reps });
            }
          }
          if (isNewPR) {
            Native.vibratePR();
            Native.playTone('pr');
            FX.emitPRIgnition(ex.name.split(' ')[0] + ' • ' + displayWeight(st.weight) + unitLabel() + ' × ' + st.reps);
          } else {
            Native.vibrateSetDone();
            Native.playTone('peak');
            FX.emitSetSparks(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
          }
          if (!st.warmup) triggerRestTimer(item.rest);
        }
        DB.saveState(state);
        renderActiveWorkoutBody();
      };
    });
  }

  function closeActiveOverlay(keepSaved) {
    stopAllLoops();
    if (sessionClockInterval) clearInterval(sessionClockInterval);
    if (restTimerInterval) clearInterval(restTimerInterval);
    document.getElementById('rest-bar').style.display = 'none';
    document.getElementById('active-overlay').classList.remove('open');
    Native.setKeepScreenOn(false);
    if (!keepSaved) {
      state.activeWorkout = null;
      DB.saveState(state);
    }
    renderTab('today', true);
  }

  document.getElementById('btn-close-workout').onclick = function () {
    // Keeps workout safely persisted for instant resume
    closeActiveOverlay(true);
  };

  document.getElementById('btn-finish-workout').onclick = function () {
    var aw = state.activeWorkout;
    if (!aw) return;
    var durationSec = Math.max(60, Math.floor((Date.now() - aw.startedAt) / 1000));
    var completedSets = 0;
    var totalVolumeKg = 0;

    aw.exercises.forEach(function (it) {
      it.sets.forEach(function (st) {
        if (st.done && !st.warmup) {
          completedSets++;
          var load = st.weight > 0 ? st.weight : (state.profile.weightKg * 0.65);
          totalVolumeKg += load * st.reps;
        }
      });
    });

    var record = {
      id: 'sess_' + Date.now(),
      title: aw.title,
      completedAt: Date.now(),
      durationSec: durationSec,
      completedSets: completedSets,
      totalVolumeKg: Math.round(totalVolumeKg),
      exercises: aw.exercises
    };

    state.sessions.push(record);
    // Advance next scheduled day automatically
    if (state.program && state.program.days.length > 0) {
      state.selectedDayIndex = ((state.selectedDayIndex || 0) + 1) % state.program.days.length;
    }
    var prs = aw.newPRs || [];
    state.activeWorkout = null;
    DB.saveState(state);

    closeActiveOverlay(false);
    showVictoryOverlay(record, prs);
  };

  function showVictoryOverlay(record, prs) {
    victoryOpen = true;
    document.getElementById('victory-title').textContent = record.title;
    document.getElementById('victory-stats').innerHTML =
      '<div class="stat-cell"><div class="stat-val">' + record.completedSets + '</div><div class="stat-lbl">HARD SETS</div></div>' +
      '<div class="stat-cell"><div class="stat-val">' + Math.round(displayWeight(record.totalVolumeKg)) + '</div><div class="stat-lbl">VOLUME ' + unitLabel() + '</div></div>' +
      '<div class="stat-cell"><div class="stat-val">' + fmtTime(record.durationSec) + '</div><div class="stat-lbl">DURATION</div></div>';

    document.getElementById('victory-prs').innerHTML = prs.length > 0
      ? '<div class="plate plate-amber" style="padding:10px;margin-bottom:0;"><div class="h-kicker" style="color:var(--signal-amber);">⚡ ' + prs.length + ' NEW PR(S) LOCKED IN</div>' +
        prs.slice(0, 3).map(function (p) {
          return '<div class="mono" style="font-size:12px;margin-top:4px;">' + esc(p.name) + ' — ' + displayWeight(p.weight) + ' ' + unitLabel() + ' × ' + p.reps + '</div>';
        }).join('') + '</div>'
      : '<div style="font-size:13px;color:var(--ink-slate);">Muscle fatigue heatmap updated. Hydrate, hit protein, and recover strong.</div>';

    document.getElementById('victory-overlay').classList.add('open');
    Native.vibratePR();
    Native.playTone('pr');
    FX.emitVictoryBlast();
  }

  document.getElementById('btn-victory-done').onclick = function () {
    victoryOpen = false;
    document.getElementById('victory-overlay').classList.remove('open');
    renderTab('today', true);
  };

  // ============================================================
  // 5. GLOBAL CONTROLS & HARDWARE BACK-BUTTON INTEGRATION
  // ============================================================
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-backdrop').onclick = function (e) {
    if (e.target.id === 'modal-backdrop') closeModal();
  };

  document.getElementById('btn-model-male').onclick = function () { setModelSex('male'); };
  document.getElementById('btn-model-female').onclick = function () { setModelSex('female'); };

  document.querySelectorAll('.dock-btn').forEach(function (btn) {
    btn.onclick = function () {
      Native.vibrateLight();
      renderTab(btn.getAttribute('data-tab'), false);
    };
  });

  root.IronPulseApp = {
    handleHardwareBack: function () {
      if (victoryOpen) {
        victoryOpen = false;
        document.getElementById('victory-overlay').classList.remove('open');
        return true;
      }
      if (modalOpen) {
        closeModal();
        return true;
      }
      if (document.getElementById('active-overlay').classList.contains('open')) {
        closeActiveOverlay(true);
        return true;
      }
      if (currentTab !== 'today') {
        renderTab('today', true);
        return true;
      }
      return false;
    },
    onAppPause: function () {
      DB.saveState(state);
    }
  };


  // ============================================================
  // 4B. IN-APP GITHUB RELEASES OTA UPDATER UI
  // ============================================================
  function fmtBytes(bytes) {
    var b = Number(bytes) || 0;
    if (b <= 0) return '';
    if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
    return Math.round(b / 1024) + ' KB';
  }

  function buildUpdatePlateHtml() {
    var st = Updater.getStatus();
    var repo = state.updateRepo || Updater.getDefaultRepo();
    var badgeClass = st.state === 'update_available' ? 'badge-primary'
      : st.state === 'up_to_date' ? 'badge-olive'
      : st.state === 'offline' || st.state === 'no_release' ? 'badge-secondary'
      : '';
    var badgeText = st.checking ? 'CHECKING...'
      : st.state === 'update_available' ? ('NEW: ' + st.latest.tag)
      : st.state === 'up_to_date' ? 'UP TO DATE'
      : st.state === 'no_release' ? 'NO RELEASE YET'
      : st.state === 'offline' ? 'OFFLINE'
      : st.state === 'error' ? 'CHECK FAILED'
      : 'READY';

    var infoLine = '';
    if (st.state === 'update_available' && st.latest) {
      infoLine = '<div style="font-size:12px;color:#FF8C96;margin-bottom:10px;">Release <strong>' + esc(st.latest.tag) + '</strong> is live on GitHub Releases' + (st.latest.apkSize ? ' (' + fmtBytes(st.latest.apkSize) + ')' : '') + '.</div>';
    } else if (st.error) {
      infoLine = '<div style="font-size:12px;color:var(--ink-slate);margin-bottom:10px;">' + esc(st.error) + '</div>';
    } else if (st.state === 'up_to_date' && st.latest) {
      infoLine = '<div style="font-size:12px;color:#86EFAC;margin-bottom:10px;">Running latest GitHub Release (' + esc(st.latest.tag) + ').</div>';
    }

    return '<div class="plate-header">' +
        '<div><div class="h-kicker">GITHUB RELEASES OTA</div><div class="h-section">APP UPDATES &amp; VERSION</div></div>' +
        '<span class="badge ' + badgeClass + '">' + esc(badgeText) + '</span>' +
      '</div>' +
      '<div class="stat-grid-3" style="grid-template-columns:1fr 1fr;margin-bottom:10px;">' +
        '<div class="stat-cell"><div class="stat-val" style="font-size:17px;">v' + esc(st.currentVersion) + '</div><div class="stat-lbl">INSTALLED</div></div>' +
        '<div class="stat-cell"><div class="stat-val" style="font-size:17px;">' + esc(st.latest ? st.latest.tag : '--') + '</div><div class="stat-lbl">LATEST RELEASE</div></div>' +
      '</div>' +
      '<label class="field-label">LINKED GITHUB REPOSITORY</label>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<input id="inp-update-repo" class="iron-input mono" style="font-size:12px;padding:9px 10px;" value="' + esc(repo) + '" />' +
        '<button type="button" id="btn-save-repo" class="btn btn-secondary btn-sm btn-tactile">SAVE</button>' +
      '</div>' +
      infoLine +
      '<div style="display:flex;gap:8px;">' +
        '<button type="button" id="btn-check-updates" class="btn btn-secondary btn-sm btn-tactile" style="flex:1;" ' + (st.checking ? 'disabled' : '') + '>' + (st.checking ? 'CHECKING...' : 'CHECK FOR UPDATES') + '</button>' +
        (st.state === 'update_available'
          ? '<button type="button" id="btn-open-update-modal" class="btn btn-primary btn-sm btn-tactile" style="flex:1;">INSTALL ' + esc(st.latest.tag) + '</button>'
          : '') +
      '</div>';
  }

  function wireUpdatePlateEvents() {
    var saveBtn = document.getElementById('btn-save-repo');
    if (saveBtn) {
      saveBtn.onclick = function () {
        var inp = document.getElementById('inp-update-repo');
        if (inp && inp.value.trim()) {
          state.updateRepo = inp.value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
          DB.saveState(state);
          Native.vibrateLight();
          Updater.checkForUpdates(state.updateRepo, false);
        }
      };
    }
    var chkBtn = document.getElementById('btn-check-updates');
    if (chkBtn) {
      chkBtn.onclick = function () {
        Native.vibrateLight();
        Updater.checkForUpdates(state.updateRepo || Updater.getDefaultRepo(), false);
      };
    }
    var openBtn = document.getElementById('btn-open-update-modal');
    if (openBtn) {
      openBtn.onclick = function () {
        Native.vibrateLight();
        openUpdateModal();
      };
    }
  }

  function renderUpdateModalContent() {
    var st = Updater.getStatus();
    if (!st.latest) return;
    var rel = st.latest;

    var progressBlock = '';
    if (st.downloading) {
      var dlText = st.totalBytes > 0
        ? (fmtBytes(st.downloadedBytes) + ' / ' + fmtBytes(st.totalBytes))
        : (st.downloadPct + '%');
      progressBlock =
        '<div style="margin:12px 0;">' +
          '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">' +
            '<span class="mono" style="font-weight:700;">DOWNLOADING APK...</span>' +
            '<span class="mono" style="color:var(--signal-crimson);">' + st.downloadPct + '% (' + esc(dlText) + ')</span>' +
          '</div>' +
          '<div style="height:8px;background:var(--bg-knurl);border:1px solid var(--line-steel);">' +
            '<div style="height:100%;width:' + st.downloadPct + '%;background:var(--signal-crimson);transition:width 140ms linear;"></div>' +
          '</div>' +
        '</div>';
    }

    var mismatchBlock = st.signingMismatch
      ? '<div class="plate plate-amber" style="padding:10px;margin-bottom:10px;font-size:12px;">' +
          '<div class="h-kicker" style="color:var(--signal-amber);margin-bottom:4px;">SIGNING KEY CHANGED — PREVENT PACKAGE CONFLICT</div>' +
          'This release was signed with a different keystore than your installed build. Tap <strong>EXPORT BACKUP FIRST</strong>, uninstall this old build, then install the new APK from GitHub Releases so all future updates install smoothly in-place.' +
          '<button type="button" id="btn-modal-backup-first" class="btn btn-secondary btn-sm btn-full btn-tactile" style="margin-top:8px;">EXPORT WORKOUT BACKUP JSON</button>' +
        '</div>'
      : '';

    var permBlock = mismatchBlock + (st.permissionNeeded
      ? '<div class="plate plate-amber" style="padding:10px;margin-bottom:10px;font-size:12px;">Enable <strong>Allow from this source</strong> in Android Settings, then tap <strong>LAUNCH INSTALLER</strong> below.</div>'
      : '');

    var errBlock = st.error
      ? '<div class="plate plate-crimson" style="padding:10px;margin-bottom:10px;font-size:12px;color:#FF8C96;">' + esc(st.error) + '</div>'
      : '';

    var primaryAction = st.downloading
      ? '<button type="button" class="btn btn-secondary btn-full" disabled>DOWNLOADING ' + st.downloadPct + '%...</button>'
      : st.downloadedReady
        ? '<button type="button" id="btn-modal-retry-install" class="btn btn-primary btn-full btn-tactile">LAUNCH ANDROID INSTALLER</button>'
        : '<button type="button" id="btn-modal-start-dl" class="btn btn-primary btn-full btn-tactile">DOWNLOAD &amp; INSTALL ' + esc(rel.tag) + '</button>';

    var html =
      '<div class="stat-grid-3" style="grid-template-columns:1fr 1fr;margin-bottom:12px;">' +
        '<div class="stat-cell"><div class="stat-val" style="font-size:18px;">v' + esc(st.currentVersion) + '</div><div class="stat-lbl">CURRENT</div></div>' +
        '<div class="stat-cell"><div class="stat-val" style="font-size:18px;color:var(--signal-crimson);">' + esc(rel.tag) + '</div><div class="stat-lbl">NEW RELEASE</div></div>' +
      '</div>' +
      '<div class="plate" style="padding:12px;margin-bottom:12px;">' +
        '<div class="h-kicker" style="margin-bottom:6px;">RELEASE NOTES</div>' +
        '<div style="font-size:13px;white-space:pre-wrap;color:var(--ink-dim);max-height:160px;overflow-y:auto;">' + esc(rel.notes) + '</div>' +
        (rel.apkName ? '<div class="mono" style="font-size:11px;color:var(--ink-slate);margin-top:8px;">PACKAGE: ' + esc(rel.apkName) + (rel.apkSize ? ' • ' + fmtBytes(rel.apkSize) : '') + '</div>' : '') +
      '</div>' +
      permBlock +
      errBlock +
      progressBlock +
      primaryAction +
      '<button type="button" id="btn-modal-open-browser" class="btn btn-ghost btn-full btn-sm btn-tactile" style="margin-top:8px;">OPEN RELEASE IN BROWSER</button>' +
      '<div class="mono" style="font-size:10px;color:var(--ink-slate);margin-top:10px;">Note: Keep the same signing keystore secrets across releases so Android updates smoothly without uninstalling.</div>';

    document.getElementById('modal-body').innerHTML = html;

    var dlBtn = document.getElementById('btn-modal-start-dl');
    if (dlBtn) dlBtn.onclick = function () { Native.vibrateSetDone(); Updater.startDownload(); };

    var retryBtn = document.getElementById('btn-modal-retry-install');
    if (retryBtn) retryBtn.onclick = function () { Native.vibrateSetDone(); Updater.retryInstall(); };

    var bkBtn = document.getElementById('btn-modal-backup-first');
    if (bkBtn) bkBtn.onclick = function () { Native.vibrateSetDone(); Native.exportBackup(state); };

    var brBtn = document.getElementById('btn-modal-open-browser');
    if (brBtn) brBtn.onclick = function () { Native.vibrateLight(); Updater.openReleasePage(); };
  }

  function openUpdateModal() {
    updateModalOpen = true;
    openSimpleModal('IN-APP OTA UPDATE', 'IRONPULSE UPDATE', '');
    renderUpdateModalContent();
  }

  if (Updater) {
    Updater.subscribe(function (st) {
      if (updateModalOpen && modalOpen) {
        renderUpdateModalContent();
      }
      if (currentTab === 'profile') {
        var plate = document.getElementById('profile-update-plate');
        if (plate) {
          plate.innerHTML = buildUpdatePlateHtml();
          wireUpdatePlateEvents();
        }
      } else if (currentTab === 'today' && st.state === 'update_available' && !document.getElementById('btn-dash-open-update')) {
        renderTab('today', true);
      }
    });
  }


  // ============================================================
  // 4C. CUSTOM SPLIT EDITOR & BODY MEASUREMENTS MODALS (v1.2.0)
  // ============================================================
  function openSplitEditorModal(dayIdx) {
    if (!state.program || !state.program.days[dayIdx]) return;
    var day = state.program.days[dayIdx];
    var addSearch = '';

    function paintEditor() {
      var rows = day.exercises.map(function (it, idx) {
        var ex = Data.EXERCISE_MAP[it.exerciseId];
        return '<div class="split-edit-row">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (idx + 1) + '. ' + esc(ex ? ex.name : it.exerciseId) + '</div>' +
            '<div class="mono" style="font-size:11px;color:var(--ink-slate);">' + it.sets + ' SETS × ' + it.repRange[0] + '-' + it.repRange[1] + ' REPS</div>' +
          '</div>' +
          '<div style="display:flex;gap:4px;">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-ed-sets="' + idx + ':-1">−</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" data-ed-sets="' + idx + ':1">+</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" style="color:#FF8C96;" data-ed-del="' + idx + '">✕</button>' +
          '</div>' +
        '</div>';
      }).join('');

      var pool = Data.EXERCISES.filter(function (ex) {
        if (!addSearch.trim()) return true;
        return ex.name.toLowerCase().indexOf(addSearch.toLowerCase()) !== -1 ||
          ex.equipment.toLowerCase().indexOf(addSearch.toLowerCase()) !== -1;
      }).slice(0, 12);

      var html =
        '<label class="field-label">DAY TITLE</label>' +
        '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
          '<input id="ed-day-title" class="iron-input" value="' + esc(day.title) + '" />' +
          '<button type="button" id="ed-save-title" class="btn btn-secondary btn-sm btn-tactile">RENAME</button>' +
        '</div>' +
        '<div class="h-kicker" style="margin-bottom:6px;">CURRENT MOVEMENTS (' + day.exercises.length + ')</div>' +
        (rows || '<div style="font-size:12px;color:var(--ink-slate);margin-bottom:10px;">No movements yet. Add from below.</div>') +
        '<div style="display:flex;gap:8px;margin:12px 0;">' +
          '<button type="button" id="ed-add-day" class="btn btn-secondary btn-sm btn-tactile" style="flex:1;">+ NEW CUSTOM DAY</button>' +
        '</div>' +
        '<div class="h-kicker" style="margin-bottom:6px;">ADD MOVEMENT TO THIS DAY</div>' +
        '<input id="ed-add-search" class="iron-input" style="margin-bottom:8px;" placeholder="Filter 41 movements (e.g. pronation, bench, pull)..." value="' + esc(addSearch) + '" />' +
        pool.map(function (ex) {
          return '<div class="split-edit-row" style="padding:8px 10px;">' +
            '<div><div style="font-size:13px;font-weight:700;">' + esc(ex.name) + '</div>' +
            '<div class="mono" style="font-size:10px;color:var(--ink-slate);">' + ex.equipment.toUpperCase() + ' • ' + esc((Data.MUSCLES[ex.primary[0]] || {}).name || ex.primary[0]) + '</div></div>' +
            '<button type="button" class="btn btn-primary btn-sm btn-tactile" data-ed-add="' + ex.id + '">+ ADD</button>' +
          '</div>';
        }).join('');

      document.getElementById('modal-body').innerHTML = html;

      document.getElementById('ed-save-title').onclick = function () {
        var val = (document.getElementById('ed-day-title').value || '').trim();
        if (val) {
          day.title = val.toUpperCase();
          DB.saveState(state);
          Native.vibrateLight();
          syncWidgetSnapshot();
          renderTab('today', true);
        }
      };

      document.getElementById('ed-add-day').onclick = function () {
        var newDayNum = state.program.days.length + 1;
        state.program.days.push({
          dayNumber: newDayNum,
          title: 'CUSTOM DAY ' + newDayNum,
          focus: 'Custom Specialist Session',
          exercises: [
            { exerciseId: 'aw_belt_pronation', sets: 3, repRange: [6, 10], rest: 120, tempo: '2-2-X-1', rirTarget: '1-2 RIR' },
            { exerciseId: 'pullup', sets: 3, repRange: [6, 12], rest: 120, tempo: '3-1-1-0', rirTarget: '1-2 RIR' },
            { exerciseId: 'pushup_standard', sets: 3, repRange: [8, 15], rest: 90, tempo: '3-1-1-0', rirTarget: '1-2 RIR' }
          ]
        });
        state.selectedDayIndex = state.program.days.length - 1;
        DB.saveState(state);
        Native.vibrateSetDone();
        closeModal();
        renderTab('today', true);
      };

      document.getElementById('ed-add-search').oninput = function (e) {
        addSearch = e.target.value;
        paintEditor();
        var inp = document.getElementById('ed-add-search');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      };

      document.querySelectorAll('[data-ed-sets]').forEach(function (b) {
        b.onclick = function () {
          var parts = b.getAttribute('data-ed-sets').split(':');
          var idx = Number(parts[0]), delta = Number(parts[1]);
          day.exercises[idx].sets = Math.max(1, Math.min(8, day.exercises[idx].sets + delta));
          DB.saveState(state);
          Native.vibrateLight();
          paintEditor();
          renderTab('today', true);
        };
      });

      document.querySelectorAll('[data-ed-del]').forEach(function (b) {
        b.onclick = function () {
          var idx = Number(b.getAttribute('data-ed-del'));
          if (day.exercises.length <= 1) return;
          day.exercises.splice(idx, 1);
          DB.saveState(state);
          Native.vibrateLight();
          paintEditor();
          renderTab('today', true);
        };
      });

      document.querySelectorAll('[data-ed-add]').forEach(function (b) {
        b.onclick = function () {
          var exId = b.getAttribute('data-ed-add');
          var ex = Data.EXERCISE_MAP[exId];
          var disc = Data.DISCIPLINES[state.profile.discipline] || Data.DISCIPLINES.mass;
          day.exercises.push({
            exerciseId: ex.id,
            sets: 3,
            repRange: ex.category === 'compound' ? disc.repRange : disc.isoRepRange,
            rest: ex.rest || 120,
            tempo: ex.tempo || disc.tempo,
            rirTarget: disc.rirTarget
          });
          DB.saveState(state);
          Native.vibrateSetDone();
          paintEditor();
          renderTab('today', true);
        };
      });
    }

    openSimpleModal('CUSTOM SPLIT BUILDER', 'DAY ' + day.dayNumber + ' EDITOR', '');
    paintEditor();
  }

  function openMeasurementsModal() {
    var last = (state.measurements && state.measurements[state.measurements.length - 1]) || {};
    var html =
      '<div class="form-grid-2">' +
        '<div><label class="field-label">BODYWEIGHT (' + unitLabel() + ')</label><input id="m-bw" class="iron-input mono" type="number" step="0.1" value="' + displayWeight(state.profile.weightKg) + '" /></div>' +
        '<div><label class="field-label">CHEST (CM)</label><input id="m-chest" class="iron-input mono" type="number" step="0.1" placeholder="e.g. 96" value="' + esc(last.chestCm || '') + '" /></div>' +
        '<div><label class="field-label">ARMS / BICEPS (CM)</label><input id="m-arms" class="iron-input mono" type="number" step="0.1" placeholder="e.g. 34" value="' + esc(last.armsCm || '') + '" /></div>' +
        '<div><label class="field-label">FOREARMS (CM)</label><input id="m-forearms" class="iron-input mono" type="number" step="0.1" placeholder="e.g. 29" value="' + esc(last.forearmsCm || '') + '" /></div>' +
        '<div><label class="field-label">WAIST (CM)</label><input id="m-waist" class="iron-input mono" type="number" step="0.1" placeholder="e.g. 76" value="' + esc(last.waistCm || '') + '" /></div>' +
        '<div><label class="field-label">THIGHS (CM)</label><input id="m-thighs" class="iron-input mono" type="number" step="0.1" placeholder="e.g. 54" value="' + esc(last.thighsCm || '') + '" /></div>' +
      '</div>' +
      '<button type="button" id="btn-save-measurements" class="btn btn-primary btn-full btn-tactile" style="margin-top:14px;">SAVE MEASUREMENTS</button>';

    openSimpleModal('BODY TAPE CHECK-IN', 'LOG MEASUREMENTS', html);
    document.getElementById('btn-save-measurements').onclick = function () {
      var bw = Number(document.getElementById('m-bw').value);
      var entry = {
        date: todayStr(),
        chestCm: Number(document.getElementById('m-chest').value) || 0,
        armsCm: Number(document.getElementById('m-arms').value) || 0,
        forearmsCm: Number(document.getElementById('m-forearms').value) || 0,
        waistCm: Number(document.getElementById('m-waist').value) || 0,
        thighsCm: Number(document.getElementById('m-thighs').value) || 0
      };
      if (bw > 25) {
        state.profile.weightKg = toKg(bw);
        state.bodyLogs.push({ date: todayStr(), weightKg: state.profile.weightKg });
      }
      if (!state.measurements) state.measurements = [];
      state.measurements.push(entry);
      DB.saveState(state);
      closeModal();
      Native.vibrateSetDone();
      FX.emitSetSparks();
      renderTab('progress', true);
    };
  }

  // Boot
  syncTopBar();
  if (Updater) { setTimeout(function () { Updater.checkForUpdates(state.updateRepo || Updater.getDefaultRepo(), true); }, 1500); }
  if (!state.onboarded) {
    openOnboarding(false);
  } else {
    renderTab('today', true);
  }
})(window);
