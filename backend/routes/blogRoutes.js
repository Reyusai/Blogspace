/**
 * routes/blogRoutes.js – Blog Endpoints Routing
 * ──────────────────────────────────────────────
 * Maps HTTP routes to blog controller functions.
 *
 * ENDPOINTS:
 *   GET    /api/blogs       -> Public: List published blogs (filters + pagination)
 *   GET    /api/blogs/mine  -> Protected: List own blogs incl. drafts
 *   GET    /api/blogs/:id   -> Public (drafts owner only): Single blog retrieval
 *   POST   /api/blogs       -> Protected: Create new blog
 *   PUT    /api/blogs/:id   -> Protected: Update own blog
 *   DELETE /api/blogs/:id   -> Protected: Delete own blog
 */

const express = require('express');
const router = express.Router();

const blogController = require('../controllers/blogController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');

// Public listing
router.get('/', blogController.getAllBlogs);

// Current user's own posts incl. drafts (must be declared before '/:id')
router.get('/mine', authMiddleware, blogController.getMyBlogs);

// Single blog retrieval (uses optional auth so owners can see their own drafts)
router.get('/:id', optionalAuthMiddleware, blogController.getBlogById);

// Protected blog modifications (requires valid JWT)
router.post('/', authMiddleware, blogController.createBlog);
router.put('/:id', authMiddleware, blogController.updateBlog);
router.delete('/:id', authMiddleware, blogController.deleteBlog);

module.exports = router;
