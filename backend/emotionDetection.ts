export type EmotionalTone = 'sentimental' | 'frustrated' | 'enthusiastic' | 'neutral';

interface ToneConfig {
  keywords: string[];
  instructions: string;
}

const TONE_CONFIGS: Record<EmotionalTone, ToneConfig> = {
  sentimental: {
    keywords: [
      'grandmother', 'grandma', 'grandfather', 'grandpa', 'childhood', 'memories',
      'passed down', 'inherited', 'family', 'heirloom', 'remember', 'memorial',
      'wedding', 'baby', 'first', 'mother', 'father', 'mom', 'dad', 'gift from',
      'belonged to', 'grew up', 'nostalgic', 'sentimental', 'precious', 'irreplaceable'
    ],
    instructions: 'User has emotional attachment. Be gentle and respectful. Suggest ways to honor memories while being practical (photo documentation, keeping one representative piece, etc).'
  },
  frustrated: {
    keywords: [
      'stupid', 'waste', 'taking up space', 'never use', 'hate', 'annoying',
      'junk', 'clutter', 'sick of', 'tired of', 'useless', 'broken', 'garbage',
      'trash', 'get rid of', 'eyesore', 'ugly', 'regret buying', 'waste of money',
      'can\'t stand', 'fed up', 'done with'
    ],
    instructions: 'User is eager to declutter this. Match their energy. Be direct and supportive of removal. Validate their desire to let go.'
  },
  enthusiastic: {
    keywords: [
      'love', 'favorite', 'perfect', 'amazing', 'beautiful', 'awesome',
      'best', 'treasure', 'adore', 'wonderful', 'fantastic', 'great condition',
      'proud of', 'collection', 'rare', 'unique', 'special', 'joy', 'happy',
      'excited', 'thrilled'
    ],
    instructions: 'User loves this item. Validate their feelings while being honest about practical use. If recommending keeping, affirm their choice.'
  },
  neutral: {
    keywords: [],
    instructions: 'Standard recommendation approach. Be helpful and balanced.'
  }
};

export function detectEmotionalTone(userNotes: string | null | undefined): EmotionalTone {
  if (!userNotes || userNotes.trim().length === 0) {
    return 'neutral';
  }

  const text = userNotes.toLowerCase();
  const scores: Record<EmotionalTone, number> = {
    sentimental: 0,
    frustrated: 0,
    enthusiastic: 0,
    neutral: 0
  };

  for (const [tone, config] of Object.entries(TONE_CONFIGS)) {
    if (tone === 'neutral') continue;
    for (const keyword of config.keywords) {
      if (text.includes(keyword)) {
        scores[tone as EmotionalTone]++;
      }
    }
  }

  const maxScore = Math.max(scores.sentimental, scores.frustrated, scores.enthusiastic);

  if (maxScore === 0) return 'neutral';
  if (scores.sentimental >= scores.frustrated && scores.sentimental >= scores.enthusiastic) return 'sentimental';
  if (scores.frustrated >= scores.enthusiastic) return 'frustrated';
  return 'enthusiastic';
}

export function getToneInstructions(tone: EmotionalTone): string {
  return TONE_CONFIGS[tone].instructions;
}
