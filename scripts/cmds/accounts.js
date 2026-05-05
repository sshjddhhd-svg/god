/**
 * /accounts — Backup Account Management Command v2.0
 *
 * Usage:
 *   /accounts list                    — Show all configured accounts
 *   /accounts add <email> <pass> [label] — Add a backup account
 *   /accounts remove <index>          — Remove account by index
 *   /accounts switch <index>          — Manually switch to an account
 *   /accounts rotate                  — Force rotation now
 *   /accounts status                  — Show rotation system status
 *   /accounts unrestrict <index>      — Mark an account as healthy
 *   /accounts reset                   — Clear all restrictions
 *   /accounts cooldown <minutes>      — Set cooldown between rotations
 *   /accounts interval <minutes>      — Set scheduled rotation (0 = off)
 *   /accounts threshold <count>       — Set failure count before rotation
 *   /accounts enable | disable        — Enable/disable auto-rotation
 */

const { writeFileSync } = require("fs-extra");

module.exports = {
  config: {
    name: "accounts",
    version: "2.0",
    author: "WHITE V3",
    countDown: 5,
    role: 3,
    description: { en: "Manage backup Facebook accounts for auto-rotation (super admin only)" },
    category: "system",
    guide: {
      en: "  {pn} list\n"
        + "  {pn} add <email> <password> [label]\n"
        + "  {pn} remove <index>\n"
        + "  {pn} switch <index>\n"
        + "  {pn} rotate\n"
        + "  {pn} status\n"
        + "  {pn} unrestrict <index>\n"
        + "  {pn} reset\n"
        + "  {pn} cooldown <minutes>\n"
        + "  {pn} interval <minutes>\n"
        + "  {pn} threshold <count>\n"
        + "  {pn} enable | disable"
    }
  },

  langs: {
    en: {
      noConfig:        "❌ accountRotation is not configured in config.json.",
      listTitle:       "📋 Backup Account Roster\n══════════════════════",
      listEntry:       "%1. %2 %3 (%4)\n   📧 %5\n   🔒 2FA: %6",
      noAccounts:      "No accounts configured yet. Use /accounts add to add one.",
      statusTitle:     "📊 Account Rotator Status\n═══════════════════════",
      addSuccess:      "✅ Account added: %1 (%2)\nIndex: %3",
      addDuplicate:    "⚠️ That email is already in the list.",
      removeSuccess:   "✅ Removed account [%1]: %2",
      removeInvalid:   "⚠️ Invalid index. Use /accounts list to see valid indexes.",
      removeLast:      "❌ Cannot remove the last account.",
      switchStart:     "🔄 Switching to account [%1]: %2\nThis will restart the bot in ~10 seconds...",
      switchInvalid:   "⚠️ Invalid index.",
      switchSame:      "ℹ️ Already using account [%1].",
      noRotator:       "❌ Account rotator module not found.",
      enabledOk:       "✅ Auto-rotation ENABLED.",
      disabledOk:      "✅ Auto-rotation DISABLED.",
      unrestricted:    "✅ Account [%1] marked as healthy (unrestricted).",
      roleError:       "❌ This command requires Super Admin (level 3).",
      cooldownSet:     "⏱️ Rotation cooldown set to %1 minute(s).",
      cooldownInvalid: "⚠️ Usage: /accounts cooldown <minutes> (1–1440)",
      intervalSet:     "⏰ Scheduled rotation set to every %1 minute(s).\n(0 = disabled)",
      intervalInvalid: "⚠️ Usage: /accounts interval <minutes> (0 = off, min 5)",
      thresholdSet:    "🎯 Failure threshold set to %1 consecutive failures.",
      thresholdInvalid:"⚠️ Usage: /accounts threshold <count> (1–20)",
      resetDone:       "🔓 All account restrictions cleared.",
      rotateStart:     "🔄 Manually triggering account rotation...",
      rotateDisabled:  "❌ Enable auto-rotation first: /accounts enable"
    }
  },

  onStart: async function ({ message, args, event, getLang }) {
    const { senderID } = event;

    const superAdmins = global.GoatBot?.config?.superAdminBot || [];
    const adminBot    = global.GoatBot?.config?.adminBot      || [];
    if (!superAdmins.includes(String(senderID)) && !adminBot.includes(String(senderID))) {
      return message.reply(getLang("roleError"));
    }

    const cfg = global.GoatBot?.config;
    if (!cfg) return message.reply("❌ Config not loaded.");

    if (!cfg.accountRotation) {
      cfg.accountRotation = {
        enable: false,
        accounts: [],
        currentIndex: 0,
        restrictedIndexes: [],
        rotationCooldownMinutes: 3,
        scheduledIntervalMinutes: 0,
        sendFailureThreshold: 5
      };
    }

    const rot      = cfg.accountRotation;
    const accounts = rot.accounts;

    const save = () => {
      try {
        writeFileSync(global.client.dirConfig, JSON.stringify(cfg, null, 2));
      } catch (e) {
        message.reply("⚠️ Failed to save config: " + e.message);
      }
    };

    const action = (args[0] || "list").toLowerCase();

    switch (action) {

      // ── list ──────────────────────────────────────────────────────────────
      case "list": {
        if (!accounts.length) return message.reply(getLang("listTitle") + "\n\n" + getLang("noAccounts"));
        const restricted = rot.restrictedIndexes || [];
        const lines = accounts.map((acc, i) => {
          const isCurrent    = i === rot.currentIndex;
          const isRestricted = restricted.includes(i);
          const statusIcon   = isCurrent ? "✅" : isRestricted ? "🚫" : "💤";
          const statusText   = isCurrent ? "ACTIVE" : isRestricted ? "RESTRICTED" : "STANDBY";
          const label        = acc.label || `Account #${i}`;
          const has2FA       = acc["2FASecret"] ? "Yes" : "No";
          return getLang("listEntry", i, statusIcon, label, statusText, acc.email, has2FA);
        });
        return message.reply(
          getLang("listTitle") + "\n\n" + lines.join("\n\n") +
          `\n\n⚙️ Auto-rotation: ${rot.enable ? "✅ ENABLED" : "❌ DISABLED"}` +
          `\n⏱️ Cooldown: ${rot.rotationCooldownMinutes || 3} min` +
          `\n⏰ Interval: ${rot.scheduledIntervalMinutes || 0} min (0=off)` +
          `\n🎯 Threshold: ${rot.sendFailureThreshold || 5} failures`
        );
      }

      // ── add ───────────────────────────────────────────────────────────────
      case "add": {
        const email    = args[1];
        const password = args[2];
        const label    = args.slice(3).join(" ") || `Backup ${accounts.length}`;
        if (!email || !password)
          return message.reply("⚠️ Usage: /accounts add <email> <password> [label]");
        if (accounts.some(a => a.email.toLowerCase() === email.toLowerCase()))
          return message.reply(getLang("addDuplicate"));
        accounts.push({ email, password, "2FASecret": "", label });
        save();
        return message.reply(getLang("addSuccess", label, email, accounts.length - 1));
      }

      // ── remove ────────────────────────────────────────────────────────────
      case "remove": {
        const idx = parseInt(args[1]);
        if (isNaN(idx) || idx < 0 || idx >= accounts.length)
          return message.reply(getLang("removeInvalid"));
        if (accounts.length <= 1)
          return message.reply(getLang("removeLast"));
        const removed = accounts.splice(idx, 1)[0];
        if (rot.currentIndex >= accounts.length) rot.currentIndex = 0;
        rot.restrictedIndexes = (rot.restrictedIndexes || [])
          .filter(i => i !== idx).map(i => i > idx ? i - 1 : i);
        save();
        return message.reply(getLang("removeSuccess", idx, removed.email));
      }

      // ── switch ────────────────────────────────────────────────────────────
      case "switch": {
        const idx = parseInt(args[1]);
        if (isNaN(idx) || idx < 0 || idx >= accounts.length)
          return message.reply(getLang("switchInvalid"));
        if (idx === rot.currentIndex)
          return message.reply(getLang("switchSame", idx));
        const target = accounts[idx];
        await message.reply(getLang("switchStart", idx, target.email));
        try {
          const rotator = require("../../bot/accountRotator/index.js");
          rot.currentIndex = (idx - 1 + accounts.length) % accounts.length;
          save();
          await rotator.rotateAccount(`Manual switch requested by admin ${senderID}`);
        } catch (e) {
          return message.reply(getLang("noRotator") + "\n" + e.message);
        }
        break;
      }

      // ── rotate ────────────────────────────────────────────────────────────
      case "rotate": {
        if (!rot.enable) return message.reply(getLang("rotateDisabled"));
        await message.reply(getLang("rotateStart"));
        try {
          const rotator = require("../../bot/accountRotator/index.js");
          rotator.resetState();
          await rotator.rotateAccount(`Manual rotation requested by admin ${senderID}`);
        } catch (e) {
          return message.reply(getLang("noRotator") + "\n" + e.message);
        }
        break;
      }

      // ── cooldown ──────────────────────────────────────────────────────────
      case "cooldown": {
        const mins = parseInt(args[1]);
        if (isNaN(mins) || mins < 1 || mins > 1440)
          return message.reply(getLang("cooldownInvalid"));
        rot.rotationCooldownMinutes = mins;
        save();
        return message.reply(getLang("cooldownSet", mins));
      }

      // ── interval ──────────────────────────────────────────────────────────
      case "interval": {
        const mins = parseInt(args[1]);
        if (isNaN(mins) || mins < 0 || (mins > 0 && mins < 5))
          return message.reply(getLang("intervalInvalid"));
        rot.scheduledIntervalMinutes = mins;
        save();
        try {
          const rotator = require("../../bot/accountRotator/index.js");
          if (mins === 0) rotator.stopScheduledRotation();
          else rotator.startScheduledRotation();
        } catch (_) {}
        return message.reply(getLang("intervalSet", mins));
      }

      // ── threshold ─────────────────────────────────────────────────────────
      case "threshold": {
        const count = parseInt(args[1]);
        if (isNaN(count) || count < 1 || count > 20)
          return message.reply(getLang("thresholdInvalid"));
        rot.sendFailureThreshold = count;
        save();
        return message.reply(getLang("thresholdSet", count));
      }

      // ── reset ─────────────────────────────────────────────────────────────
      case "reset": {
        rot.restrictedIndexes = [];
        try {
          const rotator = require("../../bot/accountRotator/index.js");
          rotator.resetState();
        } catch (_) {}
        save();
        return message.reply(getLang("resetDone"));
      }

      // ── status ────────────────────────────────────────────────────────────
      case "status": {
        try {
          const rotator = require("../../bot/accountRotator/index.js");
          const s = rotator.getStatus();
          const lastRot = s.lastRotationTime
            ? new Date(s.lastRotationTime).toLocaleString()
            : "Never";
          return message.reply(
            getLang("statusTitle") + "\n\n" +
            `📊 Total accounts:   ${s.totalAccounts}\n` +
            `✅ Current:          [${s.currentIndex}] ${s.currentLabel}\n` +
            `📧 Email:            ${s.currentEmail}\n` +
            `🔄 Auto-rotation:    ${s.enabled ? "Enabled" : "Disabled"}\n` +
            `🚫 Restricted:       ${s.restrictedIndexes.length > 0 ? s.restrictedIndexes.join(", ") : "None"}\n` +
            `⏱️ Cooldown:         ${s.rotationCooldownMinutes} min\n` +
            `⏰ Scheduled every:  ${s.scheduledIntervalMinutes || 0} min ${s.scheduledActive ? "✅" : "⏸️"}\n` +
            `🎯 Fail threshold:   ${s.sendFailureThreshold} failures\n` +
            `⏱️ Last rotation:    ${lastRot}\n` +
            `📝 Last reason:      ${s.lastRotationReason || "N/A"}\n` +
            `🔁 Attempts:         ${s.rotationAttempts}`
          );
        } catch (e) {
          return message.reply(getLang("noRotator"));
        }
      }

      // ── unrestrict ────────────────────────────────────────────────────────
      case "unrestrict": {
        const idx = parseInt(args[1]);
        if (isNaN(idx) || idx < 0 || idx >= accounts.length)
          return message.reply(getLang("switchInvalid"));
        rot.restrictedIndexes = (rot.restrictedIndexes || []).filter(i => i !== idx);
        save();
        return message.reply(getLang("unrestricted", idx));
      }

      // ── enable / disable ──────────────────────────────────────────────────
      case "enable": {
        rot.enable = true;
        save();
        try {
          const rotator = require("../../bot/accountRotator/index.js");
          rotator.startScheduledRotation();
        } catch (_) {}
        return message.reply(getLang("enabledOk"));
      }
      case "disable": {
        rot.enable = false;
        save();
        try {
          const rotator = require("../../bot/accountRotator/index.js");
          rotator.stopScheduledRotation();
        } catch (_) {}
        return message.reply(getLang("disabledOk"));
      }

      default:
        return message.SyntaxError();
    }
  }
};
