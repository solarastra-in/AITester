// ---------------------------------------------------------------------------
// Generates test cases with an LLM, using a key the operator supplies and
// stores themselves (never a platform-wide key) — usage and its cost are
// entirely the operator's own account with their model provider.
// Output is constrained to the same structured schema specParser.js already
// normalizes, so generated cases run through the identical generic engine
// as uploaded ones.
// ---------------------------------------------------------------------------
const axios = require('axios');
const { parseStructuredJson } = require('./specParser');

const SCHEMA_INSTRUCTIONS = `Return ONLY a JSON array (no prose, no markdown fences). Each element:
{
  "id": "CATEGORY-01",
  "category": "short grouping name",
  "title": "one-line description of what's being verified",
  "priority": "High"|"Medium"|"Low",
  "tags": ["security"|"regression"] ,
  "type": "http"|"manual",
  "method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE",
  "path": "/api/whatever (relative path only, no domain)",
  "auth_persona": null or a short snake_case persona key like "trial_user" or "admin" (use null for endpoints that should be reachable with no auth, or that SHOULD reject unauthenticated calls),
  "body": {} or omit,
  "expected_status": "200" or "401,403" (comma-separated if multiple acceptable),
  "expected_body_contains": "" or "text|other text" (pipe-separated substrings the response should contain, empty if none),
  "instructions": "only for type=manual — step-by-step human instructions"
}
Prefer type "http" whenever the check is a real API call with a clear expected status/body. Use type "manual" only for things that need a browser/visual/human judgement (OAuth screens, layout, visual regressions).
Cover: unauthenticated access to protected endpoints (expect 401/403), core happy-path flows, input validation, and any security-relevant access control implied by the site's purpose. Produce between 10 and 25 cases.`;

async function generateWithAnthropic({ apiKey, model, siteUrl, description, existingPlanText }) {
  const userPrompt = `Target site: ${siteUrl}
${description ? `Description of the site/product: ${description}\n` : ''}${existingPlanText ? `The operator also provided this existing (possibly messy) test plan or notes — use it as the primary source of truth, converting it into the structured schema:\n\n${existingPlanText}\n\n` : ''}
Generate a functional test suite for this site.

${SCHEMA_INSTRUCTIONS}`;

  const resp = await axios.post('https://api.anthropic.com/v1/messages', {
    model: model || 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userPrompt }],
  }, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    timeout: 60000,
    validateStatus: () => true,
  });

  if (resp.status !== 200) {
    const err = new Error(`Anthropic API returned ${resp.status}: ${JSON.stringify(resp.data).slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  const text = (resp.data.content || []).map(b => b.text || '').join('\n').trim();
  return extractJsonArray(text);
}

async function generateWithOpenAI({ apiKey, model, siteUrl, description, existingPlanText }) {
  const userPrompt = `Target site: ${siteUrl}
${description ? `Description of the site/product: ${description}\n` : ''}${existingPlanText ? `The operator also provided this existing (possibly messy) test plan or notes — use it as the primary source of truth, converting it into the structured schema:\n\n${existingPlanText}\n\n` : ''}
Generate a functional test suite for this site.

${SCHEMA_INSTRUCTIONS}`;

  const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: model || 'gpt-4o-mini',
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.2,
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    timeout: 60000,
    validateStatus: () => true,
  });

  if (resp.status !== 200) {
    const err = new Error(`OpenAI API returned ${resp.status}: ${JSON.stringify(resp.data).slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  const text = resp.data.choices?.[0]?.message?.content || '';
  return extractJsonArray(text);
}

function extractJsonArray(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('Model response did not contain a JSON array.');
  const jsonStr = cleaned.slice(start, end + 1);
  const rows = JSON.parse(jsonStr);
  return rows;
}

async function generateTestCases({ provider, apiKey, model, siteUrl, description, existingPlanText }) {
  if (!apiKey) throw new Error('An API key for the chosen provider is required — add it in Project Settings (it is stored only in your own dataset, not sent anywhere but that provider).');
  const rows = provider === 'openai'
    ? await generateWithOpenAI({ apiKey, model, siteUrl, description, existingPlanText })
    : await generateWithAnthropic({ apiKey, model, siteUrl, description, existingPlanText });
  return parseStructuredJson(rows);
}

module.exports = { generateTestCases };
