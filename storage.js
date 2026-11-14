/* storage.js – all LocalStorage access lives here so other files stay simple. */
const KEYS = {
  users: 'blogspace_users',
  session: 'blogspace_session',
  posts: 'blogspace_posts',
  theme: 'blogspace_theme'
};

const CATEGORIES = ['Technology', 'Design', 'Career', 'Productivity', 'Lifestyle'];

/* Safe JSON read/write: never crash the page if storage is blocked or corrupted */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error('Storage read failed for', key, error);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Storage write failed for', key, error);
    return false;
  }
}

/* Sample posts so the homepage is never empty. Users' own posts are added in Phase 3-4. */
const SEED_POSTS = [
  { id: 's1', title: 'Why I stopped memorising syntax and started reading source code', description: 'Reading small open-source projects taught me more in a month than a semester of tutorials.', content: '', category: 'Technology', author: 'Ananya Rawat', authorId: 'seed', date: '2026-10-28', image: 'https://picsum.photos/seed/code-desk/900/600', status: 'published', featured: true, readTime: 6 },
  { id: 's2', title: 'A calmer way to plan your study week', description: 'Three lists, one calendar, and a rule about Sundays that fixed my backlog.', content: '', category: 'Productivity', author: 'Rohit Negi', authorId: 'seed', date: '2026-10-24', image: 'https://picsum.photos/seed/planner/900/600', status: 'published', featured: true, readTime: 4 },
  { id: 's3', title: 'Spacing, not colour, is what makes an interface feel professional', description: 'A practical look at the 8-point grid and how to apply it to your next project.', content: '', category: 'Design', author: 'Meera Joshi', authorId: 'seed', date: '2026-10-19', image: 'https://picsum.photos/seed/layout-grid/900/600', status: 'published', featured: true, readTime: 5 },
  { id: 's4', title: 'Building your first portfolio when you have no experience', description: 'What recruiters actually look at, and how to show it with three small projects.', content: '', category: 'Career', author: 'Karan Bisht', authorId: 'seed', date: '2026-10-15', image: 'https://picsum.photos/seed/portfolio/900/600', status: 'published', featured: false, readTime: 7 },
  { id: 's5', title: 'LocalStorage explained: what it can and cannot do', description: 'A beginner-friendly guide to storing data in the browser, plus the security limits.', content: '', category: 'Technology', author: 'Ananya Rawat', authorId: 'seed', date: '2026-10-11', image: 'https://picsum.photos/seed/browser-data/900/600', status: 'published', featured: false, readTime: 5 },
  { id: 's6', title: 'Slow mornings: a small routine that survived exam season', description: 'No productivity hack, only a few boring habits that were easy to keep.', content: '', category: 'Lifestyle', author: 'Meera Joshi', authorId: 'seed', date: '2026-10-06', image: 'https://picsum.photos/seed/morning-light/900/600', status: 'published', featured: false, readTime: 3 },
  { id: 's7', title: 'CSS Grid vs Flexbox: which one should you reach for?', description: 'A simple decision rule with examples you can copy straight into your project.', content: '', category: 'Technology', author: 'Rohit Negi', authorId: 'seed', date: '2026-10-02', image: 'https://picsum.photos/seed/grid-flex/900/600', status: 'published', featured: false, readTime: 6 },
  { id: 's8', title: 'Choosing fonts: pair one serif with one sans and stop', description: 'Typography rules that save time and make almost any page look intentional.', content: '', category: 'Design', author: 'Karan Bisht', authorId: 'seed', date: '2026-09-27', image: 'https://picsum.photos/seed/type-specimen/900/600', status: 'published', featured: false, readTime: 4 }
];

/* Posts: seed posts are merged in once, so they stay available on first load */
function getPosts() {
  let posts = readJSON(KEYS.posts, null);
  if (!posts) {
    posts = SEED_POSTS;
    writeJSON(KEYS.posts, posts);
  }
  return posts;
}

function getPublishedPosts() {
  return getPosts()
    .filter(post => post.status === 'published')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/* Session helper used by the navbar on every page */
function getCurrentUser() {
  return readJSON(KEYS.session, null);
}

function logoutUser() {
  localStorage.removeItem(KEYS.session);
}
