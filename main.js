/* main.js – shared behaviour (theme, nav, toasts) + homepage rendering. */

/* ---------- Helpers ---------- */
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'success') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const icon = document.querySelector('#themeToggle i');
  if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  try { localStorage.setItem(KEYS.theme, theme); } catch (e) { /* storage blocked */ }
}

function initTheme() {
  applyTheme(document.documentElement.dataset.theme || 'light');
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

/* ---------- Mobile nav ---------- */
function initMobileNav() {
  const button = document.getElementById('menuToggle');
  const links = document.getElementById('navLinks');
  if (!button || !links) return;

  const setOpen = open => {
    links.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    button.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  };

  button.addEventListener('click', () => setOpen(!links.classList.contains('open')));
  links.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
}

/* ---------- Navbar reflects login state ---------- */
function initAuthNav() {
  const loggedIn = Boolean(getCurrentUser());
  document.querySelectorAll('.auth-guest').forEach(el => { el.hidden = loggedIn; });
  document.querySelectorAll('.auth-user').forEach(el => { el.hidden = !loggedIn; });
}

/* ---------- Homepage ---------- */
const filters = { query: '', category: 'All' };

function imageTag(post) {
  /* If the remote image fails (offline), the CSS gradient behind it still shows */
  return `<img src="${escapeHTML(post.image)}" alt="" loading="lazy" onerror="this.remove()">`;
}

function postCardHTML(post, large = false) {
  return `
    <article class="card ${large ? 'card-large' : ''}">
      <a class="card-image" href="#" data-post="${post.id}" aria-label="Read ${escapeHTML(post.title)}">${imageTag(post)}</a>
      <div class="card-body">
        <span class="tag">${escapeHTML(post.category)}</span>
        <h3><a href="#" data-post="${post.id}">${escapeHTML(post.title)}</a></h3>
        <p>${escapeHTML(post.description)}</p>
        <div class="meta">
          <span class="avatar">${escapeHTML(post.author.charAt(0))}</span>
          <span>${escapeHTML(post.author)}</span>
          <span class="meta-sep">${formatDate(post.date)}</span>
          <span class="meta-sep">${post.readTime || 5} min read</span>
        </div>
      </div>
    </article>`;
}

function renderCategories(posts) {
  const chips = document.getElementById('categoryChips');
  const names = ['All', ...CATEGORIES];
  chips.innerHTML = names.map(name => {
    const count = name === 'All' ? posts.length : posts.filter(p => p.category === name).length;
    const active = filters.category === name ? ' active' : '';
    return `<button class="chip${active}" data-category="${name}">${name}<span>${count}</span></button>`;
  }).join('');
}

function renderHome() {
  const posts = getPublishedPosts();

  /* Featured: only shown when no search/filter is active */
  const featuredSection = document.getElementById('featured');
  const featured = posts.filter(p => p.featured).slice(0, 3);
  featuredSection.hidden = featured.length === 0 || filters.query !== '' || filters.category !== 'All';
  document.getElementById('featuredGrid').innerHTML = featured.map((p, i) => postCardHTML(p, i === 0)).join('');

  renderCategories(posts);

  /* Latest list with search + category filter */
  const query = filters.query.trim().toLowerCase();
  const results = posts.filter(p =>
    (filters.category === 'All' || p.category === filters.category) &&
    p.title.toLowerCase().includes(query)
  );

  const filtering = query !== '' || filters.category !== 'All';
  document.getElementById('latestTitle').textContent = filtering ? 'Results' : 'Latest articles';
  document.getElementById('resultCount').textContent = `${results.length} ${results.length === 1 ? 'article' : 'articles'}`;
  document.getElementById('latestGrid').innerHTML = results.map(p => postCardHTML(p)).join('');
  document.getElementById('emptyState').hidden = results.length > 0;
  document.getElementById('statsLine').textContent = `${posts.length} articles across ${CATEGORIES.length} categories`;
}

function initHome() {
  if (!document.getElementById('latestGrid')) return; // not the homepage

  renderHome();

  document.getElementById('searchForm').addEventListener('submit', e => e.preventDefault());
  document.getElementById('searchInput').addEventListener('input', e => {
    filters.query = e.target.value;
    renderHome();
  });

  document.getElementById('categoryChips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filters.category = chip.dataset.category;
    renderHome();
  });

  document.getElementById('resetFilters').addEventListener('click', () => {
    filters.query = '';
    filters.category = 'All';
    document.getElementById('searchInput').value = '';
    renderHome();
  });

  /* Full article view arrives in a later phase; give honest feedback until then */
  document.querySelector('main').addEventListener('click', e => {
    if (e.target.closest('[data-post]')) {
      e.preventDefault();
      showToast('Full article pages arrive in a later phase.', 'info');
    }
  });
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
