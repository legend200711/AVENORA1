/**
 * AVENORA — Avenora Live (SPA page)
 *
 * Renders entirely inside the main SPA — no standalone HTML redirects.
 *
 * Routes handled here:
 *   #live              → Live Hub  (list active rooms + "Go Live" flow)
 *   #live-room/{id}    → Live Room  (watch a specific room, or host controls
 *                                    if the user is the creator)
 *
 * Firebase services used:
 *   Firestore  liveRooms/{roomId}   — room metadata (status, title, hostId…)
 *   Auth       window.AvenoraFirebase.Auth  — current user
 *   MediaDevices.getUserMedia        — camera / mic for "Go Live" setup
 */

/* ── Live Hub page ──────────────────────────────────────────────────── */
registerPage('live', {
  _unsub: null,

  async render(container) {
    container.innerHTML = _liveHubHTML();
    this._unsub = await _liveHubInit(container);
    return () => {
      if (typeof this._unsub === 'function') this._unsub();
    };
  },
});

/* ── Live Room page ─────────────────────────────────────────────────── */
registerPage('live-room', {
  _cleanup: null,

  async render(container) {
    // roomId comes from the hash: #live-room/abc123
    const roomId = location.hash.replace('#', '').split('/')[1] || null;
    container.innerHTML = _liveRoomHTML(roomId);
    this._cleanup = await _liveRoomInit(container, roomId);
    return () => {
      if (typeof this._cleanup === 'function') this._cleanup();
    };
  },
});

/* ══════════════════════════════════════════════════════════════════════
   LIVE HUB — list active rooms + "Go Live" setup flow
   ══════════════════════════════════════════════════════════════════════ */

function _liveHubHTML() {
  return `
    <div class="avl-hub" style="padding:var(--space-lg);max-width:900px;margin:0 auto">
      <div class="page-header" style="padding-top:var(--space-xl);padding-bottom:var(--space-md)">
        <h1 style="font-family:var(--font-display);letter-spacing:0.1em;margin-bottom:4px">
          <span style="color:#ff3232">AVENORA</span> LIVE
        </h1>
        <p class="tagline">LIVE STREAMING</p>
      </div>

      <!-- Auth gate -->
      <div id="avl-auth-gate" class="card" style="display:none;text-align:center;padding:var(--space-xl);max-width:420px;margin:0 auto">
        <div style="font-size:2.5rem;margin-bottom:12px">🔒</div>
        <h3 style="margin-bottom:8px">Sign in to use Live</h3>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px">
          Create and watch live streams with your Avenora account.
        </p>
        <button class="btn btn-primary" onclick="Modal.open('auth-modal')">Sign In</button>
      </div>

      <!-- Go Live setup (hidden until "Go Live" clicked) -->
      <div id="avl-setup" style="display:none;max-width:540px;margin:0 auto var(--space-xl)">
        <div class="card" style="border-color:rgba(255,50,50,0.35);padding:var(--space-lg)">
          <h3 style="font-family:var(--font-display);color:#ff3232;letter-spacing:0.08em;margin-bottom:var(--space-md)">
            🔴 GO LIVE SETUP
          </h3>
          <!-- Camera preview -->
          <div style="position:relative;background:#0a0a0a;border-radius:8px;overflow:hidden;margin-bottom:var(--space-md);aspect-ratio:16/9">
            <video id="avl-preview" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;display:block"></video>
            <div id="avl-cam-off" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted)">
              <div style="font-size:2rem">📷</div><span style="font-size:0.85rem">Camera off</span>
            </div>
          </div>
          <!-- Controls row -->
          <div style="display:flex;gap:8px;margin-bottom:var(--space-md);justify-content:center;flex-wrap:wrap">
            <button id="avl-btn-cam" class="btn btn-ghost btn-sm" onclick="AVLive.toggleSetupCam()">📷 Camera: ON</button>
            <button id="avl-btn-mic" class="btn btn-ghost btn-sm" onclick="AVLive.toggleSetupMic()">🎤 Mic: ON</button>
            <button id="avl-btn-flip" class="btn btn-ghost btn-sm" onclick="AVLive.flipCamera()" style="display:none">🔄 Flip</button>
          </div>
          <!-- Title -->
          <div class="form-group" style="margin-bottom:var(--space-md)">
            <label class="form-label" for="avl-title">Stream Title</label>
            <input class="form-input" id="avl-title" placeholder="What are you streaming?" maxlength="80">
          </div>
          <!-- Actions -->
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" onclick="AVLive.cancelSetup()">Cancel</button>
            <button class="btn btn-primary" id="avl-go-live-btn"
              style="background:rgba(220,20,20,0.85);border-color:rgba(255,50,50,0.6);flex:1;font-family:var(--font-display)"
              onclick="AVLive.startLive()">
              <span>🔴</span> GO LIVE
            </button>
          </div>
          <div id="avl-setup-err" style="color:#c0394a;font-size:0.85rem;margin-top:8px;display:none"></div>
          <div id="avl-setup-diag" style="font-size:0.75rem;margin-top:6px;font-family:monospace;word-break:break-all;display:none"></div>
        </div>
      </div>

      <!-- Hub main content -->
      <div id="avl-hub-main">
        <!-- Go Live button bar -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-lg)">
          <div>
            <span id="avl-live-count" style="font-size:0.85rem;color:var(--text-muted)">Loading rooms…</span>
          </div>
          <button id="avl-go-live-start" class="btn btn-primary"
            style="background:rgba(220,20,20,0.85);border-color:rgba(255,50,50,0.6);font-family:var(--font-display);letter-spacing:0.08em;gap:6px"
            onclick="AVLive.openSetup()">
            <span>🔴</span> GO LIVE
          </button>
        </div>
        <!-- Rooms grid -->
        <div id="avl-rooms-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--space-md)">
          <div class="loading-state"><div class="spinner spinner-lg"></div></div>
        </div>
        <!-- Empty state -->
        <div id="avl-empty" style="display:none;text-align:center;padding:var(--space-xxl) var(--space-lg)">
          <div style="font-size:3rem;margin-bottom:12px">📡</div>
          <h3 style="margin-bottom:8px">No one is live right now</h3>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:var(--space-md)">
            Be the first to go live and get the community watching!
          </p>
          <button class="btn btn-primary"
            style="background:rgba(220,20,20,0.85);border-color:rgba(255,50,50,0.6)"
            onclick="AVLive.openSetup()">🔴 Start Live</button>
        </div>
      </div>
    </div>
  `;
}

async function _liveHubInit(container) {
  // Expose AVLive helpers on window so inline onclick handlers work
  window.AVLive = window.AVLive || {};

  const user = _avlGetUser();
  if (!user) {
    document.getElementById('avl-auth-gate').style.display = '';
    document.getElementById('avl-hub-main').style.display = 'none';
    return null;
  }

  // Shared camera/mic state for setup flow
  let _setupStream = null;
  let _camOn = true;
  let _micOn = true;
  let _facingMode = 'user';

  // Detect mobile for flip button
  const isMobile = /android|iphone|ipad/i.test(navigator.userAgent);
  if (isMobile) {
    const flipBtn = document.getElementById('avl-btn-flip');
    if (flipBtn) flipBtn.style.display = '';
  }

  // ── Go Live setup helpers ─────────────────────────────────────────
  AVLive.openSetup = async function () {
    document.getElementById('avl-setup').style.display = '';
    document.getElementById('avl-hub-main').style.display = 'none';
    document.getElementById('avl-setup-err').style.display = 'none';
    await _startPreview();
  };

  AVLive.cancelSetup = function () {
    _stopPreview();
    document.getElementById('avl-setup').style.display = 'none';
    document.getElementById('avl-hub-main').style.display = '';
  };

  AVLive.toggleSetupCam = async function () {
    _camOn = !_camOn;
    const btn = document.getElementById('avl-btn-cam');
    const off = document.getElementById('avl-cam-off');
    const vid = document.getElementById('avl-preview');
    if (_setupStream) {
      _setupStream.getVideoTracks().forEach(t => { t.enabled = _camOn; });
    }
    if (btn) btn.textContent = `📷 Camera: ${_camOn ? 'ON' : 'OFF'}`;
    if (off) off.style.display = _camOn ? 'none' : '';
    if (vid) vid.style.display = _camOn ? 'block' : 'none';
  };

  AVLive.toggleSetupMic = function () {
    _micOn = !_micOn;
    if (_setupStream) {
      _setupStream.getAudioTracks().forEach(t => { t.enabled = _micOn; });
    }
    const btn = document.getElementById('avl-btn-mic');
    if (btn) btn.textContent = `🎤 Mic: ${_micOn ? 'ON' : 'OFF'}`;
  };

  AVLive.flipCamera = async function () {
    _facingMode = _facingMode === 'user' ? 'environment' : 'user';
    _stopPreview();
    await _startPreview();
  };

  AVLive.startLive = async function () {
    const title = (document.getElementById('avl-title')?.value || '').trim() || 'Avenora Live';
    const btn   = document.getElementById('avl-go-live-btn');
    const errEl = document.getElementById('avl-setup-err');
    const diagEl = document.getElementById('avl-setup-diag');

    errEl.style.display = 'none';
    if (diagEl) diagEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Starting…';

    // ── Diagnostics (never show secrets) ──────────────────────────────
    const diag = {
      step:            'init',
      firebaseProject: 'avenora-6e147',
      authUser:        null,
      uid:             null,
      firebaseCurrentUser: null,
      firestoreWrite:  null,
      roomId:          null,
      errorCode:       null,
      errorMessage:    null,
      errorStack:      null,
    };

    function _showDiag(msg, isError) {
      if (!diagEl) return;
      diagEl.style.display  = '';
      diagEl.style.color    = isError ? '#c0394a' : '#7cb9e8';
      diagEl.textContent    = msg;
    }

    function _showErr(friendly, technical) {
      errEl.textContent   = friendly;
      errEl.style.display = '';
      _showDiag(technical, true);
      console.error('[AVL] startLive failed', { ...diag, friendly, technical });
      btn.disabled  = false;
      btn.textContent = '🔴 GO LIVE';
    }

    try {
      // ── 1. Verify local user state ────────────────────────────────
      diag.step    = 'auth-state-check';
      diag.authUser = user ? (user.username || user.email || '(user object)') : null;
      diag.uid      = user?.uid || user?.id || null;

      if (!user || !diag.uid) {
        _showErr(
          'Please sign in to Avenora before going live.',
          'Auth: no user in LegendState — uid missing'
        );
        return;
      }

      // ── 2. Verify Firebase currentUser (live token, not cached UID) ──
      diag.step = 'firebase-current-user';
      let fbCurrentUser = null;
      try {
        const fbAuth = await window.AvenoraFirebase.getFirebaseAuth?.();
        fbCurrentUser = fbAuth?.currentUser || null;
      } catch (authErr) {
        diag.errorCode    = authErr.code || 'AUTH_LOAD_FAILED';
        diag.errorMessage = authErr.message;
      }
      diag.firebaseCurrentUser = fbCurrentUser ? fbCurrentUser.uid : null;

      if (!fbCurrentUser) {
        _showErr(
          'Please sign in to Avenora before going live.',
          `Auth: Firebase currentUser is null — uid=${diag.uid} is from cache only. ` +
          'Firebase session may have expired. Please sign out and sign in again.'
        );
        return;
      }

      // ── 3. Confirm the cached uid matches Firebase currentUser ───────
      if (fbCurrentUser.uid !== diag.uid) {
        console.warn(
          '[AVL] UID mismatch: LegendState uid=' + diag.uid +
          ' vs Firebase uid=' + fbCurrentUser.uid +
          '. Using Firebase uid.'
        );
        diag.uid = fbCurrentUser.uid;
      }

      // ── 4. Write liveRooms document ──────────────────────────────────
      diag.step = 'firestore-write';
      _showDiag('Starting live session…', false);

      const fs = await _avlFirestore();
      const { collection, addDoc, serverTimestamp } = await _avlFSImports();

      const roomData = {
        // Core identity fields required by Firestore rules and backend
        ownerUid:    diag.uid,                                    // matches request.auth.uid for Firestore rules
        hostId:      diag.uid,                                    // backward-compat alias
        hostName:    user.username || user.profile?.displayName || 'Creator',
        hostAvatar:  user.profile?.avatarUrl || '',
        title,
        platform:    'avenora',
        status:      'live',
        viewerCount: 0,
        likeCount:   0,
        createdAt:   serverTimestamp(),
        startedAt:   serverTimestamp(),
      };

      let roomRef;
      try {
        roomRef = await addDoc(collection(fs, 'liveRooms'), roomData);
      } catch (fsErr) {
        diag.errorCode    = fsErr.code   || 'FIRESTORE_WRITE_FAILED';
        diag.errorMessage = fsErr.message;
        diag.errorStack   = fsErr.stack?.split('\n').slice(0, 4).join(' | ');
        diag.firestoreWrite = 'failed';

        let hint = '';
        if (fsErr.code === 'permission-denied') {
          hint = ' — Firestore permission-denied: Firebase auth.uid must match hostId field. ' +
                 'Check firestore.rules liveRooms create rule.';
        } else if (fsErr.code === 'unauthenticated') {
          hint = ' — Firestore unauthenticated: Firebase session token is missing or invalid.';
        }

        _showErr(
          'Could not start live stream. Please try again.',
          `Firestore write failed: ${fsErr.code || 'unknown'} — ${fsErr.message}${hint}`
        );
        return;
      }

      diag.firestoreWrite = 'success';
      diag.roomId         = roomRef.id;
      diag.step           = 'complete';

      console.info('[AVL] Live session created', {
        roomId:          roomRef.id,
        uid:             diag.uid,
        firebaseProject: diag.firebaseProject,
        title,
      });

      _stopPreview();
      navigateTo(`live-room/${roomRef.id}`);

    } catch (err) {
      diag.errorCode    = err.code    || 'UNEXPECTED_ERROR';
      diag.errorMessage = err.message;
      diag.errorStack   = err.stack?.split('\n').slice(0, 4).join(' | ');
      console.error('[AVL] startLive unexpected error', { ...diag, err });
      _showErr(
        'Could not start live stream. Please try again.',
        `${diag.step}: ${err.message || 'Unexpected error'}` +
        (err.code ? ` (${err.code})` : '')
      );
    }
  };

  // ── Camera preview helpers ────────────────────────────────────────
  async function _startPreview() {
    const vid = document.getElementById('avl-preview');
    const off = document.getElementById('avl-cam-off');
    try {
      _setupStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: _facingMode },
        audio: true,
      });
      _camOn = true;
      _micOn = true;
      if (vid) { vid.srcObject = _setupStream; vid.style.display = 'block'; }
      if (off) off.style.display = 'none';
    } catch {
      if (off) off.style.display = '';
      if (vid) vid.style.display = 'none';
    }
  }

  function _stopPreview() {
    if (_setupStream) { _setupStream.getTracks().forEach(t => t.stop()); _setupStream = null; }
    const vid = document.getElementById('avl-preview');
    if (vid) vid.srcObject = null;
  }

  // ── Rooms grid ───────────────────────────────────────────────────
  async function _loadRooms() {
    const grid = document.getElementById('avl-rooms-grid');
    const empty = document.getElementById('avl-empty');
    const countEl = document.getElementById('avl-live-count');
    if (!grid) return null;

    try {
      const fs = await _avlFirestore();
      const { collection, query, where, orderBy, onSnapshot } = await _avlFSImports();
      const q = query(
        collection(fs, 'liveRooms'),
        where('status', '==', 'live'),
        orderBy('startedAt', 'desc')
      );

      const unsub = onSnapshot(q, snap => {
        const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (countEl) countEl.textContent = rooms.length === 0 ? 'No one is live right now' : `${rooms.length} room${rooms.length === 1 ? '' : 's'} live`;
        if (rooms.length === 0) {
          grid.innerHTML = '';
          if (empty) empty.style.display = '';
        } else {
          if (empty) empty.style.display = 'none';
          grid.innerHTML = rooms.map(r => `
            <div class="card avl-room-card" style="cursor:pointer;border-color:rgba(255,50,50,0.25)"
              onclick="navigateTo('live-room/${r.id}')">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <div class="avl-live-dot" style="width:8px;height:8px;border-radius:50%;background:#ff3232;flex-shrink:0;animation:pulse 1.5s infinite"></div>
                <span style="font-size:0.75rem;font-weight:700;color:#ff3232;letter-spacing:0.1em">LIVE</span>
                <span style="font-size:0.78rem;color:var(--text-muted);margin-left:auto">${r.viewerCount || 0} watching</span>
              </div>
              <div style="font-weight:600;margin-bottom:4px;font-size:0.95rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
                ${escapeHtml(r.title || 'Untitled Stream')}
              </div>
              <div style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(r.hostName || 'Creator')}</div>
            </div>
          `).join('');
        }
      }, () => {
        if (grid) grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Could not load live rooms.</p>';
      });
      return unsub;
    } catch (err) {
      console.warn('[AVL] Could not load rooms:', err);
      if (grid) grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">Live rooms unavailable.</p>';
      return null;
    }
  }

  const unsub = await _loadRooms();
  return function cleanup() {
    _stopPreview();
    if (typeof unsub === 'function') unsub();
  };
}

/* ══════════════════════════════════════════════════════════════════════
   LIVE ROOM — viewer + host controls
   ══════════════════════════════════════════════════════════════════════ */

function _liveRoomHTML(roomId) {
  if (!roomId) {
    return `
      <div class="error-state" style="min-height:60vh">
        <div class="error-icon">📡</div>
        <h3>Room Not Found</h3>
        <p>This live room does not exist or has ended.</p>
        <button class="btn btn-primary" onclick="navigateTo('live')">← Back to Live Hub</button>
      </div>`;
  }
  return `
    <div style="padding:var(--space-lg);max-width:900px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-md)">
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('live')">← Live Hub</button>
        <span id="avlr-live-badge" style="font-size:0.72rem;font-weight:700;color:#ff3232;letter-spacing:0.1em;background:rgba(255,50,50,0.12);padding:2px 8px;border-radius:12px;border:1px solid rgba(255,50,50,0.3)">LIVE</span>
        <span id="avlr-title" style="font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Loading…</span>
        <span id="avlr-viewers" style="margin-left:auto;font-size:0.8rem;color:var(--text-muted)"></span>
      </div>

      <!-- Video area -->
      <div style="background:#080808;border-radius:10px;overflow:hidden;margin-bottom:var(--space-md);aspect-ratio:16/9;position:relative">
        <video id="avlr-video" autoplay playsinline style="width:100%;height:100%;object-fit:contain;display:block"></video>
        <div id="avlr-ended-overlay" style="display:none;position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.85)">
          <div style="font-size:2.5rem;margin-bottom:12px">📡</div>
          <h3 style="margin-bottom:8px">Stream Ended</h3>
          <button class="btn btn-primary" onclick="navigateTo('live')">← Back to Live Hub</button>
        </div>
      </div>

      <!-- Host controls (shown for room creator) -->
      <div id="avlr-host-controls" style="display:none;margin-bottom:var(--space-md)">
        <div class="card" style="border-color:rgba(255,50,50,0.3);padding:var(--space-md)">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="avlr-btn-cam"  class="btn btn-ghost btn-sm" onclick="AVLRoom.toggleCam()">📷 Cam: ON</button>
            <button id="avlr-btn-mic"  class="btn btn-ghost btn-sm" onclick="AVLRoom.toggleMic()">🎤 Mic: ON</button>
            <button class="btn btn-ghost btn-sm danger" style="margin-left:auto" onclick="AVLRoom.endLive()">⏹ End Stream</button>
          </div>
        </div>
      </div>

      <!-- Chat -->
      <div class="card" style="padding:var(--space-md)">
        <h4 style="margin-bottom:var(--space-sm)">Live Chat</h4>
        <div id="avlr-chat" style="height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:var(--space-sm);font-size:0.85rem">
          <p style="color:var(--text-muted);text-align:center;margin:auto">Chat loading…</p>
        </div>
        <div id="avlr-chat-input-wrap" style="display:flex;gap:8px">
          <input class="form-input" id="avlr-chat-input" placeholder="Say something…" maxlength="300" style="flex:1"
            onkeydown="if(event.key==='Enter')AVLRoom.sendChat()">
          <button class="btn btn-primary btn-sm" onclick="AVLRoom.sendChat()">Send</button>
        </div>
      </div>
    </div>
  `;
}

async function _liveRoomInit(container, roomId) {
  if (!roomId) return null;

  window.AVLRoom = {};
  const user = _avlGetUser();
  const chatEl = document.getElementById('avlr-chat');

  let _unsubRoom = null;
  let _unsubChat = null;
  let _isHost = false;

  try {
    const fs = await _avlFirestore();
    const { doc, getDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy, limit, serverTimestamp, deleteDoc } = await _avlFSImports();

    // Load room doc
    const roomDoc = await getDoc(doc(fs, 'liveRooms', roomId));
    if (!roomDoc.exists() || roomDoc.data().status !== 'live') {
      document.getElementById('avlr-ended-overlay').style.display = 'flex';
      return null;
    }

    const roomData = roomDoc.data();
    _isHost = user && (user.uid === roomData.hostId || user.id === roomData.hostId);
    document.getElementById('avlr-title').textContent = roomData.title || 'Live Stream';
    document.getElementById('avlr-viewers').textContent = `${roomData.viewerCount || 0} watching`;

    if (_isHost) {
      document.getElementById('avlr-host-controls').style.display = '';
    }

    // Watch room status
    _unsubRoom = onSnapshot(doc(fs, 'liveRooms', roomId), snap => {
      if (!snap.exists() || snap.data().status !== 'live') {
        document.getElementById('avlr-ended-overlay').style.display = 'flex';
      }
      const d = snap.data() || {};
      const el = document.getElementById('avlr-viewers');
      if (el) el.textContent = `${d.viewerCount || 0} watching`;
    });

    // Live chat
    const chatQ = query(collection(fs, 'liveRooms', roomId, 'liveMessages'), orderBy('ts', 'asc'), limit(100));
    _unsubChat = onSnapshot(chatQ, snap => {
      if (!chatEl) return;
      if (snap.empty) { chatEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;margin:auto">No messages yet</p>'; return; }
      chatEl.innerHTML = snap.docs.map(d => {
        const m = d.data();
        return `<div><span style="font-weight:600;color:var(--avenora-gold)">${escapeHtml(m.name || 'User')}</span> <span style="color:var(--text-primary)">${escapeHtml(m.text || '')}</span></div>`;
      }).join('');
      chatEl.scrollTop = chatEl.scrollHeight;
    });

    // Send chat
    AVLRoom.sendChat = async function () {
      if (!user) { Modal.open('auth-modal'); return; }
      const input = document.getElementById('avlr-chat-input');
      const text = (input?.value || '').trim();
      if (!text) return;
      input.value = '';
      try {
        await addDoc(collection(fs, 'liveRooms', roomId, 'liveMessages'), {
          uid:  user.uid || user.id || '',
          name: user.username || user.profile?.displayName || 'User',
          text,
          ts:   serverTimestamp(),
        });
      } catch (e) { console.warn('[AVL] Chat send failed:', e); }
    };

    // Host controls
    let _camOn = true, _micOn = true;
    AVLRoom.toggleCam = function () {
      _camOn = !_camOn;
      const btn = document.getElementById('avlr-btn-cam');
      if (btn) btn.textContent = `📷 Cam: ${_camOn ? 'ON' : 'OFF'}`;
      // If localStream is attached to video, toggle tracks
      const vid = document.getElementById('avlr-video');
      if (vid?.srcObject) vid.srcObject.getVideoTracks().forEach(t => { t.enabled = _camOn; });
    };

    AVLRoom.toggleMic = function () {
      _micOn = !_micOn;
      const btn = document.getElementById('avlr-btn-mic');
      if (btn) btn.textContent = `🎤 Mic: ${_micOn ? 'ON' : 'OFF'}`;
      const vid = document.getElementById('avlr-video');
      if (vid?.srcObject) vid.srcObject.getAudioTracks().forEach(t => { t.enabled = _micOn; });
    };

    AVLRoom.endLive = async function () {
      if (!confirm('End your live stream?')) return;
      try { await updateDoc(doc(fs, 'liveRooms', roomId), { status: 'ended', endedAt: serverTimestamp() }); } catch {}
      navigateTo('live');
    };

  } catch (err) {
    console.error('[AVL] Room init error:', err);
    if (chatEl) chatEl.innerHTML = '<p style="color:var(--text-muted);text-align:center">Could not connect to this room.</p>';
  }

  return function cleanup() {
    if (typeof _unsubRoom === 'function') _unsubRoom();
    if (typeof _unsubChat === 'function') _unsubChat();
  };
}

/* ══════════════════════════════════════════════════════════════════════
   SHARED HELPERS — Firebase access via window.AvenoraFirebase
   ══════════════════════════════════════════════════════════════════════ */

/** Get the current user from LegendState or LegendAPI. */
function _avlGetUser() {
  return LegendState.get('user') || LegendAPI.auth.getUser() || null;
}

/** Resolve Firestore instance from the already-initialised app. */
async function _avlFirestore() {
  if (window.AvenoraFirebase?._fsInstance) return window.AvenoraFirebase._fsInstance;
  const { getFirestore } = await import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js`);
  const app = await window.AvenoraFirebase.getApp?.() || null;
  if (!app) throw new Error('Firebase app not ready');
  window.AvenoraFirebase._fsInstance = getFirestore(app);
  return window.AvenoraFirebase._fsInstance;
}

/** Cache Firestore named exports to avoid repeated dynamic imports. */
let _fsCached = null;
async function _avlFSImports() {
  if (_fsCached) return _fsCached;
  const m = await import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js`);
  _fsCached = m;
  return m;
}
