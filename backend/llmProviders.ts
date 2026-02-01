/**
 * Multi-LLM Provider Abstraction
 *
 * Supports Anthropic Claude, OpenAI GPT, Google Gemini, and Ollama (local).
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'ollama';

export interface ProviderConfig {
  name: string;
  defaultModel: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  keyPlaceholder: string;
  consoleUrl: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
}

export interface AnalysisResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
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

function getProvider(name: string): ProviderConfig | null {
  return PROVIDERS[name as ProviderName] || null;
}

function getAvailableProviders(): (ProviderConfig & { id: string })[] {
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

function buildAnalysisPrompt(categoryList: string, customPrompt?: string | null): string {
  const template = customPrompt || DEFAULT_ANALYSIS_PROMPT;
  return template.replace(/\{\{categories\}\}/g, categoryList);
}

function calculateCost(providerName: string, inputTokens: number, outputTokens: number): number {
  const provider = PROVIDERS[providerName as ProviderName];
  if (!provider) return 0;
  const inputCost = (inputTokens / 1000000) * provider.inputPricePerMillion;
  const outputCost = (outputTokens / 1000000) * provider.outputPricePerMillion;
  return inputCost + outputCost;
}

// --- Provider-specific analysis functions ---

async function analyzeWithAnthropic(apiKey: string, base64Image: string, mediaType: string, categoryList: string, customPrompt?: string): Promise<AnalysisResult> {
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
            source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64Image },
          },
          { type: 'text', text: buildAnalysisPrompt(categoryList, customPrompt) },
        ],
      },
    ],
  });

  const firstBlock = message.content[0];
  return {
    text: firstBlock.type === 'text' ? firstBlock.text : '',
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
    model,
  };
}

async function analyzeWithOpenAI(apiKey: string, base64Image: string, mediaType: string, categoryList: string, customPrompt?: string): Promise<AnalysisResult> {
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
    text: response.choices[0].message.content || '',
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    model,
  };
}

async function analyzeWithGoogle(apiKey: string, base64Image: string, mediaType: string, categoryList: string, customPrompt?: string): Promise<AnalysisResult> {
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
    inputTokens: (usage as Record<string, number>).promptTokenCount || 0,
    outputTokens: (usage as Record<string, number>).candidatesTokenCount || 0,
    model,
  };
}

async function analyzeWithOllama(baseUrl: string, base64Image: string, mediaType: string, categoryList: string, customPrompt?: string): Promise<AnalysisResult> {
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

  const data = await response.json() as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };

  return {
    text: data.message?.content || '',
    inputTokens: data.prompt_eval_count || 0,
    outputTokens: data.eval_count || 0,
    model,
  };
}

// --- Provider-specific text generation functions ---

async function generateTextWithAnthropic(apiKey: string, prompt: string, systemPrompt: string): Promise<AnalysisResult> {
  const anthropic = new Anthropic({ apiKey });
  const model = PROVIDERS.anthropic.defaultModel;
  const message = await anthropic.messages.create({
    model,
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  const firstBlock = message.content[0];
  return {
    text: firstBlock.type === 'text' ? firstBlock.text : '',
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
    model,
  };
}

async function generateTextWithOpenAI(apiKey: string, prompt: string, systemPrompt: string): Promise<AnalysisResult> {
  const openai = new OpenAI({ apiKey });
  const model = PROVIDERS.openai.defaultModel;
  const response = await openai.chat.completions.create({
    model,
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  });

  return {
    text: response.choices[0].message.content || '',
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    model,
  };
}

async function generateTextWithGoogle(apiKey: string, prompt: string, systemPrompt: string): Promise<AnalysisResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = PROVIDERS.google.defaultModel;
  const generativeModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });

  const result = await generativeModel.generateContent([{ text: prompt }]);

  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata || {};

  return {
    text,
    inputTokens: (usage as Record<string, number>).promptTokenCount || 0,
    outputTokens: (usage as Record<string, number>).candidatesTokenCount || 0,
    model,
  };
}

async function generateTextWithOllama(baseUrl: string, prompt: string, systemPrompt: string): Promise<AnalysisResult> {
  const model = 'llama3.2';
  const url = `${baseUrl.replace(/\/+$/, '')}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${errBody}`);
  }

  const data = await response.json() as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };

  return {
    text: data.message?.content || '',
    inputTokens: data.prompt_eval_count || 0,
    outputTokens: data.eval_count || 0,
    model,
  };
}

async function generateText(providerName: string, apiKeyOrUrl: string, prompt: string, systemPrompt: string): Promise<AnalysisResult> {
  switch (providerName) {
    case 'anthropic':
      return generateTextWithAnthropic(apiKeyOrUrl, prompt, systemPrompt);
    case 'openai':
      return generateTextWithOpenAI(apiKeyOrUrl, prompt, systemPrompt);
    case 'google':
      return generateTextWithGoogle(apiKeyOrUrl, prompt, systemPrompt);
    case 'ollama':
      return generateTextWithOllama(apiKeyOrUrl, prompt, systemPrompt);
    default:
      throw new Error(`Unsupported LLM provider: ${providerName}`);
  }
}

async function analyzeImage(providerName: string, apiKeyOrUrl: string, base64Image: string, mediaType: string, categoryList: string, customPrompt?: string): Promise<AnalysisResult> {
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

export {
  PROVIDERS,
  DEFAULT_ANALYSIS_PROMPT,
  getProvider,
  getAvailableProviders,
  buildAnalysisPrompt,
  calculateCost,
  analyzeImage,
  generateText,
};
