function isBotAdmin(senderID) {
  const adminBot = global.GoatBot?.config?.adminBot || [];
  return adminBot.map(id => String(id).trim()).includes(String(senderID));
}

module.exports = {
  config: {
    name: "unm",
    version: "2.0",
    author: "Custom",
    countDown: 5,
    role: 0,
    description: "إلغاء قفل اسم الغروب",
    category: "group",
    guide: {
      en: "  {pn} — Stop locking the group name"
    }
  },

  onStart: async function ({ api, event, message, threadsData }) {
    const { senderID, threadID } = event;

    if (!isBotAdmin(senderID)) return;

    const nmLock = await threadsData.get(threadID, "data.nmLock");

    if (!nmLock?.enabled) {
      return message.reply("ℹ️ لا يوجد قفل اسم نشط في هذا الغروب.");
    }

    // Disable in database
    await threadsData.set(threadID, { ...nmLock, enabled: false }, "data.nmLock");

    // Clear the recurring timer
    if (global._nmIntervals?.has(threadID)) {
      clearTimeout(global._nmIntervals.get(threadID));
      global._nmIntervals.delete(threadID);
    }
    if (global._nmLocks?.has(threadID)) {
      global._nmLocks.delete(threadID);
    }

    return message.reply(
      `🔓 تم إلغاء قفل اسم الغروب!\n\n` +
      `📛 كان مقفلاً على: ${nmLock.name}\n\n` +
      `يمكن لأي شخص الآن تغيير اسم الغروب بحرية.`
    );
  }
};
