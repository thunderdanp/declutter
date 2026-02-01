import { Pool } from 'pg';
import { getPersonalityConfig } from './personalities';
import { detectEmotionalTone, getToneInstructions } from './emotionDetection';
import { buildRecommendationContext, RecommendationContext } from './contextBuilder';

export async function buildAIPrompt(
  pool: Pool,
  userId: number,
  itemId: number
): Promise<{ prompt: string; context: RecommendationContext }> {
  const context = await buildRecommendationContext(pool, userId, itemId);
  const personality = getPersonalityConfig(context.personalityMode);

  // Fetch item basic info
  const itemResult = await pool.query(
    'SELECT name, category, description FROM items WHERE id = $1',
    [itemId]
  );
  const item = itemResult.rows[0] || { name: 'Unknown', category: '', description: '' };

  const patternsBlock = context.userPatterns.length > 0
    ? context.userPatterns.map(p => `- ${p}`).join('\n')
    : 'No significant patterns detected yet.';

  const prompt = `${personality.systemPrompt}

ITEM TO EVALUATE:
Name: ${item.name}
Category: ${item.category || 'Uncategorized'}
Description: ${item.description || 'None provided'}

USER CONTEXT:
- Goal: ${context.userGoal}
- Item last used: ${context.lastUsedTimeframe || 'Not specified'}
- Condition: ${context.itemCondition || 'Not specified'}
- Sentimental value: ${context.isSentimental ? 'Yes' : 'No'}
- User notes: "${context.userNotes || 'None'}"
- Duplicate count: ${context.duplicateCount} other ${item.category || 'similar'} items
- Season: ${context.season}

LEARNING FROM PAST:
${patternsBlock}

EMOTIONAL TONE DETECTED: ${context.emotionalTone}
${getToneInstructions(context.emotionalTone)}

INSTRUCTIONS:
- Provide ONE recommendation: KEEP, DONATE, SELL, or TOSS
- Give a conversational, specific reason (2-3 sentences)
- Use VARIED language - never repeat the same phrases
- Match the user's energy level
- ${personality.specificInstructions}
- Consider this is for ${context.userGoal}

Format response as JSON:
{
  "decision": "KEEP|DONATE|SELL|TOSS",
  "reason": "Your personalized explanation here",
  "action": "Optional specific action like 'Donate to Goodwill on Main St'"
}`;

  return { prompt, context };
}

export interface ReasoningPromptData {
  itemName: string;
  category?: string;
  recommendation: string;
  personalityMode?: string;
  userGoal?: string;
  frequency?: string;
  emotional?: string;
  practical?: string;
  financial?: string;
  userNotes?: string;
  duplicateCount?: number;
  emotionalTone?: string;
}

export function buildReasoningPrompt(data: ReasoningPromptData): { prompt: string; systemPrompt: string } {
  const personality = getPersonalityConfig(data.personalityMode || 'balanced');
  const emotionalTone = data.emotionalTone || (data.userNotes ? detectEmotionalTone(data.userNotes) : 'neutral');
  const toneInstructions = getToneInstructions(emotionalTone as 'sentimental' | 'frustrated' | 'enthusiastic' | 'neutral');

  const systemPrompt = `${personality.systemPrompt}

You are explaining a decluttering recommendation to a user. ${personality.specificInstructions}

${toneInstructions}

Respond with ONLY the explanation text — no JSON, no labels, no quotes. Write 2-3 conversational sentences.`;

  const contextLines: string[] = [];
  if (data.frequency) contextLines.push(`Usage frequency: ${data.frequency}`);
  if (data.emotional) contextLines.push(`Sentimental value: ${data.emotional}`);
  if (data.practical) contextLines.push(`Condition: ${data.practical}`);
  if (data.financial) contextLines.push(`Financial value: ${data.financial}`);
  if (data.userNotes) contextLines.push(`User notes: "${data.userNotes}"`);
  if (data.duplicateCount && data.duplicateCount > 1) contextLines.push(`Duplicate items in category: ${data.duplicateCount}`);
  if (data.userGoal) contextLines.push(`User's decluttering goal: ${data.userGoal}`);

  const contextBlock = contextLines.length > 0
    ? `\n\nContext:\n${contextLines.map(l => `- ${l}`).join('\n')}`
    : '';

  const prompt = `Item: ${data.itemName}${data.category ? ` (${data.category})` : ''}${contextBlock}

The recommendation is: ${data.recommendation}. Explain in 2-3 sentences why this recommendation makes sense for this item.`;

  return { prompt, systemPrompt };
}
