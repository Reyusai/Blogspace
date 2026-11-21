/**
 * models/Blog.js – Blogs table schema, seeding, and database queries
 * ────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Acts as the Data Access Layer (DAL) for blogs.
 *   Provides clean helper functions for all CRUD operations, ensuring
 *   parameterized SQL is used everywhere.
 *
 * DESIGN DECISIONS:
 *   • All listing queries enforce `status = 'published'` to protect drafts.
 *   • Search inspects both `title` and `description` using lowercase LIKE.
 *   • Safe pagination defaults: page >= 1, 1 <= limit <= 50.
 *   • Never trusts client-supplied author information.
 */

const { dbRun, dbGet, dbAll } = require('../config/database');

// ──────────────────────────────────────────────
// Seed data – copied from frontend storage.js SEED_POSTS
// ──────────────────────────────────────────────
const SEED_POSTS = [
  {
    title: 'Why I stopped memorising syntax and started reading source code',
    description: 'Reading small open-source projects taught me more in a month than a semester of tutorials.',
    content: '',
    category: 'Technology',
    author: 'Ananya Rawat',
    date: '2026-10-28',
    image: 'https://picsum.photos/seed/code-desk/900/600',
    status: 'published',
    featured: 1,
    readTime: 6
  },
  {
    title: 'A calmer way to plan your study week',
    description: 'Three lists, one calendar, and a rule about Sundays that fixed my backlog.',
    content: '',
    category: 'Productivity',
    author: 'Rohit Negi',
    date: '2026-10-24',
    image: 'https://picsum.photos/seed/planner/900/600',
    status: 'published',
    featured: 1,
    readTime: 4
  },
  {
    title: 'Spacing, not colour, is what makes an interface feel professional',
    description: 'A practical look at the 8-point grid and how to apply it to your next project.',
    content: '',
    category: 'Design',
    author: 'Meera Joshi',
    date: '2026-10-19',
    image: 'https://picsum.photos/seed/layout-grid/900/600',
    status: 'published',
    featured: 1,
    readTime: 5
  },
  {
    title: 'Building your first portfolio when you have no experience',
    description: 'What recruiters actually look at, and how to show it with three small projects.',
    content: '',
    category: 'Career',
    author: 'Karan Bisht',
    date: '2026-10-15',
    image: 'https://picsum.photos/seed/portfolio/900/600',
    status: 'published',
    featured: 0,
    readTime: 7
  },
  {
    title: 'LocalStorage explained: what it can and cannot do',
    description: 'A beginner-friendly guide to storing data in the browser, plus the security limits.',
    content: '',
    category: 'Technology',
    author: 'Ananya Rawat',
    date: '2026-10-11',
    image: 'https://picsum.photos/seed/browser-data/900/600',
    status: 'published',
    featured: 0,
    readTime: 5
  },
  {
    title: 'Slow mornings: a small routine that survived exam season',
    description: 'No productivity hack, only a few boring habits that were easy to keep.',
    content: '',
    category: 'Lifestyle',
    author: 'Meera Joshi',
    date: '2026-10-06',
    image: 'https://picsum.photos/seed/morning-light/900/600',
    status: 'published',
    featured: 0,
    readTime: 3
  },
  {
    title: 'CSS Grid vs Flexbox: which one should you reach for?',
    description: 'A simple decision rule with examples you can copy straight into your project.',
    content: '',
    category: 'Technology',
    author: 'Rohit Negi',
    date: '2026-10-02',
    image: 'https://picsum.photos/seed/grid-flex/900/600',
    status: 'published',
    featured: 0,
    readTime: 6
  },
  {
    title: 'Choosing fonts: pair one serif with one sans and stop',
    description: 'Typography rules that save time and make almost any page look intentional.',
    content: '',
    category: 'Design',
    author: 'Karan Bisht',
    date: '2026-09-27',
    image: 'https://picsum.photos/seed/type-specimen/900/600',
    status: 'published',
    featured: 0,
    readTime: 4
  }
];

// ──────────────────────────────────────────────
// Table creation
// ──────────────────────────────────────────────

async function createBlogsTable() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS blogs (
      id          INTEGER  PRIMARY KEY AUTOINCREMENT,
      title       TEXT     NOT NULL,
      description TEXT,
      content     TEXT,
      category    TEXT,
      author_id   INTEGER,
      author      TEXT,
      image       TEXT,
      status      TEXT     DEFAULT 'published' CHECK(status IN ('published', 'draft')),
      featured    INTEGER  DEFAULT 0,
      read_time   INTEGER  DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  console.log('  ✓ blogs table ready');
}

// ──────────────────────────────────────────────
// Idempotent seeding
// ──────────────────────────────────────────────

async function seedBlogs() {
  let inserted = 0;

  for (const post of SEED_POSTS) {
    const existing = await dbGet(
      'SELECT id FROM blogs WHERE title = ? AND author_id IS NULL',
      [post.title]
    );

    if (!existing) {
      await dbRun(
        `INSERT INTO blogs
           (title, description, content, category, author_id, author,
            image, status, featured, read_time, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          post.title,
          post.description,
          post.content,
          post.category,
          post.author,
          post.image,
          post.status,
          post.featured,
          post.readTime,
          post.date
        ]
      );
      inserted++;
    }
  }

  const total = await dbGet('SELECT COUNT(*) as count FROM blogs');
  console.log(`  ✓ Blog seeding: ${inserted} new, ${total.count} total posts in database`);
}

// ──────────────────────────────────────────────
// Query & Data Access Helpers
// ──────────────────────────────────────────────

/**
 * Find a blog post by its primary ID.
 * Returns the blog row or null if not found.
 */
async function findById(id) {
  const row = await dbGet('SELECT * FROM blogs WHERE id = ?', [id]);
  return row || null;
}

/**
 * Retrieve published blogs with filtering, searching, and pagination.
 * NEVER returns drafts.
 */
async function findPublished({ page = 1, limit = 10, category = null, search = null }) {
  // Normalize pagination parameters
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  // Base filter: strictly published
  const conditions = ["status = 'published'"];
  const params = [];

  // Category filter
  if (category && category !== 'All') {
    conditions.push('LOWER(category) = LOWER(?)');
    params.push(category.trim());
  }

  // Search filter (across title and description)
  if (search && search.trim().length > 0) {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    const term = `%${search.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Total count query
  const countRow = await dbGet(
    `SELECT COUNT(*) as total FROM blogs ${whereClause}`,
    params
  );
  const total = countRow ? countRow.total : 0;

  // Data query with ordering and pagination
  const dataParams = [...params, limitNum, offset];
  const blogs = await dbAll(
    `SELECT id, title, description, content, category, author_id, author,
            image, status, featured, read_time, created_at, updated_at
     FROM blogs
     ${whereClause}
     ORDER BY featured DESC, created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    dataParams
  );

  return {
    blogs,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum)
  };
}

/**
 * Retrieve ALL posts (published + drafts) owned by one author, with pagination.
 * Only ever called with the authenticated user's own id.
 */
async function findByAuthor(author_id, { page = 1, limit = 50 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const countRow = await dbGet(
    'SELECT COUNT(*) as total FROM blogs WHERE author_id = ?',
    [author_id]
  );
  const total = countRow ? countRow.total : 0;

  const blogs = await dbAll(
    `SELECT id, title, description, content, category, author_id, author,
            image, status, featured, read_time, created_at, updated_at
     FROM blogs
     WHERE author_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [author_id, limitNum, offset]
  );

  return {
    blogs,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum)
  };
}

/**
 * Insert a new blog post.
 */
async function createBlog({
  title,
  description = '',
  content = '',
  category = 'Technology',
  author_id,
  author,
  image = '',
  status = 'published',
  featured = 0,
  read_time = 1
}) {
  const result = await dbRun(
    `INSERT INTO blogs
       (title, description, content, category, author_id, author,
        image, status, featured, read_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      description,
      content,
      category,
      author_id,
      author,
      image,
      status,
      featured ? 1 : 0,
      read_time
    ]
  );

  return await findById(result.lastID);
}

/**
 * Update an existing blog post.
 * Enforces ownership directly in the SQL WHERE condition (id = ? AND author_id = ?).
 * Automatically updates `updated_at` to CURRENT_TIMESTAMP.
 *
 * @param {number} id - Blog ID
 * @param {number} author_id - Authenticated user's ID
 * @param {Object} fieldsToUpdate - Whitelisted fields to modify
 * @returns {Promise<Object|null>} Updated blog post or null if no row matched
 */
async function updateBlog(id, author_id, fieldsToUpdate) {
  const allowed = [
    'title',
    'description',
    'content',
    'category',
    'image',
    'status',
    'featured',
    'read_time'
  ];

  const setClauses = [];
  const params = [];

  for (const key of allowed) {
    if (fieldsToUpdate[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      if (key === 'featured') {
        params.push(fieldsToUpdate[key] ? 1 : 0);
      } else {
        params.push(fieldsToUpdate[key]);
      }
    }
  }

  if (setClauses.length === 0) {
    return await findById(id);
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id, author_id);

  const result = await dbRun(
    `UPDATE blogs SET ${setClauses.join(', ')} WHERE id = ? AND author_id = ?`,
    params
  );

  if (result.changes === 0) {
    return null;
  }

  return await findById(id);
}

/**
 * Delete a blog post by ID.
 * Enforces ownership directly in the SQL WHERE condition (id = ? AND author_id = ?).
 *
 * @param {number} id - Blog ID
 * @param {number} author_id - Authenticated user's ID
 * @returns {Promise<boolean>} True if a row was deleted, false otherwise
 */
async function deleteBlog(id, author_id) {
  const result = await dbRun(
    'DELETE FROM blogs WHERE id = ? AND author_id = ?',
    [id, author_id]
  );
  return result.changes > 0;
}

module.exports = {
  createBlogsTable,
  seedBlogs,
  findById,
  findPublished,
  findByAuthor,
  createBlog,
  updateBlog,
  deleteBlog,
  SEED_POSTS
};
