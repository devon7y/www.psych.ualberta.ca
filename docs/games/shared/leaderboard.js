(function(window) {
  "use strict";

  // -----------------------------------------------------------------------
  // CONFIGURATION
  // -----------------------------------------------------------------------
  var FIREBASE_CONFIG = null; // Set to Firebase config object to enable cloud leaderboard

  var GAME_IDS = ['brainwave_surfer', 'memory_trace', 'erp_catcher', 'recall_rush'];
  var GAME_LABELS = {
    brainwave_surfer: 'Brainwave Surfer',
    memory_trace:     'Memory Trace',
    erp_catcher:      'ERP Catcher',
    recall_rush:      'Recall Rush'
  };

  var MAX_ENTRIES = 10;
  var LS_KEY_PREFIX = 'cml_lb_';
  var LS_NAME_KEY = 'cml_player_name';

  // -----------------------------------------------------------------------
  // FIREBASE LOADER
  // -----------------------------------------------------------------------
  var db = null;
  var firebaseReady = false;
  var firebaseCallbacks = [];

  function loadFirebase(callback) {
    if (!FIREBASE_CONFIG) { callback(null); return; }
    if (firebaseReady) { callback(db); return; }
    firebaseCallbacks.push(callback);
    if (document.getElementById('cml-firebase-app')) return;

    var scripts = [
      'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
    ];

    var loaded = 0;
    scripts.forEach(function(src) {
      var s = document.createElement('script');
      s.src = src;
      if (src.indexOf('app-compat') !== -1) s.id = 'cml-firebase-app';
      s.onload = function() {
        loaded++;
        if (loaded === scripts.length) {
          try {
            firebase.initializeApp(FIREBASE_CONFIG);
            db = firebase.database();
            firebaseReady = true;
            firebaseCallbacks.forEach(function(cb) { cb(db); });
          } catch(e) {
            firebaseCallbacks.forEach(function(cb) { cb(null); });
          }
          firebaseCallbacks = [];
        }
      };
      s.onerror = function() {
        firebaseCallbacks.forEach(function(cb) { cb(null); });
        firebaseCallbacks = [];
      };
      document.head.appendChild(s);
    });
  }

  // -----------------------------------------------------------------------
  // SCORE SUBMISSION
  // -----------------------------------------------------------------------
  function submitScore(gameId, name, score, callback) {
    name = String(name).slice(0, 32).trim() || 'Anonymous';
    score = Math.round(Number(score)) || 0;
    var entry = { name: name, score: score, date: new Date().toLocaleDateString() };

    // Save player name for future use
    try { localStorage.setItem(LS_NAME_KEY, name); } catch(e) {}

    // localStorage write (always)
    _lsWriteScore(gameId, entry);

    // Firebase write (best-effort)
    loadFirebase(function(database) {
      if (!database) {
        var rank = _lsGetRank(gameId, score);
        if (callback) callback(null, { name: name, score: score, date: entry.date, rank: rank });
        return;
      }
      var ref = database.ref('leaderboards/' + gameId);
      ref.push({ name: name, score: score, ts: Date.now() })
        .then(function() {
          var rank = _lsGetRank(gameId, score);
          if (callback) callback(null, { name: name, score: score, date: entry.date, rank: rank });
        })
        .catch(function() {
          var rank = _lsGetRank(gameId, score);
          if (callback) callback(null, { name: name, score: score, date: entry.date, rank: rank });
        });
    });
  }

  // -----------------------------------------------------------------------
  // SCORE FETCHING
  // -----------------------------------------------------------------------
  function fetchScores(gameId, callback) {
    loadFirebase(function(database) {
      if (!database) {
        callback(_lsReadScores(gameId));
        return;
      }
      var ref = database.ref('leaderboards/' + gameId);
      ref.orderByChild('score').limitToLast(MAX_ENTRIES)
        .once('value')
        .then(function(snapshot) {
          var entries = [];
          snapshot.forEach(function(child) {
            var v = child.val();
            entries.push({
              name:  v.name,
              score: v.score,
              date:  v.ts ? new Date(v.ts).toLocaleDateString() : '-'
            });
          });
          entries.sort(function(a, b) { return b.score - a.score; });
          entries = entries.slice(0, MAX_ENTRIES);
          entries.forEach(function(e, i) { e.rank = i + 1; });
          callback(entries);
        })
        .catch(function() {
          callback(_lsReadScores(gameId));
        });
    });
  }

  // -----------------------------------------------------------------------
  // LEADERBOARD WIDGET RENDERER
  // -----------------------------------------------------------------------
  function renderWidget(containerId, gameId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var games = gameId ? [gameId] : GAME_IDS;

    var html = '<div class="leaderboard-widget">';
    html += '<h3>Global Leaderboard</h3>';

    if (games.length > 1) {
      html += '<div class="leaderboard-tabs" role="tablist">';
      games.forEach(function(gid, i) {
        html += '<button class="leaderboard-tab' + (i === 0 ? ' active' : '') + '" ' +
                'data-game="' + gid + '" role="tab">' + _esc(GAME_LABELS[gid]) + '</button>';
      });
      html += '</div>';
    }

    html += '<div class="leaderboard-body">';
    games.forEach(function(gid, i) {
      html += '<div class="leaderboard-panel" data-game="' + gid + '" ' +
              'style="display:' + (i === 0 ? 'block' : 'none') + '">';
      html += '<div class="leaderboard-loading">Loading scores...</div>';
      html += '</div>';
    });
    html += '</div></div>';

    container.innerHTML = html;

    // Tab switching
    var tabs = container.querySelectorAll('.leaderboard-tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function() {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        this.classList.add('active');
        var panels = container.querySelectorAll('.leaderboard-panel');
        for (var k = 0; k < panels.length; k++) {
          panels[k].style.display = panels[k].getAttribute('data-game') === this.getAttribute('data-game') ? 'block' : 'none';
        }
      });
    }

    // Load scores for all panels
    games.forEach(function(gid) {
      fetchScores(gid, function(entries) {
        var panel = container.querySelector('.leaderboard-panel[data-game="' + gid + '"]');
        if (!panel) return;
        if (!entries || entries.length === 0) {
          panel.innerHTML = '<p class="leaderboard-loading">No scores yet. Be the first!</p>';
          return;
        }
        var tableHtml = '<table class="leaderboard-table"><thead><tr>' +
          '<th>#</th><th>Name</th><th>Score</th><th>Date</th>' +
          '</tr></thead><tbody>';
        entries.forEach(function(e) {
          var rankClass = e.rank === 1 ? ' leaderboard-rank--gold' :
                          e.rank === 2 ? ' leaderboard-rank--silver' :
                          e.rank === 3 ? ' leaderboard-rank--bronze' : '';
          tableHtml += '<tr><td class="leaderboard-rank' + rankClass + '">' + e.rank +
            '</td><td>' + _esc(e.name) + '</td><td>' + e.score.toLocaleString() +
            '</td><td>' + _esc(e.date) + '</td></tr>';
        });
        tableHtml += '</tbody></table>';
        panel.innerHTML = tableHtml;
      });
    });
  }

  // -----------------------------------------------------------------------
  // SCORE SUBMISSION UI
  // -----------------------------------------------------------------------
  function showSubmitForm(containerId, gameId, score, onSubmitted) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var savedName = '';
    try { savedName = localStorage.getItem(LS_NAME_KEY) || ''; } catch(e) {}

    container.innerHTML =
      '<div class="lb-submit-form">' +
      '<p>Your score: <strong>' + Math.round(score).toLocaleString() + '</strong></p>' +
      '<div style="margin-bottom:12px;">' +
      '<input type="text" id="lb-name-input" maxlength="32" placeholder="Your name" value="' + _esc(savedName) + '" />' +
      '</div>' +
      '<button id="lb-submit-btn">Submit Score</button> ' +
      '<button id="lb-skip-btn">Skip</button>' +
      '</div>';

    var nameInput = document.getElementById('lb-name-input');
    nameInput.focus();
    nameInput.select();

    nameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('lb-submit-btn').click();
    });

    document.getElementById('lb-submit-btn').addEventListener('click', function() {
      var name = (nameInput.value || '').trim() || 'Anonymous';
      submitScore(gameId, name, score, function(err, entry) {
        if (onSubmitted) onSubmitted(entry);
        renderWidget(containerId, gameId);
      });
    });

    document.getElementById('lb-skip-btn').addEventListener('click', function() {
      renderWidget(containerId, gameId);
    });
  }

  // -----------------------------------------------------------------------
  // LOCALSTORAGE HELPERS
  // -----------------------------------------------------------------------
  function _lsKey(gameId) { return LS_KEY_PREFIX + gameId; }

  function _lsReadScores(gameId) {
    try {
      var raw = localStorage.getItem(_lsKey(gameId));
      var entries = raw ? JSON.parse(raw) : [];
      entries.sort(function(a, b) { return b.score - a.score; });
      entries = entries.slice(0, MAX_ENTRIES);
      entries.forEach(function(e, i) { e.rank = i + 1; });
      return entries;
    } catch(e) { return []; }
  }

  function _lsWriteScore(gameId, entry) {
    try {
      var entries = _lsReadScores(gameId);
      entries.forEach(function(e) { delete e.rank; });
      entries.push({ name: entry.name, score: entry.score, date: entry.date });
      entries.sort(function(a, b) { return b.score - a.score; });
      entries = entries.slice(0, 50);
      localStorage.setItem(_lsKey(gameId), JSON.stringify(entries));
    } catch(e) {}
  }

  function _lsGetRank(gameId, score) {
    var entries = _lsReadScores(gameId);
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].score <= score) return i + 1;
    }
    return entries.length + 1;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // -----------------------------------------------------------------------
  // PUBLIC API
  // -----------------------------------------------------------------------
  window.CMLLeaderboard = {
    submitScore:    submitScore,
    fetchScores:    fetchScores,
    renderWidget:   renderWidget,
    showSubmitForm: showSubmitForm,
    GAME_IDS:       GAME_IDS,
    GAME_LABELS:    GAME_LABELS
  };

})(window);
