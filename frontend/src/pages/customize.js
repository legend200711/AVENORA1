/**
 * AVENORA — Customize Avenora Settings Page
 *
 * Sections:
 *   1. Home-page card layout (show/hide/reorder optional service cards)
 *   2. Notification preferences
 *   3. Appearance settings (theme, accent, text size, high-contrast, reduced-motion, etc.)
 *   4. Personalization (start section, continue watching/listening, saved items, muted topics)
 *
 * Persistence:
 *   - Firestore (primary, when Firebase is available)
 *   - REST /api/preferences (fallback)
 *   - localStorage cache for instant restore while preferences load
 *
 * Founder-only card visibility is resolved server-side — never from a
 * hard-coded email or client-side check against private user data.
 */

registerPage('customize', {
  async render(container) {
    const user = LegendAPI.auth.getUser();

    if (!user) {
      container.innerHTML = `
        <div class="cust-root">
          <div class="cust-header">
            <h1>Customize Avenora</h1>
            <p class="cust-subtitle">Personalize your experience</p>
          </div>
          <div class="card" style="text-align:center;padding:var(--space-2xl)">
            <p style="color:var(--text-secondary);margin-bottom:var(--space-md)">
              Sign in to customize how Avenora looks and behaves.
            </p>
            <button class="btn btn-primary" onclick="Modal.open('auth-modal')">Sign In</button>
          </div>
        </div>
      `;
      return () => {};
    }

    // ── Render skeleton while preferences load ──────────
    container.innerHTML = `
      <div class="cust-root" id="cust-root">
        <div class="cust-header">
          <h1>Customize Avenora</h1>
          <p class="cust-subtitle">Personalize your experience</p>
        </div>
        <div style="min-height:200px;display:flex;align-items:center;justify-content:center">
          <div class="spinner spinner-lg" aria-label="Loading preferences"></div>
        </div>
      </div>
    `;

    // ── Load preferences (Firestore → REST → local cache) ─
    let prefs = _custLoadCache() || _custDefaults();
    try {
      const result = await LegendAPI.preferences.get();
      if (result?.preferences) {
        prefs = _custMerge(_custDefaults(), result.preferences);
        _custSaveCache(prefs);
      }
    } catch (err) {
      console.warn('[AVN Customize] Could not load preferences from server, using local cache:', err.message);
    }

    // ── Render full UI ───────────────────────────────────
    _custRender(container, prefs, user);
    return () => { _custCleanup(); };
  },
});

/* ═══════════════════════════════════════════════════════════
   DEFAULT PREFERENCES
   ═══════════════════════════════════════════════════════════ */
function _custDefaults() {
  return {
    theme: 'dark',
    accentColor: 'gold',
    textSize: 'normal',
    gothicIntensity: 'standard',
    highContrast: false,
    reducedMotion: false,
    soundEnabled: true,
    autoplay: true,
    captions: false,
    notifications: {
      level: 'all',
      likes: true,
      comments: true,
      follows: true,
      messages: true,
      groupMessages: true,
      chatInvites: true,
      friendRequests: true,
      liveVideo: true,
      systemAnnouncements: true,
    },
    homeCards: {
      visibleCards: ['cloudstream','live','social','dj','music','gallery'],
      cardOrder: ['cloudstream','live','social','dj','music','gallery'],
    },
    startSection: '',
    continueWatching: true,
    continueListening: true,
    recentlyVisited: true,
    savedItems: true,
    mutedTopics: [],
    _founderAccess: false,
  };
}

const CARD_META = {
  cloudstream: { label: 'Avenora 24-Hour Cloud Stream',      founderOnly: false },
  live:        { label: 'Avenora Live',                       founderOnly: false },
  social:      { label: 'Avenora Share',                      founderOnly: false },
  dj:          { label: 'Avenora DJ System',                  founderOnly: false },
  music:       { label: 'Avenora Music Hub',                  founderOnly: false },
  gallery:     { label: 'Avenora Gallery',                    founderOnly: false },
  admin:       { label: 'Avenora Founder Control Center',     founderOnly: true  },
};

const ALL_CARD_IDS = Object.keys(CARD_META);

/* ═══════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════ */
let _custState = null;
let _custDirty = false;
let _custSaving = false;

function _custCleanup() {
  _custState = null;
  _custDirty = false;
  _custSaving = false;
}

function _custRender(container, prefs, user) {
  _custState = JSON.parse(JSON.stringify(prefs)); // deep clone
  _custDirty = false;

  const founderAccess = !!prefs._founderAccess;
  // Available card IDs for this user (founder cards only for founders)
  const availableCards = ALL_CARD_IDS.filter(id => !CARD_META[id].founderOnly || founderAccess);

  // Ensure cardOrder contains all available cards (add missing, keep extras for now)
  const storedOrder = (prefs.homeCards?.cardOrder || []).filter(id => availableCards.includes(id));
  const missingCards = availableCards.filter(id => !storedOrder.includes(id));
  _custState.homeCards.cardOrder = [...storedOrder, ...missingCards];

  // Ensure visibleCards only contains available cards
  _custState.homeCards.visibleCards = (prefs.homeCards?.visibleCards || []).filter(id => availableCards.includes(id));

  container.innerHTML = `
    <div class="cust-root" id="cust-root">
      <div class="cust-header">
        <h1>Customize Avenora</h1>
        <p class="cust-subtitle">Personalize your experience</p>
      </div>

      <!-- ── 1. Home-page Card Layout ──────────────────── -->
      <section class="cust-section" aria-labelledby="cust-cards-title">
        <div class="cust-section-header">
          <svg class="cust-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <h2 id="cust-cards-title" class="cust-section-title">Home-Page Cards</h2>
        </div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:var(--space-md)">
          Choose which optional cards appear on your home page and arrange them in the order you prefer.
          Use the arrows to move cards up or down. Toggle visibility with the switch.
        </p>
        <div id="cust-card-list" class="cust-card-list" role="list" aria-label="Home page cards, reorderable"></div>
        <div style="margin-top:var(--space-md)">
          <button class="cust-restore-link" onclick="custRestoreCards()">
            Restore default card layout
          </button>
        </div>
      </section>

      <!-- ── 2. Notifications ───────────────────────────── -->
      <section class="cust-section" aria-labelledby="cust-notif-title">
        <div class="cust-section-header">
          <svg class="cust-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <h2 id="cust-notif-title" class="cust-section-title">Notifications</h2>
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Notification level</p>
            <small>Controls how many optional notifications you receive overall.</small>
          </div>
          <div class="cust-notif-level" role="group" aria-label="Notification level">
            ${['all','important','none'].map(v => `
              <button class="cust-notif-btn ${_custState.notifications.level === v ? 'active' : ''}"
                data-notif-level="${v}"
                onclick="custSetNotifLevel('${v}')"
                aria-pressed="${_custState.notifications.level === v}">
                ${{ all: 'All', important: 'Important only', none: 'Minimal' }[v]}
              </button>
            `).join('')}
          </div>
        </div>

        <p style="font-size:0.8rem;color:var(--text-muted);margin:var(--space-sm) 0">
          Fine-tune individual notification types below.
          Security and account notices are always delivered regardless of these settings.
        </p>

        ${[
          { key: 'likes',               label: 'Likes and reactions',        desc: '' },
          { key: 'comments',            label: 'Comments and replies',        desc: '' },
          { key: 'follows',             label: 'New followers',               desc: '' },
          { key: 'messages',            label: 'Private messages',            desc: '' },
          { key: 'groupMessages',       label: 'Group messages',              desc: '' },
          { key: 'chatInvites',         label: 'Chat-room invitations',       desc: '' },
          { key: 'friendRequests',      label: 'Friend and connection requests', desc: '' },
          { key: 'liveVideo',           label: 'Live and video notifications', desc: '' },
          { key: 'systemAnnouncements', label: 'System announcements',        desc: 'Platform updates and community news.' },
        ].map(item => `
          <div class="cust-row">
            <div class="cust-row-label">
              <p>${escapeHtml(item.label)}</p>
              ${item.desc ? `<small>${escapeHtml(item.desc)}</small>` : ''}
            </div>
            ${_custToggleHtml(`notif-${item.key}`, _custState.notifications[item.key], `custToggleNotif('${item.key}', this)`)}
          </div>
        `).join('')}
      </section>

      <!-- ── 3. Appearance ──────────────────────────────── -->
      <section class="cust-section" aria-labelledby="cust-appear-title">
        <div class="cust-section-header">
          <svg class="cust-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M20.2 8.8A9 9 0 0 1 21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 .8-3.2"/>
            <path d="M17 2L12 7 7 2"/>
          </svg>
          <h2 id="cust-appear-title" class="cust-section-title">Appearance</h2>
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Dark theme</p>
            <small>Choose your preferred darkness level.</small>
          </div>
          <select class="cust-select" id="cust-theme" aria-label="Dark theme"
            onchange="custChange('theme', this.value)">
            <option value="dark"   ${_custState.theme==='dark'  ?'selected':''}>Dark</option>
            <option value="darker" ${_custState.theme==='darker'?'selected':''}>Deeper Dark</option>
            <option value="amoled" ${_custState.theme==='amoled'?'selected':''}>AMOLED Black</option>
          </select>
        </div>

        <div class="cust-row" style="flex-direction:column;align-items:flex-start;gap:var(--space-sm)">
          <div class="cust-row-label">
            <p>Accent colour</p>
            <small>Applied to highlights, buttons, and decorative elements throughout Avenora.</small>
          </div>
          <div class="cust-accent-grid" role="group" aria-label="Accent colour">
            ${[
              { id: 'gold',    label: 'Aged Egyptian Gold' },
              { id: 'emerald', label: 'Dark Emerald' },
              { id: 'violet',  label: 'Midnight Violet' },
              { id: 'bronze',  label: 'Antique Bronze' },
              { id: 'crimson', label: 'Deep Crimson' },
            ].map(a => `
              <button class="cust-accent-swatch ${_custState.accentColor === a.id ? 'selected' : ''}"
                data-accent="${a.id}"
                onclick="custSetAccent('${a.id}')"
                aria-label="${escapeHtml(a.label)}${_custState.accentColor === a.id ? ' (selected)' : ''}"
                aria-pressed="${_custState.accentColor === a.id}"
                title="${escapeHtml(a.label)}">
              </button>
            `).join('')}
          </div>
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Gothic Egyptian intensity</p>
            <small>Controls the strength of decorative stone, gold, and ancient Egyptian visual motifs.</small>
          </div>
          <select class="cust-select" id="cust-gothic" aria-label="Gothic Egyptian intensity"
            onchange="custChange('gothicIntensity', this.value)">
            <option value="subtle"   ${_custState.gothicIntensity==='subtle'  ?'selected':''}>Subtle</option>
            <option value="standard" ${_custState.gothicIntensity==='standard'?'selected':''}>Standard</option>
            <option value="intense"  ${_custState.gothicIntensity==='intense' ?'selected':''}>Intense</option>
          </select>
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Text size</p>
            <small>Scales readable text across the entire app.</small>
          </div>
          <select class="cust-select" id="cust-textsize" aria-label="Text size"
            onchange="custChange('textSize', this.value)">
            <option value="small"  ${_custState.textSize==='small' ?'selected':''}>Small</option>
            <option value="normal" ${_custState.textSize==='normal'?'selected':''}>Normal</option>
            <option value="large"  ${_custState.textSize==='large' ?'selected':''}>Large</option>
            <option value="xlarge" ${_custState.textSize==='xlarge'?'selected':''}>Extra Large</option>
          </select>
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>High-contrast mode</p>
            <small>Increases border and text contrast for better readability.</small>
          </div>
          ${_custToggleHtml('high-contrast', _custState.highContrast, `custChange('highContrast', this.checked)`)}
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Reduced motion</p>
            <small>Disables non-essential animations and transitions. Also respects your system setting.</small>
          </div>
          ${_custToggleHtml('reduced-motion', _custState.reducedMotion, `custChange('reducedMotion', this.checked)`)}
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Interface sounds</p>
            <small>Enable subtle UI sounds where applicable.</small>
          </div>
          ${_custToggleHtml('sound', _custState.soundEnabled, `custChange('soundEnabled', this.checked)`)}
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Autoplay media</p>
            <small>Videos and audio play automatically when you open them.</small>
          </div>
          ${_custToggleHtml('autoplay', _custState.autoplay, `custChange('autoplay', this.checked)`)}
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Captions</p>
            <small>Show captions when available for videos and live streams.</small>
          </div>
          ${_custToggleHtml('captions', _custState.captions, `custChange('captions', this.checked)`)}
        </div>
      </section>

      <!-- ── 4. Personalization ─────────────────────────── -->
      <section class="cust-section" aria-labelledby="cust-personal-title">
        <div class="cust-section-header">
          <svg class="cust-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <h2 id="cust-personal-title" class="cust-section-title">Personalization</h2>
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Preferred starting section</p>
            <small>Optional. When set, a shortcut appears on your home page — but the normal Avenora home is always the default landing page.</small>
          </div>
          <select class="cust-select" id="cust-start" aria-label="Preferred starting section"
            onchange="custChange('startSection', this.value)">
            <option value=""          ${_custState.startSection===''          ?'selected':''}>None (Home)</option>
            <option value="social"    ${_custState.startSection==='social'    ?'selected':''}>Feed</option>
            <option value="video"     ${_custState.startSection==='video'     ?'selected':''}>Video</option>
            <option value="music"     ${_custState.startSection==='music'     ?'selected':''}>Music Hub</option>
            <option value="arcade"    ${_custState.startSection==='arcade'    ?'selected':''}>Arcade</option>
            <option value="chat"      ${_custState.startSection==='chat'      ?'selected':''}>Chat</option>
            <option value="gallery"   ${_custState.startSection==='gallery'   ?'selected':''}>Gallery</option>
            <option value="cloudstream" ${_custState.startSection==='cloudstream'?'selected':''}>Cloud Stream</option>
            <option value="live"      ${_custState.startSection==='live'      ?'selected':''}>Live</option>
            <option value="dj"        ${_custState.startSection==='dj'        ?'selected':''}>DJ System</option>
          </select>
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Continue Watching</p>
            <small>Show a shortcut to your most recently watched video on the home page.</small>
          </div>
          ${_custToggleHtml('continue-watching', _custState.continueWatching, `custChange('continueWatching', this.checked)`)}
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Continue Listening</p>
            <small>Show a shortcut to your last played track on the home page.</small>
          </div>
          ${_custToggleHtml('continue-listening', _custState.continueListening, `custChange('continueListening', this.checked)`)}
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Recently visited areas</p>
            <small>Keep track of which sections you have visited recently.</small>
          </div>
          ${_custToggleHtml('recently-visited', _custState.recentlyVisited, `custChange('recentlyVisited', this.checked)`)}
        </div>

        <div class="cust-row">
          <div class="cust-row-label">
            <p>Saved posts, videos, music, and games</p>
            <small>Show your saved and bookmarked items in quick-access sections.</small>
          </div>
          ${_custToggleHtml('saved-items', _custState.savedItems, `custChange('savedItems', this.checked)`)}
        </div>
      </section>

      <!-- ── Save bar ───────────────────────────────────── -->
      <div class="cust-save-bar" id="cust-save-bar" role="region" aria-label="Save your preferences">
        <span class="cust-save-bar__msg" id="cust-save-msg" aria-live="polite" aria-atomic="true"></span>
        <div class="cust-save-bar__actions">
          <button class="cust-restore-link" onclick="custRestoreDefaults()" style="margin-right:var(--space-sm)">
            Restore all defaults
          </button>
          <button class="btn btn-primary btn-sm" id="cust-save-btn" onclick="custSave()">
            Save Changes
          </button>
        </div>
      </div>

    </div>
  `;

  // Render the card list after main HTML is in the DOM
  _custRenderCardList(founderAccess);

  // Apply current prefs visually (accent, text size, etc.) immediately
  _custApplyVisually(_custState);
}

/* ═══════════════════════════════════════════════════════════
   CARD LIST
   ═══════════════════════════════════════════════════════════ */
function _custRenderCardList(founderAccess) {
  const list = document.getElementById('cust-card-list');
  if (!list) return;

  const order = _custState.homeCards.cardOrder.filter(id => CARD_META[id] && (!CARD_META[id].founderOnly || founderAccess));
  const visible = new Set(_custState.homeCards.visibleCards);

  list.innerHTML = order.map((id, idx) => {
    const meta = CARD_META[id];
    const isVisible = visible.has(id);
    const isFirst = idx === 0;
    const isLast  = idx === order.length - 1;

    return `
      <div class="cust-card-item" role="listitem" data-card-id="${id}"
           draggable="true"
           ondragstart="custDragStart(event, '${id}')"
           ondragover="custDragOver(event)"
           ondrop="custDrop(event, '${id}')"
           ondragend="custDragEnd(event)">
        <button class="cust-card-item__drag" aria-label="Drag to reorder ${escapeHtml(meta.label)}"
                tabindex="0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span class="cust-card-item__label">${escapeHtml(meta.label)}</span>
        ${meta.founderOnly ? `<span class="cust-card-item__founder-badge">Founder</span>` : ''}
        <button class="cust-card-move" onclick="custCardMoveUp('${id}')"
          aria-label="Move ${escapeHtml(meta.label)} up" ${isFirst ? 'disabled' : ''} title="Move up">▲</button>
        <button class="cust-card-move" onclick="custCardMoveDown('${id}')"
          aria-label="Move ${escapeHtml(meta.label)} down" ${isLast ? 'disabled' : ''} title="Move down">▼</button>
        <label class="cust-toggle cust-card-item__vis" title="${isVisible ? 'Hide this card' : 'Show this card'}">
          <input type="checkbox" ${isVisible ? 'checked' : ''}
            onchange="custToggleCard('${id}', this.checked)"
            aria-label="${isVisible ? 'Hide' : 'Show'} ${escapeHtml(meta.label)}">
          <span class="cust-toggle-track" aria-hidden="true"></span>
          <span class="cust-toggle-thumb" aria-hidden="true"></span>
        </label>
      </div>
    `;
  }).join('');
}

/* ─── Drag & drop ────────────────────────────────────────── */
let _custDragId = null;

window.custDragStart = function(e, id) {
  _custDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
};

window.custDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const item = e.currentTarget;
  item.classList.add('cust-card-item--drag-over');
};

window.custDragEnd = function(e) {
  document.querySelectorAll('.cust-card-item--drag-over')
    .forEach(el => el.classList.remove('cust-card-item--drag-over'));
};

window.custDrop = function(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('cust-card-item--drag-over');
  if (!_custDragId || _custDragId === targetId) return;

  const order = _custState.homeCards.cardOrder;
  const fromIdx = order.indexOf(_custDragId);
  const toIdx   = order.indexOf(targetId);
  if (fromIdx < 0 || toIdx < 0) return;

  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, _custDragId);
  _custDragId = null;
  _custMarkDirty();
  _custRenderCardList(!!_custState._founderAccess);
};

/* ─── Move buttons ───────────────────────────────────────── */
window.custCardMoveUp = function(id) {
  const order = _custState.homeCards.cardOrder;
  const idx = order.indexOf(id);
  if (idx <= 0) return;
  [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
  _custMarkDirty();
  _custRenderCardList(!!_custState._founderAccess);
  // Restore focus to the same card's "move up" button
  setTimeout(() => {
    const newIdx = _custState.homeCards.cardOrder.indexOf(id);
    const items = document.querySelectorAll('.cust-card-item');
    items[newIdx]?.querySelectorAll('.cust-card-move')[0]?.focus();
  }, 0);
};

window.custCardMoveDown = function(id) {
  const order = _custState.homeCards.cardOrder;
  const idx = order.indexOf(id);
  if (idx < 0 || idx >= order.length - 1) return;
  [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
  _custMarkDirty();
  _custRenderCardList(!!_custState._founderAccess);
  setTimeout(() => {
    const newIdx = _custState.homeCards.cardOrder.indexOf(id);
    const items = document.querySelectorAll('.cust-card-item');
    items[newIdx]?.querySelectorAll('.cust-card-move')[1]?.focus();
  }, 0);
};

/* ─── Toggle card visibility ─────────────────────────────── */
window.custToggleCard = function(id, visible) {
  const vis = _custState.homeCards.visibleCards;
  if (visible) {
    if (!vis.includes(id)) vis.push(id);
  } else {
    const i = vis.indexOf(id);
    if (i !== -1) vis.splice(i, 1);
  }
  _custMarkDirty();
};

window.custRestoreCards = function() {
  const defaults = _custDefaults();
  const founderAccess = !!_custState._founderAccess;
  let defaultOrder = [...defaults.homeCards.cardOrder];
  let defaultVisible = [...defaults.homeCards.visibleCards];
  if (founderAccess && !defaultOrder.includes('admin')) {
    defaultOrder.push('admin');
    defaultVisible.push('admin');
  }
  _custState.homeCards.cardOrder = defaultOrder;
  _custState.homeCards.visibleCards = defaultVisible;
  _custMarkDirty();
  _custRenderCardList(founderAccess);
};

/* ═══════════════════════════════════════════════════════════
   NOTIFICATION CONTROLS
   ═══════════════════════════════════════════════════════════ */
window.custSetNotifLevel = function(level) {
  _custState.notifications.level = level;
  _custMarkDirty();
  // Update aria-pressed + active class
  document.querySelectorAll('[data-notif-level]').forEach(btn => {
    const isActive = btn.dataset.notifLevel === level;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
};

window.custToggleNotif = function(key, checkbox) {
  _custState.notifications[key] = checkbox.checked;
  _custMarkDirty();
};

/* ═══════════════════════════════════════════════════════════
   GENERIC CHANGE HANDLER
   ═══════════════════════════════════════════════════════════ */
window.custChange = function(key, value) {
  _custState[key] = value;
  _custMarkDirty();
  _custApplyVisually(_custState);
};

window.custSetAccent = function(accent) {
  _custState.accentColor = accent;
  _custMarkDirty();
  _custApplyVisually(_custState);
  // Update swatch selection
  document.querySelectorAll('.cust-accent-swatch').forEach(btn => {
    const isSelected = btn.dataset.accent === accent;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.setAttribute('aria-label',
      (btn.title || '') + (isSelected ? ' (selected)' : ''));
  });
};

/* ═══════════════════════════════════════════════════════════
   SAVE / RESTORE DEFAULTS
   ═══════════════════════════════════════════════════════════ */
window.custSave = async function() {
  if (_custSaving) return;
  _custSaving = true;

  const btn = document.getElementById('cust-save-btn');
  const msg = document.getElementById('cust-save-msg');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="cust-spinner" aria-hidden="true"></span>Saving…'; }
  // Clear any previous message and inline colour override before each attempt
  if (msg) { msg.textContent = ''; msg.className = 'cust-save-bar__msg'; msg.style.color = ''; }

  try {
    const toSave = JSON.parse(JSON.stringify(_custState));
    delete toSave._founderAccess; // Never send runtime flag to server

    const result = await LegendAPI.preferences.save(toSave);
    if (!result?.success && !result?.preferences) {
      throw new Error('Unexpected response from server');
    }

    // Merge returned prefs (server may have sanitized values)
    if (result.preferences) {
      _custState = _custMerge(_custDefaults(), result.preferences);
    }
    _custSaveCache(_custState);
    _custApplyVisually(_custState);
    _custDirty = false;

    if (msg) {
      msg.style.color = '';
      msg.textContent = '✓ Preferences saved.';
      msg.className = 'cust-save-bar__msg cust-save-bar__msg--success';
      setTimeout(() => { if (msg) { msg.textContent = ''; msg.className = 'cust-save-bar__msg'; } }, 4000);
    }
    Toast.success('Preferences saved.');

  } catch (err) {
    console.warn('[AVN Customize] Save failed:', err);
    const isNetwork = err.message === 'Failed to fetch' || err.message?.includes('NetworkError');
    const isPermission = err.message?.includes('Missing or insufficient permissions') || err.code === 'permission-denied';
    const userMsg = isNetwork
      ? 'Could not connect. Your selections have been kept — please check your connection and try again.'
      : isPermission
        ? 'Your session may have expired. Please sign out and sign back in, then try again.'
        : 'Something went wrong while saving. Your selections have been kept. Please try again.';
    if (msg) {
      msg.style.color = '';
      msg.textContent = userMsg;
      msg.className = 'cust-save-bar__msg cust-save-bar__msg--error';
    }
    Toast.error('Preferences could not be saved.');
  } finally {
    _custSaving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
};

window.custRestoreDefaults = function() {
  Modal.create({
    id: 'cust-restore-modal',
    title: 'Restore Defaults',
    body: `<p style="color:var(--text-secondary)">This will reset all Customize Avenora preferences to their defaults, including card layout, notifications, and appearance settings. Your account data, posts, and media are not affected.</p>`,
    actions: [
      { label: 'Cancel', class: 'btn-ghost', onclick: "Modal.close('cust-restore-modal')" },
      { label: 'Restore Defaults', class: 'btn-primary', onclick: 'custConfirmRestoreDefaults()' },
    ],
  });
  Modal.open('cust-restore-modal');
};

window.custConfirmRestoreDefaults = async function() {
  Modal.close('cust-restore-modal');

  const btn = document.getElementById('cust-save-btn');
  const msg = document.getElementById('cust-save-msg');
  if (btn) { btn.disabled = true; }

  try {
    const result = await LegendAPI.preferences.reset();
    const fresh = result?.preferences || _custDefaults();
    _custState = _custMerge(_custDefaults(), fresh);
    _custSaveCache(_custState);
    _custApplyVisually(_custState);
    _custDirty = false;

    // Re-render the full customize page with defaults
    const user = LegendAPI.auth.getUser();
    if (user) _custRender(document.getElementById('page-container'), _custState, user);

    Toast.success('All preferences restored to defaults.');
  } catch (err) {
    console.warn('[AVN Customize] Reset failed:', err);
    Toast.error('Could not restore defaults. Please try again.');
    if (btn) { btn.disabled = false; }
  }
};

/* ═══════════════════════════════════════════════════════════
   VISUAL APPLICATION
   Applies current preferences to the document without a reload.
   ═══════════════════════════════════════════════════════════ */
const ACCENT_VARS = {
  gold:    { main: '#b8954b', dim: '#76552f' },
  emerald: { main: '#3a7a5f', dim: '#21483c' },
  violet:  { main: '#8866bb', dim: '#30213f' },
  bronze:  { main: '#76552f', dim: '#4a3318' },
  crimson: { main: '#9e2b38', dim: '#701f28' },
};

const TEXT_SIZE_VARS = {
  small:  '13px',
  normal: '15px',
  large:  '17px',
  xlarge: '19px',
};

const THEME_BG = {
  dark:   { primary: '#090807', secondary: '#171513', card: '#131210' },
  darker: { primary: '#060504', secondary: '#100e0c', card: '#0d0b09' },
  amoled: { primary: '#000000', secondary: '#0a0908', card: '#080706' },
};

function _custApplyVisually(prefs) {
  const root = document.documentElement;

  // Accent colour
  const accent = ACCENT_VARS[prefs.accentColor] || ACCENT_VARS.gold;
  root.style.setProperty('--neon-blue',     accent.main);
  root.style.setProperty('--neon-blue-dim', accent.dim);
  root.style.setProperty('--avenora-gold',  accent.main);
  root.style.setProperty('--avenora-bronze',accent.dim);
  root.style.setProperty('--border-blue',   `rgba(${_hexToRgb(accent.main)},0.28)`);
  root.style.setProperty('--glow-blue',     `0 0 18px rgba(${_hexToRgb(accent.main)},0.35)`);
  root.style.setProperty('--grad-blue',     `linear-gradient(135deg, rgba(${_hexToRgb(accent.main)},0.12), rgba(${_hexToRgb(accent.dim)},0.07))`);

  // Theme darkness
  const theme = THEME_BG[prefs.theme] || THEME_BG.dark;
  root.style.setProperty('--bg-primary',   theme.primary);
  root.style.setProperty('--bg-secondary', theme.secondary);
  root.style.setProperty('--bg-card',      theme.card);

  // Text size
  const fontSize = TEXT_SIZE_VARS[prefs.textSize] || '15px';
  root.style.setProperty('font-size', fontSize);
  document.documentElement.style.fontSize = fontSize;

  // Gothic intensity (CSS class on body)
  document.body.classList.remove('avn-gothic-subtle', 'avn-gothic-standard', 'avn-gothic-intense');
  document.body.classList.add(`avn-gothic-${prefs.gothicIntensity || 'standard'}`);

  // High contrast
  document.body.classList.toggle('avn-high-contrast', !!prefs.highContrast);

  // Reduced motion (additive to OS pref)
  document.body.classList.toggle('avn-reduced-motion', !!prefs.reducedMotion);
  if (prefs.reducedMotion) {
    _custInjectReducedMotionStyle();
  } else {
    _custRemoveReducedMotionStyle();
  }

  // Persist to localStorage for instant restore on next load
  _custSaveCache(prefs);
}

function _custInjectReducedMotionStyle() {
  let el = document.getElementById('avn-reduced-motion-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'avn-reduced-motion-style';
    el.textContent = `
      .avn-reduced-motion *, .avn-reduced-motion *::before, .avn-reduced-motion *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(el);
  }
}

function _custRemoveReducedMotionStyle() {
  document.getElementById('avn-reduced-motion-style')?.remove();
}

/* ═══════════════════════════════════════════════════════════
   LOCAL CACHE  (instant restore on page load)
   ═══════════════════════════════════════════════════════════ */
const _CACHE_KEY = 'avn_prefs_cache';

function _custSaveCache(prefs) {
  try {
    const toStore = JSON.parse(JSON.stringify(prefs));
    delete toStore._founderAccess;
    localStorage.setItem(_CACHE_KEY, JSON.stringify(toStore));
  } catch {}
}

function _custLoadCache() {
  try {
    const raw = localStorage.getItem(_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */
function _custMarkDirty() {
  _custDirty = true;
  const msg = document.getElementById('cust-save-msg');
  if (msg && !msg.textContent) {
    msg.textContent = 'You have unsaved changes.';
    // Use CSS class only — no inline style so success/error classes can override cleanly
    msg.className = 'cust-save-bar__msg cust-save-bar__msg--dirty';
    msg.style.color = '';
  }
}

function _custToggleHtml(id, checked, onchangeExpr) {
  return `
    <label class="cust-toggle" for="cust-toggle-${id}">
      <input type="checkbox" id="cust-toggle-${id}" ${checked ? 'checked' : ''}
        onchange="${onchangeExpr}" role="switch" aria-checked="${checked}">
      <span class="cust-toggle-track" aria-hidden="true"></span>
      <span class="cust-toggle-thumb" aria-hidden="true"></span>
    </label>
  `;
}

function _custMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source || {})) {
    if (key === '_founderAccess') { out[key] = source[key]; continue; }
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = _custMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `${r},${g},${b}`;
}

/* ═══════════════════════════════════════════════════════════
   AUTO-APPLY ON PAGE LOAD
   Restore cached visual preferences before the first render
   so there is no unstyled flash on reload.
   ═══════════════════════════════════════════════════════════ */
(function _custAutoApplyOnLoad() {
  const cached = _custLoadCache();
  if (cached) {
    try { _custApplyVisually(cached); } catch {}
  }
})();
