const fs = require("fs-extra");
const path = require("path");

const lockDataPath = path.join(process.cwd(), "database/data/lockData.json");

function loadLockData() {
  try {
    if (fs.existsSync(lockDataPath)) {
      return JSON.parse(fs.readFileSync(lockDataPath, "utf8"));
    }
  } catch (e) {}
  return {};
}

function saveLockData(data) {
  try {
    fs.ensureDirSync(path.dirname(lockDataPath));
    fs.writeFileSync(lockDataPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[LOCK] Failed to save lock data:", e.message);
  }
}

// تحميل البيانات المحفوظة عند تشغيل البوت
if (!global.GoatBot._lockDataLoaded) {
  if (!global.GoatBot.lockedThreads) global.GoatBot.lockedThreads = {};
  const savedData = loadLockData();
  Object.assign(global.GoatBot.lockedThreads, savedData);
  global.GoatBot._lockDataLoaded = true;
}

// ── حماية الأسبام — تتبّع معدل الرسائل ────────────────────────────────────
if (!global._lockSpamTracker) global._lockSpamTracker = {};
const SPAM_LIMIT   = 8;   // عدد الرسائل
const SPAM_WINDOW  = 10;  // ثانية
const SPAM_COOLDOWN = 60; // ثانية قبل إعادة التحقق بعد القفل التلقائي

function trackSpam(threadID, senderID) {
  const key = `${threadID}:${senderID}`;
  const now = Date.now();
  if (!global._lockSpamTracker[key]) global._lockSpamTracker[key] = { count: 0, first: now };
  const tr = global._lockSpamTracker[key];
  if (now - tr.first > SPAM_WINDOW * 1000) {
    tr.count = 1; tr.first = now;
  } else {
    tr.count++;
  }
  return tr.count;
}

function resetSpamTrack(threadID, senderID) {
  delete global._lockSpamTracker[`${threadID}:${senderID}`];
}

// ===================================================
//   دالة التحقق من أدمن البوت فقط
// ===================================================
function isAdmin(senderID) {
  const adminBot = global.GoatBot.config.adminBot || [];
  return adminBot.includes(String(senderID)) || adminBot.includes(senderID);
}

module.exports = {
  config: {
    name: "lock",
    version: "6.0",
    author: "MOHAMMAD AKASH",
    countDown: 5,
    role: 1,
    description: "قفل/فتح المجموعة — فقط الأدمن يمكنه استخدام البوت عند القفل",
    category: "box chat",
  },

  onStart: async function ({ api, event, args, threadsData }) {
    const { threadID, senderID } = event;

    if (!isAdmin(senderID)) {
      return api.sendMessage("❌ هذا الأمر للأدمن فقط!", threadID);
    }

    const lockedThreads = global.GoatBot.lockedThreads;
    const action = (args[0] || "").toLowerCase();

    // ── /lock on ──────────────────────────────────────────────────────────────
    if (action === "on" || action === "lock") {
      if (lockedThreads[threadID])
        return api.sendMessage("🔒 المجموعة مقفلة بالفعل!", threadID);

      lockedThreads[threadID] = true;
      saveLockData(lockedThreads);

      return api.sendMessage(
        "🔒 تم قفل المجموعة!\n" +
        "البوت سيتجاهل جميع الرسائل والأوامر تلقائياً.\n" +
        "فقط الأدمن يمكنه استخدام البوت الآن.",
        threadID
      );
    }

    // ── /lock off ─────────────────────────────────────────────────────────────
    if (action === "off" || action === "unlock") {
      if (!lockedThreads[threadID])
        return api.sendMessage("🔓 المجموعة مفتوحة بالفعل!", threadID);

      delete lockedThreads[threadID];
      saveLockData(lockedThreads);

      return api.sendMessage(
        "🔓 تم فتح المجموعة!\n" +
        "يمكن للجميع استخدام البوت الآن.",
        threadID
      );
    }

    // ── /lock status ──────────────────────────────────────────────────────────
    if (action === "status") {
      const isLocked = !!lockedThreads[threadID];
      return api.sendMessage(
        `📊 حالة المجموعة: ${isLocked ? "🔒 مقفلة" : "🔓 مفتوحة"}`,
        threadID
      );
    }

    // ── /lock on all ──────────────────────────────────────────────────────────
    if (action === "on" && (args[1] || "").toLowerCase() === "all" ||
        action === "all" && !args[1]) {
      // Re-check in case user wrote "/lock all" directly
    }
    if ((action === "on" && (args[1] || "").toLowerCase() === "all") ||
        (action === "all")) {
      const allThreads = global.db?.allThreadData || [];
      if (!allThreads.length) {
        return api.sendMessage("⚠️ لا توجد مجموعات متاحة في قاعدة البيانات.", threadID);
      }
      let lockedCount = 0;
      for (const thread of allThreads) {
        const tid = thread.threadID;
        if (!lockedThreads[tid]) {
          lockedThreads[tid] = true;
          lockedCount++;
        }
      }
      saveLockData(lockedThreads);
      return api.sendMessage(
        `🔒 تم قفل جميع المجموعات!\n` +
        `✅ مُقفل الآن: ${lockedCount} مجموعة جديدة\n` +
        `📊 إجمالي المجموعات المقفلة: ${Object.keys(lockedThreads).length}\n\n` +
        `استخدم /lock off في كل مجموعة لفتحها.`,
        threadID
      );
    }

    // ── /lock off all ─────────────────────────────────────────────────────────
    if (action === "off" && (args[1] || "").toLowerCase() === "all") {
      const count = Object.keys(lockedThreads).length;
      for (const tid of Object.keys(lockedThreads)) {
        delete lockedThreads[tid];
      }
      saveLockData(lockedThreads);
      return api.sendMessage(
        `🔓 تم فتح جميع المجموعات!\n` +
        `✅ تم فتح: ${count} مجموعة`,
        threadID
      );
    }

    // ── /lock spam on/off — تفعيل/تعطيل حماية السبام ────────────────────────
    if (action === "spam") {
      const sub = (args[1] || "on").toLowerCase();
      global.GoatBot._spamProtect = sub !== "off";
      return api.sendMessage(
        sub !== "off"
          ? `🛡️ حماية الأسبام مفعّلة!\nالقفل التلقائي عند ${SPAM_LIMIT} رسائل في ${SPAM_WINDOW} ثانية.`
          : `⚠️ حماية الأسبام معطّلة.`,
        threadID
      );
    }

    return api.sendMessage(
      "⚙️ طريقة الاستخدام:\n" +
      "• /lock on — قفل المجموعة\n" +
      "• /lock off — فتح المجموعة\n" +
      "• /lock on all — قفل كل المجموعات\n" +
      "• /lock off all — فتح كل المجموعات\n" +
      "• /lock status — معرفة الحالة\n" +
      "• /lock spam on/off — حماية الأسبام التلقائية",
      threadID
    );
  },

  // ── مراقبة الرسائل: حذف غير الأدمن عند القفل + حماية الأسبام ─────────────
  onEvent: async function ({ api, event }) {
    const { threadID, senderID, messageID, body } = event;
    const lockedThreads = global.GoatBot.lockedThreads;

    const botID = global.GoatBot.botID || global.botID;
    if (String(senderID) === String(botID)) return;

    // ── حذف رسائل غير الأدمن عند القفل ─────────────────────────────────────
    if (lockedThreads?.[threadID]) {
      if (isAdmin(senderID)) return;
      try { await api.unsendMessage(messageID); } catch (e) {}
      return;
    }

    // ── حماية الأسبام التلقائية ───────────────────────────────────────────────
    if (global.GoatBot._spamProtect !== false && !isAdmin(senderID) && body) {
      const prefix = global.GoatBot?.config?.prefix || "/";
      const isCmd = body.startsWith(prefix);
      if (!isCmd) return; // نراقب الأوامر فقط

      const count = trackSpam(threadID, senderID);
      if (count >= SPAM_LIMIT) {
        resetSpamTrack(threadID, senderID);
        if (!lockedThreads[threadID]) {
          lockedThreads[threadID] = true;
          saveLockData(lockedThreads);
          try {
            await api.sendMessage(
              `🛡️ تم تفعيل قفل المجموعة تلقائياً!\n` +
              `⚠️ سبب: أسبام أوامر (${SPAM_LIMIT}+ أوامر في ${SPAM_WINDOW} ثانية)\n` +
              `👤 المستخدم: ${senderID}\n` +
              `🔑 أدمن البوت يمكنه فتح القفل بـ /lock off`,
              threadID
            );
          } catch (_) {}
          // حذف الرسالة المسبّبة للأسبام
          try { await api.unsendMessage(messageID); } catch (_) {}
        }
      }
    }
  },
};
