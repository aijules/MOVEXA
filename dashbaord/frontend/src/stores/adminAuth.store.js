import { defineStore } from 'pinia';
import { post, get, getToken, setToken } from '../services/apiClient.js';

// Real staff auth against the backend (POST /api/admin/auth/login → JWT).
export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    token: getToken(),
    user: null,
    loading: false,
    error: '',
  }),
  getters: {
    isAuthenticated: (s) => Boolean(s.token),
    permissions: (s) => s.user?.permissions || [],
    role: (s) => s.user?.role || '',
  },
  actions: {
    hasPermission(p) {
      if (!p) return true;
      return this.role === 'Admin' || this.permissions.includes(p);
    },
    async login({ username, password }) {
      this.loading = true; this.error = '';
      try {
        const res = await post('/api/admin/auth/login', { username, password });
        this.token = res.token;
        this.user = res.user;
        setToken(res.token);
        return res.user;
      } catch (e) {
        this.error = e.message || 'Login failed';
        throw e;
      } finally {
        this.loading = false;
      }
    },
    async loadMe() {
      if (!this.token) return null;
      try {
        const res = await get('/api/admin/auth/me'); // get() unwraps; but /me returns {success,user}
        // get() unwraps `data`; /me has no `data`, so res is the full body
        this.user = res.user || res;
        return this.user;
      } catch {
        this.logout();
        return null;
      }
    },
    logout() {
      this.token = null;
      this.user = null;
      setToken(null);
    },
  },
});
