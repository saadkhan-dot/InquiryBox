# InquiryBox

InquiryBox is a small enquiry management REST API built with Node.js, Express, PostgreSQL, and `pg`. It uses CommonJS, parameterized SQL, controller-based request handling, and environment-based database configuration.

## Project layout

- `src/app.js`: Express middleware, routes, and JSON error handling
- `src/server.js`: starts the HTTP server
- `src/routes/`: health and enquiry routes
- `src/controllers/enquiryController.js`: validation and enquiry queries
- `src/config/db.js`: PostgreSQL connection pool
- `src/scripts/initDb.js` and `schema.sql`: safe, repeatable initial schema setup
- `test/api.test.js`: isolated HTTP/API tests using Node's built-in test runner
- `InquiryBox.postman_collection.json`: importable API requests

## Setup

Requirements: Node.js 18 or newer and PostgreSQL 12 or newer.

From the project directory:

```sh
npm install
cp .env.example .env
```

Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in your local `.env`. The server defaults to port 3000; set `PORT=5050` if you want the examples below unchanged. Create the PostgreSQL database if needed, then initialize its table and indexes:

```sh
createdb inquirybox
npm run db:init
```

`db:init` creates missing schema objects without dropping or clearing existing enquiry records. Run the API:

```sh
npm start
# or, with Node's watch mode:
npm run dev
```

The Postman collection defaults to `http://localhost:5050`; change its `baseUrl` variable if your server uses another port.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | API overview |
| `GET` | `/health` | Health check |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/enquiries` | Create an enquiry |
| `GET` | `/api/enquiries` | List enquiries; optional `?status=new`, `?status=in_progress`, or `?status=resolved` |
| `GET` | `/api/enquiries/:id` | Retrieve one enquiry |
| `PATCH` | `/api/enquiries/:id/status` | Change status |
| `DELETE` | `/api/enquiries/:id` | Delete an enquiry |

Create JSON fields: `customer_name` (required, up to 100 characters), `email` (required, valid email, up to 255), `subject` (required, up to 150), `message` (required, up to 10,000), `phone` (optional string, up to 20), and `status` (optional; defaults to `new`). Status values are `new`, `in_progress`, and `resolved`. Text fields must be non-empty when required. IDs must be positive safe integers. Invalid input returns HTTP 400; missing records return 404. Unexpected errors return a generic JSON 500 response, with technical details logged server-side.

Example:

```sh
curl -i http://localhost:5050/api/health
curl -i -X POST http://localhost:5050/api/enquiries \
  -H 'Content-Type: application/json' \
  -d '{"customer_name":"Sam Lee","email":"sam@example.com","subject":"Question","message":"Can you help?"}'
```

## Tests and Postman

Run isolated API tests, which stub database queries and do not require PostgreSQL credentials:

```sh
npm test
```

Import `InquiryBox.postman_collection.json` into Postman. The collection captures the ID from a successful create request for later retrieve, update, and delete examples. It also includes validation, invalid ID/status, malformed JSON, and not-found requests. Run the successful CRUD requests against a locally configured database; the validation requests do not need database access.

## Safety notes

`.env` and `node_modules/` are ignored by Git. Do not commit real credentials. All SQL values are passed as parameters. The schema script uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`; it does not reset data.
