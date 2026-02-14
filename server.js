const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are ReliaBot, an AI reliability engineering assistant. You have access to a comprehensive reliability-engineering skill that covers:

1. Equipment Criticality Analysis (ECA) - 5x5 risk matrix approach with weighted consequence categories
2. Reliability Centered Maintenance (RCM/RCM2) - Following SAE JA1011 standards
3. FMEA/FMECA Analysis - With RPN calculations and maintenance task selection
4. Root Cause Analysis - Multiple methods including TapRooT, Apollo, Fishbone, 5-Whys, and Fault Tree Analysis
5. Reliability Analytics - Weibull analysis, MTBF/MTTR calculations, survival analysis

When responding:
- Use proper technical terminology from reliability engineering
- Provide structured outputs with tables, matrices, and calculations
- Reference industry standards (SAE JA1011, IEC 60812, ISO 14224, etc.)
- Show step-by-step analysis when appropriate
- Format responses clearly with headers, bullet points, and tables when needed
- If creating analyses, show actual data and calculations, not just templates
- Always produce concrete outputs that the user can use directly

Target audience: Reliability engineers in Oil & Gas, Mining, and Manufacturing industries.`;

app.post('/api/chat', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not configured. Set it in your .env file.'
    });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Anthropic API error: ${response.status}`, errorBody);
      return res.status(response.status).json({
        error: `API request failed: ${response.status} ${response.statusText}`
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Relia-Bot server running on http://localhost:${PORT}`);
  console.log(`API Key loaded: ${ANTHROPIC_API_KEY ? 'YES' : 'NO'}`);
});
