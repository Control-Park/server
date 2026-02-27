Run instructions:
1. npm install
2. Create .env following .env.example
3. npm run dev -> supports hot reload using --watch so we don't install nodemon

CI:
- .husky pre-commit rules will run type checks and lint checks for formatting
- GitHub [ci actions](.github/workflows/ci.yml) will run a couple commands below to make sure ur code doesn't break codebase

#### Commands:
- **npm run dev**: runs the index.ts file without typechecking and automatically restarts the Node.js server whenever a file is saved, which allows for quick iterations while working on a project.
- **npm run start**: runs the compiled JavaScript files (that is, the same files that would run in your production environment).
- **npm run build**: runs the TypeScript typechecker and outputs the compiled JavaScript files.
- **npm run type-check**: runs the TypeScript typechecker, without any file output.
- **npm run lint**: runs ESLint throughout all your files and shows which files have yet to be linted.
- **npm run lint:fix**: runs ESLint throughout all your files and applies automatic linting whenever possible.
- **npm run format**: runs Prettier throughout all your files and applies formatting.
- **npm run format:check**: runs Prettier throughout all your files and shows which files have yet to be formatted.