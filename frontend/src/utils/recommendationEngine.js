/**
 * Recommendation Engine
 * Shared utility for analyzing items and generating recommendations
 */

/**
 * Analyzes an item based on form data and user profile to determine recommendation
 * @param {Object} formData - The form data containing item evaluation answers
 * @param {Object} profile - The user's profile with preferences
 * @returns {string} - The recommendation type (keep, storage, accessible, sell, donate, discard)
 */
export function analyzeItem(formData, profile) {
  let scores = {
    keep: 0,
    storage: 0,
    accessible: 0,
    sell: 0,
    donate: 0,
    discard: 0
  };

  // Usage analysis
  if (formData.used === 'yes') {
    scores.keep += 3;
    scores.accessible += 2;
  } else if (formData.used === 'rarely') {
    scores.storage += 2;
    scores.accessible += 1;
  } else {
    scores.donate += 2;
    scores.sell += 1;
    scores.discard += 1;
  }

  // Sentimental value
  if (formData.sentimental === 'high') {
    scores.keep += 3;
    scores.storage += 2;
  } else if (formData.sentimental === 'some') {
    scores.keep += 1;
    scores.storage += 2;
  } else {
    scores.sell += 1;
    scores.donate += 1;
  }

  // Condition
  if (formData.condition === 'excellent' || formData.condition === 'good') {
    scores.keep += 1;
    scores.sell += 2;
    scores.donate += 1;
  } else if (formData.condition === 'fair') {
    scores.donate += 2;
    scores.discard += 1;
  } else {
    scores.discard += 3;
  }

  // Monetary value
  if (formData.value === 'high') {
    scores.keep += 2;
    scores.sell += 3;
  } else if (formData.value === 'medium') {
    scores.sell += 2;
    scores.donate += 1;
  } else {
    scores.donate += 2;
    scores.discard += 1;
  }

  // Replaceability
  if (formData.replace === 'difficult') {
    scores.keep += 2;
    scores.storage += 2;
  } else if (formData.replace === 'moderate') {
    scores.storage += 1;
  } else {
    scores.donate += 1;
    scores.discard += 1;
  }

  // Space availability
  if (formData.space === 'yes') {
    scores.keep += 2;
    scores.accessible += 3;
  } else if (formData.space === 'limited') {
    scores.storage += 2;
  } else {
    scores.storage += 1;
    scores.sell += 1;
    scores.donate += 1;
  }

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

  const maxScore = Math.max(...Object.values(scores));
  return Object.keys(scores).find(key => scores[key] === maxScore);
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
