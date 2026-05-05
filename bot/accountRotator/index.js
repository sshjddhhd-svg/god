/**
 * Account Rotator — Core Engine v2.0
 *
 * يدير التبديل التلقائي بين حسابات فيسبوك الاحتياطية عند الحظر.
 *
 * Flow:
 *  1. Detector triggers rotateAccount()
 *  2. Mark current account as "restricted"
 *  3. Find next healthy account
 *  4. Login via fca-eryxenx and extract fresh cookies
 *  5. Save new cookies to account.txt
 *  6. Update currentIndex in config
 *  7. Notify all admins
 *  8. process.exit(2) → watchdog restarts bot with new account
 */

const login   = require("fca-eryxenx");
const fs      = require("fs-extra");
const path    = require("path");

// ─── State ─────────────────────────────────────────────────────────────────
let isRotating          = false;
let lastRotationTime    = 0;
const MAX_ROTATION_ATTEMPTS = 3;
let rotationAttempts    = 0;
let _scheduledTimer     = null;

// ─── Dynamic cooldown (reads from config each time) ─────────────────────────
function getRotationCooldown() {
  const minutes = global.GoatBot?.config?.accountRotation?.rotationCooldownMinutes;
  return (typeof minutes === "number" && minutes > 0 ? minutes : 3) * 60 * 1000;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function log(level, msg) {
  const logger = global.utils?.log;
  if (level === "info")  return logger?.info ("ACCOUNT_ROTATOR", msg);
  if (level === "warn")  return logger?.warn ("ACCOUNT_ROTATOR", msg);
  if (level === "error") return logger?.err  ("ACCOUNT_ROTATOR", msg);
  console.log("[ACCOUNT_ROTATOR]", msg);
}

function notifyAdmins(message) {
  try {
    const api     = global.GoatBot?.fcaApi;
    const admins  = global.GoatBot?.config?.adminBot || [];
    const superAdmins = global.GoatBot?.config?.superAdminBot || [];
    const allAdmins   = [...new Set([...admins, ...superAdmins])];
    if (!api) return;
    for (const adminID of allAdmins) {
      const id = String(adminID).trim();
      if (!id) continue;
      api.sendMessage(message, id).catch(() => {});
    }
  } catch (e) {}
}

function getConfig() {
  return global.GoatBot?.config?.accountRotation || {};
}

function getAccounts() {
  return getConfig().accounts || [];
}

function getCurrentIndex() {
  return getConfig().currentIndex ?? 0;
}

function saveConfig() {
  try {
    const dirConfig = global.client?.dirConfig;
    if (!dirConfig) return;
    fs.writeFileSync(dirConfig, JSON.stringify(global.GoatBot.config, null, 2));
  } catch (e) {
    log("error", "Failed to save config: " + e.message);
  }
}

function getNextAccountIndex() {
  const accounts = getAccounts();
  if (!accounts.length) return -1;

  const currentIdx = getCurrentIndex();
  const restricted = getConfig().restrictedIndexes || [];

  for (let i = 1; i <= accounts.length; i++) {
    const idx = (currentIdx + i) % accounts.length;
    if (!restricted.includes(idx)) return idx;
  }

  log("warn", "All accounts are restricted. Clearing restriction list and trying from index 0...");
  if (global.GoatBot?.config?.accountRotation) {
    global.GoatBot.config.accountRotation.restrictedIndexes = [];
    saveConfig();
  }
  return (currentIdx + 1) % accounts.length;
}

function markCurrentAsRestricted() {
  const cfg = global.GoatBot?.config?.accountRotation;
  if (!cfg) return;
  if (!cfg.restrictedIndexes) cfg.restrictedIndexes = [];
  const current = getCurrentIndex();
  if (!cfg.restrictedIndexes.includes(current)) {
    cfg.restrictedIndexes.push(current);
    saveConfig();
    log("warn", `Account [${current}] marked as restricted.`);
  }
}

function loginAndGetCookies(account) {
  return new Promise((resolve) => {
    const credentials = { email: account.email, password: account.password };
    log("info", `Logging in with account: ${account.email}`);
    login(credentials, {}, (err, newApi) => {
      if (err) {
        log("error", `Login failed for ${account.email}: ${err?.error || err?.message || String(err)}`);
        return resolve(null);
      }
      try {
        const appState = newApi.getAppState();
        if (!appState || !appState.length) {
          log("error", `Got empty appState for ${account.email}`);
          return resolve(null);
        }
        log("info", `✅ Login successful for ${account.email}. Got ${appState.length} cookie(s).`);
        resolve(appState);
      } catch (e) {
        log("error", `Failed to extract appState: ${e.message}`);
        resolve(null);
      }
    });
  });
}

async function saveCookies(appState) {
  const accountPath = path.join(process.cwd(), "account.txt");
  await fs.writeFile(accountPath, JSON.stringify(appState, null, 2), "utf-8");
  log("info", `💾 New cookies saved to account.txt (${appState.length} entries)`);
}

// ─── Scheduled Interval Rotation ───────────────────────────────────────────
/**
 * Start rotating on a fixed schedule (every N minutes).
 * If intervalMinutes is 0 or not set → disabled.
 */
module.exports.startScheduledRotation = function startScheduledRotation() {
  if (_scheduledTimer) {
    clearInterval(_scheduledTimer);
    _scheduledTimer = null;
  }

  const cfg = getConfig();
  const minutes = cfg.scheduledIntervalMinutes;
  if (!minutes || minutes <= 0) return;
  if (!cfg.enable) return;

  const ms = minutes * 60 * 1000;
  log("info", `⏰ Scheduled rotation active — every ${minutes} min`);

  _scheduledTimer = setInterval(async () => {
    const current = getConfig();
    if (!current.enable || !current.scheduledIntervalMinutes) {
      clearInterval(_scheduledTimer);
      _scheduledTimer = null;
      return;
    }
    log("info", "⏰ Scheduled rotation — time to switch accounts");
    await module.exports.rotateAccount("Scheduled interval rotation").catch(() => {});
  }, ms);
};

module.exports.stopScheduledRotation = function stopScheduledRotation() {
  if (_scheduledTimer) {
    clearInterval(_scheduledTimer);
    _scheduledTimer = null;
    log("info", "⏰ Scheduled rotation stopped.");
  }
};

// ─── Main Rotation Function ─────────────────────────────────────────────────
module.exports.rotateAccount = async function rotateAccount(reason = "unknown") {
  if (isRotating) {
    log("warn", "Rotation already in progress — skipping duplicate call.");
    return false;
  }

  const now = Date.now();
  const cooldown = getRotationCooldown();
  if (now - lastRotationTime < cooldown) {
    const waitSec = Math.ceil((cooldown - (now - lastRotationTime)) / 1000);
    log("warn", `Rotation cooldown active. Wait ${waitSec}s before next rotation.`);
    return false;
  }

  const cfg = getConfig();
  if (!cfg.enable) {
    log("info", "Account rotation is disabled in config.");
    return false;
  }

  const accounts = getAccounts();
  if (accounts.length < 2) {
    log("warn", "Need at least 2 accounts configured for rotation. Skipping.");
    return false;
  }

  if (rotationAttempts >= MAX_ROTATION_ATTEMPTS) {
    log("error", `Max rotation attempts (${MAX_ROTATION_ATTEMPTS}) reached. Manual intervention required.`);
    notifyAdmins(
      `⛔ ACCOUNT ROTATOR\n\n` +
      `Tried ${MAX_ROTATION_ATTEMPTS} account rotations — all failed or limit reached.\n` +
      `Manual intervention required!\n\n` +
      `Reason for last trigger: ${reason}`
    );
    return false;
  }

  isRotating = true;
  lastRotationTime = now;
  rotationAttempts++;

  const currentIdx     = getCurrentIndex();
  const currentAccount = accounts[currentIdx];
  const label          = currentAccount?.label || `Account #${currentIdx}`;
  const cooldownMin    = Math.round(cooldown / 60000);

  log("warn", `⚠️ Rotation triggered! Reason: "${reason}" | Cooldown: ${cooldownMin}min`);

  notifyAdmins(
    `🔄 ACCOUNT ROTATOR\n\n` +
    `⚠️ Trigger: ${reason}\n` +
    `📤 Switching away from: ${label} (${currentAccount?.email || "?"})\n` +
    `⏱️ Cooldown: ${cooldownMin} دقيقة\n` +
    `🔍 Finding next available account...`
  );

  markCurrentAsRestricted();

  const nextIdx = getNextAccountIndex();
  if (nextIdx === -1) {
    log("error", "No backup accounts available.");
    notifyAdmins("❌ ACCOUNT ROTATOR\n\nNo backup accounts available. All accounts are restricted.");
    isRotating = false;
    return false;
  }

  const nextAccount = accounts[nextIdx];
  const nextLabel   = nextAccount?.label || `Account #${nextIdx}`;

  log("info", `Trying account [${nextIdx}]: ${nextAccount.email}`);
  notifyAdmins(
    `⏳ ACCOUNT ROTATOR\n\nAttempting login with:\n📧 ${nextLabel} (${nextAccount.email})\n\nPlease wait...`
  );

  const appState = await loginAndGetCookies(nextAccount);

  if (!appState) {
    log("error", `Failed to login with account [${nextIdx}]: ${nextAccount.email}`);
    if (global.GoatBot?.config?.accountRotation) {
      if (!global.GoatBot.config.accountRotation.restrictedIndexes)
        global.GoatBot.config.accountRotation.restrictedIndexes = [];
      global.GoatBot.config.accountRotation.restrictedIndexes.push(nextIdx);
      saveConfig();
    }
    isRotating = false;
    notifyAdmins(`❌ Login failed for ${nextAccount.email}. Trying next account...`);
    await new Promise(r => setTimeout(r, 5000));
    return module.exports.rotateAccount(`Previous login failed (${reason})`);
  }

  try {
    await saveCookies(appState);
  } catch (e) {
    log("error", "Failed to save cookies: " + e.message);
    isRotating = false;
    notifyAdmins(`❌ ACCOUNT ROTATOR\n\nLogin succeeded but failed to save cookies:\n${e.message}`);
    return false;
  }

  if (global.GoatBot?.config?.accountRotation) {
    global.GoatBot.config.accountRotation.currentIndex      = nextIdx;
    global.GoatBot.config.accountRotation.lastRotationTime  = new Date().toISOString();
    global.GoatBot.config.accountRotation.lastRotationReason = reason;
    const restricted = global.GoatBot.config.accountRotation.restrictedIndexes || [];
    global.GoatBot.config.accountRotation.restrictedIndexes = restricted.filter(i => i !== nextIdx);
    saveConfig();
  }

  rotationAttempts = 0;

  log("info", `✅ Rotation complete! Switched to account [${nextIdx}]: ${nextAccount.email}`);
  notifyAdmins(
    `✅ ACCOUNT ROTATOR SUCCESS\n\n` +
    `📥 Now using: ${nextLabel} (${nextAccount.email})\n` +
    `🔄 Previous: ${label} (${currentAccount?.email || "?"})\n` +
    `💾 New cookies saved to account.txt\n` +
    `♻️ Bot is restarting in 3 seconds...\n\n` +
    `📝 All groups, commands, and data are preserved.`
  );

  isRotating = false;
  setTimeout(() => process.exit(2), 3000);
  return true;
};

module.exports.resetState = function () {
  isRotating       = false;
  rotationAttempts = 0;
};

module.exports.getStatus = function () {
  const cfg      = getConfig();
  const accounts = getAccounts();
  const current  = getCurrentIndex();
  const cooldownMin = cfg.rotationCooldownMinutes || 3;
  const intervalMin = cfg.scheduledIntervalMinutes || 0;
  return {
    enabled:               cfg.enable || false,
    totalAccounts:         accounts.length,
    currentIndex:          current,
    currentEmail:          accounts[current]?.email || "?",
    currentLabel:          accounts[current]?.label || `Account #${current}`,
    restrictedIndexes:     cfg.restrictedIndexes || [],
    lastRotationTime:      cfg.lastRotationTime   || null,
    lastRotationReason:    cfg.lastRotationReason  || null,
    rotationCooldownMinutes: cooldownMin,
    scheduledIntervalMinutes: intervalMin,
    scheduledActive:       !!_scheduledTimer,
    isRotating,
    rotationAttempts,
    sendFailureThreshold:  cfg.sendFailureThreshold || 5
  };
};
