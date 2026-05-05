/**
 * /nick [اسم]   — يغيّر كنية جميع الأعضاء للاسم المحدد باستمرار
 * /nick off     — إيقاف الحلقة
 * /nick حدف     — حذف كل الكنيات الآن (مرة واحدة)
 * /nick reset   — نفس حدف
 * /nick status  — عرض الحالة
 * /nick unpin   — فك تثبيت كنية شخص
 *
 * إصلاحات v4:
 *  - الحلقة لا تتوقف أبداً بسبب أخطاء DB (تعيد المحاولة دائماً)
 *  - تغيير الاسم أثناء الشغل → يُطبَّق فوراً (نظام version)
 *  - auto-restart: إذا توقفت الحلقة بشكل غير متوقع وما زال الأمر مفعلاً تعيد تشغيل نفسها
 *  - /nick حدف لحذف كل الكنيات دفعة واحدة
 */

if (!global._nickRunning)  global._nickRunning  = {};   // tid → true
if (!global._nickVersion)  global._nickVersion  = {};   // tid → number (يزيد عند تغيير الاسم)
if (!global._nickStop)     global._nickStop     = {};   // tid → true

// ── مساعدات ──────────────────────────────────────────────────────────────────

function isBotAdmin(uid) {
  return (global.GoatBot?.config?.adminBot || [])
    .map(String).includes(String(uid));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * ينام مدة ms — لكنه يستيقظ مبكراً إذا:
 *  - طُلب الإيقاف (_nickStop)
 *  - تغيّر الإصدار (_nickVersion) مقارنةً بـ knownVersion
 */
async function sleepInterruptible(ms, tid, knownVersion) {
  const step = 150;
  let elapsed = 0;
  while (elapsed < ms) {
    if (global._nickStop[tid])                       return "stop";
    if ((global._nickVersion[tid] || 0) !== knownVersion) return "version";
    await sleep(Math.min(step, ms - elapsed));
    elapsed += step;
  }
  return "done";
}

async function loadLock(threadsData, tid) {
  try {
    const val = await threadsData.get(tid, "data.nickLock");
    return (val && typeof val === "object") ? val : null;
  } catch (_) { return null; }
}

async function saveLock(threadsData, tid, lock) {
  try { await threadsData.set(tid, lock, "data.nickLock"); } catch (_) {}
}

// ── الحلقة الرئيسية ───────────────────────────────────────────────────────────

async function runCycle(api, threadsData, tid) {
  if (global._nickRunning[tid]) return;          // حلقة تعمل بالفعل
  global._nickRunning[tid] = true;
  delete global._nickStop[tid];

  const botID = String(api.getCurrentUserID());

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // ── فحص الإيقاف ──────────────────────────────────────────────────────
      if (global._nickStop[tid]) break;

      // ── قراءة الإعدادات ───────────────────────────────────────────────────
      const lock = await loadLock(threadsData, tid);

      if (!lock) {
        // DB فشلت أو لا يوجد إعداد بعد → انتظر وأعد
        const r = await sleepInterruptible(8000, tid, global._nickVersion[tid] || 0);
        if (r === "stop") break;
        continue;
      }

      if (!lock.enabled || !lock.name) break;   // إيقاف صريح من قاعدة البيانات

      const targetName   = lock.name;
      const pinned       = lock.pinned || {};
      const knownVersion = global._nickVersion[tid] || 0;

      // ── جلب الأعضاء ───────────────────────────────────────────────────────
      let members = [];
      try {
        const info = await api.getThreadInfo(tid);
        members = (info.participantIDs || []).filter(id => String(id) !== botID);
      } catch (_) {
        const r = await sleepInterruptible(15000, tid, knownVersion);
        if (r === "stop") break;
        continue;
      }

      if (!members.length) {
        const r = await sleepInterruptible(10000, tid, knownVersion);
        if (r === "stop") break;
        continue;
      }

      // خلط الترتيب لتوزيع التغييرات
      members.sort(() => Math.random() - 0.5);

      // ── تغيير الكنيات ─────────────────────────────────────────────────────
      for (const uid of members) {
        if (global._nickStop[tid]) break;
        // إذا تغيّر الإصدار أثناء الدورة → ابدأ دورة جديدة فوراً بالاسم الجديد
        if ((global._nickVersion[tid] || 0) !== knownVersion) break;

        if (pinned[String(uid)]) continue;

        try { await api.changeNickname(targetName, tid, uid); } catch (_) {}

        const r = await sleepInterruptible(4500, tid, knownVersion);
        if (r === "stop" || r === "version") break;
      }

      if (global._nickStop[tid]) break;

      // انتظار قصير بين الدورات
      const r = await sleepInterruptible(2500, tid, global._nickVersion[tid] || 0);
      if (r === "stop") break;
      // إذا "version" → ابدأ الدورة التالية فوراً (بدون انتظار)
    }
  } finally {
    delete global._nickRunning[tid];
    delete global._nickStop[tid];

    // ── auto-restart: إذا ما زال الأمر مفعلاً في DB → أعد التشغيل ─────────
    if (!global._nickStop[tid]) {
      setTimeout(async () => {
        try {
          const lock = await loadLock(threadsData, tid);
          if (lock?.enabled && lock?.name) {
            runCycle(api, threadsData, tid).catch(() => {});
          }
        } catch (_) {}
      }, 5000);
    }
  }
}

// ── Module ────────────────────────────────────────────────────────────────────

module.exports = {
  config: {
    name: "nick",
    version: "4.0",
    author: "DJAMEL / Fix",
    countDown: 3,
    role: 2,
    description: "تغيير كنيات جميع الأعضاء لاسم واحد باستمرار",
    category: "admin",
    guide: {
      en:
        "  {pn} [اسم]          — شغّل وغيّر كنيات الكل لهذا الاسم\n" +
        "  {pn} off             — أوقف الأمر\n" +
        "  {pn} حدف             — احذف كل كنيات الغروب الآن\n" +
        "  {pn} reset           — نفس حدف\n" +
        "  {pn} status          — الحالة الحالية\n" +
        "  {pn} unpin [ID/@]    — فك تثبيت كنية شخص"
    }
  },

  onStart: async function ({ api, event, args, message, threadsData }) {
    const { senderID, threadID } = event;
    if (!isBotAdmin(senderID)) return;

    const sub  = (args[0] || "").toLowerCase().trim();
    const name = args.join(" ").trim();

    // ── /nick off ──────────────────────────────────────────────────────────────
    if (sub === "off") {
      const lock = await loadLock(threadsData, threadID);
      if (lock) { lock.enabled = false; await saveLock(threadsData, threadID, lock); }
      global._nickStop[threadID] = true;
      delete global._nickRunning[threadID];
      return message.reply("🛑 تم إيقاف أمر الكنيات.");
    }

    // ── /nick status ───────────────────────────────────────────────────────────
    if (sub === "status") {
      const lock    = await loadLock(threadsData, threadID);
      const running = !!global._nickRunning[threadID];
      const pins    = Object.keys(lock?.pinned || {}).length;
      return message.reply(
        "📊 حالة أمر الكنيات\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        `▶️ الحالة  : ${running ? "🟢 يعمل" : "🔴 متوقف"}\n` +
        `📛 الاسم   : ${lock?.name || "—"}\n` +
        `📌 مثبتون : ${pins} شخص`
      );
    }

    // ── /nick حدف أو /nick reset ───────────────────────────────────────────────
    if (sub === "حدف" || sub === "reset") {
      message.reply("⏳ جاري حذف جميع الكنيات...");
      let info;
      try { info = await api.getThreadInfo(threadID); }
      catch (_) { return message.reply("❌ فشل في جلب معلومات الغروب."); }

      const botID   = String(api.getCurrentUserID());
      const members = (info.participantIDs || []).filter(id => String(id) !== botID);
      let done = 0, failed = 0;

      for (const uid of members) {
        try { await api.changeNickname("", threadID, uid); done++; }
        catch (_) { failed++; }
        await sleep(2000);
      }
      return message.reply(
        `✅ تم حذف كنيات ${done} عضو` +
        (failed ? ` (فشل ${failed})` : "") + "."
      );
    }

    // ── /nick unpin ────────────────────────────────────────────────────────────
    if (sub === "unpin") {
      const mentionIDs = Object.keys(event.mentions || {});
      const targetID   = String(mentionIDs[0] || args[1] || "");
      if (!targetID) return message.reply("❌ حدد الشخص: /nick unpin [ID] أو @منشن");

      const lock = await loadLock(threadsData, threadID);
      if (!lock?.pinned?.[targetID])
        return message.reply("⚠️ هذا الشخص ليس لديه كنية مثبتة.");

      delete lock.pinned[targetID];
      await saveLock(threadsData, threadID, lock);
      return message.reply("✅ فُك تثبيت كنية هذا الشخص — سيُغيّرها الأمر في الدورة التالية.");
    }

    // ── /nick (بدون وسيطة) ────────────────────────────────────────────────────
    if (!name) {
      return message.reply(
        "📋 أمر الكنيات\n━━━━━━━━━━━━━━━━━━\n" +
        "• /nick [اسم]       — شغّل وغيّر كنيات الكل\n" +
        "• /nick off          — أوقف الأمر\n" +
        "• /nick حدف          — احذف كل كنيات الغروب الآن\n" +
        "• /nick reset        — نفس حدف\n" +
        "• /nick status       — الحالة الحالية\n" +
        "• /nick unpin [ID/@] — فك تثبيت شخص\n" +
        "━━━━━━━━━━━━━━━━━━\n" +
        "📌 إذا غيّرت كنية شخص يدوياً كأدمن → البوت لن يتجاوزها."
      );
    }

    // ── /nick [اسم] ───────────────────────────────────────────────────────────
    const existing = await loadLock(threadsData, threadID);
    const lock     = (existing && typeof existing === "object") ? existing : {};
    lock.name    = name;
    lock.enabled = true;
    if (!lock.pinned) lock.pinned = {};
    await saveLock(threadsData, threadID, lock);

    // زيادة الإصدار لإيقاظ الحلقة فوراً إذا كانت تعمل
    global._nickVersion[threadID] = ((global._nickVersion[threadID] || 0) + 1);

    if (global._nickRunning[threadID]) {
      return message.reply(
        `✅ تم تحديث الاسم إلى: "${name}"\n` +
        "⚡ سيُطبَّق فوراً على الكل في الدورة الحالية."
      );
    }

    delete global._nickStop[threadID];

    message.reply(
      `🔄 تشغيل أمر الكنيات!\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📛 الاسم المستهدف: ${name}\n` +
      `⏱ ~4.5 ثانية بين كل عضو\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `اكتب /nick off للإيقاف\n` +
      `اكتب /nick حدف لحذف كل الكنيات`
    );

    runCycle(api, threadsData, threadID).catch(() => {});
  },

  // ── مراقبة تغييرات الكنيات ────────────────────────────────────────────────
  onEvent: async function ({ api, event, threadsData }) {
    if (event.logMessageType !== "log:user-nickname") return;

    const { threadID, author, logMessageData } = event;
    const botID   = String(api.getCurrentUserID());
    const changer = String(author || "");
    const target  = String(logMessageData?.participant_id || "");
    const newNick = logMessageData?.nickname || "";

    if (!changer || !target) return;
    if (changer === botID) return;   // تغيير البوت نفسه — تجاهل

    if (isBotAdmin(changer) && target !== botID) {
      // ── أدمن البوت غيّر كنية يدوياً → ثبّتها ──────────────────────────────
      const lock = await loadLock(threadsData, threadID);
      if (!lock) return;
      if (!lock.pinned) lock.pinned = {};
      if (newNick) {
        lock.pinned[target] = newNick;
      } else {
        delete lock.pinned[target];
      }
      await saveLock(threadsData, threadID, lock);

    } else if (!isBotAdmin(changer) && target !== botID) {
      // ── عضو عادي غيّر كنيته → أعد تطبيق الاسم المستهدف فوراً ─────────────
      if (!global._nickRunning[threadID]) return;
      const lock = await loadLock(threadsData, threadID);
      if (!lock?.enabled || !lock?.name) return;
      if (lock.pinned?.[target]) return;

      setTimeout(async () => {
        try { await api.changeNickname(lock.name, threadID, target); } catch (_) {}
      }, 4000);
    }
  }
};
