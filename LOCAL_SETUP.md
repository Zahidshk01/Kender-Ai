# Running Kender locally (VS Code / Windows)

If you see:

```
'vite' is not recognized as an internal or external command, operable program or batch file.
```

it means dependencies were never installed in this folder (or `node_modules` is
incomplete). `vite` is a local dev dependency, not a global command.

## Steps

1. Open a terminal in the project root (the folder containing `package.json`).
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create your env file:

   ```bash
   copy .env.example .env
   ```

   Fill in at least the `VITE_SUPABASE_*` values (from your Lovable backend
   settings). Server-only keys are needed for AI/chat and payments to work locally.

4. Start the dev server:

   ```bash
   npm run dev
   ```

   Then open http://localhost:8080

## Notes

- Always use `npm run dev`, never a bare `vite` command.
- Node.js 20 or newer is required (`node -v` to check).
- If install fails or the error persists, delete `node_modules` and
  `package-lock.json`, then run `npm install` again.
- Never commit `.env`.
