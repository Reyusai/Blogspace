/**
 * controllers/blogController.js – Blog CRUD Operations Controller
 * ──────────────────────────────────────────────────────────────
 * Implements endpoints for:
 *   GET    /api/blogs       – Public listing with filters & pagination
 *   GET    /api/blogs/mine  – Authenticated: current user's posts incl. drafts
 *   GET    /api/blogs/:id   – Single blog retrieval (drafts visible to owner only)
 *   POST   /api/blogs       – Create blog (authenticated)
 *   PUT    /api/blogs/:id   – Update blog (authenticated & owner only)
 *   DELETE /api/blogs/:id   – Delete blog (authenticated & owner only)
 *
 * SECURITY PRACTICES:
 *   • Never trusts client-supplied author_id or author names.
 *   • Prevents IDOR: ownership enforced both at controller and SQL query level.
 *   • Prevents mass-assignment: only whitelisted fields can be updated.
 *   • Comprehensive type and length validation on all input fields.
 *   • Enforces integer validation on all ID parameters.
 *   • Original seed posts (author_id === null) are immutable and protected from deletion.
 *   • Draft posts are never leaked to the public or other users.
 */

const mongoose = require('mongoose');
const Blog = require('../models/Blog');

// Valid statuses defined in database CHECK constraint
const ALLOWED_STATUSES = ['published', 'draft'];

// Maximum allowed lengths for fields
const LIMITS = {
  TITLE: 255,
  DESCRIPTION: 1000,
  CONTENT: 50000,
  CATEGORY: 50,
  IMAGE: 500,
  READ_TIME_MAX: 120
};

/**
 * Helper to validate MongoDB ObjectId strings
 */
function validateObjectId(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!mongoose.Types.ObjectId.isValid(trimmed) || !/^[0-9a-fA-F]{24}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * GET /api/blogs
 * Public listing of published blogs with filtering and pagination.
 */
async function getAllBlogs(req, res, next) {
  try {
    const { page, limit, category, search, q } = req.query;

    const searchTerm = search || q || null;

    const result = await Blog.findPublished({
      page,
      limit,
      category,
      search: searchTerm
    });

    return res.status(200).json({
      success: true,
      count: result.blogs.length,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      },
      blogs: result.blogs
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    next(error);
  }
}

/**
 * GET /api/blogs/mine
 * Authenticated: list the current user's own posts (published + drafts).
 * Identity comes only from the verified token, never from client input.
 */
async function getMyBlogs(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await Blog.findByAuthor(req.user.id, { page, limit });

    return res.status(200).json({
      success: true,
      count: result.blogs.length,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      },
      blogs: result.blogs
    });
  } catch (error) {
    console.error('Error fetching own blogs:', error);
    next(error);
  }
}

/**
 * GET /api/blogs/:id
 * Retrieve a single blog post.
 * - Published posts: public.
 * - Draft posts: accessible only to the authenticated owner.
 */
async function getBlogById(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format.'
      });
    }

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found.'
      });
    }

    // If published, return directly
    if (blog.status === 'published') {
      return res.status(200).json({
        success: true,
        blog
      });
    }

    // If draft: only the authenticated author can view it
    const isOwner = req.user && String(req.user.id) === String(blog.author_id);
    if (isOwner) {
      return res.status(200).json({
        success: true,
        blog
      });
    }

    // Return 404 to non-owners so drafts are never leaked or confirmed to exist
    return res.status(404).json({
      success: false,
      message: 'Blog post not found.'
    });
  } catch (error) {
    console.error('Error fetching blog by ID:', error);
    next(error);
  }
}

/**
 * POST /api/blogs
 * Create a new blog post. Requires authentication.
 */
async function createBlog(req, res, next) {
  try {
    const {
      title,
      description,
      content,
      category,
      image,
      status,
      read_time,
      featured
    } = req.body;

    // 1. Validate required title
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title is required and cannot be empty.'
      });
    }

    if (title.length > LIMITS.TITLE) {
      return res.status(400).json({
        success: false,
        message: `Title cannot exceed ${LIMITS.TITLE} characters.`
      });
    }

    // 2. Validate description if provided
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Description must be a string.'
        });
      }
      if (description.length > LIMITS.DESCRIPTION) {
        return res.status(400).json({
          success: false,
          message: `Description cannot exceed ${LIMITS.DESCRIPTION} characters.`
        });
      }
    }

    // 3. Validate content if provided
    if (content !== undefined) {
      if (typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Content must be a string.'
        });
      }
      if (content.length > LIMITS.CONTENT) {
        return res.status(400).json({
          success: false,
          message: `Content cannot exceed ${LIMITS.CONTENT} characters.`
        });
      }
    }

    // 4. Validate category if provided
    if (category !== undefined) {
      if (typeof category !== 'string' || category.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Category cannot be empty.'
        });
      }
      if (category.length > LIMITS.CATEGORY) {
        return res.status(400).json({
          success: false,
          message: `Category cannot exceed ${LIMITS.CATEGORY} characters.`
        });
      }
    }

    // 5. Validate image if provided
    if (image !== undefined) {
      if (typeof image !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Image URL must be a string.'
        });
      }
      if (image.length > LIMITS.IMAGE) {
        return res.status(400).json({
          success: false,
          message: `Image URL cannot exceed ${LIMITS.IMAGE} characters.`
        });
      }
    }

    // 6. Validate status if provided
    const blogStatus = status ? String(status).trim().toLowerCase() : 'published';
    if (!ALLOWED_STATUSES.includes(blogStatus)) {
      return res.status(400).json({
        success: false,
        message: `Status must be either 'published' or 'draft'. Received: '${status}'`
      });
    }

    // 7. Validate / estimate read time
    let readTime = 1;
    if (read_time !== undefined) {
      const parsedReadTime = parseInt(read_time, 10);
      if (isNaN(parsedReadTime) || parsedReadTime < 1 || parsedReadTime > LIMITS.READ_TIME_MAX) {
        return res.status(400).json({
          success: false,
          message: `read_time must be an integer between 1 and ${LIMITS.READ_TIME_MAX}.`
        });
      }
      readTime = parsedReadTime;
    } else {
      const fullText = `${title} ${description || ''} ${content || ''}`;
      const words = fullText.trim().split(/\s+/).length;
      readTime = Math.max(1, Math.ceil(words / 200));
    }

    // 8. Derive author identity strictly from the verified user session
    const newBlog = await Blog.createBlog({
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      content: typeof content === 'string' ? content : '',
      category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : 'Technology',
      author_id: req.user.id,
      author: req.user.name,
      image: typeof image === 'string' ? image.trim() : '',
      status: blogStatus,
      featured: featured ? 1 : 0,
      read_time: readTime
    });

    return res.status(201).json({
      success: true,
      message: 'Blog post created successfully.',
      blog: newBlog
    });
  } catch (error) {
    console.error('Error creating blog:', error);
    next(error);
  }
}

/**
 * PUT /api/blogs/:id
 * Update an existing blog post. Requires authentication and ownership.
 */
async function updateBlog(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format.'
      });
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found.'
      });
    }

    // Prevent modifying original seed posts (author_id IS NULL)
    if (blog.author_id === null || blog.author_id === undefined) {
      return res.status(403).json({
        success: false,
        message: 'Original seeded posts are read-only and cannot be modified.'
      });
    }

    // Enforce ownership: only the author can update
    if (String(blog.author_id) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this blog post.'
      });
    }

    // Validate update payload
    const {
      title,
      description,
      content,
      category,
      image,
      status,
      read_time,
      featured
    } = req.body;

    const fieldsToUpdate = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Title cannot be empty.'
        });
      }
      if (title.length > LIMITS.TITLE) {
        return res.status(400).json({
          success: false,
          message: `Title cannot exceed ${LIMITS.TITLE} characters.`
        });
      }
      fieldsToUpdate.title = title.trim();
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Description must be a string.'
        });
      }
      if (description.length > LIMITS.DESCRIPTION) {
        return res.status(400).json({
          success: false,
          message: `Description cannot exceed ${LIMITS.DESCRIPTION} characters.`
        });
      }
      fieldsToUpdate.description = description.trim();
    }

    if (content !== undefined) {
      if (typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Content must be a string.'
        });
      }
      if (content.length > LIMITS.CONTENT) {
        return res.status(400).json({
          success: false,
          message: `Content cannot exceed ${LIMITS.CONTENT} characters.`
        });
      }
      fieldsToUpdate.content = content;
    }

    if (category !== undefined) {
      if (typeof category !== 'string' || category.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Category cannot be empty.'
        });
      }
      if (category.length > LIMITS.CATEGORY) {
        return res.status(400).json({
          success: false,
          message: `Category cannot exceed ${LIMITS.CATEGORY} characters.`
        });
      }
      fieldsToUpdate.category = category.trim();
    }

    if (image !== undefined) {
      if (typeof image !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Image URL must be a string.'
        });
      }
      if (image.length > LIMITS.IMAGE) {
        return res.status(400).json({
          success: false,
          message: `Image URL cannot exceed ${LIMITS.IMAGE} characters.`
        });
      }
      fieldsToUpdate.image = image.trim();
    }

    if (status !== undefined) {
      const normalizedStatus = String(status).trim().toLowerCase();
      if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: `Status must be either 'published' or 'draft'. Received: '${status}'`
        });
      }
      fieldsToUpdate.status = normalizedStatus;
    }

    if (read_time !== undefined) {
      const readTimeNum = parseInt(read_time, 10);
      if (isNaN(readTimeNum) || readTimeNum < 1 || readTimeNum > LIMITS.READ_TIME_MAX) {
        return res.status(400).json({
          success: false,
          message: `read_time must be an integer between 1 and ${LIMITS.READ_TIME_MAX}.`
        });
      }
      fieldsToUpdate.read_time = readTimeNum;
    }

    if (featured !== undefined) {
      fieldsToUpdate.featured = featured ? 1 : 0;
    }

    // Require at least one valid field to update
    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one valid field must be provided for update.'
      });
    }

    // Ownership enforced in SQL condition (WHERE id = ? AND author_id = ?)
    const updatedBlog = await Blog.updateBlog(id, req.user.id, fieldsToUpdate);

    if (!updatedBlog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found or update unauthorized.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Blog post updated successfully.',
      blog: updatedBlog
    });
  } catch (error) {
    console.error('Error updating blog:', error);
    next(error);
  }
}

/**
 * DELETE /api/blogs/:id
 * Delete a blog post. Requires authentication and ownership.
 */
async function deleteBlog(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid blog ID format.'
      });
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found.'
      });
    }

    // Prevent deleting original seed posts
    if (blog.author_id === null || blog.author_id === undefined) {
      return res.status(403).json({
        success: false,
        message: 'Original seeded posts cannot be deleted.'
      });
    }

    // Enforce ownership
    if (String(blog.author_id) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this blog post.'
      });
    }

    // Ownership enforced directly in SQL condition (WHERE id = ? AND author_id = ?)
    const deleted = await Blog.deleteBlog(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found or deletion unauthorized.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Blog post deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting blog:', error);
    next(error);
  }
}

module.exports = {
  getAllBlogs,
  getMyBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog
};
