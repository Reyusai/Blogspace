/**
 * models/User.js – User Model and Mongoose Schema
 * ─────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Acts as the Data Access Layer (DAL) for users.
 *   Encapsulates all MongoDB operations related to the `users` collection
 *   using Mongoose schemas and models.
 *
 * SECURITY PRACTICES:
 *   • Passwords are encrypted before storage and never returned in safe queries.
 *   • Enforces unique, lowercase email addresses with trimmed values.
 *   • Maps MongoDB `_id` to `id` string for API contract consistency.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    password: {
      type: String,
      required: [true, 'Password is required']
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : doc.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : doc.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

/**
 * Ensure user indexes (e.g. unique email) are initialized.
 * Replaces old createUsersTable() from SQLite.
 */
async function createUsersTable() {
  await User.init();
  console.log('  ✓ users collection ready');
}

/**
 * Find a user by email (returns full user record including password hash).
 * Used internally during login verification.
 * 
 * @param {string} email - Normalized lowercase email address
 * @returns {Promise<Object|null>} Full user object or null
 */
async function findByEmail(email) {
  if (!email) return null;
  const user = await User.findOne({ email: email.trim().toLowerCase() }).exec();
  if (!user) return null;
  return {
    id: user._id.toString(),
    _id: user._id,
    name: user.name,
    email: user.email,
    password: user.password,
    created_at: user.created_at
  };
}

/**
 * Find a safe user by ID (excludes password hash).
 * Used by auth middleware and profile lookups.
 * 
 * @param {string|number} id - User ID (ObjectId string)
 * @returns {Promise<Object|null>} Safe user object or null
 */
async function findById(id) {
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const user = await User.findById(id).select('-password').exec();
  if (!user) return null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    created_at: user.created_at
  };
}

/**
 * Insert a new user into the database.
 * 
 * @param {Object} userData - { name, email, password (hashed) }
 * @returns {Promise<Object>} Created safe user object (excluding password)
 */
async function createUser({ name, email, password }) {
  const user = new User({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password
  });
  await user.save();

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    created_at: user.created_at
  };
}

/**
 * Helper to strip the password hash from a user object
 * before returning it to the client.
 */
function toSafeUser(user) {
  if (!user) return null;
  const safeUser = { ...user };
  delete safeUser.password;
  delete safeUser._id;
  delete safeUser.__v;
  if (!safeUser.id && user._id) {
    safeUser.id = user._id.toString();
  }
  return safeUser;
}

module.exports = {
  User,
  createUsersTable,
  findByEmail,
  findById,
  createUser,
  toSafeUser
};
