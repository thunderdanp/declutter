import { Pool } from 'pg';
import { detectEmotionalTone, EmotionalTone } from './emotionDetection';
import { getUserPatterns } from './userPatterns';

export interface RecommendationContext {
  userGoal: string;
  personalityMode: string;
  lastUsedTimeframe: string | null;
  itemCondition: string | null;
  isSentimental: boolean;
  userNotes: string | null;
  duplicateCount: number;
  season: string;
  emotionalTone: EmotionalTone;
  userPatterns: string[];
  overrideRate: number;
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

export async function getDuplicateCount(pool: Pool, userId: number, category: string | null): Promise<number> {
  if (!category) return 0;

  const result = await pool.query(
    'SELECT COUNT(*) FROM items WHERE user_id = $1 AND category = $2',
    [userId, category]
  );

  return parseInt(result.rows[0].count, 10) || 0;
}

export async function buildRecommendationContext(
  pool: Pool,
  userId: number,
  itemId: number
): Promise<RecommendationContext> {
  // Fetch user settings
  const userResult = await pool.query(
    'SELECT personality_mode, user_goal FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0] || { personality_mode: 'balanced', user_goal: 'general' };

  // Fetch item details
  const itemResult = await pool.query(
    'SELECT category, last_used_timeframe, item_condition, is_sentimental, user_notes FROM items WHERE id = $1',
    [itemId]
  );
  const item = itemResult.rows[0] || {};

  // Get duplicate count
  const duplicateCount = await getDuplicateCount(pool, userId, item.category);

  // Get user patterns
  const patterns = await getUserPatterns(pool, userId);

  // Detect emotional tone
  const emotionalTone = detectEmotionalTone(item.user_notes);

  return {
    userGoal: user.user_goal || 'general',
    personalityMode: user.personality_mode || 'balanced',
    lastUsedTimeframe: item.last_used_timeframe || null,
    itemCondition: item.item_condition || null,
    isSentimental: item.is_sentimental || false,
    userNotes: item.user_notes || null,
    duplicateCount,
    season: getCurrentSeason(),
    emotionalTone,
    userPatterns: patterns.patterns,
    overrideRate: patterns.overrideRate
  };
}
