/**
 * AVENORA - API Client Service
 * All backend communication goes through this module.
 * Swap the BASE_URL to point to your deployed backend.
 *
 * Auth is now handled by Firebase Authentication (AvenoraFirebase.Auth).
 * The TokenStore shim below reads the Firebase UID so that isLoggedIn()
 * keeps working for all callers without changes.
 */

(function (global) {
  'use strict';

  const BASE_URL = (window.LU_CONFIG && window.LU_CONFIG.apiUrl) || 'http://localhost:3001/api';

  // ─── Token management (Firebase shim) ─────────────────────
  // Firebase manages its own ID tokens; we keep the UID in storage
  // as the "access token" sentinel so all isLoggedIn() checks pass.
  const TokenStore = {
    getAccess()   { return sessionStorage.getItem('lu_uid') || localStorage.getItem('lu_uid')
                        || sessionStorage.getItem('lu_access') || localStorage.getItem('lu_access'); },
    getRefresh()  { return localStorage.getItem('lu_refresh'); },
    setAccess(t)  { sessionStorage.setItem('lu_access', t); localStorage.setItem('lu_access', t); },
    setRefresh(t) { localStorage.setItem('lu_refresh', t); },
    clear() {
      ['lu_uid', 'lu_access', 'lu_refresh'].forEach(k => {
        sessionStorage.removeItem(k);
        localStorage.removeItem(k);
      });
    },
  };

  // ─── HTTP helpers ─────────────────────────────────────────
  let isRefreshing = false;
  let refreshQueue = [];

  async function request(method, path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    // Prefer a fresh Firebase ID token; fall back to stored JWT for legacy backend calls
    let token = null;
    if (window.AvenoraFirebase?.Auth) {
      token = await window.AvenoraFirebase.Auth.getIdToken().catch(() => null);
    }
    if (!token) token = TokenStore.getAccess();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = {
      method,
      headers,
      signal: opts.signal,
    };
    if (opts.body && method !== 'GET') config.body = JSON.stringify(opts.body);

    let res = await fetch(`${BASE_URL}${path}`, config);

    // Auto-refresh on 401
    if (res.status === 401 && TokenStore.getRefresh() && !opts._retried) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: TokenStore.getRefresh() }),
          });
          if (refreshRes.ok) {
            const { accessToken } = await refreshRes.json();
            TokenStore.setAccess(accessToken);
            refreshQueue.forEach(fn => fn(accessToken));
          } else {
            TokenStore.clear();
            LegendState.set('user', null);
            window.dispatchEvent(new Event('lu:logged-out'));
          }
        } finally {
          isRefreshing = false;
          refreshQueue = [];
        }
      }
      // Retry once
      return request(method, path, { ...opts, _retried: true });
    }

    // Parse response
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const err = new Error(data?.message || `Request failed: ${res.status}`);
      err.status = res.status;
      err.code = data?.code;
      err.details = data?.details;
      throw err;
    }

    return data;
  }

  const get = (path, opts) => request('GET', path, opts);
  const post = (path, body, opts) => request('POST', path, { body, ...opts });
  const put = (path, body, opts) => request('PUT', path, { body, ...opts });
  const patch = (path, body, opts) => request('PATCH', path, { body, ...opts });
  const del = (path, opts) => request('DELETE', path, opts);

  // ─── Upload (multipart) ───────────────────────────────────
  async function upload(path, formData) {
    const token = TokenStore.getAccess();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ─── Auth API — delegates to Firebase, falls back to REST ─
  const AuthAPI = {
    async register(username, email, password) {
      if (window.AvenoraFirebase?.Auth) {
        return window.AvenoraFirebase.Auth.register(username, email, password);
      }
      // Legacy REST fallback
      const data = await post('/auth/register', { username, email, password });
      TokenStore.setAccess(data.accessToken);
      TokenStore.setRefresh(data.refreshToken);
      LegendState.set('user', data.user);
      return data;
    },
    async login(email, password) {
      if (window.AvenoraFirebase?.Auth) {
        return window.AvenoraFirebase.Auth.login(email, password);
      }
      // Legacy REST fallback
      const data = await post('/auth/login', { email, password });
      TokenStore.setAccess(data.accessToken);
      TokenStore.setRefresh(data.refreshToken);
      LegendState.set('user', data.user);
      return data;
    },
    async logout() {
      if (window.AvenoraFirebase?.Auth) {
        return window.AvenoraFirebase.Auth.logout();
      }
      try { await post('/auth/logout', {}); } catch {}
      TokenStore.clear();
      LegendState.set('user', null);
      window.dispatchEvent(new Event('lu:logged-out'));
    },
    async me() {
      if (window.AvenoraFirebase?.Auth) {
        return window.AvenoraFirebase.Auth.me();
      }
      const data = await get('/auth/me');
      LegendState.set('user', data.user);
      return data.user;
    },
    async forgotPassword(email) {
      if (window.AvenoraFirebase?.Auth) {
        return window.AvenoraFirebase.Auth.forgotPassword(email);
      }
      return post('/auth/forgot-password', { email });
    },
    resetPassword: (token, password) => post('/auth/reset-password', { token, password }),
    isLoggedIn() { return !!TokenStore.getAccess(); },
    getUser() { return LegendState.get('user'); },
  };

  // ─── Posts API — backed by Firestore ─────────────────────
  const PostsAPI = {
    async feed(page = 1) {
      if (window.AvenoraFirebase?.Firestore) {
        const posts = await window.AvenoraFirebase.Firestore.getPosts(20 * page);
        const slice = posts.slice((page - 1) * 20, page * 20);
        return { posts: slice };
      }
      return get(`/posts?page=${page}&limit=20`);
    },
    async feedByAuthor(authorId, page = 1) {
      if (window.AvenoraFirebase?.Firestore) {
        const all = await window.AvenoraFirebase.Firestore.getPosts(200);
        const filtered = all.filter(p => p.author?.id === authorId);
        return { posts: filtered.slice((page - 1) * 20, page * 20) };
      }
      return get(`/posts?author=${authorId}&page=${page}&limit=20`);
    },
    async create(content, mediaUrls = [], tags = []) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.createPost(content, mediaUrls, tags);
      }
      return post('/posts', { content, mediaUrls, tags });
    },
    async update(id, content) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.updatePost(id, content);
      }
      return put(`/posts/${id}`, { content });
    },
    async delete(id) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.deletePost(id);
      }
      return del(`/posts/${id}`);
    },
    async like(id) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.likePost(id);
      }
      return post(`/posts/${id}/like`, {});
    },
    async comment(id, content) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.addComment(id, content);
      }
      return post(`/posts/${id}/comment`, { content });
    },
    async deleteComment(postId, commentId) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.deleteComment(postId, commentId);
      }
      return del(`/posts/${postId}/comment/${commentId}`);
    },
    async comments(postId) {
      if (window.AvenoraFirebase?.Firestore) {
        const comments = await window.AvenoraFirebase.Firestore.getComments(postId);
        return { comments };
      }
      return get(`/posts/${postId}/comments`);
    },
    repost: (id, comment) => post(`/posts/${id}/repost`, { comment }),
  };

  // ─── Videos API ───────────────────────────────────────────
  const VideosAPI = {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/videos?${q}`);
    },
    get: (id) => get(`/videos/${id}`),
    like: (id) => post(`/videos/${id}/like`, {}),

    // Comments
    comments: (videoId, page = 1) => get(`/videos/${videoId}/comments?page=${page}`),
    addComment: (videoId, content) => post(`/videos/${videoId}/comments`, { content }),
    deleteComment: (videoId, commentId) => del(`/videos/${videoId}/comments/${commentId}`),

    // Watch Later (server-side when logged in)
    toggleWatchLater: (id) => post(`/videos/${id}/watchlater`, {}),
    getWatchLater: () => get('/videos/me/watchlater'),

    // Watch History (server-side)
    updateHistory: (id, position) => post(`/videos/${id}/history`, { position }),
    getHistory: () => get('/videos/me/history'),
    deleteHistory: (videoId) => del(`/videos/history/${videoId}`),

    // Channels
    channels: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/videos/channels?${q}`);
    },
    channel: (id) => get(`/videos/channel/${id}`),
    subscribeChannel: (id) => post(`/videos/channel/${id}/subscribe`, {}),

    // Upload (via XHR directly in the form for real progress tracking)
    // The XHR call is handled inline in video.js for progress events

    // Report
    reportVideo: (id, reason, details) =>
      post(`/videos/${id}/report`, { reason, details }),

    // Moderation
    deleteVideo: (id) => del(`/videos/${id}`),
    restoreVideo: (id) => put(`/videos/${id}/restore`, {}),
    featureVideo: (id, featured = true) => put(`/videos/${id}/feature`, { featured }),
    suspendChannel: (id, reason) => put(`/videos/channel/${id}/suspend`, { reason }),
    unsuspendChannel: (id) => put(`/videos/channel/${id}/unsuspend`, {}),
  };

  // ─── Streams API — legacy read-only list/get ──────────────
  const StreamsAPI = {
    list: (status = 'live') => get(`/streams?status=${status}`),
    get: (id) => get(`/streams/${id}`),
  };

  // ─── Live API — browser-based WHIP/HLS live sessions ──────
  // Replaces OBS/RTMP/Streamlabs flow. Publisher uses WebRTC/WHIP
  // from the browser; viewers receive HLS from MediaMTX.
  const LiveAPI = {
    // Public list of live streams
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/live?${q}`);
    },
    // Get a single stream (public)
    get: (id) => get(`/live/${id}`),
    // Get playback info (HLS URL, publisher status) — public
    playback: (id) => get(`/live/${id}/playback`),
    // Get viewer count — public
    viewers: (id) => get(`/live/${id}/viewers`),
    // Current user's own sessions — authenticated
    mySessions: () => get('/live/my/sessions'),
    // Create a new live session — authenticated
    create: (data) => post('/live', data),
    // Update title/description/category — authenticated
    update: (id, data) => request('PATCH', `/live/${id}`, { body: data }),
    // Signal publisher is about to connect WHIP — authenticated
    startPublishing: (id) => post(`/live/${id}/start-publishing`, {}),
    // Signal publisher is disconnecting — authenticated
    stopPublishing: (id) => post(`/live/${id}/stop-publishing`, {}),
    // Heartbeat from publisher — authenticated
    // metrics: { bitrate, fps, resolution, errors }
    reportHealth: (id, metrics = {}) => post(`/live/${id}/health`, metrics),
    // Report a stream error — authenticated
    reportError: (id, code, message, phase) =>
      post(`/live/${id}/error`, { code, message, phase }),
    // Admin: MediaMTX health check — requires founder role
    mediaMTXHealth: () => get('/live/health-check'),
  };

  // ─── Search API ───────────────────────────────────────────
  const SearchAPI = {
    search: (query, type) => get(`/search?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ''}`),
  };

  // ─── Users API ────────────────────────────────────────────
  const UsersAPI = {
    async profile(username) {
      if (window.AvenoraFirebase?.Firestore) {
        const currentUser = LegendState.get('user');
        // If viewing own profile, look up by UID directly (faster)
        if (currentUser && currentUser.username === username) {
          const fsProfile = await window.AvenoraFirebase.Firestore.getProfile(currentUser.id);
          const merged = { ...currentUser, ...(fsProfile || {}) };
          return {
            user: {
              id: merged.id || currentUser.id,
              username: merged.username || username,
              role: merged.role || 'member',
              profile: merged.profile || {},
              stats: merged.stats || {},
              createdAt: merged.createdAt || new Date().toISOString(),
              isOwnProfile: true,
              isFollowing: false,
            },
          };
        }
        // Viewing another user's profile — query by username field
        const fsProfile = await window.AvenoraFirebase.Firestore.getProfileByUsername(username);
        if (fsProfile) {
          return {
            user: {
              id: fsProfile.id,
              username: fsProfile.username || username,
              role: fsProfile.role || 'member',
              profile: fsProfile.profile || {},
              stats: fsProfile.stats || {},
              createdAt: fsProfile.createdAt || new Date().toISOString(),
              isOwnProfile: false,
              isFollowing: false,
            },
          };
        }
      }
      return get(`/users/${username}`);
    },
    async posts(username, page = 1) {
      if (window.AvenoraFirebase?.Firestore) {
        const currentUser = LegendState.get('user');
        let authorId = (currentUser?.username === username) ? currentUser.id : null;
        if (!authorId) {
          const fsProfile = await window.AvenoraFirebase.Firestore.getProfileByUsername(username);
          authorId = fsProfile?.id || null;
        }
        if (authorId) {
          return PostsAPI.feedByAuthor(authorId, page);
        }
      }
      return get(`/users/${username}/posts?page=${page}&limit=20`);
    },
    follow: (id) => post(`/users/${id}/follow`, {}),
    unfollow: (id) => del(`/social/follow/${id}`),
    followStatus: (id) => get(`/social/follow/status/${id}`),
    followers: (id, page = 1) => get(`/social/followers/${id}?page=${page}`),
    following: (id, page = 1) => get(`/social/following/${id}?page=${page}`),
    updateProfile: async (data) => {
      if (window.AvenoraFirebase?.Firestore) {
        const user = LegendState.get('user');
        if (!user) throw new Error('Not authenticated');
        await window.AvenoraFirebase.Firestore.upsertProfile(user.id, { profile: { ...user.profile, ...data } });
        const updated = { ...user, profile: { ...user.profile, ...data } };
        LegendState.set('user', updated);
        return { user: updated };
      }
      return put('/users/profile', data);
    },
  };

  // ─── Upload API — delegates to Firebase Storage ───────────
  const UploadAPI = {
    async image(file, onProgress) {
      if (window.AvenoraFirebase?.Storage) {
        const url = await window.AvenoraFirebase.Storage.uploadImage(file, onProgress);
        return { url };
      }
      const fd = new FormData(); fd.append('file', file);
      return upload('/upload/image', fd);
    },
    async avatar(file, onProgress) {
      if (window.AvenoraFirebase?.Storage) {
        const url = await window.AvenoraFirebase.Storage.uploadAvatar(file, onProgress);
        return { url };
      }
      const fd = new FormData(); fd.append('file', file);
      return upload('/upload/avatar', fd);
    },
    async audio(file, onProgress) {
      if (window.AvenoraFirebase?.Storage) {
        const url = await window.AvenoraFirebase.Storage.uploadAudio(file, onProgress);
        return { url };
      }
      const fd = new FormData(); fd.append('file', file);
      return upload('/upload/audio', fd);
    },
    async video(file, onProgress) {
      if (window.AvenoraFirebase?.Storage) {
        const url = await window.AvenoraFirebase.Storage.uploadVideo(file, onProgress);
        return { url };
      }
      const fd = new FormData(); fd.append('file', file);
      return upload('/upload/video', fd);
    },
  };

  // ─── Notifications API ────────────────────────────────────
  const NotificationsAPI = {
    list: (page = 1) => get(`/notifications?page=${page}&limit=20`),
    markRead: (id) => put(`/notifications/${id}/read`, {}),
    markAllRead: () => put('/notifications/read-all', {}),
  };

  // ─── Reports API ─────────────────────────────────────────
  const ReportsAPI = {
    submit: (targetType, targetId, reason, details) =>
      post('/reports', { targetType, targetId, reason, details }),
    list: (status = 'pending', page = 1) => get(`/reports?status=${status}&page=${page}`),
    review: (id, status, reviewNote) => put(`/reports/${id}`, { status, reviewNote }),
  };

  // ─── Stories API — backed by Firestore ───────────────────
  const StoriesAPI = {
    async feed() {
      if (window.AvenoraFirebase?.Firestore) {
        const stories = await window.AvenoraFirebase.Firestore.getStories();
        return { stories };
      }
      return get('/stories');
    },
    async byUser(userId) {
      if (window.AvenoraFirebase?.Firestore) {
        const stories = await window.AvenoraFirebase.Firestore.getStoriesByUser(userId);
        return { stories };
      }
      return get(`/stories/${userId}`);
    },
    async create(mediaUrl, mediaType, caption) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.createStory(mediaUrl, mediaType, caption);
      }
      return post('/stories', { mediaUrl, mediaType, caption });
    },
    view: (id) => post(`/stories/${id}/view`, {}),
    async delete(id) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.deleteStory(id);
      }
      return del(`/stories/${id}`);
    },
  };

  // ─── Gallery API — backed by Firestore + Firebase Storage ──
  const GalleryAPI = {
    async list(params = {}) {
      if (window.AvenoraFirebase?.Firestore) {
        const items = await window.AvenoraFirebase.Firestore.getGallery(params.limit || 24);
        // Client-side filter by category / search query
        const filtered = items.filter(i => {
          const catOk = !params.category || params.category === 'all' || i.mediaType === params.category || i.category === params.category;
          const qOk   = !params.q || (i.caption || i.title || '').toLowerCase().includes(params.q.toLowerCase());
          return catOk && qOk;
        });
        return { images: filtered.map(i => ({
          _id: i.id, url: i.url, title: i.caption || i.title || 'Untitled',
          category: i.mediaType || i.category || 'artwork',
          uploader: { username: i.author?.username, _id: i.author?.id },
          likeCount: (i.likes || []).length,
          likedByMe: (i.likes || []).includes(LegendAPI?.auth?.getUser()?.id),
          createdAt: i.createdAt,
        })), total: filtered.length };
      }
      const q = new URLSearchParams(params).toString();
      return get(`/gallery?${q}`);
    },
    async upload(formData) {
      if (window.AvenoraFirebase?.Storage && window.AvenoraFirebase?.Firestore) {
        const file     = formData.get('file');
        const category = formData.get('category') || 'artwork';
        const title    = formData.get('title') || '';
        const url = await window.AvenoraFirebase.Storage.uploadImage(file);
        await window.AvenoraFirebase.Firestore.addGalleryItem(url, category, title);
        return { images: [{ _id: Date.now().toString(), url, title, category,
          uploader: { username: LegendAPI?.auth?.getUser()?.username }, createdAt: new Date().toISOString() }] };
      }
      return upload('/gallery/upload', formData);
    },
    async like(id) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.likeGalleryItem(id);
      }
      return post(`/gallery/${id}/like`, {});
    },
    async delete(id) {
      if (window.AvenoraFirebase?.Firestore) {
        return window.AvenoraFirebase.Firestore.deleteGalleryItem(id);
      }
      return del(`/gallery/${id}`);
    },
  };

  // ─── Music API ────────────────────────────────────────────
  const MusicAPI = {
    tracks: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/music/tracks?${q}`);
    },
    track: (id) => get(`/music/tracks/${id}`),
    albums: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/music/albums?${q}`);
    },
    album: (id) => get(`/music/albums/${id}`),
    artists: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return get(`/music/artists?${q}`);
    },
    artist: (id) => get(`/music/artists/${id}`),
    playlists: () => get('/music/playlists'),
    playlist: (id) => get(`/music/playlists/${id}`),
    like: (id) => post(`/music/tracks/${id}/like`, {}),
    upload: (formData) => upload('/music/upload', formData),
    search: (q, limit = 20) => get(`/music/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  };

  // ─── Chat API ─────────────────────────────────────────────
  const ChatAPI = {
    rooms: () => get('/chat/rooms'),
    history: (roomId, limit = 50) => get(`/chat/rooms/${roomId}/history?limit=${limit}`),
    deleteMessage: (id) => del(`/chat/messages/${id}`),
    reportMessage: (id, reason = 'other', details) => post(`/chat/messages/${id}/report`, { reason, details }),
    block: (userId) => post(`/chat/users/${userId}/block`, {}),
    unblock: (userId) => post(`/chat/users/${userId}/unblock`, {}),
    blocks: () => get('/chat/blocks'),
  };

  // ─── Private Rooms API ────────────────────────────────────
  const PrivateRoomsAPI = {
    list: () => get('/rooms'),
    discover: (q) => get(`/rooms/discover${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (roomId) => get(`/rooms/${roomId}`),
    create: (data) => post('/rooms', data),
    update: (roomId, data) => patch(`/rooms/${roomId}`, data),
    delete: (roomId, action = 'archive') => del(`/rooms/${roomId}?action=${action}`),
    join: (roomId) => post(`/rooms/${roomId}/join`, {}),
    invite: (roomId, username) => post(`/rooms/${roomId}/invite`, { username }),
    approveJoin: (roomId, uid) => post(`/rooms/${roomId}/join-requests/${uid}/approve`, {}),
    rejectJoin: (roomId, uid) => post(`/rooms/${roomId}/join-requests/${uid}/reject`, {}),
    removeMember: (roomId, uid) => del(`/rooms/${roomId}/members/${uid}`),
    ban: (roomId, uid, reason) => post(`/rooms/${roomId}/ban/${uid}`, { reason }),
    unban: (roomId, uid) => del(`/rooms/${roomId}/ban/${uid}`),
    mute: (roomId, uid, minutes = 60) => post(`/rooms/${roomId}/mute/${uid}`, { minutes }),
    history: (roomId, limit = 50, before) => get(`/rooms/${roomId}/history?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  };

  // ─── Direct Messages API ──────────────────────────────────
  const DMAPI = {
    list: () => get('/dm'),
    create: (data) => post('/dm', data),
    conversation: (id) => get(`/dm/${id}`),
    messages: (id, limit = 50, before) => get(`/dm/${id}/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
    send: (id, content, replyToId) => post(`/dm/${id}/messages`, { content, replyToId }),
    deleteMessage: (conversationId, msgId) => del(`/dm/${conversationId}/messages/${msgId}`),
    read: (id) => post(`/dm/${id}/read`, {}),
    mute: (id, mute = true, hours = 24) => post(`/dm/${id}/mute`, { mute, hours }),
    block: (id) => post(`/dm/${id}/block`, {}),
    unblock: (id) => post(`/dm/${id}/unblock`, {}),
  };

  // ─── Inbox API ────────────────────────────────────────────
  const InboxAPI = {
    list: () => get('/inbox'),
    unread: () => get('/inbox/unread'),
  };

  // ─── Admin API ────────────────────────────────────────────
  const AdminAPI = {
    dashboard: () => get('/admin/dashboard'),
    users: (page, search) => get(`/admin/users?page=${page || 1}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    setRole: (userId, role) => put(`/admin/users/${userId}/role`, { role }),
    suspend: (userId, reason, until) => put(`/admin/users/${userId}/suspend`, { reason, until }),
    unsuspend: (userId) => put(`/admin/users/${userId}/unsuspend`, {}),
    flaggedPosts: () => get('/admin/posts/flagged'),
    reports: (status = 'pending', page = 1) => get(`/admin/reports?status=${status}&page=${page}`),
    deletePost: (id) => del(`/admin/posts/${id}`),
    system: () => get('/admin/system'),
  };

  // ─── Founder Theme API ────────────────────────────────────
  const FounderThemeAPI = {
    list:           ()              => get('/admin/themes'),
    published:      ()              => get('/admin/themes/published'),
    history:        ()              => get('/admin/themes/history'),
    get:            (id)            => get(`/admin/themes/${id}`),
    create:         (data)          => post('/admin/themes', data),
    update:         (id, data)      => put(`/admin/themes/${id}`, data),
    publish:        (id)            => post(`/admin/themes/${id}/publish`, {}),
    rollback:       (id)            => post(`/admin/themes/${id}/rollback`, {}),
    delete:         (id)            => del(`/admin/themes/${id}`),
    // Public endpoint — no auth required, used on every page load
    active:         ()              => fetch(`${BASE_URL}/themes/active`).then(r => r.json()).catch(() => ({ success: false, theme: null })),
  };

  // ─── Cloud Stream API ─────────────────────────────────────
  const CloudStreamAPI = {
    status:         ()              => get('/admin/cloud-stream/status'),
    queue:          ()              => get('/admin/cloud-stream/queue'),
    media:          ()              => get('/admin/cloud-stream/media'),
    start:          ()              => post('/admin/cloud-stream/start', {}),
    stop:           ()              => post('/admin/cloud-stream/stop', {}),
    pause:          ()              => post('/admin/cloud-stream/pause', {}),
    resume:         ()              => post('/admin/cloud-stream/resume', {}),
    skip:           ()              => post('/admin/cloud-stream/skip', {}),
    refresh:        ()              => post('/admin/cloud-stream/refresh', {}),
    addToQueue:     (files)         => post('/admin/cloud-stream/queue/add', { files }),
    removeFromQueue:(index)         => del(`/admin/cloud-stream/queue/${index}`),
    reorderQueue:   (from, to)      => put('/admin/cloud-stream/queue/reorder', { from, to }),
    clearQueue:     ()              => del('/admin/cloud-stream/queue'),
    setSettings: (shuffle, repeat) => {
      const body = {};
      if (shuffle !== undefined) body.shuffle = shuffle;
      if (repeat  !== undefined) body.repeat  = repeat;
      return put('/admin/cloud-stream/settings', body);
    },
  };

  // ─── Health ───────────────────────────────────────────────
  const HealthAPI = {
    check: () => fetch(`${BASE_URL.replace('/api', '')}/api/health`).then(r => r.json()).catch(() => ({ status: 'error' })),
  };

  // ─── Companion API ────────────────────────────────────────
  const CompanionAPI = {
    me:           ()                      => get('/companion/me'),
    discover:     ()                      => post('/companion/discover', {}),
    setup:        (data)                  => patch('/companion/setup', data),
    care:         (action)                => post(`/companion/care/${action}`, {}),
    taskAction:   (key, action)           => request('PATCH', `/companion/tasks/${key}`, { body: { action } }),
    gameScore:    (score)                 => post('/companion/minigame/score', { score }),
    widget:       (data)                  => request('PATCH', '/companion/widget', { body: data }),
  };

  // ─── Preferences API ─────────────────────────────────────
  // Keys that are safe to round-trip through Firestore.
  // Any field not in this list (e.g. Firestore metadata like updatedAt)
  // is stripped before the data enters client state or goes back to Firestore,
  // preventing "Unsupported field value: a plain object" errors caused by
  // Timestamp objects being JSON-serialised into {seconds, nanoseconds} dicts.
  const PREF_KEYS = [
    'theme','accentColor','textSize','gothicIntensity','highContrast',
    'reducedMotion','soundEnabled','autoplay','captions',
    'notifications','homeCards',
    'startSection','continueWatching','continueListening',
    'recentlyVisited','savedItems','mutedTopics',
  ];

  function _stripPrefs(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    for (const k of PREF_KEYS) {
      if (raw[k] !== undefined) out[k] = raw[k];
    }
    return out;
  }

  const PreferencesAPI = {
    async get() {
      const user = LegendState.get('user');
      if (window.AvenoraFirebase?.Firestore && user) {
        const raw = await window.AvenoraFirebase.Firestore.getUserPreferences(user.id).catch(() => null);
        // Strip Firestore metadata (Timestamp objects etc.) — only keep known pref keys
        const stored = _stripPrefs(raw);
        const founderAccess = ['founder','admin'].includes(user.role);
        return { preferences: { ...stored, _founderAccess: founderAccess } };
      }
      return get('/preferences');
    },

    async save(prefs) {
      const user = LegendState.get('user');
      if (window.AvenoraFirebase?.Firestore && user) {
        // Only send known preference keys — never _founderAccess or metadata
        const toSave = _stripPrefs(prefs);
        await window.AvenoraFirebase.Firestore.setUserPreferences(user.id, toSave);
        return {
          success: true,
          preferences: { ...toSave, _founderAccess: ['founder','admin'].includes(user.role) }
        };
      }
      return put('/preferences', prefs);
    },

    async reset() {
      const user = LegendState.get('user');
      if (window.AvenoraFirebase?.Firestore && user) {
        // Write an empty object — setUserPreferences will add only updatedAt
        await window.AvenoraFirebase.Firestore.setUserPreferences(user.id, {});
        return this.get();
      }
      return post('/preferences/reset', {});
    },
  };

  // ─── Exports ──────────────────────────────────────────────
  global.LegendAPI = {
    request,
    auth: AuthAPI,
    posts: PostsAPI,
    videos: VideosAPI,
    streams: StreamsAPI,
    live: LiveAPI,
    search: SearchAPI,
    users: UsersAPI,
    upload: UploadAPI,
    notifications: NotificationsAPI,
    reports: ReportsAPI,
    stories: StoriesAPI,
    music: MusicAPI,
    chat: ChatAPI,
    privateRooms: PrivateRoomsAPI,
    dm: DMAPI,
    inbox: InboxAPI,
    gallery: GalleryAPI,
    admin: AdminAPI,
    founderTheme: FounderThemeAPI,
    cloudStream: CloudStreamAPI,
    health: HealthAPI,
    companion: CompanionAPI,
    preferences: PreferencesAPI,
    TokenStore,
  };

})(window);
