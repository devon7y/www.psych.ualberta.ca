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
  // LEVEL DEFINITIONS
  // =========================================================================
  var LEVELS = [
    { gridSize: 4, items: 6,  strongMs: 2000, weakMs: 700,  distractorSec: 15 },
    { gridSize: 4, items: 8,  strongMs: 1500, weakMs: 500,  distractorSec: 15 },
    { gridSize: 5, items: 10, strongMs: 1000, weakMs: 400,  distractorSec: 12 },
    { gridSize: 5, items: 12, strongMs: 800,  weakMs: 300,  distractorSec: 10 },
    { gridSize: 6, items: 14, strongMs: 700,  weakMs: 250,  distractorSec: 10 }
  ];

  function getLevelConfig(level) {
    if (level <= LEVELS.length) {
      return LEVELS[level - 1];
    }
    // Level 5+: 6x6 grid, +2 items per level beyond 5, timings decrease
    var extra = level - LEVELS.length;
    return {
      gridSize: 6,
      items: Math.min(14 + extra * 2, 36),
      strongMs: Math.max(400, 700 - extra * 50),
      weakMs: Math.max(150, 250 - extra * 25),
      distractorSec: Math.max(8, 10 - extra)
    };
  }

  // =========================================================================
  // GAME STATE
  // =========================================================================
  var state = {
    level: 1,
    totalScore: 0,
    fails: 0,
    maxFails: 3,
    // Current round
    config: null,
    studyItems: [],    // [{cellIndex, word, isStrong}]
    recallIndex: 0,
    roundScore: 0,
    roundCorrect: 0,
    roundWrong: 0,
    recallResults: [],  // per-item: true/false
    // Distractor stats
    mathCorrect: 0,
    mathTotal: 0,
    mathTotalAllTime: 0,
    mathCorrectAllTime: 0,
    // Timers
    studyTimer: null,
    distractorTimer: null,
    distractorInterval: null,
    distractorStart: 0,
    // Used words (to avoid repeats within a session)
    usedWords: []
  };

  // =========================================================================
  // DOM REFS
  // =========================================================================
  var phases = {
    start:      document.getElementById('mt-start'),
    study:      document.getElementById('mt-study'),
    distractor: document.getElementById('mt-distractor'),
    recall:     document.getElementById('mt-recall'),
    results:    document.getElementById('mt-results'),
    gameover:   document.getElementById('mt-gameover')
  };

  function showPhase(name) {
    var keys = Object.keys(phases);
    for (var i = 0; i < keys.length; i++) {
      var el = phases[keys[i]];
      if (keys[i] === name) {
        el.classList.add('active');
        el.classList.add('mt-fade-in');
      } else {
        el.classList.remove('active');
        el.classList.remove('mt-fade-in');
      }
    }
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
    // If we've used most words, reset pool
    if (state.usedWords.length + count > WORDS.length) {
      state.usedWords = [];
    }
    var available = [];
    for (var i = 0; i < WORDS.length; i++) {
      if (state.usedWords.indexOf(WORDS[i]) === -1) {
        available.push(WORDS[i]);
      }
    }
    available = shuffle(available);
    var picked = available.slice(0, count);
    for (var j = 0; j < picked.length; j++) {
      state.usedWords.push(picked[j]);
    }
    return picked;
  }

  function scoreItem(item, position, totalItems) {
    var base = item.isStrong ? 75 : 150;
    var relPos = totalItems > 1 ? position / (totalItems - 1) : 0.5;
    var serialBonus = Math.round(50 * (1 - Math.abs(relPos - 0.5) * 2));
    return base + serialBonus;
  }

  // =========================================================================
  // HUD
  // =========================================================================
  function updateHUD() {
    var levelEls = [document.getElementById('mt-hud-level'), document.getElementById('mt-hud-level2')];
    var scoreEls = [document.getElementById('mt-hud-score'), document.getElementById('mt-hud-score2')];
    var livesEls = [document.getElementById('mt-hud-lives'), document.getElementById('mt-hud-lives2')];

    for (var i = 0; i < levelEls.length; i++) {
      if (levelEls[i]) levelEls[i].textContent = state.level;
      if (scoreEls[i]) scoreEls[i].textContent = state.totalScore.toLocaleString();
    }

    for (var k = 0; k < livesEls.length; k++) {
      if (!livesEls[k]) continue;
      var html = '';
      for (var f = 0; f < state.maxFails; f++) {
        html += '<span class="mt-life' + (f < state.fails ? ' used' : '') + '"></span>';
      }
      livesEls[k].innerHTML = html;
    }
  }

  // =========================================================================
  // GRID BUILDER
  // =========================================================================
  function buildGrid(containerId, gridSize, clickable) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    container.className = 'mt-grid mt-grid--' + gridSize;

    var totalCells = gridSize * gridSize;
    var cells = [];
    for (var i = 0; i < totalCells; i++) {
      var cell = document.createElement('div');
      cell.className = 'mt-cell';
      cell.setAttribute('data-index', i);

      // Badge for sequence number (hidden by default)
      var badge = document.createElement('span');
      badge.className = 'mt-cell-badge';
      cell.appendChild(badge);

      if (clickable) {
        cell.classList.add('recall-ready');
        (function(idx, cellEl) {
          cellEl.addEventListener('click', function() {
            handleRecallClick(idx, cellEl);
          });
        })(i, cell);
      }

      container.appendChild(cell);
      cells.push(cell);
    }
    return cells;
  }

  // =========================================================================
  // STUDY PHASE
  // =========================================================================
  function startStudy() {
    state.config = getLevelConfig(state.level);
    var cfg = state.config;
    var totalCells = cfg.gridSize * cfg.gridSize;

    // Pick random cell positions for items
    var allPositions = [];
    for (var i = 0; i < totalCells; i++) allPositions.push(i);
    allPositions = shuffle(allPositions);
    var positions = allPositions.slice(0, cfg.items);

    // Pick words
    var words = pickWords(cfg.items);

    // Determine strong/weak (~40% strong)
    var numStrong = Math.round(cfg.items * 0.4);
    var strengthOrder = [];
    var s;
    for (s = 0; s < numStrong; s++) strengthOrder.push(true);
    for (s = numStrong; s < cfg.items; s++) strengthOrder.push(false);
    strengthOrder = shuffle(strengthOrder);

    state.studyItems = [];
    for (var j = 0; j < cfg.items; j++) {
      state.studyItems.push({
        cellIndex: positions[j],
        word: words[j],
        isStrong: strengthOrder[j]
      });
    }

    state.recallIndex = 0;
    state.roundScore = 0;
    state.roundCorrect = 0;
    state.roundWrong = 0;
    state.recallResults = [];
    state.mathCorrect = 0;
    state.mathTotal = 0;

    updateHUD();
    showPhase('study');

    var studyCells = buildGrid('mt-study-grid', cfg.gridSize, false);

    // Animate study items one at a time
    var itemIndex = 0;
    var counterEl = document.getElementById('mt-study-counter');

    function showNextItem() {
      if (itemIndex >= state.studyItems.length) {
        // Study phase done, start distractor
        startDistractor();
        return;
      }

      var item = state.studyItems[itemIndex];
      var cell = studyCells[item.cellIndex];
      var duration = item.isStrong ? cfg.strongMs : cfg.weakMs;

      counterEl.textContent = 'Item ' + (itemIndex + 1) + ' of ' + state.studyItems.length;

      // Light up cell
      cell.classList.add('study-active');
      cell.classList.add(item.isStrong ? 'study-strong' : 'study-weak');
      cell.childNodes[cell.childNodes.length - 1].textContent = item.word;
      // The text is inside the cell itself, not just the badge
      // We need to set the text content but keep the badge
      var textNode = document.createTextNode(item.word);
      // Clear existing text but keep badge
      while (cell.childNodes.length > 1) {
        cell.removeChild(cell.lastChild);
      }
      cell.appendChild(textNode);
      cell.style.color = '#fff';
      cell.style.fontSize = '0.8rem';

      state.studyTimer = setTimeout(function() {
        // Turn off cell
        cell.classList.remove('study-active', 'study-strong', 'study-weak');
        cell.style.color = 'transparent';

        // Pause between items
        state.studyTimer = setTimeout(function() {
          itemIndex++;
          showNextItem();
        }, 400);
      }, duration);
    }

    // Brief pause before starting
    state.studyTimer = setTimeout(function() {
      showNextItem();
    }, 800);
  }

  // =========================================================================
  // DISTRACTOR PHASE
  // =========================================================================
  var currentMathAnswer = 0;

  function generateMathProblem() {
    var a = Math.floor(Math.random() * 20) + 1;
    var b = Math.floor(Math.random() * 20) + 1;
    var isAdd = Math.random() > 0.4;
    var problem, answer;

    if (isAdd) {
      problem = a + ' + ' + b + ' = ?';
      answer = a + b;
    } else {
      // Ensure no negative results
      if (a < b) { var tmp = a; a = b; b = tmp; }
      problem = a + ' - ' + b + ' = ?';
      answer = a - b;
    }

    currentMathAnswer = answer;
    document.getElementById('mt-math-problem').textContent = problem;
    var inp = document.getElementById('mt-math-input');
    inp.value = '';
    inp.className = '';
    inp.focus();
  }

  function handleMathSubmit() {
    var inp = document.getElementById('mt-math-input');
    var val = parseInt(inp.value, 10);
    if (isNaN(val)) return;

    state.mathTotal++;
    state.mathTotalAllTime++;

    if (val === currentMathAnswer) {
      state.mathCorrect++;
      state.mathCorrectAllTime++;
      inp.className = 'correct';
    } else {
      inp.className = 'wrong';
    }

    document.getElementById('mt-dist-stats').textContent =
      state.mathCorrect + '/' + state.mathTotal + ' correct';

    setTimeout(function() {
      generateMathProblem();
    }, 300);
  }

  function startDistractor() {
    showPhase('distractor');
    var cfg = state.config;
    var duration = cfg.distractorSec * 1000;
    var timerFill = document.getElementById('mt-dist-timer-fill');

    state.mathCorrect = 0;
    state.mathTotal = 0;
    document.getElementById('mt-dist-stats').textContent = '';
    timerFill.style.width = '100%';

    generateMathProblem();

    state.distractorStart = Date.now();

    state.distractorInterval = setInterval(function() {
      var elapsed = Date.now() - state.distractorStart;
      var pct = Math.max(0, 1 - elapsed / duration);
      timerFill.style.width = (pct * 100).toFixed(1) + '%';

      if (elapsed >= duration) {
        clearInterval(state.distractorInterval);
        state.distractorInterval = null;
        startRecall();
      }
    }, 100);
  }

  function onMathKeydown(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      handleMathSubmit();
    }
  }

  document.getElementById('mt-math-input').addEventListener('keydown', onMathKeydown);

  // =========================================================================
  // RECALL PHASE
  // =========================================================================
  function startRecall() {
    showPhase('recall');
    updateHUD();

    var cfg = state.config;
    state.recallIndex = 0;
    state.roundCorrect = 0;
    state.roundWrong = 0;
    state.roundScore = 0;
    state.recallResults = [];

    buildGrid('mt-recall-grid', cfg.gridSize, true);
    updateRecallProgress();
  }

  function updateRecallProgress() {
    var el = document.getElementById('mt-recall-progress');
    el.textContent = (state.recallIndex + 1) + ' of ' + state.studyItems.length;
  }

  function handleRecallClick(cellIndex, cellEl) {
    // Ignore if cell already clicked or recall is done
    if (!cellEl.classList.contains('recall-ready')) return;
    if (state.recallIndex >= state.studyItems.length) return;

    var expectedItem = state.studyItems[state.recallIndex];
    var isCorrect = (cellIndex === expectedItem.cellIndex);

    cellEl.classList.remove('recall-ready');

    if (isCorrect) {
      cellEl.classList.add('recall-correct');
      // Show the word
      while (cellEl.childNodes.length > 1) {
        cellEl.removeChild(cellEl.lastChild);
      }
      cellEl.appendChild(document.createTextNode(expectedItem.word));
      cellEl.style.color = '#fff';
      cellEl.style.fontSize = '0.8rem';
      // Show badge with position number
      cellEl.querySelector('.mt-cell-badge').textContent = state.recallIndex + 1;

      var pts = scoreItem(expectedItem, state.recallIndex, state.studyItems.length);
      // Bonus for correct serial order
      pts += 25;
      state.roundScore += pts;
      state.roundCorrect++;
      state.recallResults.push(true);
    } else {
      cellEl.classList.add('recall-wrong');
      // Penalty
      state.roundScore = Math.max(0, state.roundScore - 30);
      state.roundWrong++;
      state.recallResults.push(false);

      // Re-enable the wrong cell after animation for future clicks? No - mark the expected cell
      // Show which cell was correct
      var recallGrid = document.getElementById('mt-recall-grid');
      var expectedCell = recallGrid.children[expectedItem.cellIndex];
      if (expectedCell && expectedCell.classList.contains('recall-ready')) {
        expectedCell.classList.remove('recall-ready');
        expectedCell.classList.add('recall-missed');
        while (expectedCell.childNodes.length > 1) {
          expectedCell.removeChild(expectedCell.lastChild);
        }
        expectedCell.appendChild(document.createTextNode(expectedItem.word));
        expectedCell.style.color = 'var(--text-light)';
        expectedCell.style.fontSize = '0.75rem';
        expectedCell.querySelector('.mt-cell-badge').textContent = state.recallIndex + 1;
      }
    }

    state.recallIndex++;

    if (state.recallIndex >= state.studyItems.length) {
      // Round over
      setTimeout(function() {
        showRoundResults();
      }, 600);
    } else {
      updateRecallProgress();
    }
  }

  // =========================================================================
  // ROUND RESULTS
  // =========================================================================
  function showRoundResults() {
    showPhase('results');

    var total = state.studyItems.length;
    var recallPct = total > 0 ? Math.round((state.roundCorrect / total) * 100) : 0;
    var passed = recallPct >= 30;

    state.totalScore += state.roundScore;

    if (!passed) {
      state.fails++;
    }

    var titleEl = document.getElementById('mt-results-title');
    var subtitleEl = document.getElementById('mt-results-subtitle');
    var scoreEl = document.getElementById('mt-round-score');

    titleEl.textContent = passed ? 'Round Complete!' : 'Round Failed';
    subtitleEl.textContent = passed
      ? 'Level ' + state.level + ' cleared. Well done!'
      : 'Less than 30% recalled. Strike ' + state.fails + ' of ' + state.maxFails + '.';
    scoreEl.textContent = '+' + state.roundScore.toLocaleString();

    // Breakdown stats
    var breakdownEl = document.getElementById('mt-results-breakdown');
    var strongRecalled = 0;
    var weakRecalled = 0;
    var strongTotal = 0;
    var weakTotal = 0;
    for (var i = 0; i < state.studyItems.length; i++) {
      if (state.studyItems[i].isStrong) {
        strongTotal++;
        if (state.recallResults[i]) strongRecalled++;
      } else {
        weakTotal++;
        if (state.recallResults[i]) weakRecalled++;
      }
    }

    breakdownEl.innerHTML =
      '<div class="mt-result-stat">' +
        '<div class="mt-result-stat-value mt-result-stat-value--green">' + state.roundCorrect + '/' + total + '</div>' +
        '<div class="mt-result-stat-label">Recalled</div>' +
      '</div>' +
      '<div class="mt-result-stat">' +
        '<div class="mt-result-stat-value mt-result-stat-value--red">' + state.roundWrong + '</div>' +
        '<div class="mt-result-stat-label">Errors</div>' +
      '</div>' +
      '<div class="mt-result-stat">' +
        '<div class="mt-result-stat-value mt-result-stat-value--blue">' + strongRecalled + '/' + strongTotal + '</div>' +
        '<div class="mt-result-stat-label">Strong Items</div>' +
      '</div>' +
      '<div class="mt-result-stat">' +
        '<div class="mt-result-stat-value">' + weakRecalled + '/' + weakTotal + '</div>' +
        '<div class="mt-result-stat-label">Weak Items</div>' +
      '</div>';

    // Serial position detail
    var detailEl = document.getElementById('mt-serial-detail');
    var detailHtml = '<h4>Item-by-Item</h4>';
    for (var j = 0; j < state.studyItems.length; j++) {
      var item = state.studyItems[j];
      var hit = state.recallResults[j];
      detailHtml += '<div class="mt-serial-row">' +
        '<span class="mt-serial-pos">' + (j + 1) + '</span>' +
        '<span class="mt-serial-word">' + item.word + '</span>' +
        '<span class="mt-serial-type mt-serial-type--' + (item.isStrong ? 'strong' : 'weak') + '">' +
          (item.isStrong ? 'STRONG' : 'WEAK') +
        '</span>' +
        '<span class="mt-serial-result mt-serial-result--' + (hit ? 'hit' : 'miss') + '">' +
          (hit ? '\u2713' : '\u2717') +
        '</span>' +
      '</div>';
    }
    detailEl.innerHTML = detailHtml;

    // Next button or game over
    var nextBtn = document.getElementById('mt-next-btn');
    if (state.fails >= state.maxFails) {
      nextBtn.style.display = 'none';
      setTimeout(function() {
        showGameOver();
      }, 2000);
    } else {
      nextBtn.style.display = '';
      if (passed) {
        nextBtn.textContent = 'Next Round';
      } else {
        nextBtn.textContent = 'Try Again';
      }
    }
  }

  // =========================================================================
  // GAME OVER
  // =========================================================================
  function showGameOver() {
    showPhase('gameover');

    document.getElementById('mt-final-score').textContent = state.totalScore.toLocaleString();
    document.getElementById('mt-go-summary').textContent =
      'You reached Level ' + state.level + ' with a total score of ' + state.totalScore.toLocaleString() + '.';

    var mathPct = state.mathTotalAllTime > 0
      ? Math.round((state.mathCorrectAllTime / state.mathTotalAllTime) * 100)
      : 0;

    document.getElementById('mt-go-stats').innerHTML =
      '<div class="mt-go-stat">' +
        '<div class="mt-go-stat-value">' + state.level + '</div>' +
        '<div class="mt-go-stat-label">Level Reached</div>' +
      '</div>' +
      '<div class="mt-go-stat">' +
        '<div class="mt-go-stat-value">' + mathPct + '%</div>' +
        '<div class="mt-go-stat-label">Math Accuracy</div>' +
      '</div>' +
      '<div class="mt-go-stat">' +
        '<div class="mt-go-stat-value">' + state.mathTotalAllTime + '</div>' +
        '<div class="mt-go-stat-label">Math Problems</div>' +
      '</div>';

    // Leaderboard
    if (typeof CMLLeaderboard !== 'undefined') {
      CMLLeaderboard.showSubmitForm('leaderboard-container', 'memory_trace', state.totalScore);
    }
  }

  // =========================================================================
  // GAME FLOW
  // =========================================================================
  function startGame() {
    state.level = 1;
    state.totalScore = 0;
    state.fails = 0;
    state.usedWords = [];
    state.mathTotalAllTime = 0;
    state.mathCorrectAllTime = 0;
    startStudy();
  }

  function nextRound() {
    // Only advance level if passed
    var total = state.studyItems.length;
    var recallPct = total > 0 ? Math.round((state.roundCorrect / total) * 100) : 0;
    if (recallPct >= 30) {
      state.level++;
    }
    startStudy();
  }

  function cleanup() {
    if (state.studyTimer) {
      clearTimeout(state.studyTimer);
      state.studyTimer = null;
    }
    if (state.distractorInterval) {
      clearInterval(state.distractorInterval);
      state.distractorInterval = null;
    }
  }

  // =========================================================================
  // EVENT BINDINGS
  // =========================================================================
  document.getElementById('mt-play-btn').addEventListener('click', function() {
    cleanup();
    startGame();
  });

  document.getElementById('mt-next-btn').addEventListener('click', function() {
    cleanup();
    nextRound();
  });

  document.getElementById('mt-restart-btn').addEventListener('click', function() {
    cleanup();
    document.getElementById('leaderboard-container').innerHTML = '';
    startGame();
  });

})();
