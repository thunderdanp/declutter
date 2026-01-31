/**
 * Multi-LLM Provider Abstraction
 *
 * Supports Anthropic Claude, OpenAI GPT, Google Gemini, and Ollama (local).
 */

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-20250514',
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    keyPlaceholder: 'sk-ant-...',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  openai: {
    name: 'OpenAI GPT-4o',
    defaultModel: 'gpt-4o',
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10,
    keyPlaceholder: 'sk-...',
    consoleUrl: 'https://platform.openai.com/api-keys',
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  google: {
    name: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40,
    keyPlaceholder: 'AIza...',
    consoleUrl: 'https://aistudio.google.com/apikey',
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  ollama: {
    name: 'Ollama (Local)',
    defaultModel: 'llama3.2-vision',
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    keyPlaceholder: '',
    consoleUrl: '',
    requiresApiKey: false,
    requiresBaseUrl: true,
  },
};

function getProvider(name) {
  return PROVIDERS[name] || null;
}

function getAvailableProviders() {
  return Object.entries(PROVIDERS).map(([key, val]) => ({
    id: key,
    ...val,
  }));
}

const DEFAULT_ANALYSIS_PROMPT = `Please analyze this image and identify what item or items are shown. Provide your response in the following JSON format only, with no additional text:

{
  "name": "A brief, clear name for the item (e.g., 'Vintage Record Player', 'Winter Coat', 'Kitchen Blender')",
  "description": "A detailed description of the item including its appearance, condition, and any notable features (2-3 sentences)",
  "category": "One of these categories: {{categories}}",
  "location": "Suggest the most likely room where this item is typically found or used. One of: bedroom, living-room, kitchen, bathroom, garage, attic, basement, closet, other"
}

Be specific and descriptive. If multiple items are visible, focus on the main/central item.`;

function buildAnalysisPrompt(categoryList, customPrompt) {
  const template = customPrompt || DEFAULT_ANALYSIS_PROMPT;
  return template.replace(/\{\{categories\}\}/g, categoryList);
}

function calculateCost(providerName, inputTokens, outputTokens) {
  const provider = PROVIDERS[providerName];
  if (!provider) return 0;
  const inputCost = (inputTokens / 1000000) * provider.inputPricePerMillion;
  const outputCost = (outputTokens / 1000000) * provider.outputPricePerMillion;
  return inputCost + outputCost;
}

// --- Provider-specific analysis functions ---

async function analyzeWithAnthropic(apiKey, base64Image, mediaType, categoryList, customPrompt) {
  const anthropic = new Anthropic({ apiKey });
  const model = PROVIDERS.anthropic.defaultModel;
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          { type: 'text', text: buildAnalysisPrompt(categoryList, customPrompt) },
        ],
      },
    ],
  });

  return {
    text: message.content[0].text,
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
    model,
  };
}

async function analyzeWithOpenAI(apiKey, base64Image, mediaType, categoryList, customPrompt) {
  const openai = new OpenAI({ apiKey });
  const model = PROVIDERS.openai.defaultModel;
  const response = await openai.chat.completions.create({
    model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${base64Image}` },
          },
          { type: 'text', text: buildAnalysisPrompt(categoryList, customPrompt) },
        ],
      },
    ],
  });

  return {
    text: response.choices[0].message.content,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    model,
  };
}

async function analyzeWithGoogle(apiKey, base64Image, mediaType, categoryList, customPrompt) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = PROVIDERS.google.defaultModel;
  const generativeModel = genAI.getGenerativeModel({ model });

  const result = await generativeModel.generateContent([
    { text: buildAnalysisPrompt(categoryList, customPrompt) },
    {
      inlineData: {
        mimeType: mediaType,
        data: base64Image,
      },
    },
  ]);

  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata || {};

  return {
    text,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    model,
  };
}

async function analyzeWithOllama(baseUrl, base64Image, mediaType, categoryList, customPrompt) {
  const model = PROVIDERS.ollama.defaultModel;
  const url = `${baseUrl.replace(/\/+$/, '')}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: 'user',
          content: buildAnalysisPrompt(categoryList, customPrompt),
          images: [base64Image],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();

  return {
    text: data.message?.content || '',
    inputTokens: data.prompt_eval_count || 0,
    outputTokens: data.eval_count || 0,
    model,
  };
}

/**
 * Analyze an image using the specified LLM provider.
 * @param {string} providerName - One of: anthropic, openai, google, ollama
 * @param {string} apiKeyOrUrl  - API key (or base URL for Ollama)
 * @param {string} base64Image  - Base64-encoded image data
 * @param {string} mediaType    - MIME type (e.g. image/jpeg)
 * @param {string} categoryList - Comma-separated category slugs
 * @returns {Promise<{text: string, inputTokens: number, outputTokens: number, model: string}>}
 */
async function analyzeImage(providerName, apiKeyOrUrl, base64Image, mediaType, categoryList, customPrompt) {
  switch (providerName) {
    case 'anthropic':
      return analyzeWithAnthropic(apiKeyOrUrl, base64Image, mediaType, categoryList, customPrompt);
    case 'openai':
      return analyzeWithOpenAI(apiKeyOrUrl, base64Image, mediaType, categoryList, customPrompt);
    case 'google':
      return analyzeWithGoogle(apiKeyOrUrl, base64Image, mediaType, categoryList, customPrompt);
    case 'ollama':
      return analyzeWithOllama(apiKeyOrUrl, base64Image, mediaType, categoryList, customPrompt);
    default:
      throw new Error(`Unsupported LLM provider: ${providerName}`);
  }
}

module.exports = {
  PROVIDERS,
  DEFAULT_ANALYSIS_PROMPT,
  getProvider,
  getAvailableProviders,
  buildAnalysisPrompt,
  calculateCost,
  analyzeImage,
};
