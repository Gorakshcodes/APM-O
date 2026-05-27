# APM-O

Asset Performance Management Office portal powered by Reliabot.

## Features

- **Equipment Criticality Analysis (ECA)** - 5x5 risk matrix with weighted consequence categories
- **RCM / FMEA** - Reliability Centered Maintenance and Failure Mode & Effects Analysis (SAE JA1011)
- **Root Cause Analysis** - TapRooT, Apollo, Fishbone, 5-Whys, Fault Tree Analysis
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

3. Add your Anthropic API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

4. Start the server:

```bash
npm start
```

5. Open `http://localhost:3000` in your browser.

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
