/**
 * AVENORA — Avenora 24-Hour Cloud Stream (SPA page)
 *
 * Renders entirely inside the main SPA — no standalone HTML redirects.
 *
 * The Cloud Stream interface is a complex ES module app (importmap + type=module
 * scripts, audio Web APIs, Firebase Firestore auth).  It is embedded here as
 * an <iframe> pointing to cloud-stream/index.html which is deployed alongside
 * the main app under frontend/cloud-stream/.
 *
 * This avoids rewriting ~1 500 lines of ES module code while still keeping
 * the feature inside the single-page entry point with no external redirects.
 */

registerPage('cloudstream', {
  async render(container) {
    // Derive the base path so the iframe resolves correctly on any host
    // (GitHub Pages: /AVENORA1/, local dev: /).
    const basePath = (window.AVENORA_BUILD && window.AVENORA_BUILD.basePath) || '/';
    const src = basePath.replace(/\/$/, '') + '/cloud-stream/index.html';

    container.innerHTML = `
      <div style="padding:var(--space-lg)">
        <div class="page-header" style="padding-top:var(--space-xl);padding-bottom:var(--space-md)">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:var(--space-md)">
            <div>
              <h1 style="font-family:var(--font-display);letter-spacing:0.1em;margin-bottom:4px">
                <span style="color:var(--neon-green)">AVENORA</span> 24-HOUR CLOUD STREAM
              </h1>
              <p class="tagline">24-HOUR ALWAYS-ON CHANNEL</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('cloudstudio')"
                    title="Manage playlists and upload music for your broadcast">
              🎛 Creator Studio
            </button>
          </div>
        </div>

        <div style="position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--border-subtle);background:#060810">
          <iframe
            id="csr-frame"
            src="${escapeHtml(src)}"
            style="width:100%;min-height:85vh;border:none;display:block"
            allow="camera; microphone; autoplay; clipboard-write"
            title="Avenora 24-Hour Cloud Stream"
            loading="lazy"
          ></iframe>
        </div>
      </div>
    `;

    // No timers or streams started in this shell
    return () => {};
  }
});
