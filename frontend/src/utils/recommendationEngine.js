/**
 * ============================================================================
 * RECOMMENDATION ENGINE
 * ============================================================================
 *
 * Shared utility for analyzing items and generating declutter recommendations.
 * This engine evaluates items based on multiple factors and user preferences
 * to provide personalized recommendations.
 *
 * ## Features
 * - Configurable scoring weights for each evaluation factor
 * - Support for multiple recommendation strategies (balanced, minimalist, etc.)
 * - A/B testing support for comparing different strategies
 * - User personality profile integration
 * - Detailed score breakdown for transparency
 *
 * ## Recommendation Types
 * - keep: Item should be kept in the home
 * - accessible: Keep in an easily accessible location
 * - storage: Move to long-term storage
 * - sell: Sell for monetary value
 * - donate: Give to charity/others
 * - discard: Throw away/recycle
 *
 * ## Usage
 * ```javascript
 * import { analyzeItem, generateReasoning, recommendationLabels } from './recommendationEngine';
 *
 * const recommendation = analyzeItem(formData, userProfile, settings);
 * const reasoning = generateReasoning(recommendation, formData, userProfile);
 * ```
 *
 * @module recommendationEngine
 * ============================================================================
 */

// Default weights used when no settings are provided
const defaultWeights = {
  usage: { yes: { keep: 3, accessible: 2 }, rarely: { storage: 2, accessible: 1 }, no: { donate: 2, sell: 1, discard: 1 } },
  sentimental: { high: { keep: 3, storage: 2 }, some: { keep: 1, storage: 2 }, none: { sell: 1, donate: 1 } },
  condition: { excellent: { keep: 1, sell: 2, donate: 1 }, good: { keep: 1, sell: 2, donate: 1 }, fair: { donate: 2, discard: 1 }, poor: { discard: 3 } },
  value: { high: { keep: 2, sell: 3 }, medium: { sell: 2, donate: 1 }, low: { donate: 2, discard: 1 } },
  replaceability: { difficult: { keep: 2, storage: 2 }, moderate: { storage: 1 }, easy: { donate: 1, discard: 1 } },
  space: { yes: { keep: 2, accessible: 3 }, limited: { storage: 2 }, no: { storage: 1, sell: 1, donate: 1 } }
};

// Default thresholds
const defaultThresholds = {
  minimumScoreDifference: 2,
  tieBreakOrder: ['keep', 'accessible', 'storage', 'sell', 'donate', 'discard']
};

// Default strategy multipliers
const defaultStrategyMultipliers = {
  usage: 1,
  sentimental: 1,
  condition: 1,
  value: 1,
  replaceability: 1,
  space: 1
};

/**
 * Fetches recommendation settings from the API
 * @returns {Promise<Object>} The recommendation settings
 */
export async function fetchRecommendationSettings() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;

    const response = await fetch('/api/recommendations/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Error fetching recommendation settings:', error);
  }
  return null;
}

/**
 * Applies strategy multipliers to weights
 * @param {Object} weights - The base weights
 * @param {Object} multipliers - The strategy multipliers
 * @returns {Object} - Adjusted weights
 */
function applyStrategyMultipliers(weights, multipliers) {
  if (!multipliers) return weights;

  const adjustedWeights = {};

  for (const [factor, options] of Object.entries(weights)) {
    const multiplier = multipliers[factor] || 1;
    adjustedWeights[factor] = {};

    for (const [option, scores] of Object.entries(options)) {
      adjustedWeights[factor][option] = {};
      for (const [recommendation, score] of Object.entries(scores)) {
        adjustedWeights[factor][option][recommendation] = Math.round(score * multiplier * 10) / 10;
      }
    }
  }

  return adjustedWeights;
}

/**
 * Analyzes an item based on form data and user profile to determine recommendation
 * @param {Object} formData - The form data containing item evaluation answers
 * @param {Object} profile - The user's profile with preferences
 * @param {Object} settings - Optional settings from API (weights, thresholds, strategyConfig)
 * @returns {string} - The recommendation type (keep, storage, accessible, sell, donate, discard)
 */
export function analyzeItem(formData, profile, settings = null) {
  let scores = {
    keep: 0,
    storage: 0,
    accessible: 0,
    sell: 0,
    donate: 0,
    discard: 0
  };

  // Use provided settings or defaults
  let weights = settings?.weights || defaultWeights;
  const thresholds = settings?.thresholds || defaultThresholds;
  const strategyConfig = settings?.strategyConfig;

  // Apply strategy multipliers if present
  if (strategyConfig?.multipliers) {
    weights = applyStrategyMultipliers(weights, strategyConfig.multipliers);
  }

  // Helper function to apply weight scores
  const applyWeights = (factor, value) => {
    const factorWeights = weights[factor];
    if (factorWeights && factorWeights[value]) {
      for (const [rec, score] of Object.entries(factorWeights[value])) {
        scores[rec] = (scores[rec] || 0) + score;
      }
    }
  };

  // Apply weights for each factor
  applyWeights('usage', formData.used);
  applyWeights('sentimental', formData.sentimental);
  applyWeights('condition', formData.condition);
  applyWeights('value', formData.value);
  applyWeights('replaceability', formData.replace);
  applyWeights('space', formData.space);

  // Apply personality profile adjustments
  if (profile) {
    if (profile.minimalistLevel === 'extreme') {
      scores.discard += 2;
      scores.donate += 2;
      scores.keep -= 1;
    } else if (profile.minimalistLevel === 'maximalist') {
      scores.keep += 2;
      scores.storage += 1;
    }

    if (profile.budgetPriority === 'very-important' && formData.value !== 'low') {
      scores.sell += 2;
    } else if (profile.budgetPriority === 'not-important') {
      scores.donate += 2;
    }

    if (profile.sentimentalValue === 'very-sentimental') {
      scores.keep += 1;
      scores.storage += 1;
    }

    if (profile.livingSpace === 'small-apartment' || profile.livingSpace === 'studio') {
      scores.storage -= 1;
      scores.donate += 1;
    }
  }

  // Apply personality mode adjustments
  if (formData.personalityMode) {
    if (formData.personalityMode === 'joy_seeker') {
      // Amplify sentimental factor, push toward donating non-joy items
      if (formData.sentimental === 'none' || formData.sentimental === 'no') {
        scores.donate += 2;
      }
    } else if (formData.personalityMode === 'minimalist') {
      scores.discard += 1;
      scores.donate += 1;
      scores.keep -= 1;
      scores.storage -= 1;
    } else if (formData.personalityMode === 'practical_parent') {
      // Penalize rarely-used items more heavily
      if (formData.used === 'no' || formData.used === 'rarely') {
        scores.donate += 1;
        scores.sell += 1;
      }
    }
  }

  // Apply context-aware adjustments
  if (formData.lastUsedTimeframe) {
    if (formData.lastUsedTimeframe === '2+_years' || formData.lastUsedTimeframe === 'never_used') {
      scores.donate += 2;
      scores.sell += 1;
      scores.keep -= 1;
    } else if (formData.lastUsedTimeframe === '1-2_years') {
      scores.storage += 1;
      scores.donate += 1;
    } else if (formData.lastUsedTimeframe === 'last_month') {
      scores.keep += 2;
      scores.accessible += 1;
    }
  }

  if (formData.itemCondition) {
    if (formData.itemCondition === 'broken') {
      scores.discard += 3;
      scores.keep -= 2;
      scores.sell -= 2;
    } else if (formData.itemCondition === 'poor') {
      scores.discard += 1;
    }
  }

  if (formData.isSentimental) {
    scores.keep += 2;
    scores.discard -= 2;
  }

  if (formData.duplicateCount > 2) {
    scores.donate += 1;
    scores.sell += 1;
  }

  // Apply user goal adjustments
  if (formData.userGoal) {
    if (formData.userGoal === 'downsizing' || formData.userGoal === 'moving') {
      scores.sell += 1;
      scores.donate += 1;
      scores.keep -= 1;
    } else if (formData.userGoal === 'organizing') {
      scores.storage += 1;
      scores.accessible += 1;
    }
  }

  // Find the highest score
  const maxScore = Math.max(...Object.values(scores));
  const topRecommendations = Object.keys(scores).filter(key => scores[key] === maxScore);

  // If there's a tie, use tieBreakOrder
  if (topRecommendations.length > 1) {
    const tieBreakOrder = thresholds.tieBreakOrder || defaultThresholds.tieBreakOrder;
    for (const rec of tieBreakOrder) {
      if (topRecommendations.includes(rec)) {
        return rec;
      }
    }
  }

  return topRecommendations[0];
}

/**
 * Analyzes an item with full score details (for debugging/admin)
 * @param {Object} formData - The form data containing item evaluation answers
 * @param {Object} profile - The user's profile with preferences
 * @param {Object} settings - Optional settings from API
 * @returns {Object} - The recommendation and all scores
 */
export function analyzeItemWithDetails(formData, profile, settings = null) {
  let scores = {
    keep: 0,
    storage: 0,
    accessible: 0,
    sell: 0,
    donate: 0,
    discard: 0
  };

  let weights = settings?.weights || defaultWeights;
  const thresholds = settings?.thresholds || defaultThresholds;
  const strategyConfig = settings?.strategyConfig;

  if (strategyConfig?.multipliers) {
    weights = applyStrategyMultipliers(weights, strategyConfig.multipliers);
  }

  const breakdown = {
    usage: {},
    sentimental: {},
    condition: {},
    value: {},
    replaceability: {},
    space: {},
    profile: {}
  };

  const applyWeights = (factor, value) => {
    const factorWeights = weights[factor];
    if (factorWeights && factorWeights[value]) {
      breakdown[factor] = { ...factorWeights[value] };
      for (const [rec, score] of Object.entries(factorWeights[value])) {
        scores[rec] = (scores[rec] || 0) + score;
      }
    }
  };

  applyWeights('usage', formData.used);
  applyWeights('sentimental', formData.sentimental);
  applyWeights('condition', formData.condition);
  applyWeights('value', formData.value);
  applyWeights('replaceability', formData.replace);
  applyWeights('space', formData.space);

  // Apply personality profile adjustments
  if (profile) {
    if (profile.minimalistLevel === 'extreme') {
      scores.discard += 2;
      scores.donate += 2;
      scores.keep -= 1;
      breakdown.profile.minimalist = { discard: 2, donate: 2, keep: -1 };
    } else if (profile.minimalistLevel === 'maximalist') {
      scores.keep += 2;
      scores.storage += 1;
      breakdown.profile.maximalist = { keep: 2, storage: 1 };
    }

    if (profile.budgetPriority === 'very-important' && formData.value !== 'low') {
      scores.sell += 2;
      breakdown.profile.budget = { sell: 2 };
    } else if (profile.budgetPriority === 'not-important') {
      scores.donate += 2;
      breakdown.profile.budget = { donate: 2 };
    }

    if (profile.sentimentalValue === 'very-sentimental') {
      scores.keep += 1;
      scores.storage += 1;
      breakdown.profile.sentimental = { keep: 1, storage: 1 };
    }

    if (profile.livingSpace === 'small-apartment' || profile.livingSpace === 'studio') {
      scores.storage -= 1;
      scores.donate += 1;
      breakdown.profile.space = { storage: -1, donate: 1 };
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  const topRecommendations = Object.keys(scores).filter(key => scores[key] === maxScore);

  let recommendation;
  if (topRecommendations.length > 1) {
    const tieBreakOrder = thresholds.tieBreakOrder || defaultThresholds.tieBreakOrder;
    for (const rec of tieBreakOrder) {
      if (topRecommendations.includes(rec)) {
        recommendation = rec;
        break;
      }
    }
  } else {
    recommendation = topRecommendations[0];
  }

  return {
    recommendation,
    scores,
    breakdown,
    maxScore,
    tiedRecommendations: topRecommendations.length > 1 ? topRecommendations : null,
    strategyUsed: strategyConfig?.name || 'Default'
  };
}

/**
 * Generates reasoning text for a recommendation
 * @param {string} recommendation - The recommendation type
 * @param {Object} formData - The form data containing item evaluation answers
 * @param {Object} profile - The user's profile with preferences
 * @returns {string} - The reasoning text explaining the recommendation
 */
export function generateReasoning(recommendation, formData, profile) {
  const reasons = [];
  const itemName = formData.name || 'This item';
  const mode = formData.personalityMode || 'balanced';

  // Personality-mode-aware opening lines
  const openings = {
    keep: {
      joy_seeker: `${itemName} clearly sparks joy for you!`,
      practical_parent: `${itemName} earns its spot in your home.`,
      comedian: `${itemName} made the cut - congratulations, you get to stay!`,
      minimalist: `${itemName} is worth keeping - and that says something.`,
      balanced: `${itemName} appears to be something you should keep in your home.`
    },
    storage: {
      joy_seeker: `Thank ${itemName} for waiting patiently - it belongs in storage for now.`,
      practical_parent: `${itemName} doesn't need prime real estate. Storage it is.`,
      comedian: `${itemName} is going to the bench - not cut from the team, just not starting.`,
      minimalist: `${itemName} should be stored. Out of sight, but not gone.`,
      balanced: `${itemName} would be best placed in storage.`
    },
    accessible: {
      joy_seeker: `Keep ${itemName} close - it brings value to your daily life!`,
      practical_parent: `${itemName} needs to be within arm's reach.`,
      comedian: `${itemName} gets VIP access - front row seating in your home!`,
      minimalist: `${itemName} earns accessible placement.`,
      balanced: `${itemName} should be kept in an easily accessible location.`
    },
    sell: {
      joy_seeker: `Thank ${itemName} for its service, and let it bring joy to someone else - plus a little cash for you!`,
      practical_parent: `Time to cash in on ${itemName}. No point keeping money on the shelf.`,
      comedian: `${itemName} is about to fund your next impulse purchase. Sell it!`,
      minimalist: `${itemName} can go. Recoup the value and free the space.`,
      balanced: `${itemName} is a good candidate for selling.`
    },
    donate: {
      joy_seeker: `${itemName} deserves to spark joy for someone new. Donate with gratitude.`,
      practical_parent: `${itemName} isn't working for you. Pass it to someone who'll actually use it.`,
      comedian: `${itemName} is ready for a new adventure. Set it free via the donation bin!`,
      minimalist: `Let ${itemName} go. Someone else will appreciate it more.`,
      balanced: `${itemName} would make a wonderful donation.`
    },
    discard: {
      joy_seeker: `Thank ${itemName} for its time in your life, then let it go with grace.`,
      practical_parent: `${itemName} has served its purpose. Time to toss it.`,
      comedian: `${itemName} has officially expired. Time for the great beyond (the trash).`,
      minimalist: `${itemName} is dead weight. Remove it.`,
      balanced: `${itemName} can be discarded.`
    }
  };

  reasons.push(openings[recommendation]?.[mode] || openings[recommendation]?.balanced || `Our recommendation for ${itemName}: ${recommendation}.`);

  // Context-specific reasons
  if (recommendation === 'keep') {
    if (formData.used === 'yes') reasons.push('You use this item regularly, which shows it serves an active purpose in your life.');
    if (formData.sentimental === 'high') reasons.push('Its strong sentimental value makes it worth holding onto.');
    if (formData.isSentimental) reasons.push('The personal significance of this item adds real value beyond the practical.');
    if (formData.lastUsedTimeframe === 'last_month') reasons.push('Recent use confirms this is part of your active rotation.');
  } else if (recommendation === 'storage') {
    if (formData.used === 'rarely' || formData.used === 'no') reasons.push("You don't use this frequently enough to warrant prime real estate in your living space.");
    if (formData.replace === 'difficult') reasons.push("This item would be hard to replace, so it's worth keeping, just not in your main living areas.");
    if (formData.lastUsedTimeframe === '1-2_years') reasons.push("It's been a while since you used this, but it may still have a season.");
  } else if (recommendation === 'accessible') {
    if (formData.used === 'yes') reasons.push('You use this item enough that it should be easy to reach when needed.');
  } else if (recommendation === 'sell') {
    if (formData.value === 'high' || formData.value === 'medium') reasons.push('This item has monetary value that you could recoup through selling.');
    if (profile?.budgetPriority === 'very-important') reasons.push('Recouping money from items aligns with your financial priorities.');
    if (formData.duplicateCount > 2) reasons.push(`You have ${formData.duplicateCount} similar items - selling extras makes sense.`);
  } else if (recommendation === 'donate') {
    if (formData.condition === 'good' || formData.condition === 'fair') reasons.push("It's in decent enough condition for someone else to use and appreciate.");
    if (formData.lastUsedTimeframe === '2+_years' || formData.lastUsedTimeframe === 'never_used') reasons.push("It hasn't been used in a long time - someone else could put it to good use.");
    if (formData.duplicateCount > 2) reasons.push(`With ${formData.duplicateCount} items in this category, paring down makes room for what matters.`);
  } else if (recommendation === 'discard') {
    if (formData.condition === 'poor' || formData.itemCondition === 'broken') reasons.push("Its condition means it's not suitable for donation or resale.");
    if (formData.lastUsedTimeframe === 'never_used') reasons.push("You've never actually used this - it's taking up space without purpose.");
  }

  // Goal-specific closer
  if (formData.userGoal === 'downsizing') {
    reasons.push('This aligns with your downsizing goal.');
  } else if (formData.userGoal === 'moving') {
    reasons.push('Less to pack means an easier move.');
  }

  return reasons.join(' ');
}

/**
 * Detects emotional tone from user notes text (client-side version)
 */
export function detectEmotionalTone(text) {
  if (!text || text.trim().length === 0) return 'neutral';

  const lower = text.toLowerCase();
  const sentimentalWords = ['grandmother', 'grandma', 'grandfather', 'childhood', 'memories', 'passed down', 'inherited', 'family', 'heirloom', 'wedding', 'baby', 'mother', 'father'];
  const frustratedWords = ['stupid', 'waste', 'taking up space', 'never use', 'hate', 'junk', 'clutter', 'useless', 'broken', 'trash', 'get rid of', 'eyesore'];
  const enthusiasticWords = ['love', 'favorite', 'perfect', 'amazing', 'beautiful', 'awesome', 'treasure', 'wonderful', 'rare', 'unique'];

  let sentScore = 0, fruScore = 0, enthScore = 0;
  for (const w of sentimentalWords) { if (lower.includes(w)) sentScore++; }
  for (const w of frustratedWords) { if (lower.includes(w)) fruScore++; }
  for (const w of enthusiasticWords) { if (lower.includes(w)) enthScore++; }

  const max = Math.max(sentScore, fruScore, enthScore);
  if (max === 0) return 'neutral';
  if (sentScore >= fruScore && sentScore >= enthScore) return 'sentimental';
  if (fruScore >= enthScore) return 'frustrated';
  return 'enthusiastic';
}

/**
 * Labels for recommendation types
 */
export const recommendationLabels = {
  keep: 'Keep It',
  storage: 'Put in Storage',
  accessible: 'Keep Accessible',
  sell: 'Sell It',
  donate: 'Donate It',
  discard: 'Discard It'
};

/**
 * Factor labels for display
 */
export const factorLabels = {
  usage: 'Usage Frequency',
  sentimental: 'Sentimental Value',
  condition: 'Condition',
  value: 'Monetary Value',
  replaceability: 'Replaceability',
  space: 'Space Availability'
};

/**
 * Option labels for each factor
 */
export const optionLabels = {
  usage: { yes: 'Regularly', rarely: 'Rarely', no: 'Never' },
  sentimental: { high: 'High', some: 'Some', none: 'None' },
  condition: { excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor' },
  value: { high: 'High', medium: 'Medium', low: 'Low' },
  replaceability: { difficult: 'Difficult', moderate: 'Moderate', easy: 'Easy' },
  space: { yes: 'Yes', limited: 'Limited', no: 'No' }
};
