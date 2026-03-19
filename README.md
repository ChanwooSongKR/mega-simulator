# MEGA Simulator

Simulates the MEGA SCAFFOLD pipeline question flow. Experience the full Research → PRD → Data → Workflow sequence in a browser.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set your Gemini API key. Either:
   - Add `GEMINI_API_KEY=your-key` to `../docs/.env`, or
   - Create a `.env` file in this directory: `GEMINI_API_KEY=your-key`

3. Start the server:
   ```bash
   npm start
   ```

4. Open http://localhost:3000

## Development

```bash
npm run dev   # auto-restart on file changes
```

## Tests

```bash
node phases.test.js   # question catalog tests
node session.test.js  # session + sequencing tests
node test-e2e.js      # full API walkthrough (requires server running)
```

## Architecture

- `phases.js` — all questions hardcoded from agent .md files
- `session.js` — in-memory session store + question sequencing
- `gemini.js` — context messages + skip detection
- `server.js` — Express API (3 routes)
- `public/` — vanilla JS SPA (no build step)
