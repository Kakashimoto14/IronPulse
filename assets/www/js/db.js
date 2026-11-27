(function (root) {
  'use strict';

  var STORAGE_KEY = 'ironpulse_v1_state';
  var IDB_NAME = 'IronPulseOfflineDB';
  var IDB_STORE = 'snapshots';

  var DEFAULT_STATE = {
    onboarded: false,
    profile: {
      name: 'Athlete',
      sex: 'male',
      age: 20,
      heightCm: 173,
      weightKg: 60,
      unit: 'kg',
      discipline: 'strength',
      experience: 'intermediate',
      equipment: 'hybrid',
      daysPerWeek: 4,
      sessionMinutes: 60,
      recoveryMode: 'standard',
      jointSafeguards: []
    },
    program: null,
    selectedDayIndex: 0,
    sessions: [],
    bodyLogs: [],
    measurements: [], // { date, chestCm, armsCm, forearmsCm, waistCm, thighsCm }
    activeWorkout: null,
    hydration: { date: '', waterCups: 0, creatineTaken: false },
    prs: {},
    favorites: [],
    updateRepo: 'Kakashimoto14/IronPulse',
    tempoBeepOn: false
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mirrorToIndexedDB(state) {
    try {
      if (!root.indexedDB) return;
      var req = root.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function (e) {
        try {
          var db = e.target.result;
          var tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(state, 'latest');
        } catch (ignored) {}
      };
    } catch (ignored) {}
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(DEFAULT_STATE);
      var parsed = JSON.parse(raw);
      return Object.assign(deepClone(DEFAULT_STATE), parsed, {
        profile: Object.assign(deepClone(DEFAULT_STATE.profile), parsed.profile || {})
      });
    } catch (e) {
      return deepClone(DEFAULT_STATE);
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      mirrorToIndexedDB(state);
    } catch (e) {
      // Storage quota safeguard
    }
  }

  function getExerciseHistory(state, exerciseId) {
    var list = [];
    (state.sessions || []).forEach(function (sess) {
      (sess.exercises || []).forEach(function (ex) {
        if (ex.exerciseId === exerciseId) {
          list.push({ date: sess.completedAt, sets: ex.sets });
        }
      });
    });
    return list;
  }

  var Native = {
    vibrateLight: function () {
      if (root.IronPulseBridge && root.IronPulseBridge.vibrateLight) root.IronPulseBridge.vibrateLight();
      else if (navigator.vibrate) navigator.vibrate(18);
    },
    vibrateSetDone: function () {
      if (root.IronPulseBridge && root.IronPulseBridge.vibrateSetDone) root.IronPulseBridge.vibrateSetDone();
      else if (navigator.vibrate) navigator.vibrate([40, 30, 25]);
    },
    vibratePR: function () {
      if (root.IronPulseBridge && root.IronPulseBridge.vibratePR) root.IronPulseBridge.vibratePR();
      else if (navigator.vibrate) navigator.vibrate([70, 50, 70, 50, 140]);
    },
    vibrateRestEnd: function () {
      if (root.IronPulseBridge && root.IronPulseBridge.vibrateRestEnd) root.IronPulseBridge.vibrateRestEnd();
      else if (navigator.vibrate) navigator.vibrate([90, 70, 90]);
    },
    setKeepScreenOn: function (on) {
      if (root.IronPulseBridge && root.IronPulseBridge.setKeepScreenOn) root.IronPulseBridge.setKeepScreenOn(!!on);
    },
    playTone: function (kind) {
      if (root.IronPulseBridge && root.IronPulseBridge.playTone) {
        root.IronPulseBridge.playTone(kind);
      } else {
        try {
          var AudioCtx = root.AudioContext || root.webkitAudioContext;
          if (!AudioCtx) return;
          if (!Native._ctx) Native._ctx = new AudioCtx();
          var osc = Native._ctx.createOscillator();
          var gain = Native._ctx.createGain();
          osc.type = kind === 'pr' ? 'triangle' : 'sine';
          osc.frequency.value = kind === 'pr' ? 880 : kind === 'rest' ? 660 : kind === 'peak' ? 520 : 380;
          gain.gain.value = 0.05;
          osc.connect(gain);
          gain.connect(Native._ctx.destination);
          osc.start();
          osc.stop(Native._ctx.currentTime + (kind === 'pr' ? 0.22 : 0.08));
        } catch (ignored) {}
      }
    },
    updateWidget: function (dayTitle, focus, discipline, readiness, sessionsLabel) {
      if (root.IronPulseBridge && root.IronPulseBridge.updateWidget) {
        try {
          root.IronPulseBridge.updateWidget(
            String(dayTitle || ''),
            String(focus || ''),
            String(discipline || ''),
            String(readiness || '100%'),
            String(sessionsLabel || '0 DONE')
          );
        } catch (ignored) {}
      }
    },
    exportBackup: function (state) {
      var json = JSON.stringify(state, null, 2);
      if (root.IronPulseBridge && root.IronPulseBridge.shareBackup) {
        root.IronPulseBridge.shareBackup(json);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json);
      }
      return json;
    }
  };

  root.IronPulseDB = {
    loadState: loadState,
    saveState: saveState,
    getExerciseHistory: getExerciseHistory,
    Native: Native
  };
})(typeof window !== 'undefined' ? window : globalThis);
