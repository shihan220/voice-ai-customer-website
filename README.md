
# Premium Visual Content Presentation

This repository is now separated into clear application layers:

- `frontend/` - Vite/React landing page and UI source
- `backend/` - Express API and PostgreSQL access
- `database/` - SQL schema and database bootstrap assets

The original design source is available at:
https://www.figma.com/design/uDEFsKtXof3VABSTHU3TVY/Premium-Visual-Content-Presentation

## Running the code

Install dependencies from the repository root:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Start the backend:

```bash
npm run dev:backend
```

Start both together:

```bash
npm run dev:all
```

Import voice records into PostgreSQL:

```bash
npm run db:import:voices
```

Start PostgreSQL with Docker:

```bash
docker compose up -d
```
  
