/**
 * api.js – BlogSpace Frontend API Client
 * ───────────────────────────────────────
 * Provides a clean, centralized interface for communicating with the
 * BlogSpace Express REST API backend.
 *
 * FEATURES:
 *   • Configurable API base URL (defaults to http://localhost:5000/api)
 *   • Automatic JWT Bearer token attachment for authenticated requests
 *   • Comprehensive HTTP and network error handling
 *   • Safe token and session storage in LocalStorage
 *   • No secrets or passwords stored
 */

const API_CONFIG = {
  // Configurable base URL: can be overridden via window.BLOGSPACE_API_URL in production
  BASE_URL: window.BLOGSPACE_API_URL || 'http://localhost:5000/api',
  STORAGE_KEYS: {
    TOKEN: 'blogspace_token',
    SESSION: 'blogspace_session',
    THEME: 'blogspace_theme'
  }
};

class ApiClient {
  constructor(config = API_CONFIG) {
    this.baseUrl = config.BASE_URL;
    this.keys = config.STORAGE_KEYS;
  }

  // ──────────────────────────────────────────
  // Auth Token & Session Helpers
  // ──────────────────────────────────────────

  getToken() {
    try {
      return localStorage.getItem(this.keys.TOKEN);
    } catch (e) {
      return null;
    }
  }

  setToken(token) {
    try {
      localStorage.setItem(this.keys.TOKEN, token);
    } catch (e) {
      console.error('Failed to save auth token:', e);
    }
  }

  getUser() {
    try {
      const raw = localStorage.getItem(this.keys.SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  setUser(user) {
    try {
      localStorage.setItem(this.keys.SESSION, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save user session:', e);
    }
  }

  clearAuth() {
    try {
      localStorage.removeItem(this.keys.TOKEN);
      localStorage.removeItem(this.keys.SESSION);
    } catch (e) {
      console.error('Failed to clear auth session:', e);
    }
  }

  isAuthenticated() {
    return Boolean(this.getToken() && this.getUser());
  }

  // ──────────────────────────────────────────
  // Core HTTP Request Wrapper
  // ──────────────────────────────────────────

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || 'GET';
    const headers = { ...options.headers };

    // Automatically attach Bearer token if available
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body
      });

      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }

      // Handle session expiration (401)
      if (response.status === 401 && options.requiresAuth) {
        this.clearAuth();
        if (typeof this.onSessionExpired === 'function') {
          this.onSessionExpired();
        }
      }

      if (!response.ok) {
        const errorMessage = (data && data.message) || `Request failed with status ${response.status}`;
        const error = new Error(errorMessage);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      // Differentiate between network connection failure and HTTP error
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const netError = new Error(
          'Unable to connect to the BlogSpace server. Please check if the backend server is running on ' + this.baseUrl
        );
        netError.status = 0;
        throw netError;
      }
      throw error;
    }
  }

  // ──────────────────────────────────────────
  // Authentication Endpoints
  // ──────────────────────────────────────────

  async register(name, email, password) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: { name, email, password }
    });

    if (data && data.token && data.user) {
      this.setToken(data.token);
      this.setUser(data.user);
    }

    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    if (data && data.token && data.user) {
      this.setToken(data.token);
      this.setUser(data.user);
    }

    return data;
  }

  async getMe() {
    try {
      const data = await this.request('/auth/me', {
        method: 'GET',
        requiresAuth: true
      });
      if (data && data.user) {
        this.setUser(data.user);
      }
      return data.user;
    } catch (error) {
      if (error.status === 401) {
        this.clearAuth();
      }
      throw error;
    }
  }

  logout() {
    this.clearAuth();
  }

  // ──────────────────────────────────────────
  // Blog Endpoints
  // ──────────────────────────────────────────

  async getBlogs({ page = 1, limit = 10, category = 'All', search = '' } = {}) {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    if (category && category !== 'All') params.append('category', category);
    if (search && search.trim()) params.append('search', search.trim());

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return await this.request(`/blogs${queryString}`);
  }

  async getMyBlogs({ page = 1, limit = 50 } = {}) {
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (limit) params.append('limit', limit);
    return await this.request(`/blogs/mine?${params.toString()}`, { requiresAuth: true });
  }

  async getBlog(id) {
    return await this.request(`/blogs/${id}`);
  }

  async createBlog(blogData) {
    return await this.request('/blogs', {
      method: 'POST',
      body: blogData,
      requiresAuth: true
    });
  }

  async updateBlog(id, blogData) {
    return await this.request(`/blogs/${id}`, {
      method: 'PUT',
      body: blogData,
      requiresAuth: true
    });
  }

  async deleteBlog(id) {
    return await this.request(`/blogs/${id}`, {
      method: 'DELETE',
      requiresAuth: true
    });
  }
}

// Export a singleton instance globally
const api = new ApiClient();
window.api = api;
