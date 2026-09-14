/**
 * AUTH PAGE (standalone route if needed, but modal is primary)
 */
registerPage('auth', {
  async render(container) {
    // If already logged in, redirect to hub
    if (LegendAPI.auth.isLoggedIn()) {
      navigateTo('hub');
      return;
    }
    // Open auth modal and go to hub
    navigateTo('hub');
    setTimeout(() => Modal.open('auth-modal'), 100);
    return () => {};
  }
});
