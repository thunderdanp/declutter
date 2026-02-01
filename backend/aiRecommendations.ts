import { Pool } from 'pg';
import { getPersonalityConfig } from './personalities';
import { getToneInstructions } from './emotionDetection';
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
