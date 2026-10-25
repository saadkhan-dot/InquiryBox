# InquiryBox 2.0

Customer enquiry management REST API using Node.js, Express 4, PostgreSQL, `pg`, bcrypt, and JWT. Routes validate input, authenticate through a Bearer token, reload the account and current role from PostgreSQL, then execute parameterized SQL. Regular accounts see only their enquiries; admins can manage all enquiries. Rows that predate ownership remain unowned and are visible only to admins.

## Requirements and setup

Use Node.js 18+ and PostgreSQL 12+. Install and configure:

```sh
npm install
cp .env.example .env
createdb inquirybox
npm run db:init
npm start
```

Set database credentials and a randomly generated JWT secret in `.env`. Production refuses to start with a missing, weak, or placeholder JWT secret. API startup never applies schema changes. `db:init` creates the complete schema for a fresh database without dropping existing objects. For an existing installation, first take a verified PostgreSQL backup (for example `pg_dump -Fc inquirybox > inquirybox-before-upgrade.dump`), then run `npm run db:migrate`. Migration `001_users_and_ownership` adds `users`, nullable `enquiries.user_id`, and its index in a transaction. Existing enquiry rows are preserved with `user_id = NULL`.

## Admin bootstrap

Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique strong `ADMIN_PASSWORD` (12–72 characters) in the process environment, then run `npm run admin:create`. It hashes the password and refuses to alter an existing account. Remove the password from the environment afterward. There is no public admin registration; normal registration always assigns `user`.

## Authentication and permissions

Register with `POST /api/auth/register`, then login with `POST /api/auth/login`. Send the returned token as `Authorization: Bearer <token>`. `/api/auth/me` returns the safe profile. JWTs last `JWT_EXPIRES_IN` (default `1h`). Logout is client-side: discard the token; it remains valid until expiry. Authentication re-reads the user and role for every protected request, so deleted accounts and role changes take effect immediately.

| Role | Permissions |
|---|---|
| user | Create and manage own enquiries only |
| admin | Manage all enquiries, including unowned legacy rows |

Foreign enquiry IDs return `404` to users to avoid exposing another account's records. Requests without valid authentication return `401`.

## API

All successful responses are JSON. Validation errors return `400`, duplicate emails `409`, rate limits `429`, missing or concealed records `404`, and unexpected errors a generic `500`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` (also `/health`) | Health |
| POST | `/api/auth/register` | Register as user |
| POST | `/api/auth/login` | Obtain JWT |
| GET | `/api/auth/me` | Current safe profile |
| POST | `/api/enquiries` | Create owned enquiry |
| GET | `/api/enquiries` | List permitted enquiries |
| GET | `/api/enquiries/:id` | Retrieve permitted enquiry |
| PATCH | `/api/enquiries/:id/status` | Update status |
| DELETE | `/api/enquiries/:id` | Delete permitted enquiry |

Enquiry fields: `customer_name` (100 chars), `email` (255), `phone` (optional, 20), `subject` (150), `message` (10,000), optional status (`new`, `in_progress`, `resolved`, default `new`). Submitted emails are trimmed and lowercased. Client ownership fields are ignored. Listing supports `limit` (default 20, maximum 100), `offset`, `status`, `search` (name/email/subject/message), `sort` (`created_at`, `updated_at`, `customer_name`, `status`), and `order` (`asc` or `desc`). Response metadata includes returned `count`, matching `total`, `limit`, `offset`, and `data`.

Examples (assumes `TOKEN` is set):

```sh
curl -X POST localhost:5050/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Sam Lee","email":"sam@example.com","password":"ChangeThis12345"}'
curl -X POST localhost:5050/api/auth/login -H 'Content-Type: application/json' -d '{"email":"sam@example.com","password":"ChangeThis12345"}'
curl -X POST localhost:5050/api/enquiries -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"customer_name":"Sam Lee","email":"sam@example.com","subject":"Question","message":"Can you help?"}'
curl 'localhost:5050/api/enquiries?status=new&limit=10&offset=0&search=help&sort=created_at&order=desc' -H "Authorization: Bearer $TOKEN"
curl -X PATCH localhost:5050/api/enquiries/1/status -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"status":"in_progress"}'
curl -X DELETE localhost:5050/api/enquiries/1 -H "Authorization: Bearer $TOKEN"
```

## Configuration and tests

See `.env.example`. CORS is not enabled (same-origin/server-to-server use); configure an explicit origin policy if a browser client needs cross-origin requests. Auth endpoints have a configurable in-memory per-IP limiter (`AUTH_RATE_LIMIT`, default 30 per 15 minutes); use a shared store for multi-instance deployments. JSON requests are limited to 32 KB (`JSON_LIMIT`).

Run `npm test` for HTTP tests with mocked PostgreSQL access. They do not need a database. For live PostgreSQL coverage, first create and initialize a dedicated test database, then set its connection variables and run `npm run test:postgres`. The integration script refuses to run unless `DB_NAME` ends in `_test`; it creates uniquely named test records and does not clean or drop the database. Import `InquiryBox.postman_collection.json` for request examples.

## Limitations

JWT logout does not revoke a stolen token before expiry. The in-memory rate limiter resets on restart and is not shared across workers. TLS termination, secret rotation, database backup monitoring, and production deployment configuration remain operational responsibilities. These controls do not by themselves establish production security.
