/**
 * AVENORA DJ SYSTEM
 * Real browser-based DJ with dual decks, crossfader, EQ, BPM, visualizer
 * Uses Web Audio API for actual audio processing
 */

registerPage('dj', {
  async render(container) {
    container.innerHTML = `
      <div id="dj-app" style="padding:var(--space-lg)">
        <div class="page-header" style="padding-top:var(--space-xl);padding-bottom:var(--space-lg)">
          <h1 style="font-family:var(--font-display);letter-spacing:0.1em">
            <span style="color:var(--neon-blue)">AVENORA</span> DJ SYSTEM
          </h1>
          <p class="tagline">PROFESSIONAL BROWSER DJ STUDIO</p>
        </div>

        <!-- Mode switcher -->
        <div style="display:flex;justify-content:center;gap:var(--space-sm);margin-bottom:var(--space-xl)">
          <button class="btn btn-outline" id="mode-listen" onclick="setDJMode('listen')">LISTEN</button>
          <button class="btn btn-primary" id="mode-dj" onclick="setDJMode('dj')">DJ</button>
          <button class="btn btn-outline" id="mode-broadcast" onclick="setDJMode('broadcast')">BROADCAST</button>
        </div>

        <!-- Main DJ interface -->
        <div id="dj-interface" style="max-width:1200px;margin:0 auto">
          
          <!-- Decks -->
          <div id="dj-decks-grid" style="display:grid;grid-template-columns:1fr auto 1fr;gap:var(--space-md);margin-bottom:var(--space-lg)">
            
            <!-- Deck A -->
            ${renderDeckHTML('A')}

            <!-- Mixer -->
            <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:var(--space-md);min-width:140px;border-color:var(--border-blue)">
              <h4 style="font-family:var(--font-display);color:var(--neon-blue);letter-spacing:0.1em;font-size:0.9rem">MIXER</h4>
              
              <!-- EQ labels -->
              <div style="display:flex;flex-direction:column;gap:var(--space-sm);width:100%">
                ${renderEQKnob('Master', 'master')}
                ${renderEQKnob('Bass A', 'bass-a')}
                ${renderEQKnob('Mid A', 'mid-a')}
                ${renderEQKnob('Treble A', 'treble-a')}
                <div class="divider"></div>
                ${renderEQKnob('Bass B', 'bass-b')}
                ${renderEQKnob('Mid B', 'mid-b')}
                ${renderEQKnob('Treble B', 'treble-b')}
              </div>

              <!-- Crossfader -->
              <div style="width:100%">
                <p style="font-size:0.7rem;color:var(--text-muted);text-align:center;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px">CROSSFADER</p>
                <div style="display:flex;align-items:center;gap:4px">
                  <span style="font-size:0.7rem;color:var(--neon-blue)">A</span>
                  <input type="range" id="crossfader" min="0" max="100" value="50" 
                         style="flex:1;accent-color:var(--neon-blue)"
                         oninput="djCrossfade(this.value)" aria-label="Crossfader">
                  <span style="font-size:0.7rem;color:var(--neon-green)">B</span>
                </div>
              </div>
            </div>

            <!-- Deck B -->
            ${renderDeckHTML('B')}
          </div>

          <!-- Visualizer -->
          <div class="card" style="margin-bottom:var(--space-lg);border-color:var(--border-blue)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm)">
              <h4 style="font-family:var(--font-display);color:var(--neon-blue);letter-spacing:0.08em">VISUALIZER</h4>
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm" onclick="djSetViz('bars')">BARS</button>
                <button class="btn btn-ghost btn-sm" onclick="djSetViz('wave')">WAVE</button>
                <button class="btn btn-ghost btn-sm" onclick="djSetViz('circle')">CIRCLE</button>
              </div>
            </div>
            <canvas id="dj-visualizer" style="width:100%;height:120px;border-radius:var(--radius-md);background:var(--bg-secondary)"></canvas>
          </div>

          <!-- Library -->
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md)">
            <!-- Import -->
            <div class="card">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md)">
                <h4 style="font-family:var(--font-display);color:var(--neon-blue);letter-spacing:0.08em">MUSIC LIBRARY</h4>
                <button class="btn btn-primary btn-sm" onclick="djImport()">📂 IMPORT</button>
              </div>
              <div class="search-bar" style="margin-bottom:var(--space-md)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="search" placeholder="Search tracks..." id="dj-search" oninput="djSearchTracks(this.value)">
              </div>
              <div id="dj-library" style="max-height:240px;overflow-y:auto">
                <p style="text-align:center;color:var(--text-muted);padding:var(--space-lg);font-size:0.85rem">Import audio files to build your library</p>
              </div>
            </div>

            <!-- Playlists -->
            <div class="card">
              <h4 style="font-family:var(--font-display);color:var(--neon-green);letter-spacing:0.08em;margin-bottom:var(--space-md)">PLAYLISTS</h4>
              <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
                ${['AVENORA HITS','AVENORA ESSENTIALS','AVENORA CHILL','AVENORA ROCK','24/7 AVENORA RADIO'].map(p => `
                  <div class="track-row" onclick="loadDJPlaylist('${p}')">
                    <span style="font-size:1.2rem">🎵</span>
                    <span style="flex:1;font-weight:600;font-size:0.85rem">${p}</span>
                    <span style="font-size:0.75rem;color:var(--text-muted)">→</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    initDJSystem();
    return () => cleanupDJSystem();
  }
});

function renderDeckHTML(deck) {
  const d = deck.toLowerCase();
  const color = deck === 'A' ? 'var(--neon-blue)' : 'var(--neon-green)';
  const borderColor = deck === 'A' ? 'var(--border-blue)' : 'var(--border-green)';

  return `
    <div class="card" id="deck-${d}" style="border-color:${borderColor}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md)">
        <h4 style="font-family:var(--font-display);color:${color};letter-spacing:0.12em;font-size:1rem">DECK ${deck}</h4>
        <button class="btn btn-ghost btn-sm" onclick="djLoadToQueue('${deck}')">QUEUE</button>
      </div>

      <!-- Track info -->
      <div style="background:var(--bg-secondary);border-radius:var(--radius-md);padding:var(--space-md);margin-bottom:var(--space-md);min-height:60px">
        <p id="deck-${d}-title" class="truncate" style="font-weight:600;font-size:0.9rem">No track loaded</p>
        <p id="deck-${d}-bpm" style="color:var(--text-muted);font-size:0.8rem">BPM: --</p>
      </div>

      <!-- Progress -->
      <div class="progress-bar" style="cursor:pointer;margin-bottom:4px" onclick="djSeek('${deck}', event, this)">
        <div class="progress-fill" id="deck-${d}-prog" style="width:0%;background:${color}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-bottom:var(--space-md)">
        <span id="deck-${d}-time">0:00</span>
        <span id="deck-${d}-dur">0:00</span>
      </div>

      <!-- Controls -->
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:var(--space-md)">
        <button class="btn btn-ghost btn-sm" onclick="djPrev('${deck}')" aria-label="Previous">⏮</button>
        <button class="btn btn-ghost btn-sm" id="deck-${d}-cue" onclick="djCue('${deck}')" aria-label="Cue" style="color:var(--neon-orange)">CUE</button>
        <button class="btn ${deck === 'A' ? 'btn-primary' : 'btn-green'}" 
                style="width:44px;height:44px;border-radius:50%;padding:0"
                id="deck-${d}-play" onclick="djTogglePlay('${deck}')" aria-label="Play/Pause">▶</button>
        <button class="btn btn-ghost btn-sm" onclick="djNext('${deck}')" aria-label="Next">⏭</button>
        <button class="btn btn-ghost btn-sm" onclick="djSync('${deck}')" title="Sync BPM" aria-label="Sync">SYNC</button>
      </div>

      <!-- Volume -->
      <div style="display:flex;align-items:center;gap:var(--space-sm)">
        <span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;width:24px">VOL</span>
        <input type="range" min="0" max="100" value="80" id="deck-${d}-vol"
               style="flex:1;accent-color:${color}"
               oninput="djSetVolume('${deck}', this.value)" aria-label="Deck ${deck} volume">
        <span id="deck-${d}-vol-label" style="font-size:0.75rem;color:var(--text-muted);min-width:32px">80%</span>
      </div>

      <!-- Load button -->
      <button class="btn btn-ghost btn-sm w-full" style="margin-top:var(--space-sm)" onclick="djLoadToDecks('${deck}')">
        📂 LOAD TRACK
      </button>
    </div>
  `;
}

function renderEQKnob(label, id) {
  return `
    <div style="display:flex;align-items:center;gap:var(--space-sm)">
      <span style="font-size:0.7rem;color:var(--text-muted);min-width:50px;text-align:right">${label}</span>
      <input type="range" min="-20" max="20" value="0" id="eq-${id}"
             style="flex:1;accent-color:var(--neon-blue)"
             oninput="djEQ('${id}', this.value)" aria-label="${label} EQ">
      <span id="eq-${id}-val" style="font-size:0.7rem;color:var(--text-muted);min-width:28px;text-align:right">0dB</span>
    </div>
  `;
}

// ─── DJ Audio Engine ──────────────────────────────────────
const DJ = {
  audioCtx: null,
  analyser: null,
  visualizer: null,
  decks: {
    A: { audio: null, gainNode: null, bassFilter: null, midFilter: null, trebleFilter: null, isPlaying: false, cuePoint: 0 },
    B: { audio: null, gainNode: null, bassFilter: null, midFilter: null, trebleFilter: null, isPlaying: false, cuePoint: 0 },
  },
  masterGain: null,
  crossfadeValue: 50,
  library: [],
  mode: 'dj',
};

function initDJSystem() {
  try {
    DJ.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    DJ.masterGain = DJ.audioCtx.createGain();
    DJ.masterGain.gain.value = 0.8;

    DJ.analyser = DJ.audioCtx.createAnalyser();
    DJ.analyser.fftSize = 512;
    DJ.masterGain.connect(DJ.analyser);
    DJ.analyser.connect(DJ.audioCtx.destination);

    // Init both decks
    ['A', 'B'].forEach(deck => {
      const audio = document.createElement('audio');
      audio.preload = 'auto';
      document.body.appendChild(audio);
      DJ.decks[deck].audio = audio;

      const src = DJ.audioCtx.createMediaElementSource(audio);
      const gain = DJ.audioCtx.createGain();
      gain.gain.value = 0.8;

      // EQ filters
      const bass = DJ.audioCtx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 200;
      const mid = DJ.audioCtx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
      const treble = DJ.audioCtx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 3000;

      src.connect(bass); bass.connect(mid); mid.connect(treble); treble.connect(gain); gain.connect(DJ.masterGain);

      DJ.decks[deck].gainNode = gain;
      DJ.decks[deck].bassFilter = bass;
      DJ.decks[deck].midFilter = mid;
      DJ.decks[deck].trebleFilter = treble;

      audio.addEventListener('timeupdate', () => djUpdateProgress(deck));
      audio.addEventListener('ended', () => { DJ.decks[deck].isPlaying = false; djUpdatePlayBtn(deck); });
      audio.addEventListener('loadedmetadata', () => {
        const dur = document.getElementById(`deck-${deck.toLowerCase()}-dur`);
        if (dur) dur.textContent = formatDuration(audio.duration);
      });
    });

    // Visualizer
    const canvas = document.getElementById('dj-visualizer');
    if (canvas && LegendVisual) {
      DJ.visualizer = new LegendVisual.MusicVisualizer(canvas, DJ.analyser, { mode: 'bars', color: '#00aaff' });
      DJ.visualizer.start();
    }

    // Progress update loop
    DJ.progressInterval = setInterval(() => {
      ['A', 'B'].forEach(deck => djUpdateProgress(deck));
    }, 100);

  } catch (err) {
    Toast.error('Web Audio API not available: ' + err.message);
  }
}

function cleanupDJSystem() {
  clearInterval(DJ.progressInterval);
  ['A', 'B'].forEach(deck => {
    const audio = DJ.decks[deck]?.audio;
    if (audio) { audio.pause(); audio.src = ''; audio.remove(); }
  });
  if (DJ.visualizer) DJ.visualizer.stop();
  if (DJ.audioCtx) DJ.audioCtx.close();
}

window.setDJMode = function (mode) {
  DJ.mode = mode;
  ['listen', 'dj', 'broadcast'].forEach(m => {
    const btn = document.getElementById(`mode-${m}`);
    if (btn) btn.className = m === mode ? 'btn btn-primary' : 'btn btn-outline';
  });
  if (mode === 'broadcast') {
    Toast.info('Broadcast mode: Recording/streaming output requires backend capture. Real-time audio in browser.');
  }
};

window.djSetViz = function (mode) {
  if (DJ.visualizer) {
    DJ.visualizer.stop();
    DJ.visualizer.opts.mode = mode;
    DJ.visualizer.start();
  }
};

window.djImport = function () {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.multiple = true;
  if ('webkitdirectory' in input && confirm('Import entire folder?')) input.webkitdirectory = true;

  input.onchange = (e) => {
    const files = Array.from(e.target.files);
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
    const valid = files.filter(f => audioExts.some(ext => f.name.toLowerCase().endsWith(ext)));

    const newTracks = valid.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(f),
      file: f,
    }));

    DJ.library.push(...newTracks);
    djRenderLibrary(DJ.library);
    Toast.success(`${newTracks.length} tracks imported to DJ library!`);
  };
  input.click();
};

window.djSearchTracks = debounce(function (query) {
  const filtered = query.trim()
    ? DJ.library.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : DJ.library;
  djRenderLibrary(filtered);
}, 200);

function djRenderLibrary(tracks) {
  const el = document.getElementById('dj-library');
  if (!el) return;
  if (!tracks.length) {
    el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:var(--space-md);font-size:0.85rem">No tracks found</p>';
    return;
  }
  el.innerHTML = tracks.map(t => `
    <div class="track-row">
      <div class="track-info">
        <div class="track-title truncate" style="font-size:0.85rem">${escapeHtml(t.name)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="djLoadTrackToDeck('A', '${t.id}')" style="color:var(--neon-blue);font-size:0.75rem">→A</button>
      <button class="btn btn-ghost btn-sm" onclick="djLoadTrackToDeck('B', '${t.id}')" style="color:var(--neon-green);font-size:0.75rem">→B</button>
    </div>
  `).join('');
}

window.djLoadTrackToDeck = function (deck, trackId) {
  const track = DJ.library.find(t => t.id === trackId);
  if (!track) return;

  const d = DJ.decks[deck];
  const audio = d.audio;
  if (!audio) return;

  audio.src = track.url;
  audio.load();

  const title = document.getElementById(`deck-${deck.toLowerCase()}-title`);
  const bpm = document.getElementById(`deck-${deck.toLowerCase()}-bpm`);
  if (title) title.textContent = track.name;
  if (bpm) bpm.textContent = 'BPM: detecting...';

  Toast.info(`"${track.name}" loaded to Deck ${deck}`);
};

window.djLoadToDecks = function (deck) { djImportToSpecificDeck(deck); };
window.djLoadToQueue = function (deck) { Toast.info(`Drag tracks from the library to Deck ${deck}`); };

function djImportToSpecificDeck(deck) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const track = { id: Date.now().toString(), name: file.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(file) };
    DJ.library.push(track);
    djLoadTrackToDeck(deck, track.id);
    djRenderLibrary(DJ.library);
  };
  input.click();
}

window.djTogglePlay = function (deck) {
  if (DJ.audioCtx?.state === 'suspended') DJ.audioCtx.resume();
  const d = DJ.decks[deck];
  const audio = d.audio;
  if (!audio) return;
  if (d.isPlaying) {
    audio.pause();
    d.isPlaying = false;
  } else {
    audio.play().then(() => { d.isPlaying = true; }).catch(err => Toast.error(`Deck ${deck}: ${err.message}`));
  }
  djUpdatePlayBtn(deck);
};

function djUpdatePlayBtn(deck) {
  const btn = document.getElementById(`deck-${deck.toLowerCase()}-play`);
  if (btn) btn.textContent = DJ.decks[deck].isPlaying ? '⏸' : '▶';
}

window.djPrev = function (deck) {
  const audio = DJ.decks[deck]?.audio;
  if (audio) audio.currentTime = Math.max(0, audio.currentTime - 10);
};
window.djNext = function (deck) {
  const audio = DJ.decks[deck]?.audio;
  if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
};

window.djCue = function (deck) {
  const d = DJ.decks[deck];
  if (!d.audio) return;
  if (d.isPlaying) {
    d.cuePoint = d.audio.currentTime;
    Toast.info(`Cue point set at ${formatDuration(d.cuePoint)}`);
  } else {
    d.audio.currentTime = d.cuePoint;
  }
};

window.djSync = function (deck) {
  Toast.info('BPM sync: detecting BPM requires audio analysis — feature available with Essentia.js integration.');
};

window.djCrossfade = function (val) {
  DJ.crossfadeValue = parseInt(val);
  const aGain = (100 - val) / 100;
  const bGain = val / 100;
  if (DJ.decks.A.gainNode) DJ.decks.A.gainNode.gain.value = aGain;
  if (DJ.decks.B.gainNode) DJ.decks.B.gainNode.gain.value = bGain;
};

window.djSetVolume = function (deck, val) {
  const d = DJ.decks[deck];
  if (d.gainNode) d.gainNode.gain.value = val / 100;
  const label = document.getElementById(`deck-${deck.toLowerCase()}-vol-label`);
  if (label) label.textContent = `${val}%`;
};

window.djEQ = function (id, val) {
  const valEl = document.getElementById(`eq-${id}-val`);
  if (valEl) valEl.textContent = `${val >= 0 ? '+' : ''}${val}dB`;

  const gainDb = parseFloat(val);
  const [type, deckLetter] = id.split('-');

  if (deckLetter === 'a' || deckLetter === 'b') {
    const deck = deckLetter.toUpperCase();
    const d = DJ.decks[deck];
    const filterMap = { bass: d.bassFilter, mid: d.midFilter, treble: d.trebleFilter };
    const filter = filterMap[type];
    if (filter) filter.gain.value = gainDb;
  } else if (id === 'master') {
    if (DJ.masterGain) DJ.masterGain.gain.value = (parseInt(val) + 20) / 40;
  }
};

window.djSeek = function (deck, e, bar) {
  const audio = DJ.decks[deck]?.audio;
  if (!audio || !audio.duration) return;
  const rect = bar.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
};

function djUpdateProgress(deck) {
  const audio = DJ.decks[deck]?.audio;
  if (!audio) return;
  const d = deck.toLowerCase();
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  const prog = document.getElementById(`deck-${d}-prog`);
  if (prog) prog.style.width = `${pct}%`;
  const time = document.getElementById(`deck-${d}-time`);
  if (time) time.textContent = formatDuration(audio.currentTime);
}

window.loadDJPlaylist = function (name) {
  Toast.info(`Playlist "${name}" — add your tracks to the library and they will be organized into this playlist.`);
};
