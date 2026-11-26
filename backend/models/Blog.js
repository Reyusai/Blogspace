/**
 * models/Blog.js – Blogs collection schema, seeding, and database queries
 * ────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Acts as the Data Access Layer (DAL) for blogs.
 *   Provides helper functions for all CRUD operations using Mongoose.
 *
 * DESIGN DECISIONS:
 *   • Listing queries strictly enforce `status: 'published'` to protect drafts.
 *   • Search inspects both `title` and `description` using case-insensitive regex.
 *   • Safe pagination defaults: page >= 1, 1 <= limit <= 50.
 *   • Preserves exact API contract: translates MongoDB `_id` to string `id`.
 *   • Seed posts have `author_id: null` and are immutable.
 */

const mongoose = require('mongoose');

// ──────────────────────────────────────────────
// Seed data – 8 curated original posts
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
// Schema Definition
// ──────────────────────────────────────────────
const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      maxlength: [255, 'Title cannot exceed 255 characters'],
      trim: true
    },
    description: {
      type: String,
      default: '',
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      trim: true
    },
    content: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      default: 'Technology',
      trim: true
    },
    author_id: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true
    },
    author: {
      type: String,
      required: [true, 'Author is required'],
      trim: true
    },
    image: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: {
        values: ['published', 'draft'],
        message: 'Status must be either "published" or "draft"'
      },
      default: 'published',
      index: true
    },
    featured: {
      type: Number,
      default: 0
    },
    read_time: {
      type: Number,
      default: 1
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

blogSchema.index({ status: 1, featured: -1, created_at: -1 });

const Blog = mongoose.models.Blog || mongoose.model('Blog', blogSchema);

/**
 * Transform a Mongoose blog document or raw object into standard API response shape
 */
function transformBlog(doc) {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: raw._id ? raw._id.toString() : raw.id,
    title: raw.title,
    description: raw.description || '',
    content: raw.content || '',
    category: raw.category || 'Technology',
    author_id: raw.author_id ? raw.author_id.toString() : null,
    author: raw.author,
    image: raw.image || '',
    status: raw.status || 'published',
    featured: raw.featured ? 1 : 0,
    read_time: raw.read_time || 1,
    created_at: raw.created_at ? (typeof raw.created_at === 'string' ? raw.created_at : raw.created_at.toISOString()) : new Date().toISOString(),
    updated_at: raw.updated_at ? (typeof raw.updated_at === 'string' ? raw.updated_at : raw.updated_at.toISOString()) : new Date().toISOString()
  };
}

/**
 * Initialize blogs collection
 */
async function createBlogsTable() {
  await Blog.init();
  console.log('  ✓ blogs collection ready');
}

/**
 * Idempotent seeding for the 8 original posts
 */
async function seedBlogs() {
  let inserted = 0;

  for (const post of SEED_POSTS) {
    const existing = await Blog.findOne({
      title: post.title,
      author_id: null
    }).exec();

    if (!existing) {
      await Blog.create({
        title: post.title,
        description: post.description,
        content: post.content,
        category: post.category,
        author_id: null,
        author: post.author,
        image: post.image,
        status: post.status,
        featured: post.featured ? 1 : 0,
        read_time: post.readTime,
        created_at: new Date(post.date),
        updated_at: new Date(post.date)
      });
      inserted++;
    }
  }

  const total = await Blog.countDocuments().exec();
  console.log(`  ✓ Blog seeding: ${inserted} new, ${total} total posts in database`);
}

/**
 * Find a blog post by its primary ID
 */
async function findById(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  const blog = await Blog.findById(id).exec();
  return transformBlog(blog);
}

/**
 * Retrieve published blogs with filtering, searching, and pagination
 */
async function findPublished({ page = 1, limit = 10, category = null, search = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const query = { status: 'published' };

  if (category && category !== 'All') {
    query.category = new RegExp(`^${category.trim()}$`, 'i');
  }

  if (search && search.trim().length > 0) {
    const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(term, 'i');
    query.$or = [{ title: regex }, { description: regex }];
  }

  const total = await Blog.countDocuments(query).exec();
  const rawBlogs = await Blog.find(query)
    .sort({ featured: -1, created_at: -1, _id: -1 })
    .skip(offset)
    .limit(limitNum)
    .exec();

  const blogs = rawBlogs.map(transformBlog);

  return {
    blogs,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}

/**
 * Retrieve ALL posts (published + drafts) owned by one author, with pagination
 */
async function findByAuthor(author_id, { page = 1, limit = 50 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  // Query by author_id (matching string or ObjectId)
  const authorQuery = mongoose.Types.ObjectId.isValid(author_id)
    ? { author_id: { $in: [author_id, new mongoose.Types.ObjectId(author_id)] } }
    : { author_id };

  const total = await Blog.countDocuments(authorQuery).exec();
  const rawBlogs = await Blog.find(authorQuery)
    .sort({ created_at: -1, _id: -1 })
    .skip(offset)
    .limit(limitNum)
    .exec();

  const blogs = rawBlogs.map(transformBlog);

  return {
    blogs,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}

/**
 * Insert a new blog post
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
  const newBlog = await Blog.create({
    title,
    description,
    content,
    category,
    author_id,
    author,
    image,
    status,
    featured: featured ? 1 : 0,
    read_time,
    created_at: new Date(),
    updated_at: new Date()
  });

  return transformBlog(newBlog);
}

/**
 * Update an existing blog post
 */
async function updateBlog(id, author_id, fieldsToUpdate) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

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

  const updateDoc = {};
  for (const key of allowed) {
    if (fieldsToUpdate[key] !== undefined) {
      if (key === 'featured') {
        updateDoc[key] = fieldsToUpdate[key] ? 1 : 0;
      } else {
        updateDoc[key] = fieldsToUpdate[key];
      }
    }
  }

  if (Object.keys(updateDoc).length === 0) {
    return await findById(id);
  }

  updateDoc.updated_at = new Date();

  const authorFilter = mongoose.Types.ObjectId.isValid(author_id)
    ? { $in: [author_id, new mongoose.Types.ObjectId(author_id)] }
    : author_id;

  const updated = await Blog.findOneAndUpdate(
    { _id: id, author_id: authorFilter },
    { $set: updateDoc },
    { returnDocument: 'after' }
  ).exec();

  if (!updated) {
    return null;
  }

  return transformBlog(updated);
}

/**
 * Delete a blog post by ID
 */
async function deleteBlog(id, author_id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return false;
  }

  const authorFilter = mongoose.Types.ObjectId.isValid(author_id)
    ? { $in: [author_id, new mongoose.Types.ObjectId(author_id)] }
    : author_id;

  const result = await Blog.deleteOne({
    _id: id,
    author_id: authorFilter
  }).exec();

  return result.deletedCount > 0;
}

Blog.createBlogsTable = createBlogsTable;
Blog.seedBlogs = seedBlogs;
Blog.findByIdCustom = findById;
Blog.findPublished = findPublished;
Blog.findByAuthor = findByAuthor;
Blog.createBlog = createBlog;
Blog.updateBlog = updateBlog;
Blog.deleteBlog = deleteBlog;
Blog.SEED_POSTS = SEED_POSTS;

module.exports = {
  Blog,
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
