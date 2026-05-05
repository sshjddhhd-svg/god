/**
 * /nm — Name Lock with time-based recurring enforcement
 *
 * /nm [name]          — lock group name
 * /unm                — unlock
 * /nm time [s]        — fixed interval (e.g. /nm time 30)
 * /nm time [min] [max]— random range  (e.g. /nm time 20 40)
 * /nm status          — show current settings
 *
 * The bot enforces the name on a recurring timer AND immediately
 * when it detects someone changing it — so even mid-changes get reverted.
 */

if (!global._nmIntervals) global._nmIntervals = new Map(); // recurring timers
if (!global._nmLocks)     global._nmLocks     = new Map(); // { name, minDelay, maxDelay, enabled }

const intervals = global._nmIntervals;
const locks     = global._nmLocks;

function isBotAdmin(senderID) {
  const adminBot = global.GoatBot?.config?.adminBot || [];
  return adminBot.map(id => String(id).trim()).includes(String(senderID));
}

function randBetween(min, max) {
  if (min >= max) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getIntervalMs(lock) {
  const min = lock.minDelay ?? lock.delay ?? 30;
  const max = lock.maxDelay ?? min;
  return randBetween(min, max) * 1000;
}

/**
 * Start (or restart) the recurring interval for a thread.
 * Uses a self-rescheduling setTimeout so the delay can be random each cycle.
 */
function startInterval(threadID, lock) {
  stopInterval(threadID);

  if (!lock?.enabled || !lock?.name) return;

  locks.set(threadID, lock);

  function schedule() {
    const delayMs = getIntervalMs(lock);
    const t = setTimeout(async () => {
      intervals.delete(threadID);

      const currentLock = locks.get(threadID);
      if (!currentLock?.enabled || !currentLock?.name) return;

      const api = global.GoatBot?.fcaApi;
      if (!api) { schedule(); return; }

      try {
        await api.setTitle(currentLock.name, threadID);
      } catch (_) {}

      schedule();
    }, delayMs);
    intervals.set(threadID, t);
  }

  schedule();
}

function stopInterval(threadID) {
  if (intervals.has(threadID)) {
    clearTimeout(intervals.get(threadID));
    intervals.delete(threadID);
  }
  locks.delete(threadID);
}

// ─── Module ───────────────────────────────────────────────────────────────────

module.exports = {
  config: {
    name: "nm",
    version: "3.0",
    author: "Custom",
    countDown: 5,
    role: 0,
    description: "قفل اسم الغروب مع تطبيق دوري بالوقت",
    category: "group",
    guide: {
      en:
        "  {pn} [name]           — Lock group name\n" +
        "  /unm                  — Unlock group name\n" +
        "  {pn} time [s]         — Fixed interval in seconds (e.g. /nm time 30)\n" +
        "  {pn} time [min] [max] — Random interval range  (e.g. /nm time 20 40)\n" +
        "  {pn} status           — Show current settings"
    }
  },

  onStart: async function ({ api, event, args, message, threadsData }) {
    const { senderID, threadID } = event;
    if (!isBotAdmin(senderID)) return;

    const sub = (args[0] || "").toLowerCase();

    // ── /nm status ──────────────────────────────────────────────────────────
    if (sub === "status") {
      const lock = await threadsData.get(threadID, "data.nmLock");
      if (!lock?.name) {
        return message.reply("📋 قفل الاسم مُعطَّل في هذا الغروب.");
      }
      const min = lock.minDelay ?? lock.delay ?? 30;
      const max = lock.maxDelay ?? min;
      const delayStr = min === max ? `${min}s` : `${min}–${max}s (عشوائي)`;
      const active = intervals.has(threadID) ? "✅ يعمل" : "⚠️ غير نشط (أعد تشغيل البوت)";
      return message.reply(
        `📋 حالة قفل الاسم\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🔒 الحالة : ${lock.enabled ? "مفعّل" : "مُعطَّل"}\n` +
        `📛 الاسم  : ${lock.name}\n` +
        `⏱ الفترة : ${delayStr}\n` +
        `🔄 المؤقت : ${active}`
      );
    }

    // ── /nm time [min] [max?] ────────────────────────────────────────────────
    if (sub === "time") {
      const v1 = parseInt(args[1]);
      const v2 = parseInt(args[2]);

      if (isNaN(v1) || v1 < 1) {
        return message.reply(
          "❌ مثال:\n" +
          "  /nm time 30      — كل 30 ثانية\n" +
          "  /nm time 20 40   — عشوائي بين 20 و 40 ثانية"
        );
      }

      const current = await threadsData.get(threadID, "data.nmLock") || {};
      if (!current.name) {
        return message.reply("❌ لم يُقفل اسم بعد. استخدم /nm [الاسم] أولاً.");
      }

      if (!isNaN(v2) && v2 >= v1) {
        current.minDelay = v1;
        current.maxDelay = v2;
        current.delay    = v1;
      } else {
        current.minDelay = v1;
        current.maxDelay = v1;
        current.delay    = v1;
      }

      await threadsData.set(threadID, current, "data.nmLock");
      startInterval(threadID, current);

      const delayStr = current.minDelay === current.maxDelay
        ? `${current.minDelay}s`
        : `${current.minDelay}–${current.maxDelay}s (عشوائي)`;

      return message.reply(
        `✅ تم تحديث الفترة الزمنية: ${delayStr}\n` +
        `البوت سيعيد تطبيق الاسم تلقائياً كل ${delayStr}.`
      );
    }

    // ── /nm [name] ───────────────────────────────────────────────────────────
    const name = args.join(" ").trim();
    if (!name) {
      return message.reply(
        "📋 أوامر قفل الاسم\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "• /nm [الاسم]          — قفل اسم الغروب\n" +
        "• /unm                 — فتح قفل الاسم\n" +
        "• /nm time [ث]         — تحديد الفترة (مثال: /nm time 30)\n" +
        "• /nm time [ث1] [ث2]  — فترة عشوائية (مثال: /nm time 20 40)\n" +
        "• /nm status           — عرض الإعدادات الحالية\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "الافتراضي: كل 30 ثانية"
      );
    }

    const existing = await threadsData.get(threadID, "data.nmLock") || {};
    const minDelay = existing.minDelay ?? 30;
    const maxDelay = existing.maxDelay ?? 30;

    const newLock = {
      name,
      delay:    minDelay,
      minDelay,
      maxDelay,
      enabled:  true
    };

    await threadsData.set(threadID, newLock, "data.nmLock");

    try { await api.setTitle(name, threadID); } catch (_) {}

    startInterval(threadID, newLock);

    const delayStr = minDelay === maxDelay
      ? `${minDelay}s`
      : `${minDelay}–${maxDelay}s (عشوائي)`;

    return message.reply(
      `🔒 تم قفل اسم الغروب!\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📛 الاسم  : ${name}\n` +
      `⏱ الفترة : ${delayStr}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ البوت سيعيد الاسم كل ${delayStr} تلقائياً.\n` +
      `✅ وأيضاً فوراً إذا حاول أحد تغييره.\n` +
      `استخدم /unm للإلغاء.`
    );
  },

  onEvent: async function ({ api, event, threadsData }) {
    const { threadID, author, logMessageType } = event;
    if (logMessageType !== "log:thread-name") return;

    const botID = String(api.getCurrentUserID());
    if (String(author) === botID) return;

    let nmLock;
    try { nmLock = await threadsData.get(threadID, "data.nmLock"); } catch (_) { return; }
    if (!nmLock?.enabled || !nmLock?.name) return;

    // Sync in-memory lock in case it was set before this restart
    if (!locks.has(threadID)) {
      locks.set(threadID, nmLock);
      startInterval(threadID, nmLock);
    }

    // Immediate restore — don't wait for the next interval cycle
    try {
      await api.setTitle(nmLock.name, threadID);
    } catch (_) {}
  }
};
