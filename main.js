/**
 * main.js – Shared frontend behavior (theme, nav, toasts, session) + Homepage rendering
 * ───────────────────────────────────────────────────────────────────────────────────
 * Connects frontend views with `api.js` while maintaining LocalStorage fallback.
 */

/* ---------- Helpers ---------- */
function escapeHTML(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function showToast(message, type = 'success') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const icon = document.querySelector('#themeToggle i');
  if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  try {
    localStorage.setItem(KEYS.theme, theme);
  } catch (e) {
    /* storage blocked */
  }
}

function initTheme() {
  applyTheme(document.documentElement.dataset.theme || 'light');
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }
}

/* ---------- Mobile nav ---------- */
function initMobileNav() {
  const button = document.getElementById('menuToggle');
  const links = document.getElementById('navLinks');
  if (!button || !links) return;

  const setOpen = (open) => {
    links.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    button.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  };

  button.addEventListener('click', () => setOpen(!links.classList.contains('open')));
  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

/* ---------- Navbar reflects login state ---------- */
function updateAuthUI() {
  const user = window.api ? window.api.getUser() : getCurrentUser();
  const loggedIn = Boolean(user);

  document.querySelectorAll('.auth-guest').forEach((el) => {
    el.hidden = loggedIn;
  });
  document.querySelectorAll('.auth-user').forEach((el) => {
    el.hidden = !loggedIn;
  });

  // If user is logged in, optionally show their name in nav
  const userGreeting = document.getElementById('navUserName');
  if (userGreeting && user) {
    userGreeting.textContent = user.name || 'Account';
  }
}

async function initAuthNav() {
  updateAuthUI();

  // If a token exists, verify and refresh profile with backend
  if (window.api && window.api.getToken()) {
    try {
      await window.api.getMe();
      updateAuthUI();
    } catch (err) {
      // If token expired or invalid, updateAuthUI reflects logged out state
      updateAuthUI();
    }
  }

  // Bind any logout buttons
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
      showToast('You have been logged out.', 'info');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);
    });
  });
}

/* ---------- Homepage Cards & Categories ---------- */
const filters = { query: '', category: 'All', page: 1, limit: 6 };

function imageTag(post) {
  const src = post.image || 'https://picsum.photos/seed/blog/900/600';
  return `<img src="${escapeHTML(src)}" alt="" loading="lazy" onerror="this.remove()">`;
}

function postCardHTML(post, large = false) {
  const postDate = post.created_at || post.date || new Date().toISOString();
  const readMinutes = post.read_time || post.readTime || 5;
  const authorName = post.author || 'Anonymous';
  const authorInitial = authorName.charAt(0).toUpperCase();

  return `
    <article class="card ${large ? 'card-large' : ''}">
      <a class="card-image" href="article.html?id=${post.id}" data-post="${post.id}" aria-label="Read ${escapeHTML(post.title)}">
        ${imageTag(post)}
      </a>
      <div class="card-body">
        <span class="tag">${escapeHTML(post.category || 'General')}</span>
        <h3><a href="article.html?id=${post.id}" data-post="${post.id}">${escapeHTML(post.title)}</a></h3>
        <p>${escapeHTML(post.description || '')}</p>
        <div class="meta">
          <span class="avatar">${escapeHTML(authorInitial)}</span>
          <span>${escapeHTML(authorName)}</span>
          <span class="meta-sep">${formatDate(postDate)}</span>
          <span class="meta-sep">${readMinutes} min read</span>
        </div>
      </div>
    </article>`;
}

function renderCategories(posts) {
  const chips = document.getElementById('categoryChips');
  if (!chips) return;

  const names = ['All', ...CATEGORIES];
  chips.innerHTML = names
    .map((name) => {
      const count = name === 'All' ? posts.length : posts.filter((p) => p.category === name).length;
      const active = filters.category === name ? ' active' : '';
      return `<button class="chip${active}" data-category="${name}">${name}<span>${count}</span></button>`;
    })
    .join('');
}

/**
 * Fallback renderer if the backend server is temporarily offline
 */
function renderHomeFallback() {
  const posts = getPublishedPosts();
  renderHomeWithPosts(posts);
}

function renderHomeWithPosts(posts) {
  const featuredSection = document.getElementById('featured');
  const featuredGrid = document.getElementById('featuredGrid');
  const latestGrid = document.getElementById('latestGrid');
  const emptyState = document.getElementById('emptyState');
  const statsLine = document.getElementById('statsLine');
  const latestTitle = document.getElementById('latestTitle');
  const resultCount = document.getElementById('resultCount');

  if (!latestGrid) return;

  const query = filters.query.trim().toLowerCase();
  const filtering = query !== '' || filters.category !== 'All';

  // Filter in memory if using cached posts
  const filtered = posts.filter(
    (p) =>
      (filters.category === 'All' || p.category === filters.category) &&
      (p.title.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query)))
  );

  // Featured
  if (featuredSection && featuredGrid) {
    const featured = posts.filter((p) => p.featured).slice(0, 3);
    featuredSection.hidden = featured.length === 0 || filtering;
    if (!featuredSection.hidden) {
      featuredGrid.innerHTML = featured.map((p, i) => postCardHTML(p, i === 0)).join('');
    }
  }

  renderCategories(posts);

  if (latestTitle) {
    latestTitle.textContent = filtering ? 'Results' : 'Latest articles';
  }
  if (resultCount) {
    resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'article' : 'articles'}`;
  }
  if (statsLine) {
    statsLine.textContent = `${posts.length} articles across ${CATEGORIES.length} categories`;
  }

  latestGrid.innerHTML = filtered.map((p) => postCardHTML(p)).join('');
  if (emptyState) {
    emptyState.hidden = filtered.length > 0;
  }
}

/**
 * Asynchronously loads blogs from backend REST API
 */
async function renderHome() {
  const latestGrid = document.getElementById('latestGrid');
  if (!latestGrid) return; // Not the homepage

  try {
    const response = await window.api.getBlogs({
      category: filters.category,
      search: filters.query,
      page: filters.page,
      limit: filters.limit
    });

    const posts = response.blogs || [];
    const pagination = response.pagination || { page: 1, totalPages: 1, total: posts.length };

    const featuredSection = document.getElementById('featured');
    const featuredGrid = document.getElementById('featuredGrid');
    const emptyState = document.getElementById('emptyState');
    const statsLine = document.getElementById('statsLine');
    const latestTitle = document.getElementById('latestTitle');
    const resultCount = document.getElementById('resultCount');

    const query = filters.query.trim();
    const filtering = query !== '' || filters.category !== 'All';

    // Featured section: show featured posts only on page 1 when not filtering
    if (featuredSection && featuredGrid) {
      const featured = posts.filter((p) => p.featured).slice(0, 3);
      featuredSection.hidden = featured.length === 0 || filtering || filters.page > 1;
      if (!featuredSection.hidden) {
        featuredGrid.innerHTML = featured.map((p, i) => postCardHTML(p, i === 0)).join('');
      }
    }

    renderCategories(posts);

    if (latestTitle) {
      latestTitle.textContent = filtering ? 'Results' : 'Latest articles';
    }
    if (resultCount) {
      const totalCount = pagination.total !== undefined ? pagination.total : posts.length;
      resultCount.textContent = `${totalCount} ${totalCount === 1 ? 'article' : 'articles'}`;
    }
    if (statsLine) {
      const totalCount = pagination.total !== undefined ? pagination.total : posts.length;
      statsLine.textContent = `${totalCount} articles across ${CATEGORIES.length} categories`;
    }

    latestGrid.innerHTML = posts.map((p) => postCardHTML(p)).join('');
    if (emptyState) {
      emptyState.hidden = posts.length > 0;
    }

    // Update Pagination UI
    const paginationEl = document.getElementById('homePagination');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageIndicator = document.getElementById('pageIndicator');

    if (paginationEl) {
      if (pagination.totalPages > 1) {
        paginationEl.hidden = false;
        if (pageIndicator) {
          pageIndicator.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
        }
        if (prevBtn) {
          prevBtn.disabled = pagination.page <= 1;
          prevBtn.style.opacity = pagination.page <= 1 ? '0.45' : '1';
          prevBtn.style.cursor = pagination.page <= 1 ? 'not-allowed' : 'pointer';
        }
        if (nextBtn) {
          nextBtn.disabled = pagination.page >= pagination.totalPages;
          nextBtn.style.opacity = pagination.page >= pagination.totalPages ? '0.45' : '1';
          nextBtn.style.cursor = pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer';
        }
      } else {
        paginationEl.hidden = true;
      }
    }
  } catch (err) {
    console.warn('API fetch unavailable, using LocalStorage cache:', err.message);
    renderHomeFallback();
  }
}

function initHome() {
  if (!document.getElementById('latestGrid')) return; // not the homepage

  renderHome();

  const searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => e.preventDefault());
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      filters.query = e.target.value;
      filters.page = 1;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderHome();
      }, 300);
    });
  }

  const categoryChips = document.getElementById('categoryChips');
  if (categoryChips) {
    categoryChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      filters.category = chip.dataset.category;
      filters.page = 1;
      renderHome();
    });
  }

  const resetFilters = document.getElementById('resetFilters');
  if (resetFilters) {
    resetFilters.addEventListener('click', () => {
      filters.query = '';
      filters.category = 'All';
      filters.page = 1;
      if (searchInput) searchInput.value = '';
      renderHome();
    });
  }

  const prevBtn = document.getElementById('prevPageBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (filters.page > 1) {
        filters.page--;
        renderHome();
        const target = document.getElementById('latest');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  const nextPageBtn = document.getElementById('nextPageBtn');
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      filters.page++;
      renderHome();
      const target = document.getElementById('latest');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileNav();
  initAuthNav();
  initHome();
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
