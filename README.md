# 💰 My Expenses — Static Personal Expense & Credit Tracker PWA (₹)

A 100% static, offline-first Progressive Web App (PWA) for tracking personal expenses, credits, and monthly budgets in Indian Rupees (`₹`). There is **no backend server, no database server, no environment variables, no login, and no API calls**—open the link and use it immediately. All data lives privately on your phone in **IndexedDB** (with automatic `localStorage` fallback) and persists across sessions.

---

## Project Files

- `index.html` — Single-page static app with swipeable **💸 Expenses** and **💰 Credits** pages, Monthly Budget box, Summary, Entry forms, Day/Month/Year Dashboards, Lists, and Backup card.
- `styles.css` — Mobile-first stylesheet (`max-width: 480px`, `viewport-fit=cover`, CSS scroll-snap swipe pages, automatic light/dark mode).
- `app.js` — Plain JavaScript logic with Indian Rupee (`₹`, `en-IN`) formatting, IndexedDB + `localStorage` persistence, `navigator.storage.persist()`, inline SVG charts, and JSON/CSV backup & merge restore.
- `manifest.json` — Web App Manifest (`standalone` display, `#7c3aed` purple theme).
- `sw.js` — Service Worker caching all static files for full offline operation.
- `icon.svg` (plus PNG icons in `public/`) — App icon assets for Android and iOS home screens.

---

## 1. How to Deploy (GitHub Pages, Netlify, or Vercel)

Because this app is 100% static HTML, CSS, and JavaScript, it deploys directly without any backend or environment variables:

### Option A: GitHub Pages
1. Push these files (`index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js`, `icon.svg`, and icons) to a GitHub repository.
2. Go to **Settings** → **Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**, pick `main` and `/ (root)`, and click **Save**.

### Option B: Netlify
1. Drag and drop the project folder onto [app.netlify.com/drop](https://app.netlify.com/drop), or connect your Git repository.
2. No environment variables are needed.

### Option C: Vercel
1. Run `npx vercel` in the project folder, or import the Git repository at [vercel.com/new](https://vercel.com/new).
2. Deploy with no environment variables.
