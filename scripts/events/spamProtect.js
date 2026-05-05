/**
 * spamProtect.js — حماية تلقائية من أسبام الأوامر
 * يراقب أوامر البوت من غير الأدمن ويقفل المجموعة تلقائياً عند الأسبام
 */

const fs   = require("fs-extra");
const path = require("path");

const lockDataPath = path.join(process.cwd(), "database/data/lockData.json");

function saveLockData(data) {
  try {
    fs.ensureDirSync(path.dirname(lockDataPath));
    fs.writeFileSync(lockDataPath, JSON.stringify(data, null, 2));
  } catch (e) {}
}

function isAdmin(senderID) {
  const adminBot = global.GoatBot?.config?.adminBot || [];
  return adminBot.includes(String(senderID)) || adminBot.includes(senderID);
}

if (!global._spamHistory) global._spamHistory = {};

const SPAM_CMD_LIMIT  = 7;
const SPAM_WINDOW_MS  = 10 * 1000;

module.exports = {
  config: {
    name:        "spamProtect",
    version:     "1.0",
    author:      "WHITE V3",
    category:    "events",
    description: "حماية تلقائية من أسبام الأوامر — يقفل المجموعة تلقائياً",
  },

  onStart: async function ({ api, event, args }) {
    if (!event || !event.senderID) return;
    if (event.type !== "message") return;

    const { threadID, senderID, messageID, body } = event;
    const botID = String(global.GoatBot?.botID || global.botID || "");
    if (String(senderID) === botID) return;
    if (isAdmin(senderID)) return;

    if (global.GoatBot?.lockedThreads?.[threadID]) return;

    const prefix = global.GoatBot?.config?.prefix || "/";
    if (!(body || "").trim().startsWith(prefix)) return;

    const key = `${threadID}:${senderID}`;
    const now = Date.now();

    if (!global._spamHistory[key]) global._spamHistory[key] = [];
    const history = global._spamHistory[key];

    while (history.length && now - history[0] > SPAM_WINDOW_MS) history.shift();
    history.push(now);

    if (history.length >= SPAM_CMD_LIMIT) {
      global._spamHistory[key] = [];

      if (!global.GoatBot.lockedThreads) global.GoatBot.lockedThreads = {};
      if (global.GoatBot.lockedThreads[threadID]) return;

      global.GoatBot.lockedThreads[threadID] = true;
      saveLockData(global.GoatBot.lockedThreads);

      try {
        await api.sendMessage(
          `🛡️ تم قفل المجموعة تلقائياً بسبب أسبام الأوامر!\n` +
          `📊 ${history.length}+ أوامر في ${SPAM_WINDOW_MS / 1000} ثانية\n` +
          `👤 المعرّف: ${senderID}\n\n` +
          `🔑 الأدمن يفتح القفل بـ /lock off`,
          threadID
        );
      } catch (_) {}

      try { await api.unsendMessage(messageID); } catch (_) {}
    }
  },
};
