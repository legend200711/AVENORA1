/**
 * AVENORA COMPANION — Easter Egg
 * Initialised once from index.html after auth resolves.
 * Single persistent widget; never duplicated across page navigations.
 *
 * Responsibilities:
 *  • Bootstrap from localStorage (guest) or API (authenticated)
 *  • Render the persistent floating widget
 *  • Handle discovery → setup → activation flow
 *  • Care interactions, daily tasks, mini-game
 *  • Respect prefers-reduced-motion
 *  • Never interfere with nav, modals, video, audio, chat, or forms
 */

(function (global) {
  'use strict';

  // Guard — only init once per page lifetime
  if (global._AVN_COMPANION_INIT) return;
  global._AVN_COMPANION_INIT = true;

  // ─── Constants ────────────────────────────────────────────
  const LS_KEY        = 'avn_companion';
  const REDUCED       = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const APPEARANCES = {
    scarab:  { label: 'Scarab',  emoji: '🪲', symbol: '𓆣' },
    anubis:  { label: 'Anubis',  emoji: '🐺', symbol: '𓁢' },
    ibis:    { label: 'Ibis',    emoji: '🦅', symbol: '𓅝' },
    cat:     { label: 'Cat',     emoji: '🐱', symbol: '𓃠' },
    falcon:  { label: 'Falcon',  emoji: '🦅', symbol: '𓅐' },
  };

  const PERSONALITIES = {
    calm:     'Calm',
    curious:  'Curious',
    cheerful: 'Cheerful',
    wise:     'Wise',
    playful:  'Playful',
  };

  const TALK_PROMPTS = [
    { label: 'How are you?',   key: 'how_are_you'   },
    { label: 'Tell me something positive.', key: 'positive' },
    { label: 'I need encouragement.', key: 'encourage'  },
    { label: 'Any advice today?', key: 'advice'     },
    { label: 'Just saying hi!',   key: 'greet'       },
  ];

  const TALK_RESPONSES = {
    how_are_you: {
      calm:     'I am at peace. The ancient sands flow well today.',
      curious:  'Wonderful — there is so much to discover today!',
      cheerful: 'Amazing! Every moment with you is a gift!',
      wise:     'In balance, as always. The scales are even.',
      playful:  'Super duper fantastic! And you? Tell me everything!',
    },
    positive: {
      calm:     'Even in stillness, each breath is a new beginning.',
      curious:  'Every question you ask today opens a new door.',
      cheerful: 'You are doing so well — keep going, you\'ve got this!',
      wise:     'The lotus blooms most beautifully from the deepest mud.',
      playful:  'You sparkle! The stars are literally jealous of you!',
    },
    encourage: {
      calm:     'You are capable of more than you realise. Trust the process.',
      curious:  'Challenges are just unexplored territory. You will find the way.',
      cheerful: 'You are incredible! I believe in you completely!',
      wise:     'Every great journey was begun by a single step taken with courage.',
      playful:  'You\'re a legend! Literally — you\'re on Avenora and everything!',
    },
    advice: {
      calm:     'Rest when you need to. The world can wait a little.',
      curious:  'Try something new today — curiosity is its own reward.',
      cheerful: 'Be kind to yourself today. You deserve the same care you give others.',
      wise:     'Seek not to control outcomes; seek only to act with integrity.',
      playful:  'Eat a snack, drink some water, then conquer the universe!',
    },
    greet: {
      calm:     'A gentle greeting returned. May your day be peaceful.',
      curious:  'Oh! Hello! What adventures await us today?',
      cheerful: 'HI HI HI! You\'re here! I was hoping you\'d visit!',
      wise:     'A greeting freely given is a small act of great kindness.',
      playful:  'BEST FRIEND ALERT! Hi hi hi! I missed you!',
    },
  };

  // ─── Local state ──────────────────────────────────────────
  let _companion = null;      // the current companion data object
  let _widgetEl  = null;      // the floating widget DOM element
  let _catEl     = null;      // the persistent black-cat Easter egg trigger
  let _panel     = 'closed';  // 'closed' | 'main' | 'tasks' | 'game' | 'talk' | 'settings'
  let _saveTimer = null;

  // ─── LS helpers (guest-mode) ──────────────────────────────
  function lsLoad() {
    return LS.get(LS_KEY, null);
  }
  function lsSave(data) {
    LS.set(LS_KEY, data);
  }

  // ─── API save with debounce ───────────────────────────────
  function scheduleSave(partial) {
    if (!LegendAPI.auth.isLoggedIn()) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      try {
        if (partial.care || partial.name !== undefined || partial.appearance || partial.personality) {
          if (partial.name !== undefined || partial.appearance || partial.personality) {
            await LegendAPI.companion.setup({
              name:        _companion.name,
              appearance:  _companion.appearance,
              personality: _companion.personality,
            });
          }
        }
        if (partial.widgetVisible !== undefined || partial.disabled !== undefined) {
          await LegendAPI.companion.widget({
            widgetVisible: _companion.widgetVisible,
            disabled:      _companion.disabled,
          });
        }
      } catch (e) {
        console.warn('[AVN Companion] Save error:', e.message);
      }
    }, 1200);
  }

  // ─── Bootstrap ────────────────────────────────────────────
  async function init() {
    // Wait until auth is resolved
    if (LegendState.get('authLoading')) {
      await new Promise(resolve => {
        const unsub = LegendState.subscribe('authLoading', loading => {
          if (!loading) { unsub(); resolve(); }
        });
      });
    }

    await loadCompanionData();
    mountCatTrigger();  // Always mount first — visible on every page
    mountWidget();

    // Re-sync on auth state change (login / logout)
    LegendState.subscribe('user', async () => {
      await loadCompanionData();
      refreshCatTrigger();
      refreshWidget();
    });
  }

  async function loadCompanionData() {
    const user = LegendState.get('user');
    if (user) {
      try {
        const res = await LegendAPI.companion.me();
        // res.companion is null for new users who have never interacted with the companion.
        // Fall through to LS / default rather than setting _companion = null.
        if (res.companion) {
          _companion = res.companion;
          // Ensure all required sub-objects exist (backwards-compat with older saved data)
          if (!_companion.care)       _companion.care       = _defaultCompanion().care;
          if (!_companion.dailyTasks) _companion.dailyTasks = _defaultTasks();
          if (!_companion.miniGame)   _companion.miniGame   = { highScore: 0, gamesPlayed: 0 };
          lsSave(_companion); // mirror to LS for quick restore
          return;
        }
      } catch (e) {
        console.warn('[AVN Companion] Could not load from server:', e.message);
      }
    }
    // Guest / offline / new user: load from LS or create defaults
    _companion = lsLoad() || _defaultCompanion();
  }

  function _defaultCompanion() {
    return {
      discovered: false,
      name: '',
      appearance: 'scarab',
      personality: 'calm',
      care: { hunger: 80, water: 80, happiness: 80, energy: 80 },
      dailyTasks: _defaultTasks(),
      miniGame: { highScore: 0, gamesPlayed: 0 },
      unlockedAppearances: ['scarab'],
      widgetVisible: true,
      disabled: false,
    };
  }

  function _defaultTasks() {
    return [
      { key: 'water',   label: 'Drink a glass of water',                  enabled: true, completedToday: false },
      { key: 'break',   label: 'Take a short break',                      enabled: true, completedToday: false },
      { key: 'stretch', label: 'Stretch for a few minutes',               enabled: true, completedToday: false },
      { key: 'song',    label: 'Listen to a favorite song',               enabled: true, completedToday: false },
      { key: 'thought', label: 'Write one positive thought',              enabled: true, completedToday: false },
      { key: 'kind',    label: 'Send a kind message to someone',          enabled: true, completedToday: false },
      { key: 'offline', label: 'Spend a few minutes away from the screen',enabled: true, completedToday: false },
      { key: 'goal',    label: 'Work toward a personal goal',             enabled: true, completedToday: false },
    ];
  }

  // ─── Black-cat Easter egg trigger (persistent, body-level) ──
  // Mounted once on init — stays alive across every page navigation
  // because it is appended to <body>, not the #page-container.
  // Visibility is controlled by:
  //   1. easterEggEnabled token from the active founder theme (default true)
  //   2. Whether the companion has already been discovered (then hidden)
  function mountCatTrigger() {
    if (_catEl) return; // already mounted
    _catEl = document.createElement('button');
    _catEl.id = 'avn-egg-btn';
    _catEl.className = 'avn-egg-trigger';
    _catEl.setAttribute('aria-label', 'Mysterious black cat');
    _catEl.setAttribute('tabindex', '0');
    _catEl.setAttribute('title', '');
    _catEl.innerHTML = `<svg class="avn-egg-cat" viewBox="0 0 32 32" width="22" height="22" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 28c0-5 1-8 3-10L7 8l4 3c1-1 3-2 5-2s4 1 5 2l4-3-2 10c2 2 3 5 3 10H6z" fill="currentColor"/>
      <path d="M7 8 c0-3 2-6 2-6l3 4M25 8 c0-3-2-6-2-6l-3 4" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>
      <ellipse cx="13" cy="16" rx="1.2" ry="1.6" fill="var(--avn-cat-eye,#2d8a5e)"/>
      <ellipse cx="19" cy="16" rx="1.2" ry="1.6" fill="var(--avn-cat-eye,#2d8a5e)"/>
      <path d="M14 20 q2 1.5 4 0" stroke="var(--avn-cat-nose,#76552f)" stroke-width="0.8" fill="none" stroke-linecap="round"/>
      <path class="avn-egg-cat__tail" d="M25 28 q6-4 4-10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;

    document.body.appendChild(_catEl);

    // Click / touch handler
    const handleActivation = () => {
      if (!window.AVNCompanion) return;
      _catEl.classList.remove('avn-egg-trigger--pulse');
      window.AVNCompanion.triggerDiscovery();
    };
    _catEl.addEventListener('click', handleActivation);
    _catEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivation(); }
    });

    refreshCatTrigger();
  }

  function refreshCatTrigger() {
    if (!_catEl) return;

    // Check founder theme for easterEggEnabled (default true when absent)
    const cached = window.AvenoraTheme?.getCached?.();
    const eggEnabled = cached?.tokens?.atmosphere?.easterEggEnabled !== false;

    // Hide if founder has disabled the Easter egg via TCC
    if (!eggEnabled) {
      _catEl.style.display = 'none';
      return;
    }

    // Hide once the companion is discovered and active (user has found it already)
    // — no need to keep showing the trigger
    if (_companion?.discovered && !_companion?.disabled) {
      _catEl.style.display = 'none';
      return;
    }

    _catEl.style.display = 'flex';

    // Pulse animation for undiscovered users regardless of auth state,
    // but honour reduced-motion
    const shouldPulse = !REDUCED && !_companion?.discovered;
    _catEl.classList.toggle('avn-egg-trigger--pulse', shouldPulse);
  }

  // ─── Widget mounting ──────────────────────────────────────
  function mountWidget() {
    if (_widgetEl) return; // already mounted
    _widgetEl = document.createElement('div');
    _widgetEl.id = 'avn-companion-widget';
    _widgetEl.setAttribute('role', 'region');
    _widgetEl.setAttribute('aria-label', 'Avenora Companion');
    document.body.appendChild(_widgetEl);
    refreshWidget();
  }

  function refreshWidget() {
    if (!_widgetEl) return;
    if (!_companion || !_companion.discovered || _companion.disabled) {
      _widgetEl.style.display = 'none';
      return;
    }
    _widgetEl.style.display = '';
    renderWidget();
  }

  // ─── Widget render ────────────────────────────────────────
  function renderWidget() {
    if (!_widgetEl || !_companion) return;
    const app = APPEARANCES[_companion.appearance] || APPEARANCES.scarab;
    const isMinimised = !_companion.widgetVisible;

    _widgetEl.innerHTML = `
      <div class="avn-cmp ${isMinimised ? 'avn-cmp--min' : ''}" role="complementary" aria-label="Avenora Companion: ${escapeHtml(_companion.name || app.label)}">
        <div class="avn-cmp__tab" id="avn-cmp-tab" tabindex="0" role="button"
             aria-expanded="${isMinimised ? 'false' : 'true'}"
             aria-label="Avenora Companion">
          <span class="avn-cmp__tab-icon" aria-hidden="true">${escapeHtml(app.symbol)}</span>
          ${!isMinimised ? `<span class="avn-cmp__tab-name">${escapeHtml(_companion.name || app.label)}</span>` : ''}
        </div>
        ${!isMinimised ? renderWidgetBody(app) : ''}
      </div>
    `;

    // Bind tab toggle
    document.getElementById('avn-cmp-tab')?.addEventListener('click', toggleMinimise);
    document.getElementById('avn-cmp-tab')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMinimise(); }
    });

    if (!isMinimised) {
      bindWidgetEvents();
      if (_panel !== 'closed') openPanel(_panel);
    }
  }

  function renderWidgetBody(app) {
    return `
      <div class="avn-cmp__body">
        <div class="avn-cmp__head">
          <div class="avn-cmp__avatar" aria-hidden="true">${escapeHtml(app.symbol)}</div>
          <div class="avn-cmp__info">
            <span class="avn-cmp__name">${escapeHtml(_companion.name || app.label)}</span>
            <span class="avn-cmp__mood">${moodLabel()}</span>
          </div>
          <div class="avn-cmp__ctrl">
            <button class="avn-cmp__btn-ico" id="avn-cmp-settings" aria-label="Companion settings" title="Settings">⚙</button>
            <button class="avn-cmp__btn-ico" id="avn-cmp-hide" aria-label="Hide companion for now" title="Hide">−</button>
          </div>
        </div>
        <div class="avn-cmp__bars" aria-label="Companion stats">
          ${statBar('Mood',   _companion.care.happiness)}
          ${statBar('Energy', _companion.care.energy)}
        </div>
        <div class="avn-cmp__actions">
          <button class="avn-cmp__action-btn" data-action="feed"     aria-label="Feed companion">🍯 Feed</button>
          <button class="avn-cmp__action-btn" data-action="water"    aria-label="Give water">💧 Water</button>
          <button class="avn-cmp__action-btn" data-action="play"     aria-label="Play mini-game">🎮 Play</button>
          <button class="avn-cmp__action-btn" data-action="talk"     aria-label="Talk to companion">💬 Talk</button>
          <button class="avn-cmp__action-btn" data-action="tasks"    aria-label="Daily tasks">✨ Tasks</button>
        </div>
        <div id="avn-cmp-panel" class="avn-cmp__panel hidden" aria-live="polite"></div>
        <div id="avn-cmp-speech" class="avn-cmp__speech hidden" aria-live="polite" role="status"></div>
      </div>
    `;
  }

  function statBar(label, value) {
    const capped = Math.max(0, Math.min(100, value || 0));
    return `<div class="avn-cmp__stat" aria-label="${escapeHtml(label)}: ${capped} of 100">
      <span class="avn-cmp__stat-label">${escapeHtml(label)}</span>
      <div class="avn-cmp__stat-track" role="progressbar" aria-valuenow="${capped}" aria-valuemin="0" aria-valuemax="100">
        <div class="avn-cmp__stat-fill" style="width:${capped}%"></div>
      </div>
    </div>`;
  }

  function moodLabel() {
    const h = _companion.care.happiness || 0;
    if (h >= 80) return '✨ Radiant';
    if (h >= 60) return '😊 Content';
    if (h >= 40) return '😐 Calm';
    if (h >= 20) return '😔 Quiet';
    return '🌙 Resting';
  }

  function bindWidgetEvents() {
    // Care action buttons
    _widgetEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'play')  { _panel = 'game';     openPanel('game');  return; }
        if (a === 'talk')  { _panel = 'talk';     openPanel('talk');  return; }
        if (a === 'tasks') { _panel = 'tasks';    openPanel('tasks'); return; }
        doCareAction(a);
      });
    });

    document.getElementById('avn-cmp-hide')?.addEventListener('click', hideWidget);
    document.getElementById('avn-cmp-settings')?.addEventListener('click', () => {
      _panel = 'settings'; openPanel('settings');
    });
  }

  // ─── Panel system ─────────────────────────────────────────
  function openPanel(type) {
    const panel = document.getElementById('avn-cmp-panel');
    if (!panel) return;

    panel.classList.remove('hidden');
    switch (type) {
      case 'tasks':    panel.innerHTML = renderTasksPanel(); break;
      case 'game':     panel.innerHTML = renderGamePanel();  initGame(); break;
      case 'talk':     panel.innerHTML = renderTalkPanel();  break;
      case 'settings': panel.innerHTML = renderSettingsPanel(); break;
      default: panel.classList.add('hidden'); return;
    }
    bindPanelClose(panel);
    bindPanelEvents(type, panel);
  }

  function bindPanelClose(panel) {
    panel.querySelector('.avn-cmp__panel-close')?.addEventListener('click', () => {
      panel.classList.add('hidden');
      _panel = 'closed';
    });
  }

  function bindPanelEvents(type, panel) {
    if (type === 'tasks') {
      panel.querySelectorAll('[data-task-complete]').forEach(btn => {
        btn.addEventListener('click', () => completeTask(btn.dataset.taskComplete));
      });
      panel.querySelectorAll('[data-task-skip]').forEach(btn => {
        btn.addEventListener('click', () => skipTask(btn.dataset.taskSkip));
      });
      panel.querySelectorAll('[data-task-toggle]').forEach(btn => {
        btn.addEventListener('click', () => toggleTaskEnabled(btn.dataset.taskToggle));
      });
    }
    if (type === 'talk') {
      panel.querySelectorAll('[data-prompt]').forEach(btn => {
        btn.addEventListener('click', () => talkPrompt(btn.dataset.prompt));
      });
      panel.querySelector('#avn-talk-send')?.addEventListener('click', sendCustomTalk);
      panel.querySelector('#avn-talk-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCustomTalk(); }
      });
    }
    if (type === 'settings') {
      panel.querySelector('#avn-cmp-name-save')?.addEventListener('click', saveSettings);
      panel.querySelector('#avn-cmp-disable')?.addEventListener('click', disableCompanion);
    }
  }

  // ─── Tasks panel ──────────────────────────────────────────
  function renderTasksPanel() {
    const tasks = (_companion.dailyTasks || _defaultTasks()).filter(t => t.enabled !== false);
    const done  = tasks.filter(t => t.completedToday).length;
    return `
      <div class="avn-cmp__panel-inner">
        <div class="avn-cmp__panel-head">
          <span>Daily Activities</span>
          <button class="avn-cmp__panel-close" aria-label="Close panel">✕</button>
        </div>
        <p class="avn-cmp__panel-note">Optional gentle activities — no pressure, no streaks. ✨</p>
        <p class="avn-cmp__panel-prog">${done} / ${tasks.length} done today</p>
        <ul class="avn-cmp__task-list" role="list">
          ${tasks.map(t => `
            <li class="avn-cmp__task-item ${t.completedToday ? 'avn-cmp__task-item--done' : ''}" role="listitem">
              <span class="avn-cmp__task-label">${escapeHtml(t.label)}</span>
              <div class="avn-cmp__task-btns">
                ${!t.completedToday
                  ? `<button class="avn-cmp__task-btn avn-cmp__task-btn--done"
                       data-task-complete="${escapeHtml(t.key)}"
                       aria-label="Mark '${escapeHtml(t.label)}' complete">Done</button>
                     <button class="avn-cmp__task-btn"
                       data-task-skip="${escapeHtml(t.key)}"
                       aria-label="Skip '${escapeHtml(t.label)}'">Skip</button>`
                  : `<span class="avn-cmp__task-check" aria-label="Completed">✓</span>`
                }
              </div>
            </li>
          `).join('')}
        </ul>
        <button class="avn-cmp__task-manage" data-task-manage="true"
          onclick="this.closest('.avn-cmp__panel-inner').querySelector('.avn-cmp__task-manage-area').classList.toggle('hidden')"
          aria-expanded="false">Manage activities ›</button>
        <ul class="avn-cmp__task-manage-area hidden" role="list">
          ${(_companion.dailyTasks || _defaultTasks()).map(t => `
            <li class="avn-cmp__task-manage-item" role="listitem">
              <label class="avn-cmp__task-toggle-label">
                <input type="checkbox" class="avn-cmp__task-toggle-check"
                  data-task-toggle="${escapeHtml(t.key)}"
                  ${t.enabled !== false ? 'checked' : ''}
                  aria-label="Enable '${escapeHtml(t.label)}'">
                ${escapeHtml(t.label)}
              </label>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  // ─── Talk panel ───────────────────────────────────────────
  function renderTalkPanel() {
    return `
      <div class="avn-cmp__panel-inner">
        <div class="avn-cmp__panel-head">
          <span>Talk to ${escapeHtml(_companion.name || 'Companion')}</span>
          <button class="avn-cmp__panel-close" aria-label="Close panel">✕</button>
        </div>
        <p class="avn-cmp__panel-note">Your companion is here to listen. 🌙</p>
        <div class="avn-cmp__talk-bubble" id="avn-talk-bubble" aria-live="polite"></div>
        <div class="avn-cmp__talk-prompts">
          ${TALK_PROMPTS.map(p => `
            <button class="avn-cmp__talk-prompt" data-prompt="${escapeHtml(p.key)}" aria-label="${escapeHtml(p.label)}">${escapeHtml(p.label)}</button>
          `).join('')}
        </div>
        <div class="avn-cmp__talk-input-row">
          <input class="avn-cmp__talk-input" id="avn-talk-input"
            placeholder="Say something kind to yourself…"
            maxlength="120"
            aria-label="Custom message to companion">
          <button class="avn-cmp__talk-send" id="avn-talk-send" aria-label="Send">Send</button>
        </div>
        <p class="avn-cmp__talk-disclaimer">Your companion is a friendly character, not a counsellor or emergency service.</p>
      </div>
    `;
  }

  // ─── Settings panel ───────────────────────────────────────
  function renderSettingsPanel() {
    const app = APPEARANCES[_companion.appearance] || APPEARANCES.scarab;
    return `
      <div class="avn-cmp__panel-inner">
        <div class="avn-cmp__panel-head">
          <span>Companion Settings</span>
          <button class="avn-cmp__panel-close" aria-label="Close panel">✕</button>
        </div>
        <div class="avn-cmp__settings-form">
          <label class="avn-cmp__settings-label" for="avn-cmp-name-input">Name</label>
          <input class="avn-cmp__settings-input" id="avn-cmp-name-input"
            value="${escapeHtml(_companion.name)}"
            maxlength="32" placeholder="Name your companion…"
            aria-label="Companion name">

          <label class="avn-cmp__settings-label" for="avn-cmp-appear-select">Appearance</label>
          <select class="avn-cmp__settings-select" id="avn-cmp-appear-select" aria-label="Companion appearance">
            ${Object.entries(APPEARANCES).map(([k, v]) =>
              `<option value="${k}" ${_companion.appearance === k ? 'selected' : ''}>${escapeHtml(v.symbol + ' ' + v.label)}</option>`
            ).join('')}
          </select>

          <label class="avn-cmp__settings-label" for="avn-cmp-pers-select">Personality</label>
          <select class="avn-cmp__settings-select" id="avn-cmp-pers-select" aria-label="Companion personality">
            ${Object.entries(PERSONALITIES).map(([k, v]) =>
              `<option value="${k}" ${_companion.personality === k ? 'selected' : ''}>${escapeHtml(v)}</option>`
            ).join('')}
          </select>

          <button class="avn-cmp__action-btn" id="avn-cmp-name-save" style="margin-top:8px">Save Changes</button>
        </div>
        <div class="avn-cmp__settings-danger">
          <button class="avn-cmp__btn-danger" id="avn-cmp-disable" aria-label="Disable companion completely">
            Disable Companion
          </button>
          <p class="avn-cmp__settings-note">You can re-enable it from your Account Settings.</p>
        </div>
      </div>
    `;
  }

  // ─── Mini-game panel (Catch the Stars) ────────────────────
  function renderGamePanel() {
    return `
      <div class="avn-cmp__panel-inner">
        <div class="avn-cmp__panel-head">
          <span>Catch the Stars</span>
          <button class="avn-cmp__panel-close" aria-label="Close panel">✕</button>
        </div>
        <div class="avn-cmp__game-wrap">
          <div class="avn-cmp__game-hud">
            <span>Score: <strong id="avn-game-score">0</strong></span>
            <span>Best: <strong id="avn-game-best">${_companion.miniGame?.highScore || 0}</strong></span>
            <span>Time: <strong id="avn-game-time">20</strong>s</span>
          </div>
          <canvas id="avn-game-canvas" class="avn-cmp__game-canvas"
            width="220" height="160"
            aria-label="Catch falling stars mini-game"
            role="img"></canvas>
          <div id="avn-game-msg" class="avn-cmp__game-msg hidden" aria-live="polite"></div>
          <button id="avn-game-start" class="avn-cmp__action-btn" aria-label="Start game">Start</button>
        </div>
      </div>
    `;
  }

  // ─── Game logic ───────────────────────────────────────────
  let _gameAF = null;
  let _gameActive = false;

  function initGame() {
    const startBtn = document.getElementById('avn-game-start');
    startBtn?.addEventListener('click', startGame);

    const canvas = document.getElementById('avn-game-canvas');
    if (!canvas) return;

    // Mouse
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      _gameState.paddleX = e.clientX - r.left - _gameState.paddleW / 2;
    });
    // Touch
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      _gameState.paddleX = e.touches[0].clientX - r.left - _gameState.paddleW / 2;
    }, { passive: false });
    // Keyboard
    document.addEventListener('keydown', _gameKeyDown);
  }

  const _gameState = {
    score: 0, timeLeft: 20, paddleX: 80, paddleW: 44,
    paddleH: 8, stars: [], lastDrop: 0, active: false,
  };

  function startGame() {
    const startBtn = document.getElementById('avn-game-start');
    const msgEl = document.getElementById('avn-game-msg');
    if (startBtn) startBtn.style.display = 'none';
    if (msgEl) msgEl.classList.add('hidden');

    Object.assign(_gameState, {
      score: 0, timeLeft: 20, paddleX: 88, stars: [],
      lastDrop: performance.now(), active: true,
    });
    _gameActive = true;

    // Countdown
    const countInterval = setInterval(() => {
      _gameState.timeLeft -= 1;
      const el = document.getElementById('avn-game-time');
      if (el) el.textContent = _gameState.timeLeft;
      if (_gameState.timeLeft <= 0) {
        clearInterval(countInterval);
        endGame();
      }
    }, 1000);

    cancelAnimationFrame(_gameAF);
    function loop(now) {
      if (!_gameState.active) return;
      _gameAF = requestAnimationFrame(loop);
      dropStar(now);
      drawGame();
    }
    _gameAF = requestAnimationFrame(loop);
  }

  function dropStar(now) {
    const interval = 700;
    if (now - _gameState.lastDrop > interval) {
      const canvas = document.getElementById('avn-game-canvas');
      if (!canvas) return;
      _gameState.stars.push({
        x: Math.random() * (canvas.width - 12) + 6,
        y: -8,
        speed: 2 + Math.random() * 2,
        r: 6 + Math.random() * 4,
        color: Math.random() > 0.5 ? '#b8954b' : '#eee4cf',
      });
      _gameState.lastDrop = now;
    }
    const canvas = document.getElementById('avn-game-canvas');
    if (!canvas) return;
    _gameState.stars.forEach(s => { s.y += s.speed; });
    _gameState.stars = _gameState.stars.filter(s => s.y < canvas.height + 10);
  }

  function drawGame() {
    const canvas = document.getElementById('avn-game-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    // Background
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(0, 0, W, H);

    // Stars
    _gameState.stars.forEach(s => {
      // Check catch
      const px = _gameState.paddleX;
      const py = H - 20;
      if (s.y + s.r >= py && s.y - s.r <= py + _gameState.paddleH &&
          s.x >= px && s.x <= px + _gameState.paddleW) {
        _gameState.score += 1;
        s.y = H + 20; // remove
        document.getElementById('avn-game-score').textContent = _gameState.score;
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    });

    // Paddle
    ctx.fillStyle = '#b8954b';
    ctx.beginPath();
    const px = _gameState.paddleX, py = H - 20, pw = _gameState.paddleW, ph = _gameState.paddleH;
    if (ctx.roundRect) {
      ctx.roundRect(px, py, pw, ph, 4);
    } else {
      ctx.rect(px, py, pw, ph);
    }
    ctx.fill();
  }

  function endGame() {
    _gameState.active = false;
    _gameActive = false;
    cancelAnimationFrame(_gameAF);
    document.removeEventListener('keydown', _gameKeyDown);

    const startBtn = document.getElementById('avn-game-start');
    const msgEl = document.getElementById('avn-game-msg');
    if (startBtn) { startBtn.textContent = 'Play Again'; startBtn.style.display = ''; }
    if (msgEl) {
      const isHigh = _gameState.score > (_companion.miniGame?.highScore || 0);
      msgEl.textContent = isHigh
        ? `✨ New high score: ${_gameState.score}!`
        : `Great game! You caught ${_gameState.score} star${_gameState.score !== 1 ? 's' : ''}.`;
      msgEl.classList.remove('hidden');
    }

    // Save score
    if (LegendAPI.auth.isLoggedIn()) {
      LegendAPI.companion.gameScore(_gameState.score).then(res => {
        if (res.isHighScore && _companion.miniGame) {
          _companion.miniGame.highScore = _gameState.score;
          const bestEl = document.getElementById('avn-game-best');
          if (bestEl) bestEl.textContent = _gameState.score;
        }
      }).catch(() => {});
    } else {
      // Guest: save to LS
      if (_gameState.score > (_companion.miniGame?.highScore || 0)) {
        if (!_companion.miniGame) _companion.miniGame = {};
        _companion.miniGame.highScore = _gameState.score;
        lsSave(_companion);
      }
    }
  }

  function _gameKeyDown(e) {
    if (!_gameActive) return;
    const canvas = document.getElementById('avn-game-canvas');
    if (!canvas) return;
    const step = 18;
    if (e.key === 'ArrowLeft')  _gameState.paddleX = Math.max(0, _gameState.paddleX - step);
    if (e.key === 'ArrowRight') _gameState.paddleX = Math.min(canvas.width - _gameState.paddleW, _gameState.paddleX + step);
  }

  // ─── Care actions ─────────────────────────────────────────
  let _careInFlight = false;

  async function doCareAction(action) {
    if (!_companion) return;
    if (_careInFlight) return; // prevent double-click spam
    _careInFlight = true;

    // Disable action buttons while saving
    _widgetEl.querySelectorAll('[data-action]').forEach(b => { b.disabled = true; });

    let message = '';

    if (LegendAPI.auth.isLoggedIn()) {
      try {
        const res = await LegendAPI.companion.care(action);
        // Merge returned care stats (Firestore returns the full updated object)
        if (res.care) Object.assign(_companion.care, res.care);
        message = res.message || _localCareResponse(action);
        lsSave(_companion); // keep LS in sync
      } catch (e) {
        console.warn('[AVN Companion] care action failed:', e.message);
        // Fall back to a local update so the UI still responds
        const cap = v => Math.min(100, Math.max(0, v));
        switch (action) {
          case 'feed':  _companion.care.hunger    = cap((_companion.care.hunger    || 80) + 25); break;
          case 'water': _companion.care.water     = cap((_companion.care.water     || 80) + 25); break;
          default:      _companion.care.happiness = cap((_companion.care.happiness || 80) + 10); break;
        }
        lsSave(_companion);
        message = _localCareResponse(action);
      }
    } else {
      // Guest: local update only
      const cap = v => Math.min(100, v);
      switch (action) {
        case 'feed':      _companion.care.hunger    = cap((_companion.care.hunger    || 80) + 25); break;
        case 'water':     _companion.care.water     = cap((_companion.care.water     || 80) + 25); break;
        case 'play':      _companion.care.happiness = cap((_companion.care.happiness || 80) + 20); break;
        case 'encourage': _companion.care.happiness = cap((_companion.care.happiness || 80) + 15); break;
      }
      lsSave(_companion);
      message = _localCareResponse(action);
    }

    _careInFlight = false;
    // Re-enable buttons
    _widgetEl.querySelectorAll('[data-action]').forEach(b => { b.disabled = false; });

    showSpeech(message);
    // Refresh bars without full re-render
    _widgetEl.querySelectorAll('.avn-cmp__stat-fill').forEach((el, i) => {
      const vals = [_companion.care.happiness, _companion.care.energy];
      if (vals[i] !== undefined) el.style.width = `${Math.max(0, Math.min(100, vals[i]))}%`;
    });
    _widgetEl.querySelector('.avn-cmp__mood')?.replaceWith(
      Object.assign(document.createElement('span'), { className: 'avn-cmp__mood', textContent: moodLabel() })
    );
  }

  function _localCareResponse(action) {
    const map = {
      feed:      'Delicious! Thank you for the offering.',
      water:     'So refreshing. Thank you.',
      play:      'That was wonderful! I feel alive!',
      encourage: 'Your kind words warm my ancient heart.',
    };
    return map[action] || 'Thank you.';
  }

  function showSpeech(text) {
    const el = document.getElementById('avn-cmp-speech');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }

  // ─── Talk ─────────────────────────────────────────────────
  function talkPrompt(key) {
    const responses = TALK_RESPONSES[key] || {};
    const personality = _companion.personality || 'calm';
    const msg = responses[personality] || 'I hear you. 🌙';
    const bubble = document.getElementById('avn-talk-bubble');
    if (bubble) {
      bubble.textContent = msg;
      bubble.classList.remove('hidden');
    }
  }

  function sendCustomTalk() {
    const input = document.getElementById('avn-talk-input');
    if (!input) return;
    const text = sanitizeText(input.value.trim(), 120);
    if (!text) return;
    input.value = '';
    const bubble = document.getElementById('avn-talk-bubble');
    if (bubble) {
      const pers = _companion.personality || 'calm';
      const replies = {
        calm:     `I hear you, "${escapeHtml(text)}". Whatever you're feeling is valid.`,
        curious:  `Interesting thought: "${escapeHtml(text)}". Tell me more!`,
        cheerful: `Aww, "${escapeHtml(text)}"! That made me smile so much!`,
        wise:     `"${escapeHtml(text)}" — words worth reflecting upon.`,
        playful:  `"${escapeHtml(text)}" — ooh, we could talk about this all day!`,
      };
      bubble.textContent = replies[pers] || `I hear you: "${escapeHtml(text)}"`;
    }
  }

  // ─── Task actions ─────────────────────────────────────────
  async function completeTask(key) {
    const task = (_companion.dailyTasks || []).find(t => t.key === key);
    if (!task) return;

    if (LegendAPI.auth.isLoggedIn()) {
      try {
        await LegendAPI.companion.taskAction(key, 'complete');
      } catch { /* offline — continue with local update */ }
    }
    task.completedToday = true;
    task.lastCompleted = new Date().toISOString();
    lsSave(_companion);

    // Reward a little happiness
    _companion.care.happiness = Math.min(100, (_companion.care.happiness || 80) + 5);
    openPanel('tasks'); // re-render tasks
    showSpeech('Well done! One step at a time. ✨');
  }

  function skipTask(key) {
    showSpeech('No worries — come back whenever you\'re ready. 🌙');
    openPanel('tasks');
  }

  function toggleTaskEnabled(key) {
    const task = (_companion.dailyTasks || []).find(t => t.key === key);
    if (!task) return;
    task.enabled = !task.enabled;
    lsSave(_companion);
    if (LegendAPI.auth.isLoggedIn()) {
      LegendAPI.companion.taskAction(key, 'toggle_enabled').catch(() => {});
    }
  }

  // ─── Widget controls ──────────────────────────────────────
  function toggleMinimise() {
    _companion.widgetVisible = !_companion.widgetVisible;
    lsSave(_companion);
    scheduleSave({ widgetVisible: _companion.widgetVisible });
    renderWidget();
  }

  function hideWidget() {
    _companion.widgetVisible = false;
    lsSave(_companion);
    scheduleSave({ widgetVisible: false });
    refreshWidget();
    Toast.info('Companion hidden. You can re-open it from your settings anytime.');
  }

  function saveSettings() {
    const name    = sanitizeText(document.getElementById('avn-cmp-name-input')?.value || '', 32);
    const appear  = document.getElementById('avn-cmp-appear-select')?.value;
    const pers    = document.getElementById('avn-cmp-pers-select')?.value;

    if (name)   _companion.name = name;
    if (appear && APPEARANCES[appear]) _companion.appearance = appear;
    if (pers   && PERSONALITIES[pers]) _companion.personality = pers;

    lsSave(_companion);
    scheduleSave({ name: true });

    // Save to API
    if (LegendAPI.auth.isLoggedIn()) {
      LegendAPI.companion.setup({ name, appearance: appear, personality: pers }).catch(() => {});
    }
    _panel = 'closed';
    renderWidget();
    Toast.success('Companion updated! ✨');
  }

  function disableCompanion() {
    if (!confirm('Disable the Avenora Companion? You can re-enable it in Account Settings.')) return;
    _companion.disabled = true;
    lsSave(_companion);
    if (LegendAPI.auth.isLoggedIn()) {
      LegendAPI.companion.widget({ disabled: true }).catch(() => {});
    }
    refreshWidget();
    Toast.info('Companion disabled. Visit Settings to bring it back anytime.');
  }

  // ─── Discovery flow ───────────────────────────────────────
  global.AVNCompanion = {
    isDiscovered() {
      return _companion?.discovered === true;
    },

    async triggerDiscovery() {
      if (_companion?.discovered) {
        // Already discovered — just open widget
        if (_companion.disabled) {
          Toast.info('Your companion is currently disabled. Visit Settings to re-enable it.');
          return;
        }
        _companion.widgetVisible = true;
        lsSave(_companion);
        refreshWidget();
        return;
      }

      // First contact: show the whisper message, then open discovery modal
      _showDiscoveryWhisper(() => _showDiscoveryModal());
    },

    // Called after setup completes
    async activateCompanion(name, appearance, personality) {
      if (!_companion) _companion = _defaultCompanion();
      _companion.discovered  = true;
      _companion.name        = sanitizeText(name, 32);
      _companion.appearance  = APPEARANCES[appearance] ? appearance : 'scarab';
      _companion.personality = PERSONALITIES[personality] ? personality : 'calm';
      _companion.widgetVisible = true;
      _companion.disabled    = false;

      lsSave(_companion);

      if (LegendAPI.auth.isLoggedIn()) {
        try {
          // Save the full companion object on first discovery so
          // all fields (care, dailyTasks, miniGame) are present in Firestore
          const fullSave = {
            discovered:   true,
            name:         _companion.name,
            appearance:   _companion.appearance,
            personality:  _companion.personality,
            widgetVisible: true,
            disabled:     false,
            care:         _companion.care,
            dailyTasks:   _companion.dailyTasks,
            miniGame:     _companion.miniGame,
          };
          const fs = window.AvenoraFirebase?.Firestore;
          const user = LegendState.get('user');
          if (fs && user) {
            await fs.saveCompanion(user.id || user.uid, fullSave);
          }
        } catch (e) {
          console.warn('[AVN Companion] Could not save discovery:', e.message);
        }

      }
      // Hide the cat trigger now that discovery is complete
      refreshCatTrigger();
      refreshWidget();
    },

    // Called by themeService after a theme publish/reload to re-check
    // easterEggEnabled without requiring a page refresh.
    refreshEasterEgg() {
      refreshCatTrigger();
    },
  };

  // ─── Discovery whisper (first-contact message) ───────────
  // Shows "You discovered something hidden…" as a subtle,
  // atmospheric overlay before proceeding to the companion modal.
  // Modular: onContinue callback lets future flows attach here.
  function _showDiscoveryWhisper(onContinue) {
    const id = 'avn-whisper-overlay';
    let el = document.getElementById(id);
    if (el) { el.remove(); }

    el = document.createElement('div');
    el.id = id;
    el.className = 'avn-whisper-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'avn-whisper-msg');
    el.innerHTML = `
      <div class="avn-whisper-box" role="document">
        <span class="avn-whisper-glyph" aria-hidden="true">𓃠</span>
        <p class="avn-whisper-msg" id="avn-whisper-msg">You found something hidden…</p>
        <button class="avn-whisper-continue btn btn-ghost btn-sm" id="avn-whisper-btn" aria-label="Continue">Continue →</button>
      </div>
    `;

    document.body.appendChild(el);

    // Animate in (rAF ensures the initial opacity:0 is painted before adding the class)
    requestAnimationFrame(() => el.classList.add('avn-whisper-overlay--visible'));

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      el.classList.remove('avn-whisper-overlay--visible');

      // Use transitionend where available; fall back to instant removal for
      // reduced-motion environments where transition is none.
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        if (typeof onContinue === 'function') onContinue();
      };
      el.addEventListener('transitionend', finish, { once: true });
      // Fallback: if no transition fires within 600ms, proceed anyway
      setTimeout(finish, 600);
    };

    document.getElementById('avn-whisper-btn')?.addEventListener('click', dismiss);

    // Keyboard: Enter/Space/Escape all dismiss
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    });

    // Auto-focus the continue button for keyboard and screen-reader users
    document.getElementById('avn-whisper-btn')?.focus();
  }

  // ─── Discovery modal ──────────────────────────────────────
  function _showDiscoveryModal() {
    const id = 'avn-discovery-modal';
    let el = document.getElementById(id);
    if (el) el.remove();

    el = document.createElement('div');
    el.id = id;
    el.className = 'modal-backdrop avn-discovery-backdrop';
    el.innerHTML = `
      <div class="modal avn-discovery-modal" role="dialog" aria-modal="true" aria-labelledby="avn-disc-title">
        <div class="avn-disc-intro" id="avn-disc-step-intro" aria-live="polite">
          <div class="avn-disc-symbol" aria-hidden="true">𓆣</div>
          <h2 id="avn-disc-title" class="avn-disc-title">A presence stirs in the ancient dark…</h2>
          <p class="avn-disc-text">Your curiosity has awakened something. A small, ancient spirit watches from the shadows — patient, warm, and waiting.</p>
          <p class="avn-disc-text">Would you like to welcome the Avenora Companion?</p>
          <div class="avn-disc-actions">
            <button class="btn btn-primary" id="avn-disc-yes" aria-label="Yes, welcome the companion">Yes, I'm ready</button>
            <button class="btn btn-ghost" id="avn-disc-no" aria-label="Not right now">Not right now</button>
          </div>
          ${!LegendAPI.auth.isLoggedIn() ? `<p class="avn-disc-save-note">💡 Sign in to save your companion's progress across devices.</p>` : ''}
        </div>
        <div class="avn-disc-setup hidden" id="avn-disc-step-setup">
          <div class="avn-disc-symbol" aria-hidden="true" id="avn-disc-setup-symbol">𓆣</div>
          <h2 class="avn-disc-title">Name your companion</h2>
          <div class="avn-disc-form">
            <label class="avn-disc-label" for="avn-disc-name">Companion name</label>
            <input class="form-input avn-disc-input" id="avn-disc-name"
              placeholder="Give it a name…" maxlength="32"
              aria-label="Companion name">

            <label class="avn-disc-label">Appearance</label>
            <div class="avn-disc-choices" role="radiogroup" aria-label="Choose appearance">
              ${Object.entries(APPEARANCES).map(([k, v]) => `
                <button class="avn-disc-choice ${k === 'scarab' ? 'avn-disc-choice--sel' : ''}"
                  data-appear="${k}" role="radio"
                  aria-checked="${k === 'scarab'}"
                  aria-label="${escapeHtml(v.label)}">
                  <span class="avn-disc-choice-sym" aria-hidden="true">${escapeHtml(v.symbol)}</span>
                  <span>${escapeHtml(v.label)}</span>
                </button>
              `).join('')}
            </div>

            <label class="avn-disc-label">Personality</label>
            <div class="avn-disc-choices" role="radiogroup" aria-label="Choose personality">
              ${Object.entries(PERSONALITIES).map(([k, v]) => `
                <button class="avn-disc-choice ${k === 'calm' ? 'avn-disc-choice--sel' : ''}"
                  data-pers="${k}" role="radio"
                  aria-checked="${k === 'calm'}"
                  aria-label="${escapeHtml(v)}">
                  ${escapeHtml(v)}
                </button>
              `).join('')}
            </div>

            <button class="btn btn-primary w-full" id="avn-disc-activate" style="margin-top:16px">Welcome my companion!</button>
            <button class="btn btn-ghost w-full" id="avn-disc-back" style="margin-top:6px">← Back</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(el);

    // Bind buttons
    document.getElementById('avn-disc-yes')?.addEventListener('click', () => {
      document.getElementById('avn-disc-step-intro').classList.add('hidden');
      document.getElementById('avn-disc-step-setup').classList.remove('hidden');
    });
    document.getElementById('avn-disc-no')?.addEventListener('click', () => el.remove());
    document.getElementById('avn-disc-back')?.addEventListener('click', () => {
      document.getElementById('avn-disc-step-setup').classList.add('hidden');
      document.getElementById('avn-disc-step-intro').classList.remove('hidden');
    });

    // Appearance choices
    let selectedAppear = 'scarab';
    let selectedPers   = 'calm';

    el.querySelectorAll('[data-appear]').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('[data-appear]').forEach(b => { b.classList.remove('avn-disc-choice--sel'); b.setAttribute('aria-checked', 'false'); });
        btn.classList.add('avn-disc-choice--sel');
        btn.setAttribute('aria-checked', 'true');
        selectedAppear = btn.dataset.appear;
        document.getElementById('avn-disc-setup-symbol').textContent = APPEARANCES[selectedAppear]?.symbol || '𓆣';
      });
    });
    el.querySelectorAll('[data-pers]').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('[data-pers]').forEach(b => { b.classList.remove('avn-disc-choice--sel'); b.setAttribute('aria-checked', 'false'); });
        btn.classList.add('avn-disc-choice--sel');
        btn.setAttribute('aria-checked', 'true');
        selectedPers = btn.dataset.pers;
      });
    });

    // Activate
    document.getElementById('avn-disc-activate')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('avn-disc-name');
      const name = sanitizeText(nameInput?.value || '', 32) || (APPEARANCES[selectedAppear]?.label || 'Companion');
      el.remove();
      await global.AVNCompanion.activateCompanion(name, selectedAppear, selectedPers);
      Toast.success(`Welcome, ${escapeHtml(name)}! Your companion is ready. ✨`);
    });
  }

  // ─── Start ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
