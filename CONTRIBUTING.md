### Run instructions (local):

1. `npm install`
2. Create .env following .env.example
3. `npm run dev` -> supports hot reload using --watch so we don't install nodemon

### Run instructions (Docker):

The server ships with a multi-stage Dockerfile that produces a lean production image.

**Build the image:**

```bash
docker build -t control-park-server .
```

**Run the container:**

Pass each environment variable from `.env.example` at runtime:

```bash
docker run -p 9001:9001 \
  -e PORT=9001 \
  -e SUPABASE_URL=<your-url> \
  -e SUPABASE_ACCESS_TOKEN=<your-token> \
  -e SUPABASE_SERVICE_ROLE_KEY=<your-key> \
  control-park-server
```

Alternatively, mount a `.env` file (dotenv picks it up automatically):

```bash
docker run -p 9001:9001 --env-file .env control-park-server
```

The server is reachable at `http://localhost:9001` and the Swagger docs at `http://localhost:9001/api-docs`.

> **Note:** `.env` and `node_modules` are excluded from the image via `.dockerignore`. Never bake secrets into the image.

CI:
- .husky pre-commit rules will run type checks and lint checks for formatting
- GitHub [ci actions](.github/workflows/ci.yml) will run a couple commands below to make sure ur code doesn't break codebase

#### Commands:
- `npm run dev`: runs the index.ts file without typechecking and automatically restarts the Node.js server whenever a file is saved, which allows for quick iterations while working on a project.
- `npm run start`: runs the compiled JavaScript files (that is, the same files that would run in your production environment).
- `npm run build`: runs the TypeScript typechecker and outputs the compiled JavaScript files.
- `npm run type-check`: runs the TypeScript typechecker, without any file output.
- `npm run lint`: runs ESLint throughout all your files and shows which files have yet to be linted.
- `npm run lint:fix`: runs ESLint throughout all your files and applies automatic linting whenever possible.
- `npm run format`: runs Prettier throughout all your files and applies formatting.
- `npm run format:check`: runs Prettier throughout all your files and shows which files have yet to be formatted.

#### For schema migrations to Supabase
- Initialize Supabase config
  - `npx supabase init`
- Link to your remote project
  - `npx supabase link --project-ref <project id>`
- Create a new migration file
  - `npx supabase migration new create_users_table`
  - This creates a file at supabase/migrations/<timestamp>_create_users_table.sql
- Then push it to Supabase:
  - `npx supabase db push`