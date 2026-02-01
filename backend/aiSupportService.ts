import { Pool } from 'pg';

interface FaqEntry {
  keywords: string[];
  question: string;
  answer: string;
}

interface FaqMatch {
  question: string;
  answer: string;
  confidence: number;
}

interface SupportTicket {
  id: number;
  subject: string;
  message: string;
  status: string;
  ai_matched: boolean;
  ai_response: string | null;
  created_at: Date;
  updated_at: Date;
  responses: SupportResponse[];
}

interface SupportResponse {
  id: number;
  message: string;
  is_ai_response: boolean;
  created_at: Date;
}

class AISupportService {
  pool: Pool;

  private faqEntries: FaqEntry[] = [
    {
      keywords: ['password', 'reset', 'forgot', 'change', 'login', 'sign in', 'locked'],
      question: 'How do I reset my password?',
      answer: 'You can reset your password by going to Settings > Change Password. If you\'re locked out, click "Forgot Password" on the login page and follow the email instructions to set a new password.'
    },
    {
      keywords: ['item', 'evaluate', 'evaluation', 'analyze', 'analysis', 'value', 'worth', 'appraise'],
      question: 'How does item evaluation work?',
      answer: 'Navigate to "Evaluate Item" from the dashboard. Upload a photo of your item, provide a description, and our AI will analyze it to suggest whether to keep, sell, donate, store, or discard the item. You can also add notes about sentimental value or condition.'
    },
    {
      keywords: ['household', 'member', 'family', 'add', 'person', 'people', 'roommate'],
      question: 'How do I manage household members?',
      answer: 'Go to the "Household" page from the navigation menu. There you can add household members by clicking "Add Member", providing their name and relationship. You can edit or remove members at any time. Household members help the AI personalize recommendations.'
    },
    {
      keywords: ['personality', 'profile', 'quiz', 'preferences', 'style', 'decluttering', 'minimalist'],
      question: 'What is the personality profile?',
      answer: 'The personality profile helps our AI understand your decluttering style and preferences. Visit the "Profile" page to answer questions about your attachment to items, organization habits, and goals. This information helps tailor recommendations to your comfort level.'
    },
    {
      keywords: ['image', 'photo', 'ai', 'analysis', 'config', 'provider', 'api', 'key', 'llm', 'anthropic', 'openai'],
      question: 'How do I configure AI image analysis?',
      answer: 'Go to Settings > AI Image Analysis. You can enable/disable image analysis, choose your preferred AI provider (Anthropic, OpenAI, Google, or Ollama), and optionally enter your own API key. If you don\'t provide a key, the system default will be used when available.'
    },
    {
      keywords: ['email', 'notification', 'alerts', 'digest', 'announcement', 'unsubscribe', 'subscribe'],
      question: 'How do I manage email notifications?',
      answer: 'Visit Settings > Email Notifications to control which emails you receive. You can toggle announcements, account updates, item recommendations, and weekly digest emails. Changes take effect immediately after saving.'
    },
    {
      keywords: ['dark', 'mode', 'theme', 'light', 'appearance', 'display', 'color'],
      question: 'How do I switch between dark and light mode?',
      answer: 'You can toggle dark mode from the theme button in the navigation bar (sun/moon icon) or from Settings > Appearance. Your preference is saved automatically and persists across sessions.'
    },
    {
      keywords: ['account', 'delete', 'remove', 'deactivate', 'cancel', 'close', 'data', 'privacy'],
      question: 'How do I delete my account?',
      answer: 'Account deletion must be requested through an administrator. Please contact your system administrator to request account removal. All your data including items, evaluations, and personal information will be permanently deleted.'
    }
  ];

  constructor(pool: Pool) {
    this.pool = pool;
  }

  matchFaq(subject: string, message: string): FaqMatch | null {
    const combinedText = `${subject} ${message}`.toLowerCase();
    let bestMatch: FaqMatch | null = null;
    let bestScore = 0;

    for (const entry of this.faqEntries) {
      let hits = 0;
      for (const keyword of entry.keywords) {
        if (combinedText.includes(keyword)) {
          hits++;
        }
      }

      if (hits >= 2) {
        const confidence = hits / entry.keywords.length;
        if (confidence > bestScore) {
          bestScore = confidence;
          bestMatch = {
            question: entry.question,
            answer: entry.answer,
            confidence
          };
        }
      }
    }

    return bestMatch;
  }

  async createTicket(userId: number, subject: string, message: string): Promise<{ id: number; aiMatched: boolean; aiResponse: string | null }> {
    const match = this.matchFaq(subject, message);
    const aiMatched = match !== null;
    const aiResponse = match ? match.answer : null;
    const status = aiMatched ? 'ai_resolved' : 'open';

    const result = await this.pool.query(
      `INSERT INTO support_tickets (user_id, subject, message, status, ai_matched, ai_response)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, subject, message, status, aiMatched, aiResponse]
    );

    const ticketId = result.rows[0].id;

    if (aiMatched && aiResponse) {
      await this.pool.query(
        `INSERT INTO support_responses (ticket_id, message, is_ai_response)
         VALUES ($1, $2, true)`,
        [ticketId, aiResponse]
      );
    }

    return { id: ticketId, aiMatched, aiResponse };
  }

  async getTicketsForUser(userId: number): Promise<SupportTicket[]> {
    const result = await this.pool.query(
      `SELECT
        t.id, t.subject, t.message, t.status, t.ai_matched, t.ai_response,
        t.created_at, t.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', r.id,
              'message', r.message,
              'is_ai_response', r.is_ai_response,
              'created_at', r.created_at
            ) ORDER BY r.created_at ASC
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'::json
        ) AS responses
      FROM support_tickets t
      LEFT JOIN support_responses r ON r.ticket_id = t.id
      WHERE t.user_id = $1
      GROUP BY t.id
      ORDER BY t.created_at DESC`,
      [userId]
    );

    return result.rows;
  }
}

export default AISupportService;
