# O-APM

Asset Performance Management Office portal powered by Reliabot.

## Features

- **Equipment Criticality Analysis (ECA)** - 5x5 risk matrix with weighted consequence categories
- **RCM / FMEA** - Reliability Centered Maintenance and Failure Mode & Effects Analysis
- **Root Cause Analysis** - 5-Whys, fishbone cause analysis, fault tree analysis
- **Reliability Analytics** - Weibull analysis, MTBF/MTTR, survival analysis
- **Report Review** - Quality audit of reliability reports
- **Export** - Download analyses as Excel or PDF

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file from the example:

```bash
cp .env.example .env
```

3. Add your model API keys to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_QA_API_KEY=
OPENAI_QA_MODEL=gpt-4.1-mini
PORT=3000
ADMIN_DASHBOARD_TOKEN=Sdvivs@407
```

`OPENAI_QA_API_KEY` is optional. When configured, Reliabot runs a silent second-pass QA review before returning chat/report output. Do not commit real API keys; rotate any key that was pasted into chat or exposed publicly.

4. Start the server:

```bash
npm start
```

5. Open `http://localhost:3000` in your browser.

## Visitor Flow

- Users do not need passwords.
- On the welcome screen, users submit name, email, and company.
- The app saves visitor details for later updates.
- The chat API is protected server-side until the welcome registration is completed.
- The app logs visitor chat/search queries, selected module, browser locale/timezone, available browser location, IP address, and user agent.
- Admin can review data at `http://localhost:3000/admin.html` using `ADMIN_DASHBOARD_TOKEN`.
- On Vercel serverless deployments, local visitor storage uses `/tmp` and is not permanent. Use a database for durable production visitor/admin records.

## Architecture

```
├── server.js          # Express backend with Anthropic API proxy
├── public/
│   ├── index.html     # Main HTML page
│   ├── styles.css     # Application styles
│   └── app.js         # Frontend JavaScript (chat, export, formatting)
├── .env.example       # Environment variable template
└── package.json       # Node.js project configuration
```

The backend server proxies requests to the Anthropic API so the API key is never exposed to the browser.
