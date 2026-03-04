(function() {
  "use strict";

  // =========================================================================
  // WORD POOL
  // =========================================================================
  var WORDS = [
    "APPLE","ARROW","BADGE","BEACH","BENCH","BLADE","BLOOM","BOARD","BRAIN","BREAD",
    "BRICK","BRUSH","CABIN","CANDY","CHAIR","CHALK","CHARM","CHEST","CHIEF","CLOCK",
    "CLOUD","COACH","CORAL","COUCH","CRANE","CREEK","CROWN","DANCE","DIARY","DREAM",
    "DRIFT","DRONE","EAGLE","FENCE","FLAME","FLASH","FLOAT","FLOOD","FLUTE","FORGE",
    "FROST","GLOBE","GRAIN","GRAPE","GUARD","HEART","HEDGE","HOUSE","IVORY","JEWEL",
    "KNIFE","LEMON","LIGHT","LODGE","MAPLE","MARSH","MEDAL","MELON","MOOSE","NERVE",
    "OCEAN","OLIVE","ORGAN","OTTER","PAINT","PANEL","PEARL","PENNY","PIANO","PLANT",
    "PLUME","POUCH","PRISM","PRIZE","PULSE","QUAIL","QUEEN","RADIO","RANCH","RIDGE",
    "RIVER","ROBIN","SCARF","SHADE","SHELL","SHINE","SKULL","SMOKE","SNAKE","SOLAR",
    "SPARK","SPEAR","SPINE","STAGE","STAMP","STEAM","STONE","STORM","STRAW","SUGAR",
    "SWORD","TABLE","TEMPO","THORN","TIGER","TORCH","TOWER","TRAIL","TULIP","VAULT",
    "VIGOR","VIOLA","WAGON","WHALE","WHEEL","WRIST","YACHT","ZEBRA"
  ];

  // =========================================================================
  // GAME STATE
  // =========================================================================
  var state = {
    round: 0,
    score: 0,
    lives: 3,
    currentList: [],
    recalledWords: [],
    recallTimerId: null,
    recallTimeLeft: 0,
    recallTotalTime: 0,
    presentTimerId: null,
    usedWords: {},
    // Power-ups: true = available
    puRehearsal: true,
    puDeep: true,
    puSpacing: true,
    deepEncodingActive: false,
    gameActive: false
  };

  // =========================================================================
  // DOM REFS
  // =========================================================================
  var els = {};

  function cacheDom() {
    els.hud = document.getElementById("game-hud");
    els.hudRound = document.getElementById("hud-round");
    els.hudScore = document.getElementById("hud-score");
    els.hudLives = document.getElementById("hud-lives");
    els.screenStart = document.getElementById("screen-start");
    els.screenCountdown = document.getElementById("screen-countdown");
    els.countdownNumber = document.getElementById("countdown-number");
    els.screenPresent = document.getElementById("screen-present");
    els.wordDisplay = document.getElementById("word-display");
    els.progressDots = document.getElementById("progress-dots");
    els.screenRecall = document.getElementById("screen-recall");
    els.recallTimer = document.getElementById("recall-timer");
    els.timerBar = document.getElementById("timer-bar");
    els.recallInput = document.getElementById("recall-input");
    els.recallChips = document.getElementById("recall-chips");
    els.powerupBar = document.getElementById("powerup-bar");
    els.puRehearsal = document.getElementById("pu-rehearsal");
    els.puDeep = document.getElementById("pu-deep");
    els.puSpacing = document.getElementById("pu-spacing");
    els.screenRehearsal = document.getElementById("screen-rehearsal");
    els.rehearsalWords = document.getElementById("rehearsal-words");
    els.screenResults = document.getElementById("screen-results");
    els.resultsGrid = document.getElementById("results-grid");
    els.roundScoreDisplay = document.getElementById("round-score-display");
    els.btnNextRound = document.getElementById("btn-next-round");
    els.btnEndGame = document.getElementById("btn-end-game");
    els.screenGameover = document.getElementById("screen-gameover");
    els.finalRound = document.getElementById("final-round");
    els.finalScore = document.getElementById("final-score");
    els.finalMessage = document.getElementById("final-message");
    els.btnStart = document.getElementById("btn-start");
    els.btnRestart = document.getElementById("btn-restart");
  }

  // =========================================================================
  // DIFFICULTY
  // =========================================================================
  function getRoundConfig(round) {
    var wordCount, displayTime, recallTime;
    if (round === 1) { wordCount = 4; displayTime = 800; recallTime = 20; }
    else if (round === 2) { wordCount = 5; displayTime = 700; recallTime = 20; }
    else if (round === 3) { wordCount = 6; displayTime = 600; recallTime = 18; }
    else if (round === 4) { wordCount = 7; displayTime = 500; recallTime = 18; }
    else {
      wordCount = 7 + (round - 4);
      displayTime = Math.max(250, 500 - (round - 4) * 50);
      recallTime = Math.max(15, 18 - (round - 5));
    }
    // Deep encoding power-up: slow presentation by 50%
    if (state.deepEncodingActive) {
      displayTime = Math.round(displayTime * 1.5);
      state.deepEncodingActive = false;
    }
    return { wordCount: wordCount, displayTime: displayTime, recallTime: recallTime };
  }

  // =========================================================================
  // SCORING (Serial Position Curve)
  // =========================================================================
  function scoreWord(word, originalList) {
    var pos = originalList.indexOf(word);
    if (pos === -1) return 0;
    var n = originalList.length;
    var relPos = pos / (n - 1);
    // Middle items are harder = more points
    var serialMult = 0.5 + 1.0 * (1 - Math.abs(relPos - 0.5) * 2);
    return Math.round(100 * serialMult);
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function pickWords(count) {
    // Try to avoid recently used words
    var available = WORDS.filter(function(w) { return !state.usedWords[w]; });
    if (available.length < count) {
      state.usedWords = {};
      available = WORDS.slice();
    }
    var picked = shuffle(available).slice(0, count);
    picked.forEach(function(w) { state.usedWords[w] = true; });
    return picked;
  }

  function showScreen(screenEl) {
    var screens = [
      els.screenStart, els.screenCountdown, els.screenPresent,
      els.screenRecall, els.screenRehearsal, els.screenResults, els.screenGameover
    ];
    screens.forEach(function(s) { s.style.display = "none"; });
    screenEl.style.display = "";
  }

  function updateHud() {
    els.hudRound.textContent = state.round;
    els.hudScore.textContent = state.score;
    els.hudLives.textContent = state.lives;
  }

  function animateScorePop(points) {
    var pop = document.createElement("div");
    pop.className = "rr-score-pop";
    pop.textContent = "+" + points;
    var host = document.getElementById("game-host");
    host.appendChild(pop);
    setTimeout(function() {
      if (pop.parentNode) pop.parentNode.removeChild(pop);
    }, 900);
  }

  // =========================================================================
  // GAME FLOW
  // =========================================================================
  function startGame() {
    state.round = 0;
    state.score = 0;
    state.lives = 3;
    state.usedWords = {};
    state.puRehearsal = true;
    state.puDeep = true;
    state.puSpacing = true;
    state.deepEncodingActive = false;
    state.gameActive = true;
    els.hud.style.display = "";
    updateHud();
    updatePowerupButtons();
    startRound();
  }

  function startRound() {
    state.round++;
    state.recalledWords = [];
    updateHud();
    showCountdown(function() {
      presentWords();
    });
  }

  function showCountdown(callback) {
    showScreen(els.screenCountdown);
    var count = 3;
    els.countdownNumber.textContent = count;
    els.countdownNumber.classList.remove("rr-countdown-tick");

    var interval = setInterval(function() {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        callback();
      } else {
        els.countdownNumber.textContent = count;
        // Trigger tick animation
        els.countdownNumber.classList.remove("rr-countdown-tick");
        // Force reflow
        void els.countdownNumber.offsetWidth;
        els.countdownNumber.classList.add("rr-countdown-tick");
      }
    }, 800);
  }

  // =========================================================================
  // PRESENTATION PHASE
  // =========================================================================
  function presentWords() {
    var config = getRoundConfig(state.round);
    state.currentList = pickWords(config.wordCount);

    showScreen(els.screenPresent);

    // Build progress dots
    els.progressDots.innerHTML = "";
    for (var d = 0; d < state.currentList.length; d++) {
      var dot = document.createElement("span");
      dot.className = "rr-dot";
      els.progressDots.appendChild(dot);
    }

    var wordIndex = 0;
    var displayTime = config.displayTime;
    // Time breakdown: 30% fade in, 40% visible, 30% fade out
    var fadeInTime = Math.round(displayTime * 0.25);
    var holdTime = Math.round(displayTime * 0.50);
    var fadeOutTime = Math.round(displayTime * 0.25);

    function showNext() {
      if (wordIndex >= state.currentList.length) {
        // All words shown, move to recall
        setTimeout(function() { startRecall(config.recallTime); }, 300);
        return;
      }

      var word = state.currentList[wordIndex];
      els.wordDisplay.textContent = word;
      els.wordDisplay.className = "rr-word-display rr-word-enter";
      els.wordDisplay.style.animationDuration = fadeInTime + "ms";

      // Mark dot
      var dots = els.progressDots.querySelectorAll(".rr-dot");
      if (dots[wordIndex]) dots[wordIndex].classList.add("rr-dot-active");

      // After fade in + hold, start fade out
      setTimeout(function() {
        els.wordDisplay.className = "rr-word-display rr-word-exit";
        els.wordDisplay.style.animationDuration = fadeOutTime + "ms";

        setTimeout(function() {
          els.wordDisplay.className = "rr-word-display";
          els.wordDisplay.textContent = "";
          wordIndex++;
          // Small gap between words
          setTimeout(showNext, 100);
        }, fadeOutTime);
      }, fadeInTime + holdTime);
    }

    showNext();
  }

  // =========================================================================
  // RECALL PHASE
  // =========================================================================
  function startRecall(recallSeconds) {
    showScreen(els.screenRecall);
    els.recallChips.innerHTML = "";
    els.recallInput.value = "";
    els.recallInput.focus();

    state.recallTotalTime = recallSeconds;
    state.recallTimeLeft = recallSeconds;
    updateTimerDisplay();

    els.timerBar.style.transition = "none";
    els.timerBar.style.width = "100%";

    updatePowerupButtons();

    // Start countdown
    var startTs = Date.now();
    state.recallTimerId = setInterval(function() {
      var elapsed = (Date.now() - startTs) / 1000;
      state.recallTimeLeft = Math.max(0, state.recallTotalTime - elapsed);
      updateTimerDisplay();

      // Timer bar
      var pct = (state.recallTimeLeft / state.recallTotalTime) * 100;
      els.timerBar.style.transition = "width 0.1s linear";
      els.timerBar.style.width = pct + "%";

      if (state.recallTimeLeft <= 0) {
        endRecall();
      }
    }, 100);
  }

  function updateTimerDisplay() {
    var secs = Math.ceil(state.recallTimeLeft);
    els.recallTimer.textContent = secs + "s";
    if (secs <= 5) {
      els.recallTimer.classList.add("rr-timer-critical");
    } else {
      els.recallTimer.classList.remove("rr-timer-critical");
    }
  }

  function submitWord() {
    var raw = els.recallInput.value.trim().toUpperCase();
    els.recallInput.value = "";
    if (!raw) return;

    // Check if already recalled
    var alreadyRecalled = false;
    for (var i = 0; i < state.recalledWords.length; i++) {
      if (state.recalledWords[i].word === raw) { alreadyRecalled = true; break; }
    }
    if (alreadyRecalled) return;

    var isCorrect = state.currentList.indexOf(raw) !== -1;
    var points = 0;

    if (isCorrect) {
      points = scoreWord(raw, state.currentList);
      state.score += points;
      updateHud();
      animateScorePop(points);
    }

    state.recalledWords.push({ word: raw, correct: isCorrect, points: points });
    addChip(raw, isCorrect, points);

    // Check if all words recalled
    var correctCount = 0;
    state.recalledWords.forEach(function(r) { if (r.correct) correctCount++; });
    if (correctCount === state.currentList.length) {
      endRecall();
    }
  }

  function addChip(word, correct, points) {
    var chip = document.createElement("span");
    chip.className = "rr-chip " + (correct ? "rr-chip-correct" : "rr-chip-wrong");
    chip.textContent = word;
    if (correct && points > 0) {
      var badge = document.createElement("span");
      badge.className = "rr-chip-points";
      badge.textContent = "+" + points;
      chip.appendChild(badge);
    }
    els.recallChips.appendChild(chip);
    // Scroll chips into view
    chip.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function endRecall() {
    if (state.recallTimerId) {
      clearInterval(state.recallTimerId);
      state.recallTimerId = null;
    }
    showRoundResults();
  }

  // =========================================================================
  // ROUND RESULTS
  // =========================================================================
  function showRoundResults() {
    showScreen(els.screenResults);

    var correctCount = 0;
    var roundPoints = 0;
    var recalledMap = {};
    state.recalledWords.forEach(function(r) {
      if (r.correct) {
        recalledMap[r.word] = r.points;
        correctCount++;
        roundPoints += r.points;
      }
    });

    // Build results grid
    var html = '<div class="rr-results-list">';
    state.currentList.forEach(function(word, idx) {
      var recalled = recalledMap.hasOwnProperty(word);
      var pts = recalled ? recalledMap[word] : scoreWord(word, state.currentList);
      var posLabel = (idx + 1);
      html += '<div class="rr-result-item ' + (recalled ? 'rr-result-hit' : 'rr-result-miss') + '">';
      html += '<span class="rr-result-pos">' + posLabel + '</span>';
      html += '<span class="rr-result-word">' + word + '</span>';
      html += '<span class="rr-result-pts">' + (recalled ? '+' + pts : pts + ' pts') + '</span>';
      html += '</div>';
    });
    html += '</div>';

    els.resultsGrid.innerHTML = html;

    var recallPct = state.currentList.length > 0 ? (correctCount / state.currentList.length) : 0;
    var roundSummary = correctCount + '/' + state.currentList.length + ' recalled';
    if (roundPoints > 0) {
      roundSummary += ' &mdash; ' + roundPoints + ' points this round';
    }
    els.roundScoreDisplay.innerHTML = roundSummary;

    // Check for failure (< 30% recall)
    var failed = recallPct < 0.3;
    if (failed) {
      state.lives--;
      updateHud();
      els.roundScoreDisplay.innerHTML += '<br><span class="rr-fail-notice">Round failed! ' + state.lives + ' lives remaining.</span>';
    }

    if (state.lives <= 0) {
      // Game over on next click
      els.btnNextRound.style.display = "none";
      els.btnEndGame.style.display = "";
      els.btnEndGame.textContent = "See Results";
      els.btnEndGame.onclick = function() { endGame(); };
    } else {
      els.btnNextRound.style.display = "";
      // Show end game option after round 3
      if (state.round >= 3) {
        els.btnEndGame.style.display = "";
        els.btnEndGame.textContent = "End Game";
        els.btnEndGame.onclick = function() { endGame(); };
      } else {
        els.btnEndGame.style.display = "none";
      }
    }
  }

  // =========================================================================
  // GAME OVER
  // =========================================================================
  function endGame() {
    state.gameActive = false;
    els.hud.style.display = "none";
    showScreen(els.screenGameover);

    els.finalRound.textContent = state.round;
    els.finalScore.textContent = state.score.toLocaleString();

    // Fun messages based on score
    var msg = "";
    if (state.score === 0) {
      msg = "Don't worry, encoding takes practice!";
    } else if (state.score < 300) {
      msg = "Your hippocampus is warming up!";
    } else if (state.score < 800) {
      msg = "Solid recall! Your memory trace is strong.";
    } else if (state.score < 1500) {
      msg = "Impressive! You'd make a great participant in our studies.";
    } else {
      msg = "Phenomenal memory! Are you a mnemonist?";
    }
    els.finalMessage.textContent = msg;

    // Show leaderboard submit
    if (typeof CMLLeaderboard !== "undefined" && state.score > 0) {
      CMLLeaderboard.showSubmitForm("leaderboard-container", "recall_rush", state.score);
    }
  }

  // =========================================================================
  // POWER-UPS
  // =========================================================================
  function updatePowerupButtons() {
    els.puRehearsal.disabled = !state.puRehearsal;
    els.puDeep.disabled = !state.puDeep;
    els.puSpacing.disabled = !state.puSpacing;

    els.puRehearsal.classList.toggle("rr-powerup-used", !state.puRehearsal);
    els.puDeep.classList.toggle("rr-powerup-used", !state.puDeep);
    els.puSpacing.classList.toggle("rr-powerup-used", !state.puSpacing);
  }

  function useRehearsal() {
    if (!state.puRehearsal) return;
    state.puRehearsal = false;
    updatePowerupButtons();

    // Pause recall timer
    if (state.recallTimerId) {
      clearInterval(state.recallTimerId);
    }

    // Show words for 2 seconds
    els.rehearsalWords.innerHTML = state.currentList.join("&nbsp;&nbsp;&bull;&nbsp;&nbsp;");
    showScreen(els.screenRehearsal);

    setTimeout(function() {
      showScreen(els.screenRecall);
      els.recallInput.focus();

      // Resume timer
      var startTs = Date.now();
      var remaining = state.recallTimeLeft;
      state.recallTimerId = setInterval(function() {
        var elapsed = (Date.now() - startTs) / 1000;
        state.recallTimeLeft = Math.max(0, remaining - elapsed);
        updateTimerDisplay();
        var pct = (state.recallTimeLeft / state.recallTotalTime) * 100;
        els.timerBar.style.width = pct + "%";
        if (state.recallTimeLeft <= 0) {
          endRecall();
        }
      }, 100);
    }, 2000);
  }

  function useDeepEncoding() {
    if (!state.puDeep) return;
    state.puDeep = false;
    state.deepEncodingActive = true;
    updatePowerupButtons();

    // Visual feedback
    els.puDeep.textContent = "Active!";
    setTimeout(function() {
      els.puDeep.textContent = "Deep Encoding";
    }, 1500);
  }

  function useSpacing() {
    if (!state.puSpacing) return;
    state.puSpacing = false;
    updatePowerupButtons();

    // Add 5 seconds
    state.recallTotalTime += 5;
    state.recallTimeLeft += 5;
    updateTimerDisplay();

    // Visual flash
    els.recallTimer.classList.add("rr-timer-bonus");
    setTimeout(function() {
      els.recallTimer.classList.remove("rr-timer-bonus");
    }, 800);
  }

  // =========================================================================
  // EVENT BINDING
  // =========================================================================
  function bindEvents() {
    els.btnStart.addEventListener("click", function() {
      startGame();
    });

    els.btnRestart.addEventListener("click", function() {
      document.getElementById("leaderboard-container").innerHTML = "";
      startGame();
    });

    els.btnNextRound.addEventListener("click", function() {
      startRound();
    });

    els.recallInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        submitWord();
      }
    });

    els.puRehearsal.addEventListener("click", function() {
      useRehearsal();
    });

    els.puDeep.addEventListener("click", function() {
      useDeepEncoding();
    });

    els.puSpacing.addEventListener("click", function() {
      useSpacing();
    });
  }

  // =========================================================================
  // INIT
  // =========================================================================
  function init() {
    cacheDom();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
