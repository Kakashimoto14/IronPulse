(function (root) {
  'use strict';

  var FALLBACK_VERSION = '1.3.0';
  var FALLBACK_CODE = 10300;
  var FALLBACK_REPO = 'Kakashimoto14/IronPulse';

  var listeners = [];
  var status = {
    checking: false,
    downloading: false,
    downloadPct: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    downloadedReady: false,
    permissionNeeded: false,
    signingMismatch: false,
    remoteSigningSha256: '',
    state: 'idle', // idle | checking | up_to_date | update_available | no_release | offline | error
    error: '',
    lastCheckedAt: null,
    latest: null // { tag, version, name, notes, htmlUrl, apkUrl, apkName, apkSize }
  };

  function getCurrentVersion() {
    if (root.IronPulseBridge && root.IronPulseBridge.getVersion) {
      return String(root.IronPulseBridge.getVersion());
    }
    return FALLBACK_VERSION;
  }

  function getCurrentVersionCode() {
    if (root.IronPulseBridge && root.IronPulseBridge.getVersionCode) {
      return Number(root.IronPulseBridge.getVersionCode()) || FALLBACK_CODE;
    }
    return FALLBACK_CODE;
  }

  function getDefaultRepo() {
    if (root.IronPulseBridge && root.IronPulseBridge.getDefaultRepo) {
      return String(root.IronPulseBridge.getDefaultRepo());
    }
    return FALLBACK_REPO;
  }

  function getInstalledSigningSha256() {
    if (root.IronPulseBridge && root.IronPulseBridge.getSigningSha256) {
      return String(root.IronPulseBridge.getSigningSha256() || '').toLowerCase();
    }
    return '';
  }

  function normalizeVersion(v) {
    return String(v || '0.0.0').trim().replace(/^v/i, '').split('-')[0];
  }

  function compareSemver(a, b) {
    var pa = normalizeVersion(a).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = normalizeVersion(b).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var len = Math.max(pa.length, pb.length, 3);
    for (var i = 0; i < len; i++) {
      var da = pa[i] || 0;
      var db = pb[i] || 0;
      if (da > db) return 1;
      if (da < db) return -1;
    }
    return 0;
  }

  function decodeB64Utf8(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(bytes);
    }
    return decodeURIComponent(escape(bin));
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(getStatus()); } catch (ignored) {}
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  function getStatus() {
    return Object.assign({
      currentVersion: getCurrentVersion(),
      currentVersionCode: getCurrentVersionCode(),
      installedSigningSha256: getInstalledSigningSha256()
    }, status);
  }

  function handleReleaseJson(jsonText) {
    status.checking = false;
    status.lastCheckedAt = Date.now();
    status.error = '';

    try {
      var rel = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
      var tag = rel.tag_name || rel.name || '';
      var latestVer = normalizeVersion(tag);
      var assets = Array.isArray(rel.assets) ? rel.assets : [];
      var apkAsset = assets.find(function (a) {
        return a && a.name && /\.apk$/i.test(a.name) && a.browser_download_url;
      }) || null;
      var metaAsset = assets.find(function (a) {
        return a && a.name === 'version.json' && a.browser_download_url;
      }) || null;
      status.signingMismatch = false;
      status.remoteSigningSha256 = '';

      status.latest = {
        tag: tag || ('v' + latestVer),
        version: latestVer,
        name: rel.name || tag || 'New Release',
        notes: (rel.body || 'Bug fixes, performance enhancements, and training engine upgrades.').trim(),
        htmlUrl: rel.html_url || ('https://github.com/' + getDefaultRepo() + '/releases'),
        apkUrl: apkAsset ? apkAsset.browser_download_url : null,
        apkName: apkAsset ? apkAsset.name : null,
        apkSize: apkAsset ? (Number(apkAsset.size) || 0) : 0
      };

      if (compareSemver(latestVer, getCurrentVersion()) > 0) {
        status.state = 'update_available';
        if (metaAsset && root.IronPulseBridge && root.IronPulseBridge.fetchReleaseVersionMeta) {
          root.IronPulseBridge.fetchReleaseVersionMeta(metaAsset.browser_download_url);
        }
      } else {
        status.state = 'up_to_date';
      }
    } catch (e) {
      status.state = 'error';
      status.error = 'Could not parse release metadata.';
    }
    emit();
  }

  function checkForUpdates(repo, silent) {
    if (status.checking) return;
    var cleanRepo = String(repo || getDefaultRepo()).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
    status.checking = true;
    status.error = '';
    if (!silent) status.state = 'checking';
    emit();

    if (root.IronPulseBridge && root.IronPulseBridge.checkGitHubRelease) {
      root.IronPulseBridge.checkGitHubRelease(cleanRepo);
      return;
    }

    // Browser preview fallback
    fetch('https://api.github.com/repos/' + cleanRepo + '/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (res) {
        if (res.status === 404) throw new Error('NO_RELEASE_YET');
        if (!res.ok) throw new Error('GitHub API HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { handleReleaseJson(data); })
      .catch(function (err) {
        handleCheckError((err && err.message) || 'Offline');
      });
  }

  function handleCheckError(msg) {
    status.checking = false;
    status.lastCheckedAt = Date.now();
    if (msg === 'NO_RELEASE_YET') {
      status.state = 'no_release';
      status.error = 'No GitHub Release published yet. Push a v* tag to publish your first release.';
    } else if (/Unable to resolve host|Failed to fetch|Network|timeout|Offline/i.test(msg)) {
      status.state = 'offline';
      status.error = 'Offline — IronPulse runs 100% locally. Connect to check GitHub Releases.';
    } else {
      status.state = 'error';
      status.error = msg;
    }
    emit();
  }

  function startDownload() {
    if (!status.latest) return;
    if (!status.latest.apkUrl) {
      openReleasePage();
      return;
    }
    if (root.IronPulseBridge && root.IronPulseBridge.downloadAndInstallApk) {
      status.downloading = true;
      status.downloadPct = 0;
      status.downloadedBytes = 0;
      status.totalBytes = status.latest.apkSize || 0;
      status.downloadedReady = false;
      status.permissionNeeded = false;
      status.error = '';
      emit();
      root.IronPulseBridge.downloadAndInstallApk(status.latest.apkUrl);
    } else {
      openReleasePage();
    }
  }

  function retryInstall() {
    if (root.IronPulseBridge && root.IronPulseBridge.installDownloadedApk) {
      status.permissionNeeded = false;
      emit();
      root.IronPulseBridge.installDownloadedApk();
    }
  }

  function openReleasePage() {
    var url = (status.latest && (status.latest.apkUrl || status.latest.htmlUrl)) ||
      ('https://github.com/' + getDefaultRepo() + '/releases');
    if (root.IronPulseBridge && root.IronPulseBridge.openExternalUrl) {
      root.IronPulseBridge.openExternalUrl(url);
    } else {
      root.open(url, '_blank');
    }
  }

  // Bridge callbacks invoked from Android native Java
  function onReleaseCheckResult(b64) {
    handleReleaseJson(decodeB64Utf8(b64));
  }

  function onReleaseCheckError(b64) {
    handleCheckError(decodeB64Utf8(b64));
  }

  function onDownloadProgress(pct, downloaded, total) {
    status.downloading = true;
    status.downloadPct = pct;
    status.downloadedBytes = downloaded;
    status.totalBytes = total;
    emit();
  }

  function onDownloadComplete() {
    status.downloading = false;
    status.downloadPct = 100;
    status.downloadedReady = true;
    emit();
  }

  function onDownloadError(b64) {
    status.downloading = false;
    status.error = decodeB64Utf8(b64);
    emit();
  }

  function onInstallPermissionNeeded() {
    status.downloading = false;
    status.downloadedReady = true;
    status.permissionNeeded = true;
    emit();
  }


  function onReleaseMetaResult(b64) {
    try {
      var meta = JSON.parse(decodeB64Utf8(b64));
      var remoteSha = String(meta.signingSha256 || '').toLowerCase();
      var localSha = getInstalledSigningSha256();
      status.remoteSigningSha256 = remoteSha;
      status.signingMismatch = !!(remoteSha && localSha && remoteSha !== localSha);
      emit();
    } catch (ignored) {}
  }

  var exported = {
    getCurrentVersion: getCurrentVersion,
    getCurrentVersionCode: getCurrentVersionCode,
    getDefaultRepo: getDefaultRepo,
    compareSemver: compareSemver,
    normalizeVersion: normalizeVersion,
    getStatus: getStatus,
    subscribe: subscribe,
    checkForUpdates: checkForUpdates,
    startDownload: startDownload,
    retryInstall: retryInstall,
    openReleasePage: openReleasePage,
    onReleaseCheckResult: onReleaseCheckResult,
    onReleaseCheckError: onReleaseCheckError,
    onDownloadProgress: onDownloadProgress,
    onDownloadComplete: onDownloadComplete,
    onDownloadError: onDownloadError,
    onInstallPermissionNeeded: onInstallPermissionNeeded,
    onReleaseMetaResult: onReleaseMetaResult,
    getInstalledSigningSha256: getInstalledSigningSha256
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    root.IronPulseUpdater = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
