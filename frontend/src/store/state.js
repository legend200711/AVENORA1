/**
 * AVENORA - Client-side State Store
 * Simple reactive state management without a framework.
 * Components subscribe to state keys and re-render on change.
 */

(function (global) {
  'use strict';

  const state = {
    user: null,
    // true until Firebase reports the first auth result (resolved or null).
    // Consumers must not treat user===null as "logged out" while this is true.
    authLoading: true,
    notifications: { items: [], unreadCount: 0 },
    theme: localStorage.getItem('lu_theme') || 'dark',
    searchOpen: false,
    notifOpen: false,
    userMenuOpen: false,
    currentPage: null,
    onlineUsers: new Set(),
  };

  const listeners = {};

  const LegendState = {
    get(key) {
      return state[key];
    },

    set(key, value) {
      const prev = state[key];
      state[key] = value;
      if (listeners[key]) {
        listeners[key].forEach(fn => {
          try { fn(value, prev); } catch (e) { console.error(`State listener error [${key}]:`, e); }
        });
      }
    },

    subscribe(key, fn) {
      if (!listeners[key]) listeners[key] = new Set();
      listeners[key].add(fn);
      return () => listeners[key].delete(fn); // Unsubscribe function
    },

    getAll() { return { ...state }; },

    // Persist non-sensitive state
    persist(key, value) {
      LegendState.set(key, value);
      try { localStorage.setItem(`lu_state_${key}`, JSON.stringify(value)); } catch {}
    },

    load(key, defaultVal) {
      try {
        const stored = localStorage.getItem(`lu_state_${key}`);
        if (stored !== null) {
          const val = JSON.parse(stored);
          LegendState.set(key, val);
          return val;
        }
      } catch {}
      return defaultVal;
    },
  };

  global.LegendState = LegendState;

})(window);
