/**
 * AVENORA ARCADE — 7 Original Mini-Games
 * All games run in-browser. Scores stored in localStorage.
 * No external dependencies required.
 */

registerPage('arcade', {
  async render(container) {
    const games = [
      { id: 'racing', name: 'SHADOW RACER', icon: '🏎️', desc: 'Dodge traffic at high speed', color: 'var(--neon-red)' },
      { id: 'memory', name: 'ECLIPSE MEMORY', icon: '🃏', desc: 'Match the hidden cards', color: 'var(--neon-blue)' },
      { id: 'match3', name: 'NEXUS GEMS', icon: '💎', desc: 'Match three to score', color: 'var(--neon-purple)' },
      { id: 'reaction', name: 'LIGHTNING REFLEX', icon: '⚡', desc: 'Beat the reaction clock', color: 'var(--neon-green)' },
      { id: 'maze', name: 'SHADOW MAZE', icon: '🌀', desc: 'Escape the dark maze', color: 'var(--neon-blue)' },
      { id: 'target', name: 'AVENORA SNIPER', icon: '🎯', desc: 'Hit targets before time runs out', color: 'var(--neon-orange)' },
      { id: 'snake', name: 'SHADOW SERPENT', icon: '🐍', desc: 'Classic snake with a Legend twist', color: 'var(--neon-green)' },
    ];

    container.innerHTML = `
      <div style="padding:var(--space-lg)">
        <div class="page-header" style="padding-top:var(--space-xl);padding-bottom:var(--space-lg)">
          <h1 style="font-family:var(--font-display);letter-spacing:0.1em">
            <span style="color:var(--neon-orange)">AVENORA</span> ARCADE
          </h1>
          <p class="tagline">7 ORIGINAL GAMES</p>
        </div>

        <div class="container-lg">
          <!-- High scores link -->
          <div style="text-align:right;margin-bottom:var(--space-md)">
            <button class="btn btn-outline btn-sm" onclick="showHighScores()">🏆 HIGH SCORES</button>
          </div>

          <!-- Game grid -->
          <div id="arcade-game-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-lg)">
            ${games.map(g => `
              <div class="card card-glow-blue" style="cursor:pointer;border-color:rgba(255,255,255,0.07)"
                   onclick="launchGame('${g.id}')"
                   role="button" tabindex="0"
                   onkeydown="if(event.key==='Enter')launchGame('${g.id}')"
                   aria-label="Play ${g.name}">
                <div style="font-size:3rem;margin-bottom:var(--space-md);line-height:1">${g.icon}</div>
                <h3 style="font-family:var(--font-display);letter-spacing:0.08em;color:${g.color};margin-bottom:4px">${g.name}</h3>
                <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:var(--space-md)">${g.desc}</p>
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <span style="font-size:0.75rem;color:var(--text-muted)">Best: <strong id="best-${g.id}">—</strong></span>
                  <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();launchGame('${g.id}')">PLAY</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Game canvas area (hidden until game launches) -->
        <div id="arcade-game-container" class="hidden" style="position:fixed;inset:0;background:var(--bg-primary);z-index:var(--z-modal);display:flex;flex-direction:column"></div>
      </div>
    `;

    loadHighScoreDisplays(games.map(g => g.id));
    return () => { stopCurrentGame(); };
  }
});

// ─── High Score system ────────────────────────────────────
const HighScores = {
  KEY: 'lu_arcade_highscores',
  
  get(gameId) {
    const all = LS.get(this.KEY, {});
    return (all[gameId] || []).sort((a, b) => b.score - a.score).slice(0, 10);
  },

  add(gameId, name, score) {
    const all = LS.get(this.KEY, {});
    if (!all[gameId]) all[gameId] = [];
    all[gameId].push({ name: name.slice(0, 20), score, date: new Date().toLocaleDateString() });
    all[gameId].sort((a, b) => b.score - a.score);
    all[gameId] = all[gameId].slice(0, 10);
    LS.set(this.KEY, all);
    return all[gameId][0]; // Top score
  },

  getBest(gameId) {
    const scores = this.get(gameId);
    return scores.length ? scores[0].score : null;
  },
};

function loadHighScoreDisplays(gameIds) {
  gameIds.forEach(id => {
    const best = HighScores.getBest(id);
    const el = document.getElementById(`best-${id}`);
    if (el) el.textContent = best !== null ? formatCount(best) : '—';
  });
}

window.showHighScores = function () {
  const games = ['racing', 'memory', 'match3', 'reaction', 'maze', 'target', 'snake'];
  const names = { racing:'SHADOW RACER', memory:'ECLIPSE MEMORY', match3:'NEXUS GEMS', reaction:'LIGHTNING REFLEX', maze:'SHADOW MAZE', target:'AVENORA SNIPER', snake:'SHADOW SERPENT' };

  const body = games.map(id => {
    const scores = HighScores.get(id);
    return `
      <div style="margin-bottom:var(--space-lg)">
        <h4 style="font-family:var(--font-display);color:var(--neon-blue);margin-bottom:var(--space-sm)">${names[id] || id}</h4>
        ${scores.length ? `
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
            ${scores.slice(0,5).map((s,i) => `
              <tr style="border-bottom:1px solid var(--border-subtle)">
                <td style="padding:4px 8px;color:var(--text-muted)">#${i+1}</td>
                <td style="padding:4px 8px;font-weight:600">${escapeHtml(s.name)}</td>
                <td style="padding:4px 8px;color:var(--neon-green);font-weight:700">${formatCount(s.score)}</td>
                <td style="padding:4px 8px;color:var(--text-muted)">${s.date}</td>
              </tr>
            `).join('')}
          </table>
        ` : `<p style="color:var(--text-muted);font-size:0.85rem">No scores yet. Play to set a record!</p>`}
      </div>
    `;
  }).join('');

  Modal.create({ id: 'highscores-modal', title: '🏆 HIGH SCORES', body });
  Modal.open('highscores-modal');
};

// ─── Game launcher ────────────────────────────────────────
let activeGame = null;

window.launchGame = function (gameId) {
  stopCurrentGame();
  const container = document.getElementById('arcade-game-container');
  container.classList.remove('hidden');
  container.style.display = 'flex';

  const games = {
    racing: initRacingGame,
    memory: initMemoryGame,
    match3: initMatch3Game,
    reaction: initReactionGame,
    maze: initMazeGame,
    target: initTargetGame,
    snake: initSnakeGame,
  };

  const initFn = games[gameId];
  if (!initFn) {
    container.innerHTML = `<div class="error-state"><h3>Game not found</h3><button class="btn btn-primary" onclick="closeGame()">Back</button></div>`;
    return;
  }

  activeGame = { id: gameId, cleanup: null };
  const cleanup = initFn(container, (score) => handleGameOver(gameId, score));
  if (cleanup) activeGame.cleanup = cleanup;
};

function stopCurrentGame() {
  if (activeGame?.cleanup) {
    try { activeGame.cleanup(); } catch {}
  }
  activeGame = null;
  const container = document.getElementById('arcade-game-container');
  if (container) { container.classList.add('hidden'); container.innerHTML = ''; }
}
window.closeGame = stopCurrentGame;

function handleGameOver(gameId, score) {
  const gameNames = { racing:'SHADOW RACER', memory:'ECLIPSE MEMORY', match3:'NEXUS GEMS', reaction:'LIGHTNING REFLEX', maze:'SHADOW MAZE', target:'AVENORA SNIPER', snake:'SHADOW SERPENT' };
  const user = LegendAPI.auth.getUser();
  const playerName = user?.username || 'PLAYER';
  
  HighScores.add(gameId, playerName, score);
  loadHighScoreDisplays(['racing', 'memory', 'match3', 'reaction', 'maze', 'target', 'snake']);

  const container = document.getElementById('arcade-game-container');
  const best = HighScores.getBest(gameId);

  container.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-lg);text-align:center;padding:var(--space-xl)">
      <h2 style="font-family:var(--font-display);font-size:2rem;letter-spacing:0.1em;color:var(--neon-red)">GAME OVER</h2>
      <div class="score-display">${formatCount(score)}</div>
      <p style="color:var(--text-muted)">Best: ${formatCount(best)}</p>
      <h3 style="color:var(--neon-blue)">${gameNames[gameId] || gameId}</h3>
      <div style="display:flex;gap:var(--space-md);flex-wrap:wrap;justify-content:center">
        <button class="btn btn-primary btn-lg" onclick="launchGame('${gameId}')">PLAY AGAIN</button>
        <button class="btn btn-outline" onclick="closeGame()">BACK TO ARCADE</button>
        <button class="btn btn-ghost" onclick="showHighScores()">🏆 SCORES</button>
      </div>
    </div>
  `;
}

function gameHeader(title, score, onClose) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,0.6);border-bottom:1px solid var(--border-subtle)">
      <h4 style="font-family:var(--font-display);letter-spacing:0.1em;color:var(--neon-blue)">${title}</h4>
      <div style="display:flex;align-items:center;gap:var(--space-md)">
        <span style="font-family:var(--font-display);color:var(--neon-green);font-size:1.2rem">SCORE: <span id="game-score">0</span></span>
        <button class="btn btn-ghost btn-sm" onclick="closeGame()">✕ EXIT</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// GAME 1: SHADOW RACER — infinite scroller racing game
// ═══════════════════════════════════════════════════════════
function initRacingGame(container, onGameOver) {
  container.innerHTML = `
    ${gameHeader('SHADOW RACER', 0)}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:var(--space-md)">
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:8px">Use ← → arrow keys or A/D or tap to steer</p>
      <canvas id="racing-canvas" style="border:1px solid var(--border-blue);border-radius:8px;touch-action:none"></canvas>
    </div>
  `;

  const canvas = document.getElementById('racing-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width = Math.min(400, window.innerWidth - 40);
  const H = canvas.height = Math.min(600, window.innerHeight - 200);

  const ROAD_W = W * 0.6;
  const road = { x: (W - ROAD_W) / 2, w: ROAD_W };

  const car = { x: W / 2, y: H * 0.8, w: 36, h: 56, speed: 0, color: '#b8954b' };
  const obstacles = [];
  let score = 0, speed = 3, raf, running = true;
  const keys = {};

  // Touch
  let touchStart = null;
  canvas.addEventListener('touchstart', e => { touchStart = e.touches[0].clientX; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - touchStart;
    car.x += dx * 0.5;
    touchStart = e.touches[0].clientX;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', e => { keys[e.key] = true; });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  function spawnObstacle() {
    const x = road.x + Math.random() * (road.w - 40) + 10;
    obstacles.push({ x, y: -60, w: 38, h: 60, color: Math.random() > 0.5 ? '#ff3344' : '#ff6600', speed: speed * (0.8 + Math.random() * 0.4) });
  }

  let frameCount = 0;
  function loop() {
    if (!running) return;
    frameCount++;
    ctx.clearRect(0, 0, W, H);

    // Road
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#222';
    ctx.fillRect(road.x, 0, road.w, H);

    // Lane markers
    ctx.strokeStyle = '#ffffff22';
    ctx.setLineDash([30, 20]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Steer
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) car.x -= 4;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) car.x += 4;
    car.x = Math.max(road.x + 4, Math.min(road.x + road.w - car.w - 4, car.x));

    // Player car
    ctx.fillStyle = car.color;
    ctx.shadowColor = car.color;
    ctx.shadowBlur = 12;
    ctx.fillRect(car.x - car.w / 2, car.y - car.h / 2, car.w, car.h);
    ctx.shadowBlur = 0;

    // Obstacles
    if (frameCount % Math.max(20, 60 - speed * 3) === 0) spawnObstacle();
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y += o.speed;
      ctx.fillStyle = o.color;
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.shadowBlur = 0;

      // Collision
      if (Math.abs(car.x - o.x - o.w / 2) < (car.w + o.w) / 2 - 4 &&
          Math.abs((car.y - car.h / 2) - (o.y + o.h / 2)) < (car.h + o.h) / 2 - 4) {
        running = false;
        onGameOver(score);
        return;
      }
      if (o.y > H + 80) { obstacles.splice(i, 1); score += 10; }
    }

    // Score
    score++;
    speed = 3 + Math.floor(score / 200) * 0.5;
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) scoreEl.textContent = formatCount(score);

    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return () => { running = false; cancelAnimationFrame(raf); };
}

// ═══════════════════════════════════════════════════════════
// GAME 2: ECLIPSE MEMORY — Card matching game
// ═══════════════════════════════════════════════════════════
function initMemoryGame(container, onGameOver) {
  const emojis = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
  const cards = [...emojis, ...emojis].map((e, i) => ({ id: i, emoji: e, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5);

  let first = null, second = null, locked = false, moves = 0, matches = 0, timer = 60;
  let timerInterval;

  container.innerHTML = `
    ${gameHeader('ECLIPSE MEMORY', 0)}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:var(--space-lg);gap:var(--space-md)">
      <div style="display:flex;gap:var(--space-xl)">
        <span style="color:var(--text-muted)">Moves: <strong id="mem-moves">0</strong></span>
        <span style="color:var(--neon-red)">Time: <strong id="mem-timer">60</strong>s</span>
      </div>
      <div id="memory-grid" style="display:grid;grid-template-columns:repeat(4,80px);gap:8px"></div>
    </div>
  `;

  timerInterval = setInterval(() => {
    timer--;
    const el = document.getElementById('mem-timer');
    if (el) el.textContent = timer;
    if (timer <= 0) {
      clearInterval(timerInterval);
      const scoreEl = document.getElementById('game-score');
      if (scoreEl) scoreEl.textContent = formatCount(matches * 100 - moves * 5);
      onGameOver(Math.max(0, matches * 100 - moves * 5));
    }
  }, 1000);

  function renderGrid() {
    const grid = document.getElementById('memory-grid');
    if (!grid) return;
    grid.innerHTML = cards.map((c, i) => `
      <div onclick="memFlip(${i})" style="
        width:80px;height:80px;border-radius:8px;cursor:pointer;
        display:flex;align-items:center;justify-content:center;font-size:2rem;
        background:${c.matched ? 'rgba(0,255,136,0.2)' : c.flipped ? 'var(--bg-elevated)' : 'var(--bg-secondary)'};
        border:1px solid ${c.matched ? 'var(--neon-green)' : c.flipped ? 'var(--border-blue)' : 'var(--border-subtle)'};
        transition:all 200ms;
        box-shadow:${c.matched ? 'var(--glow-green)' : 'none'}
      ">${c.flipped || c.matched ? c.emoji : '🌑'}</div>
    `).join('');
  }

  window.memFlip = function (idx) {
    if (locked || cards[idx].flipped || cards[idx].matched) return;
    cards[idx].flipped = true;

    if (!first) {
      first = idx;
    } else {
      second = idx;
      moves++;
      const movesEl = document.getElementById('mem-moves');
      if (movesEl) movesEl.textContent = moves;

      if (cards[first].emoji === cards[second].emoji) {
        cards[first].matched = cards[second].matched = true;
        matches++;
        first = second = null;
        const scoreEl = document.getElementById('game-score');
        if (scoreEl) scoreEl.textContent = formatCount(matches * 100);

        if (matches === emojis.length) {
          clearInterval(timerInterval);
          setTimeout(() => onGameOver(matches * 100 + timer * 10), 500);
        }
      } else {
        locked = true;
        setTimeout(() => {
          cards[first].flipped = cards[second].flipped = false;
          first = second = null;
          locked = false;
          renderGrid();
        }, 800);
      }
    }
    renderGrid();
  };

  renderGrid();
  return () => clearInterval(timerInterval);
}

// ═══════════════════════════════════════════════════════════
// GAME 3: NEXUS GEMS — Match-three
// ═══════════════════════════════════════════════════════════
function initMatch3Game(container, onGameOver) {
  const COLS = 7, ROWS = 7;
  const GEMS = ['💎', '⭐', '🔮', '💫', '🌀', '🔷'];
  let board = [], score = 0, moves = 30;

  function makeBoard() {
    board = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => GEMS[Math.floor(Math.random() * GEMS.length)])
    );
  }

  container.innerHTML = `
    ${gameHeader('NEXUS GEMS', 0)}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:var(--space-lg);gap:var(--space-md)">
      <div style="display:flex;gap:var(--space-xl)">
        <span style="color:var(--text-muted)">Moves: <strong id="m3-moves">30</strong></span>
      </div>
      <div id="m3-grid" style="display:inline-grid;grid-template-columns:repeat(${COLS},44px);gap:3px"></div>
    </div>
  `;

  let selected = null;

  function renderM3() {
    const grid = document.getElementById('m3-grid');
    if (!grid) return;
    grid.innerHTML = board.flat().map((gem, i) => {
      const row = Math.floor(i / COLS), col = i % COLS;
      const isSel = selected && selected[0] === row && selected[1] === col;
      return `<div onclick="m3Click(${row},${col})" style="
        width:44px;height:44px;border-radius:6px;cursor:pointer;
        display:flex;align-items:center;justify-content:center;font-size:1.4rem;
        background:${isSel ? 'rgba(0,170,255,0.3)' : 'var(--bg-secondary)'};
        border:${isSel ? '2px solid var(--neon-blue)' : '1px solid var(--border-subtle)'};
        transition:all 150ms
      ">${gem}</div>`;
    }).join('');
  }

  function checkMatches() {
    let found = false;
    const toRemove = new Set();

    // Check horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 2; c++) {
        if (board[r][c] && board[r][c] === board[r][c+1] && board[r][c] === board[r][c+2]) {
          toRemove.add(`${r},${c}`); toRemove.add(`${r},${c+1}`); toRemove.add(`${r},${c+2}`);
          found = true;
        }
      }
    }
    // Check vertical
    for (let r = 0; r < ROWS - 2; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] && board[r][c] === board[r+1][c] && board[r][c] === board[r+2][c]) {
          toRemove.add(`${r},${c}`); toRemove.add(`${r+1},${c}`); toRemove.add(`${r+2},${c}`);
          found = true;
        }
      }
    }

    if (found) {
      toRemove.forEach(pos => {
        const [r, c] = pos.split(',').map(Number);
        board[r][c] = null;
        score += 50;
      });
      // Drop gems
      for (let c = 0; c < COLS; c++) {
        let empty = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (board[r][c]) { board[empty][c] = board[r][c]; if (empty !== r) board[r][c] = null; empty--; }
        }
        for (let r = empty; r >= 0; r--) board[r][c] = GEMS[Math.floor(Math.random() * GEMS.length)];
      }
      const scoreEl = document.getElementById('game-score');
      if (scoreEl) scoreEl.textContent = formatCount(score);
      setTimeout(() => { checkMatches(); renderM3(); }, 200);
    }
    return found;
  }

  function swap(r1, c1, r2, c2) {
    [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]];
    if (!checkMatches()) {
      setTimeout(() => { [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]]; renderM3(); }, 300);
    } else {
      moves--;
      const movesEl = document.getElementById('m3-moves');
      if (movesEl) movesEl.textContent = moves;
      if (moves <= 0) setTimeout(() => onGameOver(score), 500);
    }
  }

  window.m3Click = function (row, col) {
    if (!selected) {
      selected = [row, col];
    } else {
      const [sr, sc] = selected;
      const dr = Math.abs(row - sr), dc = Math.abs(col - sc);
      if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
        swap(sr, sc, row, col);
      }
      selected = null;
    }
    renderM3();
  };

  makeBoard();
  checkMatches();
  renderM3();
  return () => {};
}

// ═══════════════════════════════════════════════════════════
// GAME 4: LIGHTNING REFLEX — Click the target FAST
// ═══════════════════════════════════════════════════════════
function initReactionGame(container, onGameOver) {
  let score = 0, round = 0, waiting = false, timeout = null;

  container.innerHTML = `
    ${gameHeader('LIGHTNING REFLEX', 0)}
    <div id="reaction-area" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-xl);padding:var(--space-xl)">
      <p style="color:var(--text-secondary);font-size:1.1rem;text-align:center" id="reaction-msg">Get ready... wait for the green flash!</p>
      <div id="reaction-btn" style="
        width:200px;height:200px;border-radius:50%;background:var(--bg-elevated);
        border:3px solid var(--border-subtle);display:flex;align-items:center;justify-content:center;
        font-size:3rem;cursor:pointer;transition:all 200ms;user-select:none
      " onclick="reactionClick()" role="button" tabindex="0" onkeydown="if(event.key===' ')reactionClick()">⚡</div>
      <p style="color:var(--text-muted);font-size:0.85rem">Round: <strong id="reaction-round">0 / 5</strong></p>
    </div>
  `;

  function nextRound() {
    if (round >= 5) { onGameOver(score); return; }
    const btn = document.getElementById('reaction-btn');
    const msg = document.getElementById('reaction-msg');
    if (!btn || !msg) return;

    btn.style.background = 'var(--bg-elevated)';
    btn.style.borderColor = 'var(--border-subtle)';
    msg.textContent = 'Wait for it...';
    waiting = false;

    const delay = 1500 + Math.random() * 3000;
    timeout = setTimeout(() => {
      waiting = true;
      btn.style.background = 'rgba(0,255,136,0.3)';
      btn.style.borderColor = 'var(--neon-green)';
      btn.style.boxShadow = 'var(--glow-green)';
      msg.textContent = 'CLICK NOW!';
      window._reactionStart = Date.now();
      // Miss timeout
      timeout = setTimeout(() => {
        if (waiting) {
          waiting = false;
          msg.textContent = 'Too slow! -50 points';
          score = Math.max(0, score - 50);
          const scoreEl = document.getElementById('game-score');
          if (scoreEl) scoreEl.textContent = formatCount(score);
          round++;
          document.getElementById('reaction-round').textContent = `${round} / 5`;
          setTimeout(nextRound, 1000);
        }
      }, 2000);
    }, delay);
  }

  window.reactionClick = function () {
    if (!waiting) {
      // Clicked too early
      const msg = document.getElementById('reaction-msg');
      if (msg) msg.textContent = 'Too early! -50 points';
      score = Math.max(0, score - 50);
      clearTimeout(timeout);
      round++;
      document.getElementById('reaction-round').textContent = `${round} / 5`;
      setTimeout(nextRound, 800);
      return;
    }
    clearTimeout(timeout);
    const rt = Date.now() - window._reactionStart;
    waiting = false;
    const pts = Math.max(0, Math.round(1000 - rt));
    score += pts;
    round++;
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) scoreEl.textContent = formatCount(score);
    const msg = document.getElementById('reaction-msg');
    if (msg) msg.textContent = `${rt}ms! +${pts} pts`;
    document.getElementById('reaction-round').textContent = `${round} / 5`;
    const btn = document.getElementById('reaction-btn');
    if (btn) { btn.style.background = 'rgba(0,170,255,0.2)'; btn.style.borderColor = 'var(--neon-blue)'; }
    setTimeout(nextRound, 800);
  };

  nextRound();
  return () => clearTimeout(timeout);
}

// ═══════════════════════════════════════════════════════════
// GAME 5: SHADOW MAZE — Navigate through a maze
// ═══════════════════════════════════════════════════════════
function initMazeGame(container, onGameOver) {
  const COLS = 15, ROWS = 15, CELL = 30;

  // Simple maze generation using recursive backtracking
  const maze = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ top: true, right: true, bottom: true, left: true, visited: false })));

  function generateMaze(r, c) {
    maze[r][c].visited = true;
    const dirs = [[-1,0,'top','bottom'],[0,1,'right','left'],[1,0,'bottom','top'],[0,-1,'left','right']].sort(() => Math.random() - 0.5);
    dirs.forEach(([dr, dc, wall, opposite]) => {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !maze[nr][nc].visited) {
        maze[r][c][wall] = false;
        maze[nr][nc][opposite] = false;
        generateMaze(nr, nc);
      }
    });
  }
  generateMaze(0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL + 2;
  canvas.height = ROWS * CELL + 2;
  canvas.style.cssText = 'border-radius:8px;border:1px solid var(--border-blue)';
  const ctx = canvas.getContext('2d');

  let player = { r: 0, c: 0 }, score = 0, startTime = Date.now();

  container.innerHTML = `
    ${gameHeader('SHADOW MAZE', 0)}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-md);padding:var(--space-lg)">
      <p style="color:var(--text-muted);font-size:0.85rem">Arrow keys or WASD to move. Reach the green exit!</p>
    </div>
  `;
  container.querySelector('div:last-child').appendChild(canvas);

  function drawMaze() {
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL + 1, y = r * CELL + 1;
        const cell = maze[r][c];
        ctx.strokeStyle = '#00aaff44';
        ctx.lineWidth = 1.5;
        if (cell.top) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + CELL, y); ctx.stroke(); }
        if (cell.right) { ctx.beginPath(); ctx.moveTo(x + CELL, y); ctx.lineTo(x + CELL, y + CELL); ctx.stroke(); }
        if (cell.bottom) { ctx.beginPath(); ctx.moveTo(x, y + CELL); ctx.lineTo(x + CELL, y + CELL); ctx.stroke(); }
        if (cell.left) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + CELL); ctx.stroke(); }
      }
    }

    // Exit
    ctx.fillStyle = 'rgba(0,255,136,0.4)';
    ctx.fillRect((COLS-1)*CELL+2, (ROWS-1)*CELL+2, CELL-2, CELL-2);
    ctx.fillStyle = '#00ff88';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚪', (COLS-0.5)*CELL, (ROWS-0.3)*CELL);

    // Player
    ctx.fillStyle = '#00aaff';
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(player.c * CELL + CELL / 2 + 1, player.r * CELL + CELL / 2 + 1, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function move(dr, dc) {
    const r = player.r, c = player.c;
    const dirMap = [[-1,0,'top'],[0,1,'right'],[1,0,'bottom'],[0,-1,'left']];
    const [, , wall] = dirMap.find(([ddr, ddc]) => ddr === dr && ddc === dc) || [];
    if (!wall || maze[r][c][wall]) return;

    player.r += dr;
    player.c += dc;
    score += 5;
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) scoreEl.textContent = formatCount(score);

    if (player.r === ROWS - 1 && player.c === COLS - 1) {
      const elapsed = (Date.now() - startTime) / 1000;
      const bonus = Math.max(0, Math.round(5000 - elapsed * 10));
      onGameOver(score + bonus);
      return;
    }
    drawMaze();
  }

  const keyHandler = (e) => {
    const map = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1], w: [-1,0], s: [1,0], a: [0,-1], d: [0,1] };
    const dir = map[e.key];
    if (dir) { e.preventDefault(); move(...dir); }
  };
  document.addEventListener('keydown', keyHandler);

  drawMaze();
  return () => document.removeEventListener('keydown', keyHandler);
}

// ═══════════════════════════════════════════════════════════
// GAME 6: AVENORA SNIPER — Click moving targets
// ═══════════════════════════════════════════════════════════
function initTargetGame(container, onGameOver) {
  let score = 0, timeLeft = 30, targets = [], raf, timerInterval;

  container.innerHTML = `
    ${gameHeader('AVENORA SNIPER', 0)}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-md);gap:var(--space-md)">
      <div style="display:flex;gap:32px">
        <span style="color:var(--neon-red)">Time: <strong id="target-timer">30</strong>s</span>
        <span style="color:var(--text-muted)">Misses: <strong id="target-misses">0</strong></span>
      </div>
      <canvas id="target-canvas" style="border-radius:8px;border:1px solid var(--border-blue);cursor:crosshair"></canvas>
    </div>
  `;

  const canvas = document.getElementById('target-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = Math.min(500, window.innerWidth - 40);
  canvas.height = Math.min(400, window.innerHeight - 240);

  let misses = 0;

  function spawnTarget() {
    const r = 15 + Math.random() * 20;
    targets.push({
      x: r + Math.random() * (canvas.width - r * 2),
      y: r + Math.random() * (canvas.height - r * 2),
      r,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      life: 2000 + Math.random() * 2000,
      born: Date.now(),
      color: ['#ff3344', '#00aaff', '#00ff88', '#ff6600'][Math.floor(Math.random() * 4)],
    });
  }

  timerInterval = setInterval(() => {
    timeLeft--;
    const el = document.getElementById('target-timer');
    if (el) el.textContent = timeLeft;
    if (timeLeft <= 0) { clearInterval(timerInterval); onGameOver(score); }
    spawnTarget();
  }, 1000);
  spawnTarget(); spawnTarget();

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      t.x += t.vx; t.y += t.vy;
      if (t.x < t.r || t.x > canvas.width - t.r) t.vx *= -1;
      if (t.y < t.r || t.y > canvas.height - t.r) t.vy *= -1;

      if (now - t.born > t.life) { targets.splice(i, 1); continue; }

      const alpha = 1 - (now - t.born) / t.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    const scoreEl = document.getElementById('game-score');
    if (scoreEl) scoreEl.textContent = formatCount(score);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let hit = false;
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      if (Math.hypot(mx - t.x, my - t.y) < t.r) {
        const pts = Math.round(100 + (t.r < 20 ? 100 : 0) + timeLeft * 2);
        score += pts;
        targets.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (!hit) {
      misses++;
      const el = document.getElementById('target-misses');
      if (el) el.textContent = misses;
      score = Math.max(0, score - 20);
    }
  });

  return () => { cancelAnimationFrame(raf); clearInterval(timerInterval); };
}

// ═══════════════════════════════════════════════════════════
// GAME 7: SHADOW SERPENT — Snake game
// ═══════════════════════════════════════════════════════════
function initSnakeGame(container, onGameOver) {
  const CELL = 20, COLS = 20, ROWS = 16;
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  canvas.style.cssText = 'border-radius:8px;border:1px solid var(--border-green)';
  const ctx = canvas.getContext('2d');

  let snake = [{ x: 10, y: 8 }, { x: 9, y: 8 }, { x: 8, y: 8 }];
  let dir = { x: 1, y: 0 }, nextDir = { x: 1, y: 0 };
  let food = randomFood(), score = 0, speed = 150, interval;

  function randomFood() {
    let pos;
    do { pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
    while (snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
  }

  container.innerHTML = `
    ${gameHeader('SHADOW SERPENT', 0)}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-md);padding:var(--space-lg)">
      <p style="color:var(--text-muted);font-size:0.85rem">Arrow keys / WASD to steer</p>
    </div>
  `;
  container.querySelector('div:last-child').appendChild(canvas);

  function draw() {
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid dots
    ctx.fillStyle = '#ffffff05';
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) ctx.fillRect(x * CELL + CELL/2, y * CELL + CELL/2, 1, 1);

    // Food
    ctx.fillStyle = '#ff3344';
    ctx.shadowColor = '#ff3344';
    ctx.shadowBlur = 10;
    ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.shadowBlur = 0;

    // Snake
    snake.forEach((seg, i) => {
      const ratio = 1 - i / snake.length;
      ctx.fillStyle = `hsl(${140 + ratio * 60}, 100%, ${30 + ratio * 25}%)`;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = i === 0 ? 12 : 0;
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.shadowBlur = 0;
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { clearInterval(interval); onGameOver(score); return; }
    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) { clearInterval(interval); onGameOver(score); return; }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 100 + Math.floor(speed / 20);
      food = randomFood();
      speed = Math.max(60, speed - 3);
      clearInterval(interval);
      interval = setInterval(step, speed);
    } else {
      snake.pop();
    }
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) scoreEl.textContent = formatCount(score);
    draw();
  }

  const keyHandler = (e) => {
    const map = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0}, w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0} };
    const d = map[e.key];
    if (d && !(d.x === -dir.x && d.y === -dir.y)) { nextDir = d; e.preventDefault(); }
  };
  document.addEventListener('keydown', keyHandler);

  interval = setInterval(step, speed);
  draw();
  return () => { clearInterval(interval); document.removeEventListener('keydown', keyHandler); };
}
