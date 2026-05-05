<div align="center">

<img src="https://readme-typing-svg.herokuapp.com?font=Montserrat&weight=700&size=32&duration=3500&pause=700&color=58A6FF&center=true&vCenter=true&width=800&lines=⚡+WHITE+V3;🤖+Facebook+Messenger+Bot;🛡️+Created+by+DJAMEL" alt="Typing SVG" />

<br/>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.5.35-00FFD1?style=for-the-badge&logo=github&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-18.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Creator-DJAMEL-FF6B6B?style=for-the-badge&logo=github&logoColor=white" />
  <img src="https://img.shields.io/badge/Platform-Facebook_Messenger-1877F2?style=for-the-badge&logo=messenger&logoColor=white" />
</p>

<p align="center">🚀 Fast &nbsp;•&nbsp; 🤖 Smart &nbsp;•&nbsp; 🛡️ Reliable &nbsp;•&nbsp; 🔒 Secure &nbsp;•&nbsp; 🌍 Multi-language</p>

</div>

---

> ⚠️ **IMPORTANT**
>
> This project is created and maintained by **DJAMEL** ([@castrolmocro](https://github.com/castrolmocro)).
> Do not sell, redistribute, or claim as your own.
> All core development, architecture, and features are the work of **DJAMEL**.

---

## 👨‍💻 Developer

| | |
|---|---|
| **Developer** | DJAMEL |
| **GitHub** | [@castrolmocro](https://github.com/castrolmocro) |
| **Repository** | [castrolmocro/WHITE-V3](https://github.com/castrolmocro/WHITE-V3) |
| **Version** | 1.5.35 |
| **License** | MIT |

---

## 🔥 Official Repository

<p align="center">
  <a href="https://github.com/castrolmocro/WHITE-V3">
    <img src="https://img.shields.io/badge/GitHub-castrolmocro%2FWHITE--V3-181717?style=for-the-badge&logo=github&logoColor=white" />
  </a>
</p>

---

## 📌 About WHITE V3

**WHITE V3** is an advanced Facebook Messenger bot framework built on top of the GoatBot engine — fully redesigned, extended, and maintained by **DJAMEL**.

It features a powerful admin web panel, end-to-end encryption, human-like behavior simulation, multi-account rotation, MQTT health monitoring, SQLite/MongoDB database support, and hundreds of commands.

---

## 🏗️ Bot Architecture

```
WHITE-V3/
├── index.js                   # Watchdog — auto-restart with exponential backoff
├── Goat.js                    # Main bot bootstrap (globals, config, DB init, login)
├── config.json                # Bot configuration (prefix, admins, database, stealth...)
├── configCommands.json        # Per-command configuration
├── account.txt                # Facebook AppState (cookies)
│
├── bot/
│   ├── login/
│   │   ├── login.js           # Facebook login via fca-eryxenx
│   │   ├── loadData.js        # Database initialization
│   │   ├── loadScripts.js     # Dynamic command/event loader
│   │   └── socketIO.js        # Socket.IO uptime integration
│   ├── handler/
│   │   └── handlerEvents.js   # Core message/event dispatcher
│   ├── stealth/               # Human-camouflage system (10 layers)
│   ├── e2ee/                  # Liberty Protocol — Signal-based E2EE
│   ├── autoRelogin.js         # Auto re-login on session loss
│   ├── accountRotator.js      # Multi-account rotation
│   ├── mqttHealthCheck.js     # MQTT connection watchdog
│   └── keepAlive.js           # Keep-alive ping system
│
├── scripts/
│   ├── cmds/                  # Bot commands (100+ commands)
│   └── events/                # Event handlers (welcome, leave, etc.)
│
├── database/
│   ├── connectDB/
│   │   ├── connectSqlite.js   # SQLite via Sequelize
│   │   └── connectMongoDB.js  # MongoDB via Mongoose
│   ├── controller/            # Data-access layer (threads, users, dashboard)
│   └── models/                # Sequelize + Mongoose models
│
├── dashboard/                 # Admin web dashboard (Express + ETA templates)
│   ├── app.js                 # Dashboard server (port 3001)
│   ├── routes/                # Register, login, forgot-password, dashboard API
│   └── views/                 # ETA HTML templates
│
├── webpanel/
│   ├── server.js              # Admin panel (port 5000) — full bot control UI
│   ├── devhub.js              # DevHub — GitHub integration + AI assistant
│   └── humanlike.js           # Human-like typing simulation
│
├── languages/                 # Localization (.lang files + cmds translations)
├── logger/                    # Custom logger with colors and timestamps
└── utils.js                   # Shared utilities
```

---

## ✨ Key Features

<div align="center">
  <table>
    <tr>
      <td align="center">🤖 100+ Bot Commands</td>
      <td align="center">🔒 Liberty Protocol E2EE</td>
    </tr>
    <tr>
      <td align="center">🕵️ 10-Layer Stealth Engine</td>
      <td align="center">🔄 Multi-Account Rotation</td>
    </tr>
    <tr>
      <td align="center">📊 Admin Web Panel</td>
      <td align="center">🐙 GitHub DevHub Integration</td>
    </tr>
    <tr>
      <td align="center">🛡️ Anti-Spam / Anti-Flood</td>
      <td align="center">💾 SQLite + MongoDB Support</td>
    </tr>
    <tr>
      <td align="center">🌍 Multi-language Support</td>
      <td align="center">🤖 AI Development Assistant</td>
    </tr>
    <tr>
      <td align="center">⚡ MQTT Health Watchdog</td>
      <td align="center">🔁 Auto-Restart Watchdog</td>
    </tr>
  </table>
</div>

---

## ⚙️ Setup

### 1. Clone the repository
```bash
git clone https://github.com/castrolmocro/WHITE-V3.git
cd WHITE-V3
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure the bot

Edit `config.json`:
```json
{
  "prefix": "/",
  "language": "en",
  "superAdminBot": ["YOUR_FACEBOOK_ID"],
  "database": { "type": "sqlite" }
}
```

### 4. Add your Facebook session

Paste your Facebook AppState (cookies) into `account.txt`.

### 5. Start the bot
```bash
node index.js
```

---

## 🌐 Deployment

### Railway
```bash
# Set env vars on Railway:
# PORT=5000
# NODE_ENV=production
```
A `railway.toml` is included — just connect the repo and deploy.

### Replit
- Set `PORT=5000` in Replit secrets
- The workflow `node index.js` is pre-configured

---

## 🔧 Admin Panel

Access the admin panel at:
- **Local**: `http://localhost:5000`
- **Railway/Replit**: your deployment URL

Default panel password: `djamel0191tlm` (change in devhub settings)

---

## 📋 Configuration Reference

| Key | Description |
|-----|-------------|
| `prefix` | Command prefix (default: `/`) |
| `superAdminBot` | Super admin Facebook IDs |
| `adminBot` | Admin Facebook IDs |
| `database.type` | `"sqlite"` or `"mongodb"` |
| `stealth.enable` | Human-camouflage system |
| `e2ee.enable` | End-to-end encryption |
| `accountRotation.enable` | Multi-account rotation |
| `dashBoard.port` | Dashboard port (default: 3001) |

---

## 🔒 Security Features

- **Liberty Protocol**: Signal-based E2EE (X3DH + Double Ratchet)
- **Anti-Spam**: Kick users who exceed message limits
- **Anti-Flood**: Detect and remove repeated messages
- **Anti-Impersonation**: Block admin name spoofing
- **Stealth Engine**: 10-layer human behavior simulation
- **Outgoing Throttle**: Rate-limit bot responses

---

## 📄 License

MIT License — created by **DJAMEL** ([@castrolmocro](https://github.com/castrolmocro)).

> Do not sell or claim this project as your own.
> © WHITE V3 created by DJAMEL — https://github.com/castrolmocro

---

<div align="center">
  <b>WHITE V3 — Created with ♥ by DJAMEL</b>
  <br/>
  <a href="https://github.com/castrolmocro/WHITE-V3">github.com/castrolmocro/WHITE-V3</a>
</div>
