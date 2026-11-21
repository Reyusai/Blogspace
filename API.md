# BlogSpace API

Base URL: `http://localhost:5000/api`. JSON in/out. Protected routes need `Authorization: Bearer <token>`.
All responses include `success` (boolean); errors include `message`.

## Auth
**POST /auth/register** - body `{ "name", "email", "password" }` (password >= 8 chars). `201` -> `{ token, user }`. `400` validation, `409` email already registered.
**POST /auth/login** - body `{ "email", "password" }`. `200` -> `{ token, user }`. `401` "Invalid email or password." (same message for unknown email and wrong password).
**GET /auth/me** (auth) - `200` -> `{ user }`. `401` if missing/invalid token.

## Blogs
Blog object: `id, title, description, content, category, author_id, author, image, status ("published"|"draft"), featured, read_time, created_at, updated_at`.

**GET /blogs** - public, published only. Query: `page` (default 1), `limit` (1-50, default 10), `category`, `search`. `200` -> `{ count, pagination: { page, limit, total, totalPages }, blogs }`.

**GET /blogs/mine** (auth) - the signed-in user's own posts, published and drafts, newest first. Query: `page`, `limit` (1-50, default 50). Same response shape as `GET /blogs`. Identity comes from the token only. `401` without a valid token.

**GET /blogs/:id** - published posts are public. A draft returns `200` only to its author; everyone else gets `404` (existence is not revealed). `400` for a non-integer id.

**POST /blogs** (auth) - body: `title` (required, <=255), optional `description` (<=1000), `content` (<=50000), `category` (<=50), `image` (<=500), `status` (`published` default | `draft`), `read_time` (1-120, estimated if omitted), `featured`. `201` -> `{ blog }`. Author is taken from the token, never from the body.

**PUT /blogs/:id** (auth, owner) - any subset of the POST fields. `403` if not the author or if it is a seeded post; `404` if missing; `400` for invalid fields or an empty update.

**DELETE /blogs/:id** (auth, owner) - `200` on success; `403` if not the author or a seeded post; `404` if missing.

## Other
**GET /health** - `200` `{ status, environment, ... }`.
In production, 5xx responses hide internal error details.
