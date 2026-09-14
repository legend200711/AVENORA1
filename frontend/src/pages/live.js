/**
 * AVENORA — Avenora Live
 * Navigation bridge that opens the Avenora Live Hub.
 */

registerPage('live', {
  async render(container) {
    container.innerHTML = `
      <div style="padding:var(--space-lg)">
        <div class="page-header" style="padding-top:var(--space-xl);padding-bottom:var(--space-lg)">
          <h1 style="font-family:var(--font-display);letter-spacing:0.1em;margin-bottom:4px">
            <span style="color:var(--neon-red)">AVENORA</span> LIVE
          </h1>
          <p class="tagline">LIVE STREAMING</p>
        </div>

        <div class="container-lg">
          <!-- Launch panel -->
          <div class="card" style="border-color:rgba(255,50,50,0.35);margin-bottom:var(--space-xl);max-width:560px;margin-left:auto;margin-right:auto">
            <div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-lg);padding:var(--space-lg) var(--space-md)">

              <div style="font-size:3rem;line-height:1" aria-hidden="true">📡</div>

              <div style="text-align:center">
                <h2 style="font-family:var(--font-display);letter-spacing:0.08em;color:var(--neon-red);margin-bottom:8px">
                  AVENORA LIVE
                </h2>
                <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.6;max-width:400px">
                  Browser-based live streaming with real-time chat,
                  guest boxes, reactions, and room presence.
                </p>
              </div>

              <div style="display:flex;flex-direction:column;gap:var(--space-sm);width:100%;max-width:320px">
                <button
                  class="btn btn-primary"
                  style="background:rgba(220,20,20,0.85);border-color:rgba(255,50,50,0.6);font-family:var(--font-display);letter-spacing:0.08em;gap:8px"
                  onclick="window.location.href='/live-hub.html'"
                  aria-label="Open Avenora Live Hub"
                >
                  <span style="font-size:0.9rem">🔴</span> OPEN LIVE HUB
                </button>
                <button
                  class="btn btn-ghost btn-sm"
                  style="color:var(--text-muted);font-size:0.8rem"
                  onclick="window.location.href='/live.html'"
                  aria-label="Go live directly"
                >
                  ↗ Go Live directly
                </button>
              </div>

              <p style="font-size:0.72rem;color:var(--text-muted);text-align:center;line-height:1.5">
                Opens the Avenora Live interface.<br>
                Sign in with your existing account to continue.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    // No cleanup needed — no timers or streams started
    return () => {};
  }
});
