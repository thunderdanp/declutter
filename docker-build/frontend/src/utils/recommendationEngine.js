/**
 * Recommendation Engine
 * Shared utility for analyzing items and generating recommendations
 * Supports configurable weights, thresholds, and A/B testing strategies
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

  if (recommendation === 'keep') {
    reasons.push(`${itemName} appears to be something you should keep in your home.`);
    if (formData.used === 'yes') {
      reasons.push('You use this item regularly, which shows it serves an active purpose in your life.');
    }
    if (formData.sentimental === 'high') {
      reasons.push('Its strong sentimental value makes it worth holding onto.');
    }
    if (profile?.minimalistLevel === 'maximalist') {
      reasons.push('Based on your personality profile, you appreciate having variety and enjoy collecting meaningful items.');
    }
  } else if (recommendation === 'storage') {
    reasons.push(`${itemName} would be best placed in storage.`);
    if (formData.used === 'rarely' || formData.used === 'no') {
      reasons.push("You don't use this frequently enough to warrant prime real estate in your living space.");
    }
    if (formData.replace === 'difficult') {
      reasons.push("This item would be hard to replace, so it's worth keeping, just not in your main living areas.");
    }
  } else if (recommendation === 'accessible') {
    reasons.push(`${itemName} should be kept in an easily accessible location.`);
    if (formData.used === 'yes') {
      reasons.push('You use this item enough that it should be easy to reach when needed.');
    }
  } else if (recommendation === 'sell') {
    reasons.push(`${itemName} is a good candidate for selling.`);
    if (formData.value === 'high' || formData.value === 'medium') {
      reasons.push('This item has monetary value that you could recoup through selling.');
    }
    if (profile?.budgetPriority === 'very-important') {
      reasons.push('Based on your profile, recouping money from items is important to you.');
    }
  } else if (recommendation === 'donate') {
    reasons.push(`${itemName} would make a wonderful donation.`);
    if (formData.condition === 'good' || formData.condition === 'fair') {
      reasons.push("It's in decent enough condition for someone else to use and appreciate.");
    }
    if (profile?.budgetPriority === 'not-important') {
      reasons.push('Based on your profile, you prefer donating over selling, which is a generous choice.');
    }
  } else if (recommendation === 'discard') {
    reasons.push(`${itemName} can be discarded.`);
    if (formData.condition === 'poor') {
      reasons.push("Its poor condition means it's not suitable for donation or resale.");
    }
    if (profile?.minimalistLevel === 'extreme') {
      reasons.push('As someone who values minimalism, letting go of items like this will help you achieve your goals.');
    }
  }

  return reasons.join(' ');
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
