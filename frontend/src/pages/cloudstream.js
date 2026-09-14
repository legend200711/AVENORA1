/**
 * AVENORA — Avenora 24-Hour Cloud Stream
 * Navigation bridge that opens the Avenora Cloud Stream interface.
 */

registerPage('cloudstream', {
  async render(container) {
    container.innerHTML = `
      <div style="padding:var(--space-lg)">
        <div class="page-header" style="padding-top:var(--space-xl);padding-bottom:var(--space-lg)">
          <h1 style="font-family:var(--font-display);letter-spacing:0.1em;margin-bottom:4px">
            <span style="color:var(--neon-green)">AVENORA</span> 24-HOUR CLOUD STREAM
          </h1>
          <p class="tagline">24-HOUR ALWAYS-ON CHANNEL</p>
        </div>

        <div class="container-lg">
          <!-- Launch panel -->
          <div class="card" style="border-color:rgba(0,200,100,0.35);margin-bottom:var(--space-xl);max-width:560px;margin-left:auto;margin-right:auto">
            <div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-lg);padding:var(--space-lg) var(--space-md)">

              <div style="font-size:3rem;line-height:1" aria-hidden="true">☁️</div>

              <div style="text-align:center">
                <h2 style="font-family:var(--font-display);letter-spacing:0.08em;color:var(--neon-green);margin-bottom:8px">
                  AVENORA 24-HOUR CLOUD STREAM
                </h2>
                <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.6;max-width:400px">
                  24-hour continuous audio and video broadcasting with
                  always-on programming and real-time Now Playing sync.
                </p>
              </div>

              <div style="display:flex;flex-direction:column;gap:var(--space-sm);width:100%;max-width:320px">
                <button
                  class="btn btn-primary"
                  style="background:rgba(0,160,80,0.85);border-color:rgba(0,200,100,0.6);font-family:var(--font-display);letter-spacing:0.08em;gap:8px"
                  onclick="window.location.href='/24-hour-cloud-stream/index.html'"
                  aria-label="Open Avenora 24-Hour Cloud Stream"
                >
                  <span style="font-size:0.9rem">☁️</span> OPEN CLOUD STREAM
                </button>
              </div>

              <!-- Feature highlights -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;font-size:0.78rem;color:var(--text-muted)">
                <div style="display:flex;gap:6px;align-items:flex-start">
                  <span>🎵</span><span>Continuous audio playlist</span>
                </div>
                <div style="display:flex;gap:6px;align-items:flex-start">
                  <span>🔄</span><span>Auto-scheduled programming</span>
                </div>
                <div style="display:flex;gap:6px;align-items:flex-start">
                  <span>🔥</span><span>Real-time Now Playing sync</span>
                </div>
                <div style="display:flex;gap:6px;align-items:flex-start">
                  <span>⚡</span><span>Always-on stream state</span>
                </div>
              </div>

              <p style="font-size:0.72rem;color:var(--text-muted);text-align:center;line-height:1.5">
                Opens the Avenora 24-Hour Cloud Stream interface.<br>
                Sign in with your existing account to manage or listen.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    // No cleanup needed
    return () => {};
  }
});
