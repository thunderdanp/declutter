import { Pool } from 'pg';

interface OverrideStats {
  total: number;
  byCategory: Record<string, { total: number; overrides: Record<string, number> }>;
  patterns: string[];
  overrideRate: number;
}

export async function getUserPatterns(pool: Pool, userId: number): Promise<OverrideStats> {
  const result = await pool.query(
    `SELECT item_category, ai_suggestion, user_choice, override_reason
     FROM recommendation_overrides
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );

  const rows = result.rows;
  const total = rows.length;

  if (total === 0) {
    return { total: 0, byCategory: {}, patterns: [], overrideRate: 0 };
  }

  // Aggregate by category
  const byCategory: Record<string, { total: number; overrides: Record<string, number> }> = {};

  for (const row of rows) {
    const cat = row.item_category || 'uncategorized';
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, overrides: {} };
    }
    byCategory[cat].total++;
    const key = `${row.ai_suggestion}->${row.user_choice}`;
    byCategory[cat].overrides[key] = (byCategory[cat].overrides[key] || 0) + 1;
  }

  // Detect patterns
  const patterns: string[] = [];

  // Check sentimental keeping pattern
  const sentimentalKeeps = rows.filter(r =>
    r.user_choice === 'keep' && (r.ai_suggestion === 'donate' || r.ai_suggestion === 'sell' || r.ai_suggestion === 'discard')
  );
  if (sentimentalKeeps.length >= 3) {
    patterns.push('User tends to keep items even when AI suggests letting go');
  }

  // Check aggressive discarding
  const aggressiveDiscards = rows.filter(r =>
    (r.user_choice === 'discard' || r.user_choice === 'donate') &&
    (r.ai_suggestion === 'keep' || r.ai_suggestion === 'storage' || r.ai_suggestion === 'accessible')
  );
  if (aggressiveDiscards.length >= 3) {
    patterns.push('User is more aggressive than AI suggests about discarding');
  }

  // Check donation preference
  const donateOverSell = rows.filter(r =>
    r.user_choice === 'donate' && r.ai_suggestion === 'sell'
  );
  if (donateOverSell.length >= 2) {
    patterns.push('User prefers donating over selling');
  }

  // Check sell preference
  const sellOverDonate = rows.filter(r =>
    r.user_choice === 'sell' && r.ai_suggestion === 'donate'
  );
  if (sellOverDonate.length >= 2) {
    patterns.push('User prefers selling over donating');
  }

  // Category-specific patterns
  for (const [cat, data] of Object.entries(byCategory)) {
    if (data.total >= 3) {
      const keepCount = Object.entries(data.overrides)
        .filter(([key]) => key.endsWith('->keep'))
        .reduce((sum, [, count]) => sum + count, 0);

      if (keepCount / data.total > 0.7) {
        patterns.push(`User keeps most ${cat} items regardless of AI suggestion`);
      }

      const removeCount = Object.entries(data.overrides)
        .filter(([key]) => key.endsWith('->donate') || key.endsWith('->discard') || key.endsWith('->sell'))
        .reduce((sum, [, count]) => sum + count, 0);

      if (removeCount / data.total > 0.7) {
        patterns.push(`User consistently removes ${cat} items`);
      }
    }
  }

  // Get total items for override rate
  const itemResult = await pool.query(
    'SELECT COUNT(*) FROM items WHERE user_id = $1 AND recommendation IS NOT NULL',
    [userId]
  );
  const totalItems = parseInt(itemResult.rows[0].count, 10) || 1;

  return {
    total,
    byCategory,
    patterns,
    overrideRate: Math.round((total / totalItems) * 100)
  };
}

export async function logOverride(
  pool: Pool,
  userId: number,
  itemId: number,
  itemCategory: string | null,
  aiSuggestion: string,
  userChoice: string,
  overrideReason: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO recommendation_overrides (user_id, item_id, item_category, ai_suggestion, user_choice, override_reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, itemId, itemCategory, aiSuggestion, userChoice, overrideReason]
  );
}
