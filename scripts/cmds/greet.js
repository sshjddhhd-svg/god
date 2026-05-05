const axios = require('axios');

  module.exports = {
    config: {
      name: "greet",
      aliases: ["hello", "hi"],
      version: "1.0",
      author: "DJAMEL",
      countDown: 5,
      role: 2,
      shortDescription: "يرد بترحيب شخصي",
      longDescription: "يرد على المستخدم بترحيب يذكر اسمه",
      category: "custom",
      guide: { en: "{pn}greet" }
    },
    onStart: async function({ api, event, args, message }) {
      const { threadID, messageID, senderID } = event;
      try {
        const userInfo = await new Promise((resolve, reject) => {
          api.getUserInfo(senderID, (err, data) => err ? reject(err) : resolve(data));
        });
        const name = userInfo[senderID]?.name || "صديقي";
        await message.reply("مرحباً " + name + "! 👋\nأهلاً وسهلاً بك في WHITE V3 🤖");
      } catch(e) {
        await message.reply("مرحباً! 👋 أهلاً وسهلاً!");
      }
    }
  };
