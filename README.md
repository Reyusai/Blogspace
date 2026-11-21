# BlogSpace

A full-stack blogging platform: users register, log in, write posts (published or draft), edit and delete their own posts, and read everyone's published posts. Plain HTML/CSS/JS frontend + Node.js/Express REST API + SQLite.

## Features

**Implemented and verified by automated tests (see [Testing](#testing)):**
- Registration, login, JWT sessions (restored on reload / new tab), logout
- Duplicate-email rejection; wrong-password and unknown-email both return the same generic error
- Passwords stored as bcrypt hashes (minimum 8 characters enforced)
- Create / edit / delete posts; published or draft status
- Dashboard with **All / Published / Drafts** filters showing only the signed-in user's posts (paginated, works beyond 50 posts)
- Draft privacy: drafts are never in the public list and return 404 to everyone except the author
- Ownership enforcement: other users get 403 on edit/delete; seeded posts are read-only
- Article page loads with or without a cover image; owner-only Edit button
- 8 seeded sample posts (author_id NULL, read-only)

**Not yet verified / not implemented (do these before a public launch):**
- Rate limiting / brute-force protection on login (not implemented)
- Security headers such as `helmet` (not implemented)
- XSS payload testing of every input; output is escaped with `escapeHTML` but not penetration-tested
- JWT expiry/renewal behaviour in the browser
- Browsers other than Chromium; mobile layouts; dark/light theme edge cases
- Production deployment (never deployed or tested live)
- Password reset, email verification, comments, image upload (do not exist)

## Technology stack
- Frontend: HTML5, CSS3, vanilla JavaScript (no build step)
- Backend: Node.js, Express 5, `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`
- Database: SQLite via `sqlite3`

## Folder structure
```
BlogSpace/
├── index.html  login.html  register.html  dashboard.html
├── create-blog.html  article.html          # frontend pages
├── style.css  main.js  storage.js  api.js  # shared frontend scripts (api.js = API client)
├── README.md  API.md  .gitignore
└── backend/
    ├── server.js                  # Express app entry point
    ├── config/database.js         # SQLite connection
    ├── routes/                    # authRoutes.js, blogRoutes.js
    ├── controllers/               # authController.js, blogController.js
    ├── middleware/authMiddleware.js
    ├── models/                    # User.js, Blog.js
    ├── test-*.js                  # automated tests (4 files)
    ├── blogspace.db               # SQLite DB with the 8 seed posts, 0 users
    ├── .env.example               # copy to .env
    ├── package.json  package-lock.json
```

## Installation
Requires Node.js 18+ (tested on Node 22).
```bash
cd backend
npm install
cp .env.example .env     # then edit .env (see below)
```

## Environment variables (`backend/.env`)
| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `NODE_ENV` | `development`, `production` or `test` |
| `JWT_SECRET` | **Required.** Long random string, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `DB_PATH` | SQLite file, relative to `backend/` (default `./blogspace.db`) |
| `CORS_ORIGIN` | Allowed frontend origin when `NODE_ENV=production` (dev allows all) |

Never commit `.env`. It is excluded by `.gitignore` and not in this ZIP.

## Running
**Backend** (terminal 1):
```bash
cd backend
npm start            # http://localhost:5000  (health: /api/health)
```
**Frontend** (terminal 2) - serve the project root with any static server:
```bash
python3 -m http.server 8080     # from the BlogSpace/ folder
# open http://localhost:8080/index.html
```
The frontend calls `http://localhost:5000/api` by default. To point at another API, define `window.BLOGSPACE_API_URL = 'https://your-api.example.com/api'` in a `<script>` before `api.js` on each page.

## Database
- SQLite file `backend/blogspace.db`; tables `users` and `blogs`.
- Shipped with the 8 original seed posts and no users. On every start the server creates missing tables and re-inserts any of the 8 seed posts that are missing (it never duplicates existing ones).
- `.gitignore` excludes `*.db` from Git; keep your own backup of production data.

## API
Summary below; full request/response details in [API.md](API.md).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | no | Health check |
| POST | `/api/auth/register` | no | Create account, returns token |
| POST | `/api/auth/login` | no | Log in, returns token |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/blogs` | no | Published posts (page, limit, category, search) |
| GET | `/api/blogs/mine` | yes | Current user's posts incl. drafts (page, limit) |
| GET | `/api/blogs/:id` | optional | Published post; drafts only for their author |
| POST | `/api/blogs` | yes | Create post |
| PUT | `/api/blogs/:id` | yes (owner) | Update post |
| DELETE | `/api/blogs/:id` | yes (owner) | Delete post |

## Authentication workflow
1. `POST /api/auth/register` or `/login` returns `{ token, user }`.
2. The frontend stores the token in `localStorage` and sends `Authorization: Bearer <token>` on protected calls.
3. On page load the dashboard/editor check for a stored session; no token redirects to `login.html`.
4. Logout clears the stored session. A 401 response also clears it.

## Testing
```bash
cd backend
npm test          # runs all four suites
```
Suites: `test-database.js` (schema/constraints; uses `blogspace.db`, so run it on a copy if you need the DB pristine), `test-auth.js`, `test-blogs.js`, `test-frontend-integration.js` (the last three use a temporary `blogspace.test.db` that they create and delete).

Browser (Playwright/Chromium) end-to-end checks were run during development against a scratch copy; those scripts are not part of this package.

## Deployment (guidance, not yet performed)
1. Backend: host on a Node-capable service (Render, Railway, VPS). Set `NODE_ENV=production`, a strong `JWT_SECRET`, `CORS_ORIGIN=<your frontend URL>`, and keep `backend/blogspace.db` on a **persistent disk** (SQLite files are lost on ephemeral filesystems).
2. Frontend: upload the root HTML/CSS/JS files to any static host (GitHub Pages, Netlify) and set `window.BLOGSPACE_API_URL` to your API URL. Use HTTPS for both.
3. Before going live, complete the "Not yet verified" items above (rate limiting and security headers first).
