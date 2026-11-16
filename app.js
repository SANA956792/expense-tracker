// 💰 My Expenses — Static Personal Expense & Credit Tracker PWA
// Plain JavaScript (Zero frameworks, zero external libraries, zero network requests)
// Storage: IndexedDB primary + localStorage fallback, wrapped in try/catch

const DB_NAME = 'MyExpensesStaticDB';
const DB_VERSION = 2;
const LS_KEYS = {
  EXPENSES: 'my_expenses_static_v1_expenses',
  CATEGORIES: 'my_expenses_static_v1_categories',
  CREDITS: 'my_expenses_static_v1_credits',
  CREDIT_SOURCES: 'my_expenses_static_v1_credit_sources',
  BUDGETS: 'my_expenses_static_v1_budgets',
  LAST_PAGE: 'my_expenses_static_v1_last_page',
  LAST_BACKUP: 'my_expenses_static_v1_last_backup',
};

function toAmountNumber(val) {
  const num = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

const DEFAULT_CATEGORIES = [
  { id: 'cat-food', name: 'Food', emoji: '🍔', is_default: true },
  { id: 'cat-travel', name: 'Travel', emoji: '🚌', is_default: true },
  { id: 'cat-shopping', name: 'Shopping', emoji: '🛍️', is_default: true },
  { id: 'cat-bills', name: 'Bills', emoji: '💡', is_default: true },
  { id: 'cat-health', name: 'Health', emoji: '🏥', is_default: true },
  { id: 'cat-fun', name: 'Fun', emoji: '🎬', is_default: true },
  { id: 'cat-groceries', name: 'Groceries', emoji: '🛒', is_default: true },
  { id: 'cat-other', name: 'Other', emoji: '📦', is_default: true },
];

const DEFAULT_CREDIT_SOURCES = [
  { id: 'src-salary', name: 'Salary', emoji: '💼', is_default: true },
  { id: 'src-gift', name: 'Gift', emoji: '🎁', is_default: true },
  { id: 'src-refund', name: 'Refund', emoji: '↩️', is_default: true },
  { id: 'src-cash', name: 'Cash', emoji: '💵', is_default: true },
  { id: 'src-interest', name: 'Interest', emoji: '🏦', is_default: true },
  { id: 'src-other', name: 'Other', emoji: '📦', is_default: true },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// --- INDIAN RUPEE (₹) NUMBER FORMATTING ---
// Shows only ₹ symbol before every amount, Indian digit grouping ("en-IN"), hides ".00" for whole numbers
function formatINR(amount) {
  const num = Math.round((Number(amount) || 0) * 100) / 100;
  const absNum = Math.abs(num);
  const isWhole = Math.abs(absNum - Math.trunc(absNum)) < 1e-9;
  const formatted = absNum.toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return (num < 0 ? '-₹' : '₹') + formatted;
}

// Compact ₹ formatter for tight SVG bar chart labels
function formatINRCompact(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return '';
  if (num >= 100000) {
    const lakhs = Math.round((num / 100000) * 10) / 10;
    return '₹' + lakhs.toLocaleString('en-IN') + 'L';
  }
  if (num >= 1000) {
    const k = Math.round((num / 1000) * 10) / 10;
    return '₹' + k.toLocaleString('en-IN') + 'k';
  }
  return '₹' + num.toLocaleString('en-IN');
}

function generateId(prefix = 'id') {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return prefix + '-' + crypto.randomUUID();
    }
  } catch {
    // fallback below
  }
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function toLocalDateKey(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function toLocalMonthKey(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

function formatDateTimeDisplay(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) +
    ' · ' +
    d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  );
}

// --- STORAGE ENGINE (IndexedDB + localStorage Fallback, all wrapped in try/catch) ---
let dbInstance = null;

function openDatabase() {
  return new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        try {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('expenses')) {
            db.createObjectStore('expenses', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('categories')) {
            db.createObjectStore('categories', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('credits')) {
            db.createObjectStore('credits', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('credit_sources')) {
            db.createObjectStore('credit_sources', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        } catch (err) {
          console.warn('IndexedDB upgrade warning:', err);
        }
      };
      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function readLocalStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function idbGetAll(storeName) {
  try {
    if (!dbInstance || !dbInstance.objectStoreNames.contains(storeName)) return null;
    return await new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbReplaceAll(storeName, items) {
  try {
    if (!dbInstance || !dbInstance.objectStoreNames.contains(storeName)) return false;
    return await new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        items.forEach((item) => store.put(item));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

async function idbGetMeta(key) {
  try {
    if (!dbInstance || !dbInstance.objectStoreNames.contains('meta')) return null;
    return await new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction('meta', 'readonly');
        const store = tx.objectStore('meta');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbSetMeta(key, value) {
  try {
    if (!dbInstance || !dbInstance.objectStoreNames.contains('meta')) return false;
    return await new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        store.put({ key, value });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

async function idbDeleteMeta(key) {
  try {
    if (!dbInstance || !dbInstance.objectStoreNames.contains('meta')) return false;
    return await new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

function normalizeExpenseRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const amount = toAmountNumber(raw.amount);
  if (amount <= 0) return null;
  const createdDate = raw.created_at ? new Date(raw.created_at) : new Date();
  const createdIso = Number.isNaN(createdDate.getTime()) ? new Date().toISOString() : createdDate.toISOString();
  return {
    id: String(raw.id || generateId('exp')),
    amount,
    reason: String(raw.reason || '').trim().slice(0, 160),
    category: String(raw.category || 'Food').trim().slice(0, 36) || 'Food',
    created_at: createdIso,
  };
}

function normalizeCreditRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const amount = toAmountNumber(raw.amount);
  if (amount <= 0) return null;
  const createdDate = raw.created_at ? new Date(raw.created_at) : new Date();
  const createdIso = Number.isNaN(createdDate.getTime()) ? new Date().toISOString() : createdDate.toISOString();
  return {
    id: String(raw.id || generateId('cred')),
    amount,
    note: String(raw.note || '').trim().slice(0, 160),
    source: String(raw.source || 'Salary').trim().slice(0, 36) || 'Salary',
    created_at: createdIso,
  };
}

// --- APPLICATION STATE ---
const nowInit = new Date();
const state = {
  expenses: [],
  categories: [...DEFAULT_CATEGORIES],
  selectedCategory: 'Food',
  credits: [],
  creditSources: [...DEFAULT_CREDIT_SOURCES],
  selectedSource: 'Salary',
  // Monthly budgets keyed by YYYY-MM (e.g. { "2026-11": 25000 })
  budgets: {},
  activePage: 'expenses', // 'expenses' | 'credits'
  lastBackupAt: null,
  // Expenses Dashboard period state
  dashTab: 'month', // 'day' | 'month' | 'year'
  dashDate: toLocalDateKey(nowInit),
  dashYear: nowInit.getFullYear(),
  dashMonth: nowInit.getMonth(),
  dashYearOnly: nowInit.getFullYear(),
  // Credits Dashboard period state
  credDashTab: 'month', // 'day' | 'month' | 'year'
  credDashDate: toLocalDateKey(nowInit),
  credDashYear: nowInit.getFullYear(),
  credDashMonth: nowInit.getMonth(),
  credDashYearOnly: nowInit.getFullYear(),
  // Expense list filter state
  listPeriodType: 'all',
  listFilterDay: toLocalDateKey(nowInit),
  listFilterMonth: toLocalMonthKey(nowInit),
  listFilterYear: String(nowInit.getFullYear()),
  listFilterCategory: 'all',
  listSearch: '',
  deferredInstallPrompt: null,
};

async function persistExpenses() {
  const savedLs = writeLocalStorageJson(LS_KEYS.EXPENSES, state.expenses);
  const savedIdb = await idbReplaceAll('expenses', state.expenses);
  return Boolean(savedLs || savedIdb);
}

async function persistCategories() {
  const savedLs = writeLocalStorageJson(LS_KEYS.CATEGORIES, state.categories);
  const savedIdb = await idbReplaceAll('categories', state.categories);
  return Boolean(savedLs || savedIdb);
}

async function persistCredits() {
  const savedLs = writeLocalStorageJson(LS_KEYS.CREDITS, state.credits);
  const savedIdb = await idbReplaceAll('credits', state.credits);
  return Boolean(savedLs || savedIdb);
}

async function persistCreditSources() {
  const savedLs = writeLocalStorageJson(LS_KEYS.CREDIT_SOURCES, state.creditSources);
  const savedIdb = await idbReplaceAll('credit_sources', state.creditSources);
  return Boolean(savedLs || savedIdb);
}

async function persistBudgets() {
  const savedLs = writeLocalStorageJson(LS_KEYS.BUDGETS, state.budgets);
  const savedIdb = await idbSetMeta('budgets', state.budgets);
  return Boolean(savedLs || savedIdb);
}

async function persistActivePage(pageName) {
  state.activePage = pageName === 'credits' ? 'credits' : 'expenses';
  try {
    localStorage.setItem(LS_KEYS.LAST_PAGE, state.activePage);
  } catch {
    // ignore
  }
  await idbSetMeta('lastActivePage', state.activePage);
}

async function persistLastBackup(isoStr) {
  state.lastBackupAt = isoStr;
  try {
    if (isoStr) {
      localStorage.setItem(LS_KEYS.LAST_BACKUP, isoStr);
    } else {
      localStorage.removeItem(LS_KEYS.LAST_BACKUP);
    }
  } catch {
    // ignore
  }
  await idbSetMeta('lastBackupAt', isoStr || '');
}

async function loadAllData() {
  await openDatabase();

  // Remove any previously saved legacy wallpaper data
  try {
    localStorage.removeItem('my_expenses_static_v1_wallpaper');
  } catch {
    // ignore
  }
  await idbDeleteMeta('wallpaper');

  // 1. Load Categories
  let cats = await idbGetAll('categories');
  if (!cats || cats.length === 0) {
    cats = readLocalStorageJson(LS_KEYS.CATEGORIES, null);
  }
  if (!cats || !Array.isArray(cats) || cats.length === 0) {
    cats = [...DEFAULT_CATEGORIES];
  } else {
    const existingNames = new Set(cats.map((c) => String(c.name).toLowerCase()));
    DEFAULT_CATEGORIES.forEach((def) => {
      if (!existingNames.has(def.name.toLowerCase())) {
        cats.push({ ...def });
      }
    });
  }
  state.categories = cats;
  await persistCategories();

  // 2. Load Expenses (separate from Credits, coercing amounts to numbers)
  let exps = await idbGetAll('expenses');
  const lsExps = readLocalStorageJson(LS_KEYS.EXPENSES, []);
  if (!exps || (exps.length === 0 && Array.isArray(lsExps) && lsExps.length > 0)) {
    exps = lsExps;
  }
  state.expenses = (Array.isArray(exps) ? exps : [])
    .map(normalizeExpenseRecord)
    .filter(Boolean);
  state.expenses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  await persistExpenses();

  // 3. Load Credit Sources
  let sources = await idbGetAll('credit_sources');
  if (!sources || sources.length === 0) {
    sources = readLocalStorageJson(LS_KEYS.CREDIT_SOURCES, null);
  }
  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    sources = [...DEFAULT_CREDIT_SOURCES];
  } else {
    const existingSourceNames = new Set(sources.map((s) => String(s.name).toLowerCase()));
    DEFAULT_CREDIT_SOURCES.forEach((def) => {
      if (!existingSourceNames.has(def.name.toLowerCase())) {
        sources.push({ ...def });
      }
    });
  }
  state.creditSources = sources;
  await persistCreditSources();

  // 4. Load Credits (separate from Expenses, coercing amounts to numbers)
  let creds = await idbGetAll('credits');
  const lsCreds = readLocalStorageJson(LS_KEYS.CREDITS, []);
  if (!creds || (creds.length === 0 && Array.isArray(lsCreds) && lsCreds.length > 0)) {
    creds = lsCreds;
  }
  state.credits = (Array.isArray(creds) ? creds : [])
    .map(normalizeCreditRecord)
    .filter(Boolean);
  state.credits.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  await persistCredits();

  // 5. Load Monthly Budgets (coercing amounts to numbers)
  let budgets = await idbGetMeta('budgets');
  if (!budgets || typeof budgets !== 'object') {
    budgets = readLocalStorageJson(LS_KEYS.BUDGETS, {});
  }
  const cleanBudgets = {};
  if (budgets && typeof budgets === 'object') {
    Object.entries(budgets).forEach(([k, v]) => {
      const num = toAmountNumber(v);
      if (num > 0) cleanBudgets[k] = num;
    });
  }
  state.budgets = cleanBudgets;
  await persistBudgets();

  // 6. Load Last Active Page
  let savedPage = await idbGetMeta('lastActivePage');
  if (!savedPage) {
    try {
      savedPage = localStorage.getItem(LS_KEYS.LAST_PAGE) || 'expenses';
    } catch {
      savedPage = 'expenses';
    }
  }
  state.activePage = savedPage === 'credits' ? 'credits' : 'expenses';

  // 7. Load Last Backup timestamp
  let lastBk = await idbGetMeta('lastBackupAt');
  if (!lastBk) {
    try {
      lastBk = localStorage.getItem(LS_KEYS.LAST_BACKUP) || null;
    } catch {
      lastBk = null;
    }
  }
  state.lastBackupAt = lastBk || null;
}

// --- PERSISTENT STORAGE REQUEST ---
async function requestPersistentStorage() {
  const badge = document.getElementById('storage-persist-badge');
  try {
    if (navigator.storage && navigator.storage.persist) {
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) {
        if (badge) badge.textContent = '🔒 Persistent storage active';
        return;
      }
      const granted = await navigator.storage.persist();
      if (badge) {
        badge.textContent = granted ? '🔒 Persistent storage active' : '📱 Saved in browser storage';
      }
    } else if (badge) {
      badge.textContent = '📱 Saved in browser storage';
    }
  } catch {
    if (badge) badge.textContent = '📱 Saved in browser storage';
  }
}

// --- STATUS BANNER ---
let statusTimer = null;

function showStatus(message, type = 'saved', durationMs = 2600) {
  const banner = document.getElementById('status-banner');
  const textEl = document.getElementById('status-banner-text');
  if (!banner || !textEl) return;

  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  banner.className = 'status-banner ' + type;
  textEl.textContent = message;
  banner.classList.remove('hidden');

  if (durationMs > 0) {
    statusTimer = setTimeout(() => {
      updateOfflineBanner();
    }, durationMs);
  }
}

function updateOfflineBanner() {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  if (!navigator.onLine) {
    showStatus('⚡ Offline mode — all data is saved directly on your phone', 'offline', 0);
  } else {
    banner.classList.add('hidden');
  }
}

// --- HELPERS ---
function getEmojiForCategory(catName) {
  const found = state.categories.find(
    (c) => String(c.name).toLowerCase() === String(catName || '').toLowerCase()
  );
  return found ? found.emoji : '📦';
}

function getEmojiForSource(sourceName) {
  const found = state.creditSources.find(
    (s) => String(s.name).toLowerCase() === String(sourceName || '').toLowerCase()
  );
  return found ? found.emoji : '📦';
}

function getThisMonthExpensesTotal() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let total = 0;
  state.expenses.forEach((e) => {
    const d = new Date(e.created_at);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      total += Number(e.amount) || 0;
    }
  });
  return Math.round(total * 100) / 100;
}

function getThisMonthCreditsTotal() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let total = 0;
  state.credits.forEach((c) => {
    const d = new Date(c.created_at);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      total += Number(c.amount) || 0;
    }
  });
  return Math.round(total * 100) / 100;
}

// --- CHANGE 1: MONTHLY BUDGET BOX ---
function getCurrentMonthKey() {
  return toLocalMonthKey(new Date());
}

function getCurrentMonthBudget() {
  const key = getCurrentMonthKey();
  const val = Number(state.budgets[key]);
  return !Number.isNaN(val) && val > 0 ? val : 0;
}

function renderMonthlyBudgetCard() {
  const cardEl = document.getElementById('monthly-budget-card');
  const titleEl = document.getElementById('budget-month-title');
  const unsetView = document.getElementById('budget-unset-view');
  const activeView = document.getElementById('budget-active-view');
  const limitEl = document.getElementById('budget-val-limit');
  const spentEl = document.getElementById('budget-val-spent');
  const fillEl = document.getElementById('budget-progress-fill');
  const pctEl = document.getElementById('budget-percent-label');
  const statusEl = document.getElementById('budget-status-line');

  if (!cardEl || !unsetView || !activeView) return;

  const now = new Date();
  const monthLabel = MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear();
  if (titleEl) {
    titleEl.textContent = monthLabel + ' Budget';
  }

  const budget = getCurrentMonthBudget();
  const spent = getThisMonthExpensesTotal();

  if (budget <= 0) {
    // Nothing set for this month: show "Set this month's budget" and no warnings
    cardEl.classList.remove('over-budget');
    unsetView.classList.remove('hidden');
    activeView.classList.add('hidden');
    return;
  }

  unsetView.classList.add('hidden');
  activeView.classList.remove('hidden');

  if (limitEl) limitEl.textContent = formatINR(budget);
  if (spentEl) spentEl.textContent = formatINR(spent);

  const rawPct = (spent / budget) * 100;
  const displayPct = Math.round(rawPct * 10) / 10;
  const barWidth = Math.max(0, Math.min(100, rawPct));

  if (fillEl) fillEl.style.width = barWidth + '%';
  if (pctEl) pctEl.textContent = displayPct + '% used';

  if (spent <= budget) {
    cardEl.classList.remove('over-budget');
    const savings = Math.round((budget - spent) * 100) / 100;
    if (statusEl) {
      statusEl.className = 'budget-status-line savings';
      statusEl.textContent = '💰 Savings: ' + formatINR(savings);
    }
  } else {
    cardEl.classList.add('over-budget');
    const overBy = Math.round((spent - budget) * 100) / 100;
    if (statusEl) {
      statusEl.className = 'budget-status-line over';
      statusEl.textContent = '🚨 Over budget by ' + formatINR(overBy);
    }
  }
}

function openBudgetEditor() {
  const form = document.getElementById('budget-edit-form');
  const input = document.getElementById('budget-input');
  const label = document.getElementById('budget-input-label');
  if (!form || !input) return;

  const now = new Date();
  if (label) {
    label.textContent = 'Set budget for ' + MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear() + ' (₹)';
  }

  const currentBudget = getCurrentMonthBudget();
  input.value = currentBudget > 0 ? String(currentBudget) : '';
  form.classList.remove('hidden');
  setTimeout(() => input.focus(), 30);
}

function closeBudgetEditor() {
  document.getElementById('budget-edit-form')?.classList.add('hidden');
}

async function handleSaveBudget(event) {
  event.preventDefault();
  const input = document.getElementById('budget-input');
  if (!input) return;

  const key = getCurrentMonthKey();
  const val = parseFloat(input.value);

  if (Number.isNaN(val) || val <= 0) {
    delete state.budgets[key];
  } else {
    state.budgets[key] = Math.round(val * 100) / 100;
  }

  await persistBudgets();
  closeBudgetEditor();
  renderMonthlyBudgetCard();
  showStatus(
    state.budgets[key]
      ? 'Monthly budget set to ' + formatINR(state.budgets[key]) + ' ✓'
      : 'Monthly budget cleared',
    'saved',
    2200
  );
}

async function handleClearBudget() {
  const key = getCurrentMonthKey();
  delete state.budgets[key];
  await persistBudgets();
  closeBudgetEditor();
  renderMonthlyBudgetCard();
  showStatus('Monthly budget cleared', 'saved', 2000);
}

function triggerOverBudgetPopup(overAmount) {
  const modal = document.getElementById('budget-crossed-modal');
  const msgEl = document.getElementById('budget-crossed-message');
  if (msgEl) {
    msgEl.textContent = '⚠️ You crossed your monthly budget by ' + formatINR(overAmount);
  }
  if (modal) {
    modal.classList.remove('hidden');
  }
  try {
    if (navigator.vibrate) {
      navigator.vibrate([180, 80, 180]);
    }
  } catch {
    // vibrate not supported or blocked
  }
}

// --- 2. RENDER SUMMARY CARD (Today, This month) ---
function renderSummaryCard() {
  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let todayTotal = 0;
  let monthTotal = 0;

  state.expenses.forEach((e) => {
    const amt = Number(e.amount) || 0;
    const d = new Date(e.created_at);
    if (Number.isNaN(d.getTime())) return;

    if (toLocalDateKey(d) === todayKey) {
      todayTotal += amt;
    }
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      monthTotal += amt;
    }
  });

  const elToday = document.getElementById('summary-today');
  const elMonth = document.getElementById('summary-month');

  if (elToday) elToday.textContent = formatINR(todayTotal);
  if (elMonth) elMonth.textContent = formatINR(monthTotal);
}

// --- 3. RENDER EXPENSE CATEGORIES & ENTRY FORM ---
function renderCategories() {
  const grid = document.getElementById('category-grid');
  const selectedLabel = document.getElementById('selected-category-label');
  const filterSelect = document.getElementById('filter-category');
  const editSelect = document.getElementById('edit-expense-category');
  if (!grid) return;

  if (!state.categories.some((c) => c.name.toLowerCase() === state.selectedCategory.toLowerCase())) {
    state.selectedCategory = state.categories[0]?.name || 'Food';
  }

  const activeCat = state.categories.find(
    (c) => c.name.toLowerCase() === state.selectedCategory.toLowerCase()
  );
  if (selectedLabel && activeCat) {
    selectedLabel.textContent = activeCat.emoji + ' ' + activeCat.name;
  }

  grid.innerHTML = '';

  state.categories.forEach((cat) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'category-chip-wrapper';

    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = cat.name.toLowerCase() === state.selectedCategory.toLowerCase();
    btn.className = 'category-btn' + (isSelected ? ' active' : '');
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'cat-emoji';
    emojiSpan.textContent = cat.emoji;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'cat-name';
    nameSpan.textContent = cat.name;

    btn.appendChild(emojiSpan);
    btn.appendChild(nameSpan);

    btn.addEventListener('click', () => {
      state.selectedCategory = cat.name;
      renderCategories();
    });

    wrapper.appendChild(btn);

    if (!cat.is_default) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'delete-custom-cat-btn';
      delBtn.title = 'Delete ' + cat.name;
      delBtn.setAttribute('aria-label', 'Delete custom category ' + cat.name);
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteCustomCategory(cat.id, cat.name);
      });
      wrapper.appendChild(delBtn);
    }

    grid.appendChild(wrapper);
  });

  // "+ New" button
  const addWrapper = document.createElement('div');
  addWrapper.className = 'category-chip-wrapper';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'category-btn add-new-btn';
  addBtn.textContent = '＋ New';
  addBtn.addEventListener('click', () => {
    const formEl = document.getElementById('new-category-form');
    if (formEl) {
      formEl.classList.toggle('hidden');
      if (!formEl.classList.contains('hidden')) {
        document.getElementById('new-cat-emoji')?.focus();
      }
    }
  });
  addWrapper.appendChild(addBtn);
  grid.appendChild(addWrapper);

  // Sync filter dropdown
  if (filterSelect) {
    const prev = state.listFilterCategory || 'all';
    filterSelect.innerHTML = '<option value="all">All categories</option>';
    state.categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.emoji + ' ' + c.name;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = [...filterSelect.options].some((o) => o.value === prev) ? prev : 'all';
  }

  // Sync edit modal dropdown
  if (editSelect) {
    editSelect.innerHTML = '';
    state.categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.emoji + ' ' + c.name;
      editSelect.appendChild(opt);
    });
  }
}

async function addCustomCategory() {
  const emojiInput = document.getElementById('new-cat-emoji');
  const nameInput = document.getElementById('new-cat-name');
  const msgEl = document.getElementById('category-form-msg');
  const formEl = document.getElementById('new-category-form');
  if (!emojiInput || !nameInput || !msgEl) return;

  const emoji = (emojiInput.value || '✨').trim();
  const name = nameInput.value.trim();

  if (!name) {
    msgEl.textContent = 'Please enter a category name.';
    msgEl.classList.remove('hidden');
    nameInput.focus();
    return;
  }

  const duplicate = state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    msgEl.textContent = 'Category "' + name + '" already exists.';
    msgEl.classList.remove('hidden');
    return;
  }

  const newCat = {
    id: generateId('cat'),
    name,
    emoji,
    is_default: false,
  };

  state.categories.push(newCat);
  state.selectedCategory = newCat.name;
  await persistCategories();

  emojiInput.value = '';
  nameInput.value = '';
  msgEl.classList.add('hidden');
  if (formEl) formEl.classList.add('hidden');

  renderCategories();
  renderDashboard();
  showStatus('Added category ' + emoji + ' ' + name + ' ✓', 'saved', 2000);
}

async function deleteCustomCategory(catId, catName) {
  state.categories = state.categories.filter((c) => c.id !== catId);
  if (state.selectedCategory.toLowerCase() === String(catName).toLowerCase()) {
    state.selectedCategory = state.categories[0]?.name || 'Food';
  }
  await persistCategories();
  renderCategories();
  renderDashboard();
  renderExpenseList();
}

// --- 4. EXPENSES DASHBOARD CARD (Day | Month | Year Tabs) ---
function getItemsForDay(items, dateKey) {
  return items.filter((e) => toLocalDateKey(e.created_at) === dateKey);
}

function getItemsForMonth(items, year, monthIndex) {
  return items.filter((e) => {
    const d = new Date(e.created_at);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === monthIndex;
  });
}

function getItemsForYear(items, year) {
  return items.filter((e) => {
    const d = new Date(e.created_at);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
  });
}

function renderDashboard() {
  document.querySelectorAll('.exp-tab-btn').forEach((btn) => {
    const t = btn.getAttribute('data-tab');
    const isActive = t === state.dashTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  const labelEl = document.getElementById('period-display-label');
  const dayPicker = document.getElementById('dashboard-day-picker');
  const comparisonEl = document.getElementById('period-comparison');
  const totalEl = document.getElementById('dash-total-spent');
  const countEl = document.getElementById('dash-expense-count');
  const avgEl = document.getElementById('dash-avg-day');
  const topCatEl = document.getElementById('dash-top-category');
  const chartTitleEl = document.getElementById('dash-chart-title');
  const chartSubEl = document.getElementById('dash-chart-subtitle');
  const chartContainer = document.getElementById('dash-chart-container');
  const progressContainer = document.getElementById('category-progress-list');

  let currentExpenses = [];
  let prevExpenses = [];
  let prevPeriodLabel = '';
  let daysDivisor = 1;

  const now = new Date();

  if (state.dashTab === 'day') {
    if (dayPicker) {
      dayPicker.classList.remove('hidden');
      dayPicker.value = state.dashDate;
    }
    const [y, m, d] = state.dashDate.split('-').map(Number);
    const selDateObj = new Date(y, m - 1, d);
    const isToday = state.dashDate === toLocalDateKey(now);
    const dateFormatted = selDateObj.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (labelEl) labelEl.textContent = isToday ? 'Today (' + dateFormatted + ')' : dateFormatted;

    const prevDateObj = new Date(y, m - 1, d - 1);
    const prevDateKey = toLocalDateKey(prevDateObj);

    currentExpenses = getItemsForDay(state.expenses, state.dashDate);
    prevExpenses = getItemsForDay(state.expenses, prevDateKey);
    prevPeriodLabel = 'yesterday';
    daysDivisor = 1;
  } else if (state.dashTab === 'month') {
    if (dayPicker) dayPicker.classList.add('hidden');
    if (labelEl) labelEl.textContent = MONTH_NAMES[state.dashMonth] + ' ' + state.dashYear;

    let prevY = state.dashYear;
    let prevM = state.dashMonth - 1;
    if (prevM < 0) {
      prevM = 11;
      prevY -= 1;
    }

    currentExpenses = getItemsForMonth(state.expenses, state.dashYear, state.dashMonth);
    prevExpenses = getItemsForMonth(state.expenses, prevY, prevM);
    prevPeriodLabel = 'last month';

    const daysInMonth = new Date(state.dashYear, state.dashMonth + 1, 0).getDate();
    if (state.dashYear === now.getFullYear() && state.dashMonth === now.getMonth()) {
      daysDivisor = Math.max(1, now.getDate());
    } else {
      daysDivisor = daysInMonth;
    }
  } else {
    if (dayPicker) dayPicker.classList.add('hidden');
    if (labelEl) labelEl.textContent = String(state.dashYearOnly);

    currentExpenses = getItemsForYear(state.expenses, state.dashYearOnly);
    prevExpenses = getItemsForYear(state.expenses, state.dashYearOnly - 1);
    prevPeriodLabel = 'last year';

    const isLeap = (state.dashYearOnly % 4 === 0 && state.dashYearOnly % 100 !== 0) || state.dashYearOnly % 400 === 0;
    const daysInYear = isLeap ? 366 : 365;
    if (state.dashYearOnly === now.getFullYear()) {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const elapsed = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      daysDivisor = Math.max(1, elapsed);
    } else {
      daysDivisor = daysInYear;
    }
  }

  const totalSpent = currentExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const prevTotalSpent = prevExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const avgPerDay = totalSpent / daysDivisor;

  const catTotals = {};
  currentExpenses.forEach((e) => {
    const cat = e.category || 'Other';
    catTotals[cat] = (catTotals[cat] || 0) + (Number(e.amount) || 0);
  });

  const sortedCategories = Object.entries(catTotals)
    .map(([category, amount]) => ({
      category,
      emoji: getEmojiForCategory(category),
      amount,
      percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  if (totalEl) totalEl.textContent = formatINR(totalSpent);
  if (countEl) countEl.textContent = String(currentExpenses.length);
  if (avgEl) avgEl.textContent = formatINR(avgPerDay);
  if (topCatEl) {
    if (sortedCategories.length > 0) {
      const top = sortedCategories[0];
      topCatEl.textContent = top.emoji + ' ' + top.category + ' (' + formatINR(top.amount) + ')';
    } else {
      topCatEl.textContent = '—';
    }
  }

  if (comparisonEl) {
    const diff = Math.round((totalSpent - prevTotalSpent) * 100) / 100;
    if (diff > 0) {
      comparisonEl.className = 'comparison-banner more';
      comparisonEl.textContent = '↑ ' + formatINR(diff) + ' more than ' + prevPeriodLabel;
    } else if (diff < 0) {
      comparisonEl.className = 'comparison-banner less';
      comparisonEl.textContent = '↓ ' + formatINR(Math.abs(diff)) + ' less than ' + prevPeriodLabel;
    } else {
      comparisonEl.className = 'comparison-banner';
      comparisonEl.textContent = 'Same spending as ' + prevPeriodLabel + ' (' + formatINR(totalSpent) + ')';
    }
  }

  if (chartContainer) {
    if (state.dashTab === 'day') {
      if (chartTitleEl) chartTitleEl.textContent = 'Hourly & per-expense breakdown';
      if (chartSubEl) chartSubEl.textContent = currentExpenses.length + ' expense(s)';
      renderDayBreakdownChart(chartContainer, currentExpenses);
    } else if (state.dashTab === 'month') {
      const daysInMonth = new Date(state.dashYear, state.dashMonth + 1, 0).getDate();
      if (chartTitleEl) chartTitleEl.textContent = 'Daily totals';
      if (chartSubEl) chartSubEl.textContent = daysInMonth + ' days';
      renderMonthDailyBarChart(chartContainer, currentExpenses, state.dashYear, state.dashMonth, daysInMonth);
    } else {
      if (chartTitleEl) chartTitleEl.textContent = 'Monthly totals (Jan – Dec)';
      if (chartSubEl) chartSubEl.textContent = String(state.dashYearOnly);
      renderYearMonthlyBarChart(chartContainer, currentExpenses);
    }
  }

  renderProgressBarsList(progressContainer, sortedCategories, 'No expenses in this period yet.', false);
}

function renderProgressBarsList(container, items, emptyMessage, isCredit = false) {
  if (!container) return;
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">' + emptyMessage + '</div>';
    return;
  }
  container.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'progress-item';

    const header = document.createElement('div');
    header.className = 'progress-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'progress-cat-name';
    nameSpan.textContent = item.emoji + ' ' + item.category;

    const metricsSpan = document.createElement('span');
    metricsSpan.className = 'progress-metrics';
    const strongAmt = document.createElement('strong');
    strongAmt.textContent = formatINR(item.amount);
    metricsSpan.appendChild(strongAmt);
    const pctStr = Math.round(item.percentage * 10) / 10;
    metricsSpan.appendChild(document.createTextNode(' · ' + pctStr + '%'));

    header.appendChild(nameSpan);
    header.appendChild(metricsSpan);

    const track = document.createElement('div');
    track.className = 'progress-track';
    const fill = document.createElement('div');
    fill.className = 'progress-fill' + (isCredit ? ' credit-fill' : '');
    fill.style.width = Math.max(2, Math.min(100, item.percentage)) + '%';
    track.appendChild(fill);

    row.appendChild(header);
    row.appendChild(track);
    container.appendChild(row);
  });
}

function renderSvgBarChart(container, bars, svgMinWidth = 360) {
  const maxVal = Math.max(...bars.map((b) => b.amount), 1);
  const svgHeight = 148;
  const chartTop = 22;
  const chartBottom = 122;
  const usableHeight = chartBottom - chartTop;
  const colWidth = Math.max(24, Math.floor(svgMinWidth / bars.length));
  const totalWidth = Math.max(svgMinWidth, colWidth * bars.length);

  let barsSvg = '';
  bars.forEach((b, idx) => {
    const xCenter = idx * colWidth + colWidth / 2;
    const barWidth = Math.min(20, Math.max(8, colWidth - 8));
    const barX = xCenter - barWidth / 2;
    const h = b.amount > 0 ? Math.max(5, Math.round((b.amount / maxVal) * usableHeight)) : 2;
    const barY = chartBottom - h;
    const opacity = b.amount > 0 ? '1' : '0.22';
    const topLabel = b.amount > 0 ? formatINRCompact(b.amount) : '';

    barsSvg +=
      '<g>' +
      '<title>' + b.tooltip + ': ' + formatINR(b.amount) + '</title>' +
      '<rect x="' + barX + '" y="' + chartTop + '" width="' + barWidth + '" height="' + usableHeight + '" rx="5" fill="currentColor" opacity="0.06" />' +
      '<rect x="' + barX + '" y="' + barY + '" width="' + barWidth + '" height="' + h + '" rx="5" fill="#7c3aed" opacity="' + opacity + '" />' +
      (topLabel
        ? '<text x="' + xCenter + '" y="' + (barY - 5) + '" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" opacity="0.8">' + topLabel + '</text>'
        : '') +
      '<text x="' + xCenter + '" y="' + (svgHeight - 8) + '" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" opacity="0.72">' + b.label + '</text>' +
      '</g>';
  });

  container.innerHTML =
    '<div class="svg-chart-container">' +
    '<svg viewBox="0 0 ' + totalWidth + ' ' + svgHeight + '" width="100%" height="' + svgHeight + '" style="min-width: ' + totalWidth + 'px; display: block;">' +
    barsSvg +
    '</svg>' +
    '</div>';
}

function renderDayBreakdownChart(container, dayExpenses) {
  if (dayExpenses.length === 0) {
    container.innerHTML = '<div class="empty-state">No expenses recorded on this day.</div>';
    return;
  }

  const blocks = [
    { label: '0–4h', tooltip: '12 AM – 4 AM', amount: 0 },
    { label: '4–8h', tooltip: '4 AM – 8 AM', amount: 0 },
    { label: '8–12h', tooltip: '8 AM – 12 PM', amount: 0 },
    { label: '12–16h', tooltip: '12 PM – 4 PM', amount: 0 },
    { label: '16–20h', tooltip: '4 PM – 8 PM', amount: 0 },
    { label: '20–24h', tooltip: '8 PM – 12 AM', amount: 0 },
  ];

  dayExpenses.forEach((e) => {
    const d = new Date(e.created_at);
    const hr = d.getHours();
    const idx = Math.min(5, Math.floor(hr / 4));
    blocks[idx].amount += Number(e.amount) || 0;
  });

  const chartWrapper = document.createElement('div');
  renderSvgBarChart(chartWrapper, blocks, 320);

  const listDiv = document.createElement('div');
  listDiv.className = 'day-breakdown-list';

  dayExpenses.forEach((e) => {
    const d = new Date(e.created_at);
    const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    const row = document.createElement('div');
    row.className = 'day-breakdown-row';

    const left = document.createElement('div');
    left.className = 'day-breakdown-left';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'day-breakdown-time';
    timeSpan.textContent = timeStr;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'day-breakdown-title';
    titleSpan.textContent = getEmojiForCategory(e.category) + ' ' + (e.reason || e.category);

    left.appendChild(timeSpan);
    left.appendChild(titleSpan);

    const amtSpan = document.createElement('span');
    amtSpan.className = 'day-breakdown-amt';
    amtSpan.textContent = formatINR(e.amount);

    row.appendChild(left);
    row.appendChild(amtSpan);
    listDiv.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(chartWrapper);
  container.appendChild(listDiv);
}

function renderMonthDailyBarChart(container, monthExpenses, year, monthIndex, daysInMonth) {
  const dailyTotals = new Array(daysInMonth).fill(0);
  monthExpenses.forEach((e) => {
    const d = new Date(e.created_at);
    const dayNum = d.getDate();
    if (dayNum >= 1 && dayNum <= daysInMonth) {
      dailyTotals[dayNum - 1] += Number(e.amount) || 0;
    }
  });

  const bars = dailyTotals.map((amt, i) => ({
    label: String(i + 1),
    tooltip: (i + 1) + ' ' + MONTH_SHORT[monthIndex] + ' ' + year,
    amount: Math.round(amt * 100) / 100,
  }));

  renderSvgBarChart(container, bars, daysInMonth * 24);
}

function renderYearMonthlyBarChart(container, yearExpenses) {
  const monthlyTotals = new Array(12).fill(0);
  yearExpenses.forEach((e) => {
    const d = new Date(e.created_at);
    const m = d.getMonth();
    if (m >= 0 && m < 12) {
      monthlyTotals[m] += Number(e.amount) || 0;
    }
  });

  const bars = monthlyTotals.map((amt, idx) => ({
    label: MONTH_SHORT[idx],
    tooltip: MONTH_NAMES[idx] + ' ' + state.dashYearOnly,
    amount: Math.round(amt * 100) / 100,
  }));

  renderSvgBarChart(container, bars, 384);
}

function shiftDashboardPeriod(direction) {
  if (state.dashTab === 'day') {
    const [y, m, d] = state.dashDate.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + direction);
    state.dashDate = toLocalDateKey(nextDate);
  } else if (state.dashTab === 'month') {
    let m = state.dashMonth + direction;
    let y = state.dashYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    state.dashMonth = m;
    state.dashYear = y;
  } else {
    state.dashYearOnly += direction;
  }
  renderDashboard();
}

// --- 5. EXPENSE LIST & FILTERS ---
function populateYearFilterOptions() {
  const yearSelect = document.getElementById('list-filter-year');
  if (!yearSelect) return;

  const years = new Set([new Date().getFullYear()]);
  state.expenses.forEach((e) => {
    const d = new Date(e.created_at);
    if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
  });

  const sortedYears = [...years].sort((a, b) => b - a);
  yearSelect.innerHTML = '';
  sortedYears.forEach((yr) => {
    const opt = document.createElement('option');
    opt.value = String(yr);
    opt.textContent = String(yr);
    yearSelect.appendChild(opt);
  });

  if (!sortedYears.map(String).includes(state.listFilterYear)) {
    state.listFilterYear = String(sortedYears[0]);
  }
  yearSelect.value = state.listFilterYear;
}

function updateListPeriodInputsVisibility() {
  const row = document.getElementById('list-period-value-row');
  const dayIn = document.getElementById('list-filter-day');
  const monthIn = document.getElementById('list-filter-month');
  const yearIn = document.getElementById('list-filter-year');

  if (!row || !dayIn || !monthIn || !yearIn) return;

  dayIn.classList.add('hidden');
  monthIn.classList.add('hidden');
  yearIn.classList.add('hidden');

  if (state.listPeriodType === 'all') {
    row.classList.add('hidden');
  } else {
    row.classList.remove('hidden');
    if (state.listPeriodType === 'day') {
      dayIn.value = state.listFilterDay;
      dayIn.classList.remove('hidden');
    } else if (state.listPeriodType === 'month') {
      monthIn.value = state.listFilterMonth;
      monthIn.classList.remove('hidden');
    } else if (state.listPeriodType === 'year') {
      populateYearFilterOptions();
      yearIn.classList.remove('hidden');
    }
  }
}

function renderExpenseList() {
  const listEl = document.getElementById('expense-list');
  const countEl = document.getElementById('expense-count-label');
  const resetBtn = document.getElementById('btn-reset-filters');
  if (!listEl) return;

  updateListPeriodInputsVisibility();

  const hasFilter =
    state.listPeriodType !== 'all' ||
    state.listFilterCategory !== 'all' ||
    Boolean(state.listSearch.trim());
  if (resetBtn) {
    resetBtn.classList.toggle('hidden', !hasFilter);
  }

  const query = state.listSearch.trim().toLowerCase();

  const filtered = state.expenses.filter((item) => {
    if (
      state.listFilterCategory !== 'all' &&
      String(item.category).toLowerCase() !== state.listFilterCategory.toLowerCase()
    ) {
      return false;
    }

    if (state.listPeriodType === 'day' && state.listFilterDay) {
      if (toLocalDateKey(item.created_at) !== state.listFilterDay) return false;
    } else if (state.listPeriodType === 'month' && state.listFilterMonth) {
      if (toLocalMonthKey(item.created_at) !== state.listFilterMonth) return false;
    } else if (state.listPeriodType === 'year' && state.listFilterYear) {
      const d = new Date(item.created_at);
      if (String(d.getFullYear()) !== String(state.listFilterYear)) return false;
    }

    if (query) {
      const r = String(item.reason || '').toLowerCase();
      const c = String(item.category || '').toLowerCase();
      const a = String(item.amount || '');
      const f = formatINR(item.amount).toLowerCase();
      if (!r.includes(query) && !c.includes(query) && !a.includes(query) && !f.includes(query)) {
        return false;
      }
    }

    return true;
  });

  if (countEl) {
    countEl.textContent = filtered.length + ' ' + (filtered.length === 1 ? 'item' : 'items');
  }

  if (filtered.length === 0) {
    listEl.innerHTML =
      state.expenses.length === 0
        ? '<div class="empty-state">No expenses saved yet. Add your first expense above!</div>'
        : '<div class="empty-state">No expenses match your current filters.</div>';
    return;
  }

  listEl.innerHTML = '';
  filtered.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'expense-item';

    const left = document.createElement('div');
    left.className = 'expense-left';

    const icon = document.createElement('div');
    icon.className = 'expense-icon';
    icon.textContent = getEmojiForCategory(item.category);

    const info = document.createElement('div');
    info.className = 'expense-info';

    const reasonText = document.createElement('span');
    reasonText.className = 'expense-reason';
    reasonText.textContent = item.reason ? item.reason : item.category;

    const meta = document.createElement('div');
    meta.className = 'expense-meta';
    meta.textContent = item.category + ' · ' + formatDateTimeDisplay(item.created_at);

    info.appendChild(reasonText);
    info.appendChild(meta);

    left.appendChild(icon);
    left.appendChild(info);

    const right = document.createElement('div');
    right.className = 'expense-right';

    const amt = document.createElement('span');
    amt.className = 'expense-amount';
    amt.textContent = formatINR(item.amount);
    right.appendChild(amt);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-action-btn';
    editBtn.title = 'Edit expense';
    editBtn.setAttribute('aria-label', 'Edit expense');
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openEditModal(item));
    right.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-action-btn delete-btn';
    delBtn.title = 'Delete expense';
    delBtn.setAttribute('aria-label', 'Delete expense');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => deleteExpense(item.id));
    right.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(right);
    listEl.appendChild(row);
  });
}

// --- SAVE, EDIT & DELETE EXPENSE ---
async function handleSaveExpense(event) {
  event.preventDefault();
  const amountInput = document.getElementById('expense-amount');
  const reasonInput = document.getElementById('expense-reason');
  const errorEl = document.getElementById('entry-error-msg');
  const saveBtn = document.getElementById('btn-save-expense');
  const saveBtnText = document.getElementById('save-btn-text');

  if (!amountInput || !reasonInput || !errorEl || !saveBtn || !saveBtnText) return;

  const amount = toAmountNumber(amountInput.value);
  const reason = reasonInput.value.trim();

  if (amount <= 0) {
    errorEl.textContent = 'Please enter an amount greater than ₹0.';
    errorEl.classList.remove('hidden');
    amountInput.focus();
    return;
  }

  errorEl.classList.add('hidden');

  const now = new Date();
  const newExpense = {
    id: generateId('exp'),
    amount,
    reason: reason.slice(0, 160),
    category: state.selectedCategory,
    created_at: now.toISOString(),
  };

  state.expenses.unshift(newExpense);
  const savedOk = await persistExpenses();

  if (!savedOk) {
    errorEl.textContent = 'Could not save expense — phone storage may be full or unavailable.';
    errorEl.classList.remove('hidden');
    showStatus('Could not save expense to phone storage', 'error', 3500);
    return;
  }

  amountInput.value = '';
  reasonInput.value = '';

  // Ensure list filters are reset and dashboard is on current period so new expense shows at once
  state.listPeriodType = 'all';
  state.listFilterCategory = 'all';
  state.listSearch = '';
  const periodEl = document.getElementById('list-filter-period-type');
  const catEl = document.getElementById('filter-category');
  const searchEl = document.getElementById('filter-search');
  if (periodEl) periodEl.value = 'all';
  if (catEl) catEl.value = 'all';
  if (searchEl) searchEl.value = '';

  state.dashDate = toLocalDateKey(now);
  state.dashMonth = now.getMonth();
  state.dashYear = now.getFullYear();
  state.dashYearOnly = now.getFullYear();

  saveBtn.classList.add('saved-state');
  saveBtnText.textContent = 'Saved ✓';
  setTimeout(() => {
    saveBtn.classList.remove('saved-state');
    saveBtnText.textContent = 'Save expense';
  }, 1800);

  renderAll();

  // Check if monthly budget is set and saving this expense pushed total over the budget
  const budget = getCurrentMonthBudget();
  if (budget > 0) {
    const newMonthTotal = getThisMonthExpensesTotal();
    if (newMonthTotal > budget) {
      const overBy = Math.round((newMonthTotal - budget) * 100) / 100;
      triggerOverBudgetPopup(overBy);
    }
  }
}

function openEditModal(item) {
  const modal = document.getElementById('edit-expense-modal');
  const idInput = document.getElementById('edit-expense-id');
  const amtInput = document.getElementById('edit-expense-amount');
  const reasonInput = document.getElementById('edit-expense-reason');
  const catSelect = document.getElementById('edit-expense-category');
  const dtInput = document.getElementById('edit-expense-datetime');
  const errEl = document.getElementById('edit-error-msg');

  if (!modal || !idInput || !amtInput || !reasonInput || !catSelect || !dtInput) return;

  idInput.value = item.id;
  amtInput.value = String(toAmountNumber(item.amount));
  reasonInput.value = item.reason || '';

  if (![...catSelect.options].some((o) => o.value === item.category)) {
    const opt = document.createElement('option');
    opt.value = item.category;
    opt.textContent = getEmojiForCategory(item.category) + ' ' + item.category;
    catSelect.appendChild(opt);
  }
  catSelect.value = item.category;

  const d = new Date(item.created_at);
  if (!Number.isNaN(d.getTime())) {
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dtInput.value = localIso;
  }

  if (errEl) errEl.classList.add('hidden');
  modal.classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-expense-modal')?.classList.add('hidden');
}

async function handleEditExpenseSubmit(event) {
  event.preventDefault();
  const idVal = document.getElementById('edit-expense-id')?.value || '';
  const amtVal = toAmountNumber(document.getElementById('edit-expense-amount')?.value || '0');
  const reasonVal = (document.getElementById('edit-expense-reason')?.value || '').trim();
  const catVal = document.getElementById('edit-expense-category')?.value || 'Food';
  const dtVal = document.getElementById('edit-expense-datetime')?.value || '';
  const errEl = document.getElementById('edit-error-msg');

  if (amtVal <= 0) {
    if (errEl) {
      errEl.textContent = 'Amount must be greater than ₹0.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const target = state.expenses.find((e) => e.id === idVal);
  if (target) {
    target.amount = amtVal;
    target.reason = reasonVal.slice(0, 160);
    target.category = catVal;
    if (dtVal && !Number.isNaN(new Date(dtVal).getTime())) {
      target.created_at = new Date(dtVal).toISOString();
    }
    state.expenses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const savedOk = await persistExpenses();
    if (!savedOk) {
      if (errEl) {
        errEl.textContent = 'Could not save changes — phone storage may be full or unavailable.';
        errEl.classList.remove('hidden');
      }
      showStatus('Could not save changes to phone storage', 'error', 3500);
      return;
    }
  }

  closeEditModal();
  renderAll();
  showStatus('Expense updated ✓', 'saved', 2000);
}

async function deleteExpense(id) {
  state.expenses = state.expenses.filter((e) => e.id !== id);
  const savedOk = await persistExpenses();
  renderAll();
  if (!savedOk) {
    showStatus('Could not update phone storage', 'error', 3000);
  }
}

// =========================================================
// CHANGE 2: CREDITS PAGE (💰 Credits)
// =========================================================

function renderCreditsSummaryCard() {
  const totalCreditsMonth = getThisMonthCreditsTotal();
  const totalExpensesMonth = getThisMonthExpensesTotal();
  const netMonth = Math.round((totalCreditsMonth - totalExpensesMonth) * 100) / 100;

  const totalEl = document.getElementById('credits-month-total');
  const netEl = document.getElementById('credits-net-line');

  if (totalEl) {
    totalEl.textContent = formatINR(totalCreditsMonth);
  }
  if (netEl) {
    netEl.textContent = 'Credits − Expenses this month = ' + formatINR(netMonth);
  }
}

function renderCreditSources() {
  const grid = document.getElementById('source-grid');
  const selectedLabel = document.getElementById('selected-source-label');
  const editSelect = document.getElementById('edit-credit-source');
  if (!grid) return;

  if (!state.creditSources.some((s) => s.name.toLowerCase() === state.selectedSource.toLowerCase())) {
    state.selectedSource = state.creditSources[0]?.name || 'Salary';
  }

  const activeSrc = state.creditSources.find(
    (s) => s.name.toLowerCase() === state.selectedSource.toLowerCase()
  );
  if (selectedLabel && activeSrc) {
    selectedLabel.textContent = activeSrc.emoji + ' ' + activeSrc.name;
  }

  grid.innerHTML = '';

  state.creditSources.forEach((src) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'category-chip-wrapper';

    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = src.name.toLowerCase() === state.selectedSource.toLowerCase();
    btn.className = 'category-btn' + (isSelected ? ' active' : '');
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'cat-emoji';
    emojiSpan.textContent = src.emoji;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'cat-name';
    nameSpan.textContent = src.name;

    btn.appendChild(emojiSpan);
    btn.appendChild(nameSpan);

    btn.addEventListener('click', () => {
      state.selectedSource = src.name;
      renderCreditSources();
    });

    wrapper.appendChild(btn);

    if (!src.is_default) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'delete-custom-cat-btn';
      delBtn.title = 'Delete ' + src.name;
      delBtn.setAttribute('aria-label', 'Delete custom source ' + src.name);
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteCustomSource(src.id, src.name);
      });
      wrapper.appendChild(delBtn);
    }

    grid.appendChild(wrapper);
  });

  // "+ New" button for custom source
  const addWrapper = document.createElement('div');
  addWrapper.className = 'category-chip-wrapper';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'category-btn add-new-btn';
  addBtn.textContent = '＋ New';
  addBtn.addEventListener('click', () => {
    const formEl = document.getElementById('new-source-form');
    if (formEl) {
      formEl.classList.toggle('hidden');
      if (!formEl.classList.contains('hidden')) {
        document.getElementById('new-source-emoji')?.focus();
      }
    }
  });
  addWrapper.appendChild(addBtn);
  grid.appendChild(addWrapper);

  if (editSelect) {
    editSelect.innerHTML = '';
    state.creditSources.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.emoji + ' ' + s.name;
      editSelect.appendChild(opt);
    });
  }
}

async function addCustomSource() {
  const emojiInput = document.getElementById('new-source-emoji');
  const nameInput = document.getElementById('new-source-name');
  const msgEl = document.getElementById('source-form-msg');
  const formEl = document.getElementById('new-source-form');
  if (!emojiInput || !nameInput || !msgEl) return;

  const emoji = (emojiInput.value || '✨').trim();
  const name = nameInput.value.trim();

  if (!name) {
    msgEl.textContent = 'Please enter a source name.';
    msgEl.classList.remove('hidden');
    nameInput.focus();
    return;
  }

  const duplicate = state.creditSources.some((s) => s.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    msgEl.textContent = 'Source "' + name + '" already exists.';
    msgEl.classList.remove('hidden');
    return;
  }

  const newSrc = {
    id: generateId('src'),
    name,
    emoji,
    is_default: false,
  };

  state.creditSources.push(newSrc);
  state.selectedSource = newSrc.name;
  await persistCreditSources();

  emojiInput.value = '';
  nameInput.value = '';
  msgEl.classList.add('hidden');
  if (formEl) formEl.classList.add('hidden');

  renderCreditSources();
  renderCreditsDashboard();
  showStatus('Added source ' + emoji + ' ' + name + ' ✓', 'saved', 2000);
}

async function deleteCustomSource(srcId, srcName) {
  state.creditSources = state.creditSources.filter((s) => s.id !== srcId);
  if (state.selectedSource.toLowerCase() === String(srcName).toLowerCase()) {
    state.selectedSource = state.creditSources[0]?.name || 'Salary';
  }
  await persistCreditSources();
  renderCreditSources();
  renderCreditsDashboard();
  renderCreditList();
}

function renderCreditsDashboard() {
  document.querySelectorAll('.cred-tab-btn').forEach((btn) => {
    const t = btn.getAttribute('data-tab');
    const isActive = t === state.credDashTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  const labelEl = document.getElementById('credit-period-display-label');
  const dayPicker = document.getElementById('credit-dashboard-day-picker');
  const totalEl = document.getElementById('cred-dash-total');
  const countEl = document.getElementById('cred-dash-count');
  const progressContainer = document.getElementById('credit-source-progress-list');

  let currentCredits = [];
  const now = new Date();

  if (state.credDashTab === 'day') {
    if (dayPicker) {
      dayPicker.classList.remove('hidden');
      dayPicker.value = state.credDashDate;
    }
    const [y, m, d] = state.credDashDate.split('-').map(Number);
    const selDateObj = new Date(y, m - 1, d);
    const isToday = state.credDashDate === toLocalDateKey(now);
    const dateFormatted = selDateObj.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (labelEl) labelEl.textContent = isToday ? 'Today (' + dateFormatted + ')' : dateFormatted;
    currentCredits = getItemsForDay(state.credits, state.credDashDate);
  } else if (state.credDashTab === 'month') {
    if (dayPicker) dayPicker.classList.add('hidden');
    if (labelEl) labelEl.textContent = MONTH_NAMES[state.credDashMonth] + ' ' + state.credDashYear;
    currentCredits = getItemsForMonth(state.credits, state.credDashYear, state.credDashMonth);
  } else {
    if (dayPicker) dayPicker.classList.add('hidden');
    if (labelEl) labelEl.textContent = String(state.credDashYearOnly);
    currentCredits = getItemsForYear(state.credits, state.credDashYearOnly);
  }

  const totalReceived = currentCredits.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  if (totalEl) totalEl.textContent = formatINR(totalReceived);
  if (countEl) countEl.textContent = String(currentCredits.length);

  const sourceTotals = {};
  currentCredits.forEach((c) => {
    const src = c.source || 'Other';
    sourceTotals[src] = (sourceTotals[src] || 0) + (Number(c.amount) || 0);
  });

  const sortedSources = Object.entries(sourceTotals)
    .map(([source, amount]) => ({
      category: source,
      emoji: getEmojiForSource(source),
      amount,
      percentage: totalReceived > 0 ? (amount / totalReceived) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  renderProgressBarsList(progressContainer, sortedSources, 'No credits in this period yet.', true);
}

function shiftCreditDashboardPeriod(direction) {
  if (state.credDashTab === 'day') {
    const [y, m, d] = state.credDashDate.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + direction);
    state.credDashDate = toLocalDateKey(nextDate);
  } else if (state.credDashTab === 'month') {
    let m = state.credDashMonth + direction;
    let y = state.credDashYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    state.credDashMonth = m;
    state.credDashYear = y;
  } else {
    state.credDashYearOnly += direction;
  }
  renderCreditsDashboard();
}

function renderCreditList() {
  const listEl = document.getElementById('credit-list');
  const countEl = document.getElementById('credit-count-label');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = state.credits.length + ' ' + (state.credits.length === 1 ? 'item' : 'items');
  }

  if (state.credits.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No credits recorded yet. Add your first credit above!</div>';
    return;
  }

  listEl.innerHTML = '';
  state.credits.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'expense-item';

    const left = document.createElement('div');
    left.className = 'expense-left';

    const icon = document.createElement('div');
    icon.className = 'expense-icon';
    icon.textContent = getEmojiForSource(item.source);

    const info = document.createElement('div');
    info.className = 'expense-info';

    const noteText = document.createElement('span');
    noteText.className = 'expense-reason';
    noteText.textContent = item.note ? item.note : item.source;

    const meta = document.createElement('div');
    meta.className = 'expense-meta';
    meta.textContent = item.source + ' · ' + formatDateTimeDisplay(item.created_at);

    info.appendChild(noteText);
    info.appendChild(meta);

    left.appendChild(icon);
    left.appendChild(info);

    const right = document.createElement('div');
    right.className = 'expense-right';

    const amt = document.createElement('span');
    amt.className = 'credit-amount-positive';
    amt.textContent = '+' + formatINR(item.amount);
    right.appendChild(amt);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-action-btn';
    editBtn.title = 'Edit credit';
    editBtn.setAttribute('aria-label', 'Edit credit');
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openEditCreditModal(item));
    right.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-action-btn delete-btn';
    delBtn.title = 'Delete credit';
    delBtn.setAttribute('aria-label', 'Delete credit');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => deleteCredit(item.id));
    right.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(right);
    listEl.appendChild(row);
  });
}

async function handleSaveCredit(event) {
  event.preventDefault();
  const amountInput = document.getElementById('credit-amount');
  const noteInput = document.getElementById('credit-note');
  const errorEl = document.getElementById('credit-error-msg');
  const saveBtn = document.getElementById('btn-save-credit');
  const saveBtnText = document.getElementById('save-credit-btn-text');

  if (!amountInput || !noteInput || !errorEl || !saveBtn || !saveBtnText) return;

  const amount = toAmountNumber(amountInput.value);
  const note = noteInput.value.trim();

  if (amount <= 0) {
    errorEl.textContent = 'Please enter an amount greater than ₹0.';
    errorEl.classList.remove('hidden');
    amountInput.focus();
    return;
  }

  errorEl.classList.add('hidden');

  const now = new Date();
  const newCredit = {
    id: generateId('cred'),
    amount,
    note: note.slice(0, 160),
    source: state.selectedSource,
    created_at: now.toISOString(),
  };

  state.credits.unshift(newCredit);
  const savedOk = await persistCredits();

  if (!savedOk) {
    errorEl.textContent = 'Could not save credit — phone storage may be full or unavailable.';
    errorEl.classList.remove('hidden');
    showStatus('Could not save credit to phone storage', 'error', 3500);
    return;
  }

  amountInput.value = '';
  noteInput.value = '';

  // Ensure credit dashboard period matches current date/month/year so totals update at once
  state.credDashDate = toLocalDateKey(now);
  state.credDashMonth = now.getMonth();
  state.credDashYear = now.getFullYear();
  state.credDashYearOnly = now.getFullYear();

  saveBtn.classList.add('saved-state');
  saveBtnText.textContent = 'Added ✓';
  setTimeout(() => {
    saveBtn.classList.remove('saved-state');
    saveBtnText.textContent = 'Add credit';
  }, 1800);

  renderAll();
}

function openEditCreditModal(item) {
  const modal = document.getElementById('edit-credit-modal');
  const idInput = document.getElementById('edit-credit-id');
  const amtInput = document.getElementById('edit-credit-amount');
  const noteInput = document.getElementById('edit-credit-note');
  const srcSelect = document.getElementById('edit-credit-source');
  const dtInput = document.getElementById('edit-credit-datetime');
  const errEl = document.getElementById('edit-credit-error-msg');

  if (!modal || !idInput || !amtInput || !noteInput || !srcSelect || !dtInput) return;

  idInput.value = item.id;
  amtInput.value = String(toAmountNumber(item.amount));
  noteInput.value = item.note || '';

  if (![...srcSelect.options].some((o) => o.value === item.source)) {
    const opt = document.createElement('option');
    opt.value = item.source;
    opt.textContent = getEmojiForSource(item.source) + ' ' + item.source;
    srcSelect.appendChild(opt);
  }
  srcSelect.value = item.source;

  const d = new Date(item.created_at);
  if (!Number.isNaN(d.getTime())) {
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dtInput.value = localIso;
  }

  if (errEl) errEl.classList.add('hidden');
  modal.classList.remove('hidden');
}

function closeEditCreditModal() {
  document.getElementById('edit-credit-modal')?.classList.add('hidden');
}

async function handleEditCreditSubmit(event) {
  event.preventDefault();
  const idVal = document.getElementById('edit-credit-id')?.value || '';
  const amtVal = toAmountNumber(document.getElementById('edit-credit-amount')?.value || '0');
  const noteVal = (document.getElementById('edit-credit-note')?.value || '').trim();
  const srcVal = document.getElementById('edit-credit-source')?.value || 'Salary';
  const dtVal = document.getElementById('edit-credit-datetime')?.value || '';
  const errEl = document.getElementById('edit-credit-error-msg');

  if (amtVal <= 0) {
    if (errEl) {
      errEl.textContent = 'Amount must be greater than ₹0.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const target = state.credits.find((c) => c.id === idVal);
  if (target) {
    target.amount = amtVal;
    target.note = noteVal.slice(0, 160);
    target.source = srcVal;
    if (dtVal && !Number.isNaN(new Date(dtVal).getTime())) {
      target.created_at = new Date(dtVal).toISOString();
    }
    state.credits.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const savedOk = await persistCredits();
    if (!savedOk) {
      if (errEl) {
        errEl.textContent = 'Could not save changes — phone storage may be full or unavailable.';
        errEl.classList.remove('hidden');
      }
      showStatus('Could not save changes to phone storage', 'error', 3500);
      return;
    }
  }

  closeEditCreditModal();
  renderAll();
  showStatus('Credit updated ✓', 'saved', 2000);
}

async function deleteCredit(id) {
  state.credits = state.credits.filter((c) => c.id !== id);
  const savedOk = await persistCredits();
  renderAll();
  if (!savedOk) {
    showStatus('Could not update phone storage', 'error', 3000);
  }
}

// --- SWIPEABLE PAGES (💸 Expenses | 💰 Credits) ---
let isProgrammaticPageScroll = false;
let programmaticScrollResetTimer = null;

function updatePageTabUI(pageName) {
  const expTab = document.getElementById('page-tab-expenses');
  const credTab = document.getElementById('page-tab-credits');
  const isCredits = pageName === 'credits';

  if (expTab) {
    expTab.classList.toggle('active', !isCredits);
    expTab.setAttribute('aria-selected', !isCredits ? 'true' : 'false');
  }
  if (credTab) {
    credTab.classList.toggle('active', isCredits);
    credTab.setAttribute('aria-selected', isCredits ? 'true' : 'false');
  }
}

function switchToPage(pageName, smooth = true) {
  const normalizedPage = pageName === 'credits' ? 'credits' : 'expenses';
  const viewport = document.getElementById('swipe-viewport');
  const targetEl = document.getElementById(normalizedPage === 'credits' ? 'page-credits' : 'page-expenses');
  updatePageTabUI(normalizedPage);
  persistActivePage(normalizedPage);

  if (viewport && targetEl) {
    const targetLeft = normalizedPage === 'credits' ? targetEl.offsetLeft : 0;
    isProgrammaticPageScroll = true;
    if (programmaticScrollResetTimer) clearTimeout(programmaticScrollResetTimer);
    viewport.scrollTo({
      left: targetLeft,
      behavior: smooth ? 'smooth' : 'auto',
    });
    programmaticScrollResetTimer = setTimeout(() => {
      isProgrammaticPageScroll = false;
    }, smooth ? 420 : 60);
  }
}

function setupSwipeNavigation() {
  const viewport = document.getElementById('swipe-viewport');
  const expTab = document.getElementById('page-tab-expenses');
  const credTab = document.getElementById('page-tab-credits');

  expTab?.addEventListener('click', () => switchToPage('expenses', true));
  credTab?.addEventListener('click', () => switchToPage('credits', true));

  if (viewport) {
    let scrollTimer = null;
    viewport.addEventListener(
      'scroll',
      () => {
        if (isProgrammaticPageScroll) return;
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const width = viewport.clientWidth || 1;
          const idx = Math.round(viewport.scrollLeft / width);
          const page = idx >= 1 ? 'credits' : 'expenses';
          if (state.activePage !== page) {
            updatePageTabUI(page);
            persistActivePage(page);
          }
        }, 60);
      },
      { passive: true }
    );
  }

  // Restore last used page immediately
  if (state.activePage === 'credits') {
    updatePageTabUI('credits');
    requestAnimationFrame(() => {
      switchToPage('credits', false);
    });
  } else {
    updatePageTabUI('expenses');
    requestAnimationFrame(() => {
      switchToPage('expenses', false);
    });
  }
}

// --- 6. BACKUP CARD (Includes Expenses, Credits, Categories, Credit Sources, Budgets) ---
function renderBackupStatus() {
  const reminderEl = document.getElementById('backup-reminder-banner');
  const infoEl = document.getElementById('last-backup-info');
  if (!reminderEl || !infoEl) return;

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  if (!state.lastBackupAt) {
    infoEl.textContent = 'No backup downloaded yet.';
    reminderEl.classList.remove('hidden');
  } else {
    const lastTime = new Date(state.lastBackupAt).getTime();
    const ageMs = now - lastTime;
    infoEl.textContent = 'Last backup: ' + formatDateTimeDisplay(state.lastBackupAt);
    if (ageMs >= thirtyDaysMs) {
      reminderEl.classList.remove('hidden');
    } else {
      reminderEl.classList.add('hidden');
    }
  }
}

async function handleCopyAsCsv() {
  const escapeCsv = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  // Combine Expenses and Credits with a Type column ("Expense" or "Credit")
  const rows = [];
  state.expenses.forEach((e) => {
    rows.push({
      type: 'Expense',
      created_at: e.created_at,
      amount: toAmountNumber(e.amount),
      note: e.reason || '',
      category: e.category || 'Other',
    });
  });
  state.credits.forEach((c) => {
    rows.push({
      type: 'Credit',
      created_at: c.created_at,
      amount: toAmountNumber(c.amount),
      note: c.note || '',
      category: c.source || 'Other',
    });
  });

  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const lines = ['Type,Date,Amount in ₹,Reason,Category'];
  rows.forEach((r) => {
    const d = new Date(r.created_at);
    const dateStr = !Number.isNaN(d.getTime())
      ? toLocalDateKey(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      : r.created_at;
    lines.push(
      escapeCsv(r.type) +
        ',' +
        escapeCsv(dateStr) +
        ',' +
        escapeCsv(formatINR(r.amount)) +
        ',' +
        escapeCsv(r.note) +
        ',' +
        escapeCsv(r.category)
    );
  });

  const csvText = lines.join('\n');

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(csvText);
    } else {
      const ta = document.createElement('textarea');
      ta.value = csvText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showStatus('Copied as CSV ✓', 'saved', 2500);
  } catch {
    showStatus('Could not copy CSV to clipboard', 'error', 3000);
  }
}

async function handleDownloadBackup() {
  const nowIso = new Date().toISOString();
  const backupData = {
    version: 2,
    exportedAt: nowIso,
    expenses: state.expenses,
    categories: state.categories,
    credits: state.credits,
    creditSources: state.creditSources,
    budgets: state.budgets,
  };

  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-expenses-backup-' + toLocalDateKey(new Date()) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  await persistLastBackup(nowIso);
  renderBackupStatus();
  showStatus('Backup downloaded ✓', 'saved', 2500);
}

async function handleRestoreBackupFile(file) {
  try {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid backup file');
    }

    // 1. Merge Categories without duplicates
    if (Array.isArray(parsed.categories)) {
      const existingNames = new Set(state.categories.map((c) => String(c.name).toLowerCase()));
      parsed.categories.forEach((c) => {
        if (c && c.name && !existingNames.has(String(c.name).toLowerCase())) {
          existingNames.add(String(c.name).toLowerCase());
          state.categories.push({
            id: c.id || generateId('cat'),
            name: String(c.name).trim().slice(0, 36),
            emoji: String(c.emoji || '✨').trim().slice(0, 8),
            is_default: Boolean(c.is_default),
          });
        }
      });
      await persistCategories();
    }

    // 2. Merge Credit Sources without duplicates
    if (Array.isArray(parsed.creditSources)) {
      const existingSrcNames = new Set(state.creditSources.map((s) => String(s.name).toLowerCase()));
      parsed.creditSources.forEach((s) => {
        if (s && s.name && !existingSrcNames.has(String(s.name).toLowerCase())) {
          existingSrcNames.add(String(s.name).toLowerCase());
          state.creditSources.push({
            id: s.id || generateId('src'),
            name: String(s.name).trim().slice(0, 36),
            emoji: String(s.emoji || '✨').trim().slice(0, 8),
            is_default: Boolean(s.is_default),
          });
        }
      });
      await persistCreditSources();
    }

    // 3. Merge Expenses without duplicates
    let addedExpenses = 0;
    if (Array.isArray(parsed.expenses)) {
      const existingIds = new Set(state.expenses.map((e) => e.id));
      const existingSignatures = new Set(
        state.expenses.map((e) => e.created_at + '|' + toAmountNumber(e.amount) + '|' + e.category + '|' + (e.reason || ''))
      );

      parsed.expenses.forEach((e) => {
        const normalized = normalizeExpenseRecord(e);
        if (!normalized) return;
        const sig =
          normalized.created_at +
          '|' +
          normalized.amount +
          '|' +
          normalized.category +
          '|' +
          (normalized.reason || '');
        if ((e.id && existingIds.has(e.id)) || existingSignatures.has(sig)) {
          return;
        }
        existingIds.add(normalized.id);
        existingSignatures.add(sig);
        state.expenses.push(normalized);
        addedExpenses++;
      });

      state.expenses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      await persistExpenses();
    }

    // 4. Merge Credits without duplicates
    let addedCredits = 0;
    if (Array.isArray(parsed.credits)) {
      const existingIds = new Set(state.credits.map((c) => c.id));
      const existingSignatures = new Set(
        state.credits.map((c) => c.created_at + '|' + toAmountNumber(c.amount) + '|' + c.source + '|' + (c.note || ''))
      );

      parsed.credits.forEach((c) => {
        const normalized = normalizeCreditRecord(c);
        if (!normalized) return;
        const sig =
          normalized.created_at +
          '|' +
          normalized.amount +
          '|' +
          normalized.source +
          '|' +
          (normalized.note || '');
        if ((c.id && existingIds.has(c.id)) || existingSignatures.has(sig)) {
          return;
        }
        existingIds.add(normalized.id);
        existingSignatures.add(sig);
        state.credits.push(normalized);
        addedCredits++;
      });

      state.credits.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      await persistCredits();
    }

    // 5. Merge Monthly Budgets
    if (parsed.budgets && typeof parsed.budgets === 'object') {
      Object.entries(parsed.budgets).forEach(([monthKey, val]) => {
        const num = toAmountNumber(val);
        if (num > 0 && !state.budgets[monthKey]) {
          state.budgets[monthKey] = num;
        }
      });
      await persistBudgets();
    }

    await persistLastBackup(new Date().toISOString());
    renderAll();
    showStatus(
      'Restored backup (' + addedExpenses + ' expense(s), ' + addedCredits + ' credit(s)) ✓',
      'saved',
      3200
    );
  } catch (err) {
    showStatus('Restore failed: ' + (err.message || 'Invalid JSON file'), 'error', 3500);
  }
}

async function handleConfirmClearAll() {
  document.getElementById('confirm-clear-modal')?.classList.add('hidden');
  state.expenses = [];
  state.credits = [];
  state.budgets = {};
  state.categories = [...DEFAULT_CATEGORIES];
  state.creditSources = [...DEFAULT_CREDIT_SOURCES];
  state.selectedCategory = 'Food';
  state.selectedSource = 'Salary';
  await persistExpenses();
  await persistCredits();
  await persistBudgets();
  await persistCategories();
  await persistCreditSources();
  renderAll();
  showStatus('All data cleared ✓', 'saved', 2500);
}

// --- PWA INSTALL & SERVICE WORKER ---
function setupPWA() {
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => {
        if (k !== 'my-expenses-static-pwa-v8') {
          caches.delete(k).catch(() => {});
        }
      });
    }).catch(() => {});
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {});
    });
  }

  const installBtn = document.getElementById('btn-install-pwa');
  const iosBtn = document.getElementById('btn-ios-install');
  const iosModal = document.getElementById('ios-guide-modal');
  const closeIosBtn = document.getElementById('btn-close-ios-guide');

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) return;

  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);

  if (isIOS && iosBtn) {
    iosBtn.classList.remove('hidden');
    iosBtn.addEventListener('click', () => iosModal?.classList.remove('hidden'));
  }

  closeIosBtn?.addEventListener('click', () => iosModal?.classList.add('hidden'));

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    installBtn?.classList.remove('hidden');
  });

  installBtn?.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    const { outcome } = await state.deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.classList.add('hidden');
      state.deferredInstallPrompt = null;
    }
  });

  window.addEventListener('appinstalled', () => {
    installBtn?.classList.add('hidden');
    state.deferredInstallPrompt = null;
  });
}

function renderAll() {
  renderMonthlyBudgetCard();
  renderSummaryCard();
  renderCategories();
  renderDashboard();
  renderExpenseList();
  renderCreditsSummaryCard();
  renderCreditSources();
  renderCreditsDashboard();
  renderCreditList();
  renderBackupStatus();
}

// --- INITIALIZATION ---
async function initApp() {
  await loadAllData();
  renderAll();
  setupSwipeNavigation();
  setupPWA();
  requestPersistentStorage();
  updateOfflineBanner();

  // Monthly Budget Box Events
  const budgetDisplay = document.getElementById('budget-display-area');
  budgetDisplay?.addEventListener('click', openBudgetEditor);
  budgetDisplay?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBudgetEditor();
    }
  });
  document.getElementById('budget-edit-form')?.addEventListener('submit', handleSaveBudget);
  document.getElementById('btn-clear-budget')?.addEventListener('click', handleClearBudget);
  document.getElementById('btn-cancel-budget')?.addEventListener('click', closeBudgetEditor);
  document.getElementById('btn-close-budget-alert')?.addEventListener('click', () => {
    document.getElementById('budget-crossed-modal')?.classList.add('hidden');
  });

  // Expense Entry Form
  document.getElementById('expense-form')?.addEventListener('submit', handleSaveExpense);

  // Custom Category Inline Form
  document.getElementById('btn-add-category')?.addEventListener('click', addCustomCategory);
  document.getElementById('btn-cancel-category')?.addEventListener('click', () => {
    document.getElementById('new-category-form')?.classList.add('hidden');
    document.getElementById('category-form-msg')?.classList.add('hidden');
  });

  document.querySelectorAll('#new-category-form .emoji-pick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emojiInput = document.getElementById('new-cat-emoji');
      if (emojiInput) emojiInput.value = btn.getAttribute('data-emoji') || '✨';
    });
  });

  // Expense Dashboard Tabs & Period Selectors
  document.querySelectorAll('.exp-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab === 'day' || tab === 'month' || tab === 'year') {
        state.dashTab = tab;
        renderDashboard();
      }
    });
  });

  document.getElementById('btn-period-prev')?.addEventListener('click', () => shiftDashboardPeriod(-1));
  document.getElementById('btn-period-next')?.addEventListener('click', () => shiftDashboardPeriod(1));

  document.getElementById('dashboard-day-picker')?.addEventListener('change', (e) => {
    if (e.target.value) {
      state.dashDate = e.target.value;
      renderDashboard();
    }
  });

  // Credit Entry Form & Custom Sources
  document.getElementById('credit-form')?.addEventListener('submit', handleSaveCredit);
  document.getElementById('btn-add-source')?.addEventListener('click', addCustomSource);
  document.getElementById('btn-cancel-source')?.addEventListener('click', () => {
    document.getElementById('new-source-form')?.classList.add('hidden');
    document.getElementById('source-form-msg')?.classList.add('hidden');
  });

  document.querySelectorAll('.source-emoji-pick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emojiInput = document.getElementById('new-source-emoji');
      if (emojiInput) emojiInput.value = btn.getAttribute('data-emoji') || '✨';
    });
  });

  // Credits Dashboard Tabs & Period Selectors
  document.querySelectorAll('.cred-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab === 'day' || tab === 'month' || tab === 'year') {
        state.credDashTab = tab;
        renderCreditsDashboard();
      }
    });
  });

  document.getElementById('btn-credit-period-prev')?.addEventListener('click', () => shiftCreditDashboardPeriod(-1));
  document.getElementById('btn-credit-period-next')?.addEventListener('click', () => shiftCreditDashboardPeriod(1));

  document.getElementById('credit-dashboard-day-picker')?.addEventListener('change', (e) => {
    if (e.target.value) {
      state.credDashDate = e.target.value;
      renderCreditsDashboard();
    }
  });

  // Expense List Filters
  document.getElementById('list-filter-period-type')?.addEventListener('change', (e) => {
    state.listPeriodType = e.target.value || 'all';
    renderExpenseList();
  });

  document.getElementById('list-filter-day')?.addEventListener('change', (e) => {
    state.listFilterDay = e.target.value;
    renderExpenseList();
  });

  document.getElementById('list-filter-month')?.addEventListener('change', (e) => {
    state.listFilterMonth = e.target.value;
    renderExpenseList();
  });

  document.getElementById('list-filter-year')?.addEventListener('change', (e) => {
    state.listFilterYear = e.target.value;
    renderExpenseList();
  });

  document.getElementById('filter-category')?.addEventListener('change', (e) => {
    state.listFilterCategory = e.target.value || 'all';
    renderExpenseList();
  });

  document.getElementById('filter-search')?.addEventListener('input', (e) => {
    state.listSearch = e.target.value || '';
    renderExpenseList();
  });

  document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
    state.listPeriodType = 'all';
    state.listFilterCategory = 'all';
    state.listSearch = '';
    const periodEl = document.getElementById('list-filter-period-type');
    const catEl = document.getElementById('filter-category');
    const searchEl = document.getElementById('filter-search');
    if (periodEl) periodEl.value = 'all';
    if (catEl) catEl.value = 'all';
    if (searchEl) searchEl.value = '';
    renderExpenseList();
  });

  // Edit Modals
  document.getElementById('edit-expense-form')?.addEventListener('submit', handleEditExpenseSubmit);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', closeEditModal);
  document.getElementById('edit-credit-form')?.addEventListener('submit', handleEditCreditSubmit);
  document.getElementById('btn-cancel-credit-edit')?.addEventListener('click', closeEditCreditModal);

  // Backup Card Controls
  document.getElementById('btn-copy-csv')?.addEventListener('click', handleCopyAsCsv);
  document.getElementById('btn-download-backup')?.addEventListener('click', handleDownloadBackup);

  const restoreInput = document.getElementById('restore-file-input');
  document.getElementById('btn-restore-backup')?.addEventListener('click', () => restoreInput?.click());
  restoreInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleRestoreBackupFile(file);
    restoreInput.value = '';
  });

  document.getElementById('btn-clear-all')?.addEventListener('click', () => {
    document.getElementById('confirm-clear-modal')?.classList.remove('hidden');
  });
  document.getElementById('btn-cancel-clear')?.addEventListener('click', () => {
    document.getElementById('confirm-clear-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-confirm-clear')?.addEventListener('click', handleConfirmClearAll);

  // Connectivity events
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
}

document.addEventListener('DOMContentLoaded', initApp);
