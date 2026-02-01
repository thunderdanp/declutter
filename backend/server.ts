/**
 * ============================================================================
 * DECLUTTER ASSISTANT - BACKEND API SERVER
 * ============================================================================
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { promises as fs } from 'fs';
import { Pool } from 'pg';
import { body, validationResult } from 'express-validator';
import * as llmProviders from './llmProviders';
import EmailService from './emailService';
import AISupportService from './aiSupportService';
import { VALID_PERSONALITY_MODES, PERSONALITY_MODES, getPersonalityConfig } from './personalities';
import { detectEmotionalTone, getToneInstructions } from './emotionDetection';
import { getUserPatterns, logOverride } from './userPatterns';
import { buildRecommendationContext, getDuplicateCount } from './contextBuilder';
import { buildAIPrompt } from './aiRecommendations';
import crypto from 'crypto';
import { RecaptchaEnterpriseServiceClient } from '@google-cloud/recaptcha-enterprise';
import * as fsSync from 'fs';
import http from 'http';

// ============================================
// TYPE DECLARATIONS
// ============================================

interface JwtPayload {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

interface PgError extends Error {
  code?: string;
}

interface LogActivityParams {
  userId: number | null;
  action: string;
  actionType: string;
  resourceType?: string | null;
  resourceId?: number | null;
  details?: Record<string, unknown> | null;
  req?: Request | null;
}

// ============================================
// RECAPTCHA
// ============================================

let recaptchaClient: RecaptchaEnterpriseServiceClient | null = null;
function getRecaptchaClient(): RecaptchaEnterpriseServiceClient | null {
  if (!recaptchaClient) {
    try {
      recaptchaClient = new RecaptchaEnterpriseServiceClient();
    } catch (err) {
      console.error('Failed to initialize reCAPTCHA Enterprise client:', (err as Error).message);
    }
  }
  return recaptchaClient;
}

async function createAssessment({ projectID, recaptchaKey, token, recaptchaAction }: {
  projectID: string;
  recaptchaKey: string;
  token: string;
  recaptchaAction: string;
}): Promise<number | null> {
  const client = getRecaptchaClient();
  if (!client) return null;

  try {
    const projectPath = client.projectPath(projectID);
    const [response] = await client.createAssessment({
      parent: projectPath,
      assessment: {
        event: {
          token: token,
          siteKey: recaptchaKey,
        },
      },
    });

    if (!response.tokenProperties!.valid) {
      console.error('reCAPTCHA token invalid:', response.tokenProperties!.invalidReason);
      return null;
    }

    if (response.tokenProperties!.action !== recaptchaAction) {
      console.error('reCAPTCHA action mismatch: expected', recaptchaAction, 'got', response.tokenProperties!.action);
      return null;
    }

    return response.riskAnalysis!.score!;
  } catch (err) {
    console.error('reCAPTCHA Enterprise createAssessment error:', (err as Error).message);
    return null;
  }
}

// ============================================
// APP SETUP
// ============================================

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3001', 10);

// Ensure uploads directory exists at runtime (important when volume is mounted)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://declutter_user:declutter_password@localhost:5432/declutter_db',
});

// Initialize email service
const emailService = new EmailService(pool);

// Initialize AI support service
const aiSupportService = new AISupportService(pool);

// Run migrations from migrations/ directory, tracking applied ones in schema_migrations
const runMigrations = async (): Promise<void> => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    if (!fsSync.existsSync(migrationsDir)) {
      console.log('No migrations directory found, skipping');
      return;
    }

    const files = fsSync.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) return;

    const applied = await pool.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(applied.rows.map((r: { filename: string }) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fsSync.readFileSync(path.join(migrationsDir, file), 'utf-8');
      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`Migration applied: ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(`Migration failed: ${file}`, (err as Error).message);
        break;
      }
    }
  } catch (err) {
    console.log('Migration runner error:', (err as Error).message);
  }
};

// Test database connection
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
    runMigrations();
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    if (!fsSync.existsSync(uploadsDir)) {
      fsSync.mkdirSync(uploadsDir, { recursive: true });
      console.log('Created uploads directory on demand:', uploadsDir);
    }
    console.log('Saving file to:', uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  validate: { trustProxy: false },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 7,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
  validate: { trustProxy: false },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again later.' },
  validate: { trustProxy: false },
});

const emailActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  validate: { trustProxy: false },
});

const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request): string => req.user?.userId?.toString() || req.ip || 'unknown',
  message: { error: 'Too many analysis requests, please try again later.' },
  validate: { trustProxy: false },
});

app.use('/api', generalLimiter);

// JWT Authentication Middleware
const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this-in-production', (err, user) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = user as JwtPayload;
    next();
  });
};

// ============================================
// ACTIVITY LOGGING HELPER
// ============================================
const logActivity = async ({ userId, action, actionType, resourceType = null, resourceId = null, details = null, req = null }: LogActivityParams): Promise<void> => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    await pool.query(
      `INSERT INTO activity_logs (user_id, action, action_type, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, action, actionType, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress, userAgent]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// ============= PUBLIC CONFIG ROUTES =============

app.get('/api/config/recaptcha', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recaptcha_site_key', 'recaptcha_project_id')"
    );
    const settings: Record<string, string> = {};
    result.rows.forEach((row: { setting_key: string; setting_value: string }) => { settings[row.setting_key] = row.setting_value; });

    const siteKey = (settings.recaptcha_site_key && settings.recaptcha_site_key.trim()) || process.env.REACT_APP_RECAPTCHA_SITE_KEY || '';
    const projectId = (settings.recaptcha_project_id && settings.recaptcha_project_id.trim()) || process.env.RECAPTCHA_PROJECT_ID || '';
    const enabled = !!(siteKey && projectId && getRecaptchaClient());

    const response: Record<string, unknown> = { enabled };
    if (enabled) {
      response.siteKey = siteKey;
    }
    res.json(response);
  } catch (error) {
    console.error('Get recaptcha config error:', error);
    res.json({ enabled: false });
  }
});

// ============= AUTH ROUTES =============

// Register
app.post('/api/auth/register', registerLimiter, [
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty()
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password, firstName, lastName, recaptchaToken } = req.body;

  try {
    const regModeResult = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'registration_mode'"
    );
    const registrationMode = regModeResult.rows.length > 0 ? regModeResult.rows[0].setting_value : 'automatic';

    if (registrationMode === 'disallowed') {
      res.status(403).json({ error: 'Registration is currently disabled.' });
      return;
    }

    // reCAPTCHA Enterprise server-side verification
    const recaptchaResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recaptcha_site_key', 'recaptcha_project_id', 'recaptcha_score_threshold')"
    );
    const recaptchaSettings: Record<string, string> = {};
    recaptchaResult.rows.forEach((row: { setting_key: string; setting_value: string }) => { recaptchaSettings[row.setting_key] = row.setting_value; });

    const siteKey = (recaptchaSettings.recaptcha_site_key && recaptchaSettings.recaptcha_site_key.trim()) || process.env.REACT_APP_RECAPTCHA_SITE_KEY || '';
    const projectId = (recaptchaSettings.recaptcha_project_id && recaptchaSettings.recaptcha_project_id.trim()) || process.env.RECAPTCHA_PROJECT_ID || '';
    const scoreThreshold = parseFloat(recaptchaSettings.recaptcha_score_threshold) || 0.5;
    const client = getRecaptchaClient();

    if (siteKey && projectId && client) {
      if (!recaptchaToken) {
        res.status(400).json({ error: 'reCAPTCHA verification required' });
        return;
      }

      const score = await createAssessment({
        projectID: projectId,
        recaptchaKey: siteKey,
        token: recaptchaToken,
        recaptchaAction: 'register',
      });

      if (score === null) {
        res.status(500).json({ error: 'Unable to verify reCAPTCHA. Please try again.' });
        return;
      }

      if (score < scoreThreshold) {
        res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
        return;
      }
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isApproved = registrationMode !== 'approval';
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, is_approved) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name',
      [email, passwordHash, firstName, lastName, isApproved]
    );

    const user = result.rows[0];

    if (!isApproved) {
      await logActivity({
        userId: user.id, action: 'register', actionType: 'USER',
        resourceType: 'user', resourceId: user.id,
        details: { email: user.email, requiresApproval: true }, req
      });
      res.status(200).json({ message: 'Registration successful. Your account is pending admin approval.', requiresApproval: true });
      return;
    }

    const verificationSetting = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'require_email_verification'"
    );
    const requireVerification = verificationSetting.rows.length > 0 && verificationSetting.rows[0].setting_value === 'true';

    if (requireVerification) {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await pool.query(
        'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
        [verificationToken, tokenExpires, user.id]
      );

      const verificationLink = `${req.headers.origin || 'http://localhost:3000'}/verify-email/${verificationToken}`;

      try {
        await emailService.sendTriggeredEmail('email_verification', user.email, {
          firstName: user.first_name,
          verificationLink
        });
      } catch (emailErr) {
        console.error('Failed to send verification email:', emailErr);
      }

      await logActivity({
        userId: user.id, action: 'register', actionType: 'USER',
        resourceType: 'user', resourceId: user.id,
        details: { email: user.email, requiresVerification: true }, req
      });

      res.status(200).json({ message: 'Registration successful. Please check your email to verify your account.', requiresVerification: true });
      return;
    }

    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
      { expiresIn: '7d' }
    );

    await logActivity({
      userId: user.id, action: 'register', actionType: 'USER',
      resourceType: 'user', resourceId: user.id,
      details: { email: user.email }, req
    });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', loginLimiter, [
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
  body('password').notEmpty()
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, is_admin, is_approved, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      await logActivity({ userId: null, action: 'login_failed', actionType: 'SYSTEM', details: { email, reason: 'unknown_email' }, req });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      await logActivity({ userId: user.id, action: 'login_failed', actionType: 'SYSTEM', resourceType: 'user', resourceId: user.id, details: { email, reason: 'invalid_password' }, req });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.is_approved) {
      await logActivity({ userId: user.id, action: 'login_failed', actionType: 'SYSTEM', resourceType: 'user', resourceId: user.id, details: { email, reason: 'account_not_approved' }, req });
      res.status(403).json({ error: 'Your account is pending admin approval.' });
      return;
    }

    const verificationSetting = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'require_email_verification'"
    );
    const requireVerification = verificationSetting.rows.length > 0 && verificationSetting.rows[0].setting_value === 'true';

    if (requireVerification && !user.email_verified) {
      await logActivity({ userId: user.id, action: 'login_failed', actionType: 'SYSTEM', resourceType: 'user', resourceId: user.id, details: { email, reason: 'email_not_verified' }, req });
      res.status(403).json({ error: 'Please verify your email address before logging in.', unverified: true, email: user.email });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
      { expiresIn: '7d' }
    );

    await logActivity({ userId: user.id, action: 'login', actionType: 'USER', resourceType: 'user', resourceId: user.id, details: { email: user.email }, req });

    res.json({
      token,
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, isAdmin: user.is_admin }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, email_verified FROM users WHERE id = $1',
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    res.json({ id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, emailVerified: user.email_verified });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Forgot password
app.post('/api/auth/forgot-password', emailActionLimiter, [
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false })
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email } = req.body;

  try {
    const result = await pool.query('SELECT id, email, first_name FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3', [token, expires, user.id]);

    const resetLink = `${req.headers.origin || 'http://localhost:3000'}/reset-password/${token}`;

    try {
      await emailService.sendTriggeredEmail('password_reset', user.email, { firstName: user.first_name, resetLink });
    } catch (emailErr) {
      console.error('Failed to send password reset email:', emailErr);
    }

    await logActivity({ userId: user.id, action: 'password_reset_requested', actionType: 'USER', resourceType: 'user', resourceId: user.id, details: { email: user.email }, req });

    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password
app.post('/api/auth/reset-password', emailActionLimiter, [
  body('token').trim().notEmpty(),
  body('password').isLength({ min: 6 })
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { token, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const user = result.rows[0];
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query('UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2', [passwordHash, user.id]);

    await logActivity({ userId: user.id, action: 'password_reset_completed', actionType: 'USER', resourceType: 'user', resourceId: user.id, details: { email: user.email }, req });

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { currentPassword, newPassword } = req.body;

  try {
    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE id = $1', [req.user!.userId]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

    if (!validPassword) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);

    await logActivity({ userId: user.id, action: 'password_changed', actionType: 'USER', resourceType: 'user', resourceId: user.id, details: { email: user.email }, req });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify email via token
app.get('/api/auth/verify-email/:token', emailActionLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      'SELECT id, email FROM users WHERE verification_token = $1 AND verification_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired verification link' });
      return;
    }

    const user = result.rows[0];
    await pool.query('UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1', [user.id]);

    await logActivity({ userId: user.id, action: 'email_verified', actionType: 'USER', resourceType: 'user', resourceId: user.id, details: { email: user.email }, req });

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend verification email
app.post('/api/auth/resend-verification', emailActionLimiter, [
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false })
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email } = req.body;

  try {
    const result = await pool.query('SELECT id, email, first_name, email_verified FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0 || result.rows[0].email_verified) {
      res.json({ message: 'If an account with that email exists and is unverified, a new verification link has been sent.' });
      return;
    }

    const user = result.rows[0];
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query('UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3', [verificationToken, tokenExpires, user.id]);

    const verificationLink = `${req.headers.origin || 'http://localhost:3000'}/verify-email/${verificationToken}`;

    try {
      await emailService.sendTriggeredEmail('email_verification', user.email, { firstName: user.first_name, verificationLink });
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr);
    }

    await logActivity({ userId: user.id, action: 'verification_email_resent', actionType: 'USER', resourceType: 'user', resourceId: user.id, details: { email: user.email }, req });

    res.json({ message: 'If an account with that email exists and is unverified, a new verification link has been sent.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= PERSONALITY PROFILE ROUTES =============

app.get('/api/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT profile_data FROM personality_profiles WHERE user_id = $1', [req.user!.userId]);
    if (result.rows.length === 0) {
      res.json({ profile: null });
      return;
    }
    res.json({ profile: result.rows[0].profile_data });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/profile', authenticateToken, async (req: Request, res: Response) => {
  const { profileData } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO personality_profiles (user_id, profile_data)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET profile_data = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING profile_data`,
      [req.user!.userId, JSON.stringify(profileData)]
    );

    await logActivity({ userId: req.user!.userId, action: 'profile_updated', actionType: 'user', resourceType: 'profile', resourceId: req.user!.userId, details: { profileType: profileData.declutterPersonality }, req });

    res.json({ profile: result.rows[0].profile_data });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= IMAGE ANALYSIS ROUTE =============

const calculateApiCost = (inputTokens: number, outputTokens: number, providerName: string = 'anthropic'): number => {
  return llmProviders.calculateCost(providerName, inputTokens, outputTokens);
};

const logApiUsage = async (userId: number, endpoint: string, model: string, inputTokens: number, outputTokens: number, success: boolean, errorMessage: string | null = null, usedUserKey: boolean = false, provider: string = 'anthropic'): Promise<void> => {
  try {
    const estimatedCost = calculateApiCost(inputTokens, outputTokens, provider);
    await pool.query(
      `INSERT INTO api_usage_logs (user_id, endpoint, model, input_tokens, output_tokens, estimated_cost, success, error_message, used_user_key, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, endpoint, model, inputTokens, outputTokens, estimatedCost, success, errorMessage, usedUserKey, provider]
    );
  } catch (err) {
    console.error('Error logging API usage:', err);
  }
};

const checkUsageLimits = async (userId: number): Promise<{ allowed: boolean; totalCost?: number; userCost?: number; monthlyLimit?: number; perUserLimit?: number; reason?: string | null }> => {
  try {
    const settingsResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('api_monthly_cost_limit', 'api_per_user_monthly_limit')"
    );
    const settings: Record<string, number> = {};
    settingsResult.rows.forEach((row: { setting_key: string; setting_value: string }) => {
      settings[row.setting_key] = parseFloat(row.setting_value);
    });

    const monthlyLimit = settings.api_monthly_cost_limit || 50;
    const perUserLimit = settings.api_per_user_monthly_limit || 10;

    const totalUsageResult = await pool.query(
      `SELECT COALESCE(SUM(estimated_cost), 0) as total_cost FROM api_usage_logs WHERE created_at >= date_trunc('month', CURRENT_DATE) AND used_user_key = false`
    );
    const totalCost = parseFloat(totalUsageResult.rows[0].total_cost);

    const userUsageResult = await pool.query(
      `SELECT COALESCE(SUM(estimated_cost), 0) as user_cost FROM api_usage_logs WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE) AND used_user_key = false`,
      [userId]
    );
    const userCost = parseFloat(userUsageResult.rows[0].user_cost);

    return {
      allowed: totalCost < monthlyLimit && userCost < perUserLimit,
      totalCost, userCost, monthlyLimit, perUserLimit,
      reason: totalCost >= monthlyLimit ? 'Monthly system limit reached' : userCost >= perUserLimit ? 'Your monthly usage limit reached' : null
    };
  } catch (err) {
    console.error('Error checking usage limits:', err);
    return { allowed: true };
  }
};

// Analyze image with LLM provider
app.post('/api/analyze-image', authenticateToken, aiLimiter, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided' });
    return;
  }

  let usedUserKey = false;
  let providerName = 'anthropic';
  let modelName = '';

  try {
    const userResult = await pool.query('SELECT llm_provider, llm_api_key, anthropic_api_key FROM users WHERE id = $1', [req.user!.userId]);
    const userRow = userResult.rows[0];
    const userProvider = userRow?.llm_provider;
    const userApiKey = userRow?.llm_api_key || userRow?.anthropic_api_key;
    usedUserKey = !!userApiKey;

    if (userProvider && llmProviders.getProvider(userProvider)) {
      providerName = userProvider;
    } else {
      const sysProv = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'llm_provider'");
      if (sysProv.rows[0]?.setting_value && llmProviders.getProvider(sysProv.rows[0].setting_value)) {
        providerName = sysProv.rows[0].setting_value;
      }
    }

    const providerConfig = llmProviders.getProvider(providerName)!;
    modelName = providerConfig.defaultModel;

    if (!usedUserKey) {
      const limitCheck = await checkUsageLimits(req.user!.userId);
      if (!limitCheck.allowed) {
        res.status(429).json({
          error: 'Usage limit exceeded',
          message: limitCheck.reason + '. Add your own API key in settings to continue.',
          userCost: limitCheck.userCost,
          perUserLimit: limitCheck.perUserLimit
        });
        return;
      }
    }

    let apiKeyOrUrl = userApiKey;

    if (!apiKeyOrUrl) {
      if (providerName === 'ollama') {
        const ollamaResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'ollama_base_url'");
        apiKeyOrUrl = ollamaResult.rows[0]?.setting_value || 'http://localhost:11434';
      } else {
        const envKeyMap: Record<string, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GOOGLE_API_KEY' };
        const dbKeyMap: Record<string, string> = { anthropic: 'anthropic_api_key', openai: 'openai_api_key', google: 'google_api_key' };

        const sysKeyResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = $1", [dbKeyMap[providerName]]);
        const dbKey = sysKeyResult.rows[0]?.setting_value;
        const envKey = process.env[envKeyMap[providerName]];
        apiKeyOrUrl = (dbKey && dbKey.trim()) ? dbKey : envKey;
      }
    }

    if (!apiKeyOrUrl) {
      res.status(400).json({ error: 'No API key available', message: `Please add your ${providerConfig.name} API key in settings or contact the administrator` });
      return;
    }

    const categoriesResult = await pool.query('SELECT slug FROM categories ORDER BY sort_order ASC, name ASC');
    const categoryList = categoriesResult.rows.map((c: { slug: string }) => c.slug).join(', ');

    const promptResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'analysis_prompt'");
    const customPrompt = promptResult.rows[0]?.setting_value || null;

    const imageBuffer = await fs.readFile(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = req.file.mimetype;

    const result = await llmProviders.analyzeImage(providerName, apiKeyOrUrl, base64Image, mediaType, categoryList, customPrompt || undefined);

    const inputTokens = result.inputTokens;
    const outputTokens = result.outputTokens;
    modelName = result.model || modelName;

    await logApiUsage(req.user!.userId, '/api/analyze-image', modelName, inputTokens, outputTokens, true, null, usedUserKey, providerName);

    const responseText = result.text;
    let analysisResult: Record<string, string>;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.error('Response was:', responseText);
      res.status(500).json({ error: 'Could not parse AI response', rawResponse: responseText });
      return;
    }

    const validSlugs = categoriesResult.rows.map((c: { slug: string }) => c.slug.toLowerCase());
    if (!validSlugs.includes(analysisResult.category?.toLowerCase())) {
      const defaultResult = await pool.query('SELECT slug FROM categories WHERE is_default = true');
      analysisResult.category = defaultResult.rows.length > 0 ? defaultResult.rows[0].slug : 'other';
    }

    res.json({ name: analysisResult.name || 'Unknown Item', description: analysisResult.description || '', category: analysisResult.category || 'other' });

  } catch (error: unknown) {
    console.error('Image analysis error:', error);
    await logApiUsage(req.user!.userId, '/api/analyze-image', modelName, 0, 0, false, (error as Error).message, usedUserKey, providerName);

    if ((error as { status?: number }).status === 401) {
      res.status(401).json({
        error: 'Invalid API key',
        message: usedUserKey ? 'Your API key is invalid. Please check your API key in settings.' : 'System API key is not configured. Please add your own API key in settings.'
      });
      return;
    }

    res.status(500).json({ error: 'Error analyzing image', details: (error as Error).message });
  }
});

// Get available LLM providers
app.get('/api/llm-providers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const sysProvResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'llm_provider'");
    const systemProvider = sysProvResult.rows[0]?.setting_value || 'anthropic';

    const sysKeysResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('anthropic_api_key', 'openai_api_key', 'google_api_key', 'ollama_base_url')"
    );
    const sysKeys: Record<string, string> = {};
    sysKeysResult.rows.forEach((row: { setting_key: string; setting_value: string }) => { sysKeys[row.setting_key] = row.setting_value; });

    const envKeyMap: Record<string, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GOOGLE_API_KEY' };
    const dbKeyMap: Record<string, string> = { anthropic: 'anthropic_api_key', openai: 'openai_api_key', google: 'google_api_key' };

    const providers = llmProviders.getAvailableProviders().map(p => {
      let systemConfigured = false;
      if (p.id === 'ollama') {
        systemConfigured = !!(sysKeys['ollama_base_url'] && sysKeys['ollama_base_url'].trim());
      } else {
        const dbVal = sysKeys[dbKeyMap[p.id]];
        const envVal = process.env[envKeyMap[p.id]];
        systemConfigured = !!(dbVal && dbVal.trim()) || !!envVal;
      }
      return { ...p, systemConfigured, isSystemDefault: p.id === systemProvider };
    });

    res.json({ providers });
  } catch (error) {
    console.error('Get LLM providers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ITEM ROUTES =============

app.get('/api/items', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { status, recommendation } = req.query;
    let query = 'SELECT * FROM items WHERE user_id = $1';
    const params: (number | string)[] = [req.user!.userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status as string);
    }

    if (recommendation && !status) {
      query += ' AND recommendation = $2';
      params.push(recommendation as string);
    } else if (recommendation && status) {
      query += ' AND recommendation = $3';
      params.push(recommendation as string);
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ items: result.rows });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/items/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.userId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Item not found' }); return; }
    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/items/:id/owners', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemResult = await pool.query('SELECT id FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.userId]);
    if (itemResult.rows.length === 0) { res.status(404).json({ error: 'Item not found' }); return; }

    const result = await pool.query('SELECT member_id FROM item_members WHERE item_id = $1', [req.params.id]);
    const ownerIds = result.rows.map((row: { member_id: number }) => row.member_id);
    res.json({ ownerIds });
  } catch (error) {
    console.error('Get item owners error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/items', authenticateToken, upload.single('image'), async (req: Request, res: Response) => {
  const { name, description, location, category, recommendation, recommendationReasoning, answers, status, ownerIds, lastUsedTimeframe, itemCondition, isSentimental, userNotes } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  if (req.file) { console.log('Image saved successfully:', req.file.path, 'URL:', imageUrl); }
  else { console.log('No image file in request or upload failed'); }

  try {
    const result = await pool.query(
      `INSERT INTO items (user_id, name, description, location, category, image_url, recommendation, recommendation_reasoning, answers, status, last_used_timeframe, item_condition, is_sentimental, user_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [req.user!.userId, name, description || null, location || null, category || null, imageUrl, recommendation || null, recommendationReasoning || null, answers ? JSON.stringify(JSON.parse(answers)) : null, status || 'pending', lastUsedTimeframe || null, itemCondition || null, isSentimental === 'true' || isSentimental === true, userNotes || null]
    );

    const item = result.rows[0];

    if (ownerIds) {
      const parsedOwnerIds = JSON.parse(ownerIds);
      if (Array.isArray(parsedOwnerIds) && parsedOwnerIds.length > 0) {
        for (const memberId of parsedOwnerIds) {
          await pool.query('INSERT INTO item_members (item_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [item.id, memberId]);
        }
      }
    }

    await logActivity({ userId: req.user!.userId, action: 'item_created', actionType: 'item', resourceType: 'item', resourceId: item.id, details: { name: item.name, category: item.category, recommendation: item.recommendation }, req });

    res.status(201).json({ item });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/items/:id', authenticateToken, upload.single('image'), async (req: Request, res: Response) => {
  const { name, description, location, category, recommendation, recommendationReasoning, answers, status, ownerIds, lastUsedTimeframe, itemCondition, isSentimental, userNotes } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramCount = 1;

    if (name !== undefined) { updates.push(`name = $${paramCount++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${paramCount++}`); params.push(description); }
    if (location !== undefined) { updates.push(`location = $${paramCount++}`); params.push(location); }
    if (category !== undefined) { updates.push(`category = $${paramCount++}`); params.push(category); }
    if (imageUrl !== undefined) { updates.push(`image_url = $${paramCount++}`); params.push(imageUrl); }
    if (recommendation !== undefined) { updates.push(`recommendation = $${paramCount++}`); params.push(recommendation); }
    if (recommendationReasoning !== undefined) { updates.push(`recommendation_reasoning = $${paramCount++}`); params.push(recommendationReasoning); }
    if (answers !== undefined) { updates.push(`answers = $${paramCount++}`); params.push(JSON.stringify(JSON.parse(answers))); }
    if (status !== undefined) { updates.push(`status = $${paramCount++}`); params.push(status); }
    if (lastUsedTimeframe !== undefined) { updates.push(`last_used_timeframe = $${paramCount++}`); params.push(lastUsedTimeframe || null); }
    if (itemCondition !== undefined) { updates.push(`item_condition = $${paramCount++}`); params.push(itemCondition || null); }
    if (isSentimental !== undefined) { updates.push(`is_sentimental = $${paramCount++}`); params.push(isSentimental === 'true' || isSentimental === true); }
    if (userNotes !== undefined) { updates.push(`user_notes = $${paramCount++}`); params.push(userNotes || null); }

    if (updates.length === 0) { res.status(400).json({ error: 'No updates provided' }); return; }

    params.push(req.params.id, req.user!.userId);
    const query = `UPDATE items SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++} RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) { res.status(404).json({ error: 'Item not found' }); return; }

    if (ownerIds !== undefined) {
      const parsedOwnerIds = Array.isArray(ownerIds) ? ownerIds : JSON.parse(ownerIds);
      await pool.query('DELETE FROM item_members WHERE item_id = $1', [req.params.id]);
      if (Array.isArray(parsedOwnerIds) && parsedOwnerIds.length > 0) {
        for (const memberId of parsedOwnerIds) {
          await pool.query('INSERT INTO item_members (item_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, memberId]);
        }
      }
    }

    const updatedItem = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'item_updated', actionType: 'item', resourceType: 'item', resourceId: updatedItem.id, details: { name: updatedItem.name, fieldsUpdated: updates.map(u => u.split(' = ')[0]) }, req });

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/items/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user!.userId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Item not found' }); return; }

    const deletedItem = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'item_deleted', actionType: 'item', resourceType: 'item', resourceId: deletedItem.id, details: { name: deletedItem.name, category: deletedItem.category }, req });

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/items/:id/decision', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { decision } = req.body;
    const validDecisions = ['keep', 'accessible', 'storage', 'sell', 'donate', 'discard'];

    if (!decision || !validDecisions.includes(decision)) {
      res.status(400).json({ error: 'Invalid decision. Must be one of: ' + validDecisions.join(', ') });
      return;
    }

    const result = await pool.query(
      `UPDATE items SET decision = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *`,
      [decision, req.params.id, req.user!.userId]
    );

    if (result.rows.length === 0) { res.status(404).json({ error: 'Item not found' }); return; }

    const item = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'decision_recorded', actionType: 'item', resourceType: 'item', resourceId: item.id, details: { name: item.name, decision, recommendation: item.recommendation, followedRecommendation: decision === item.recommendation }, req });

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Record decision error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/items/:id/decision', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE items SET decision = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user!.userId]
    );

    if (result.rows.length === 0) { res.status(404).json({ error: 'Item not found' }); return; }

    const item = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'decision_cleared', actionType: 'item', resourceType: 'item', resourceId: item.id, details: { name: item.name }, req });

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Clear decision error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get statistics
app.get('/api/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM items WHERE user_id = $1', [req.user!.userId]);
    const recommendationResult = await pool.query(
      `SELECT recommendation, COUNT(*) as count FROM items WHERE user_id = $1 AND recommendation IS NOT NULL GROUP BY recommendation`,
      [req.user!.userId]
    );
    const statusResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM items WHERE user_id = $1 GROUP BY status`,
      [req.user!.userId]
    );

    res.json({ total: parseInt(totalResult.rows[0].total), byRecommendation: recommendationResult.rows, byStatus: statusResult.rows });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= CATEGORIES ROUTES =============

app.get('/api/categories', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT id, name, slug, display_name, icon, color, sort_order, is_default FROM categories ORDER BY sort_order ASC, name ASC');
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ADMIN ROUTES =============

const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user!.userId]);
    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const pendingUsers = await pool.query('SELECT COUNT(*) FROM users WHERE is_approved = false');
    const totalItems = await pool.query('SELECT COUNT(*) FROM items');
    const recentUsers = await pool.query('SELECT id, email, first_name, last_name, is_approved, is_admin, created_at FROM users ORDER BY created_at DESC LIMIT 5');

    res.json({ totalUsers: parseInt(totalUsers.rows[0].count), pendingUsers: parseInt(pendingUsers.rows[0].count), totalItems: parseInt(totalItems.rows[0].count), recentUsers: recentUsers.rows });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin, u.is_approved, u.email_verified, u.created_at,
             (u.llm_api_key IS NOT NULL OR u.anthropic_api_key IS NOT NULL) as has_api_key, u.image_analysis_enabled,
             COUNT(i.id) as item_count
      FROM users u LEFT JOIN items i ON u.id = i.user_id GROUP BY u.id ORDER BY u.created_at DESC
    `);
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/admin/users/:id/approve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('UPDATE users SET is_approved = true, email_verified = true, verification_token = NULL, verification_token_expires = NULL WHERE id = $1 RETURNING email, first_name, last_name', [id]);

    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }

    const user = result.rows[0];
    await emailService.sendTriggeredEmail('account_approved', user.email, { firstName: user.first_name || 'User', lastName: user.last_name || '' });
    await logActivity({ userId: req.user!.userId, action: 'user_approved', actionType: 'admin', resourceType: 'user', resourceId: parseInt(id), details: { approvedUserId: parseInt(id) }, req });

    res.json({ message: 'User approved' });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/users/:id/api-settings', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { anthropic_api_key, llm_api_key, image_analysis_enabled, clear_api_key } = req.body;

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramCount = 1;

    if (clear_api_key) {
      updates.push(`llm_api_key = NULL`);
      updates.push(`anthropic_api_key = NULL`);
    } else {
      const newKey = llm_api_key || anthropic_api_key;
      if (newKey !== undefined && newKey !== '') {
        updates.push(`llm_api_key = $${paramCount++}`); params.push(newKey);
        updates.push(`anthropic_api_key = $${paramCount++}`); params.push(newKey);
      }
    }

    if (image_analysis_enabled !== undefined) {
      updates.push(`image_analysis_enabled = $${paramCount++}`); params.push(image_analysis_enabled);
    }

    if (updates.length === 0) { res.status(400).json({ error: 'No updates provided' }); return; }

    params.push(id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, llm_api_key, anthropic_api_key, image_analysis_enabled`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }

    const user = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'user_api_settings_updated', actionType: 'admin', resourceType: 'user', resourceId: parseInt(id), details: { targetUserId: parseInt(id), apiKeyCleared: !!clear_api_key, apiKeySet: !!(llm_api_key || anthropic_api_key) && !clear_api_key, imageAnalysisEnabled: image_analysis_enabled }, req });

    res.json({ id: user.id, hasApiKey: !!(user.llm_api_key || user.anthropic_api_key), imageAnalysisEnabled: user.image_analysis_enabled !== false });
  } catch (error) {
    console.error('Update user API settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user!.userId) { res.status(400).json({ error: 'Cannot delete your own account' }); return; }

    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [id]);
    const deletedUserInfo = userResult.rows[0];
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    await logActivity({ userId: req.user!.userId, action: 'user_deleted', actionType: 'admin', resourceType: 'user', resourceId: parseInt(id), details: { deletedUserId: parseInt(id), deletedUserEmail: deletedUserInfo?.email }, req });

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get/Update system settings
app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const settings: Record<string, string> = {};
    result.rows.forEach((row: { setting_key: string; setting_value: string }) => { settings[row.setting_key] = row.setting_value; });
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/settings/registration_mode', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    if (!['automatic', 'approval', 'disallowed'].includes(value)) { res.status(400).json({ error: 'Invalid registration mode' }); return; }
    await pool.query('INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP', ['registration_mode', value]);
    res.json({ message: 'Setting updated' });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/settings/require_email_verification', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    if (!['true', 'false'].includes(value)) { res.status(400).json({ error: 'Invalid value. Must be "true" or "false".' }); return; }
    await pool.query('INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP', ['require_email_verification', value]);
    res.json({ message: 'Setting updated' });
  } catch (error) {
    console.error('Update email verification setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/:id/verify-email', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userResult = await pool.query('SELECT id, email FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }

    await pool.query('UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1', [id]);
    await logActivity({ userId: req.user!.userId, action: 'admin_email_verified', actionType: 'ADMIN', resourceType: 'user', resourceId: parseInt(id), details: { verifiedUserId: parseInt(id), verifiedEmail: userResult.rows[0].email }, req });

    res.json({ message: 'User email verified successfully' });
  } catch (error) {
    console.error('Admin verify email error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= SMTP CONFIGURATION ROUTES =============

app.get('/api/admin/smtp', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'smtp_%'");
    const settings: Record<string, string> = {};
    result.rows.forEach((row: { setting_key: string; setting_value: string }) => {
      if (row.setting_key === 'smtp_password') { settings[row.setting_key] = row.setting_value ? '••••••••' : ''; }
      else { settings[row.setting_key] = row.setting_value; }
    });
    res.json(settings);
  } catch (error) {
    console.error('Get SMTP settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/smtp', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_address } = req.body;
    const settings: [string, string][] = [['smtp_host', smtp_host], ['smtp_port', smtp_port], ['smtp_user', smtp_user], ['smtp_from_address', smtp_from_address]];
    if (smtp_password && !smtp_password.includes('•')) { settings.push(['smtp_password', smtp_password]); }

    for (const [key, value] of settings) {
      await pool.query('INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP', [key, value || '']);
    }
    res.json({ message: 'SMTP settings saved' });
  } catch (error) {
    console.error('Save SMTP settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/smtp/test', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await emailService.testConnection();
    res.json(result);
  } catch (error) {
    console.error('Test SMTP error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ============= ADMIN API KEY SETTINGS =============

app.get('/api/admin/api-key', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('anthropic_api_key', 'openai_api_key', 'google_api_key', 'ollama_base_url', 'llm_provider')");
    const settings: Record<string, string> = {};
    result.rows.forEach((row: { setting_key: string; setting_value: string }) => { settings[row.setting_key] = row.setting_value; });

    const dbKey = settings.anthropic_api_key;
    const envKey = process.env.ANTHROPIC_API_KEY;
    const keyPreview = (key: string): string => key ? `...${key.slice(-4)}` : '';

    res.json({
      hasDbKey: !!(dbKey && dbKey.trim()), dbKeyPreview: dbKey ? keyPreview(dbKey) : null,
      hasEnvKey: !!envKey, envKeyPreview: envKey ? keyPreview(envKey) : null,
      activeSource: (dbKey && dbKey.trim()) ? 'database' : (envKey ? 'environment' : 'none'),
      systemProvider: settings.llm_provider || 'anthropic',
      anthropic: { hasDbKey: !!(dbKey && dbKey.trim()), dbKeyPreview: (dbKey && dbKey.trim()) ? keyPreview(dbKey) : null, hasEnvKey: !!envKey },
      openai: { hasDbKey: !!(settings.openai_api_key && settings.openai_api_key.trim()), dbKeyPreview: (settings.openai_api_key && settings.openai_api_key.trim()) ? keyPreview(settings.openai_api_key) : null, hasEnvKey: !!process.env.OPENAI_API_KEY },
      google: { hasDbKey: !!(settings.google_api_key && settings.google_api_key.trim()), dbKeyPreview: (settings.google_api_key && settings.google_api_key.trim()) ? keyPreview(settings.google_api_key) : null, hasEnvKey: !!process.env.GOOGLE_API_KEY },
      ollama: { baseUrl: settings.ollama_base_url || 'http://localhost:11434' },
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/api-key', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { api_key, clear_key, provider, system_provider, ollama_base_url } = req.body;

    if (system_provider && llmProviders.getProvider(system_provider)) {
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('llm_provider', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [system_provider]);
    }

    if (ollama_base_url !== undefined) {
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('ollama_base_url', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [ollama_base_url]);
    }

    const targetProvider = provider || 'anthropic';
    const dbKeyMap: Record<string, string> = { anthropic: 'anthropic_api_key', openai: 'openai_api_key', google: 'google_api_key' };
    const settingKey = dbKeyMap[targetProvider];

    if (clear_key && settingKey) {
      await pool.query("UPDATE system_settings SET setting_value = '', updated_at = CURRENT_TIMESTAMP WHERE setting_key = $1", [settingKey]);
      res.json({ message: `${targetProvider} API key removed`, provider: targetProvider, hasDbKey: false });
      return;
    }

    if (api_key && settingKey) {
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`, [settingKey, api_key]);
      res.json({ message: `${targetProvider} API key saved successfully`, provider: targetProvider, hasDbKey: true, dbKeyPreview: `...${api_key.slice(-4)}` });
      return;
    }

    res.json({ message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ANALYSIS PROMPT ADMIN ROUTES =============

app.get('/api/admin/analysis-prompt', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'analysis_prompt'");
    const storedPrompt = result.rows[0]?.setting_value || '';
    const isCustom = storedPrompt.trim().length > 0;
    res.json({ prompt: isCustom ? storedPrompt : llmProviders.DEFAULT_ANALYSIS_PROMPT, isCustom, defaultPrompt: llmProviders.DEFAULT_ANALYSIS_PROMPT });
  } catch (error) {
    console.error('Error fetching analysis prompt:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/analysis-prompt', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') { res.status(400).json({ error: 'Prompt is required' }); return; }
    if (!prompt.includes('{{categories}}')) { res.status(400).json({ error: 'Prompt must contain the {{categories}} placeholder' }); return; }

    await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('analysis_prompt', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [prompt]);
    await logActivity({ userId: req.user!.userId, action: 'analysis_prompt_updated', actionType: 'ADMIN', resourceType: 'setting', details: { setting: 'analysis_prompt' }, req });
    res.json({ message: 'Analysis prompt saved successfully', isCustom: true });
  } catch (error) {
    console.error('Error saving analysis prompt:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/analysis-prompt', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    await pool.query("UPDATE system_settings SET setting_value = '', updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'analysis_prompt'");
    await logActivity({ userId: req.user!.userId, action: 'analysis_prompt_reset', actionType: 'ADMIN', resourceType: 'setting', details: { setting: 'analysis_prompt' }, req });
    res.json({ message: 'Analysis prompt reset to default', isCustom: false, defaultPrompt: llmProviders.DEFAULT_ANALYSIS_PROMPT });
  } catch (error) {
    console.error('Error resetting analysis prompt:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= RECAPTCHA ADMIN ROUTES =============

app.get('/api/admin/recaptcha', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recaptcha_site_key', 'recaptcha_project_id', 'recaptcha_score_threshold')");
    const settings: Record<string, string> = {};
    result.rows.forEach((row: { setting_key: string; setting_value: string }) => { settings[row.setting_key] = row.setting_value; });

    const dbSiteKey = settings.recaptcha_site_key || '';
    const dbProjectId = settings.recaptcha_project_id || '';
    const scoreThreshold = settings.recaptcha_score_threshold || '0.5';
    const envProjectId = process.env.RECAPTCHA_PROJECT_ID || '';

    const activeSiteKey = (dbSiteKey.trim()) || process.env.REACT_APP_RECAPTCHA_SITE_KEY || '';
    const activeProjectId = (dbProjectId.trim()) || envProjectId;

    res.json({ siteKey: dbSiteKey, projectId: dbProjectId, scoreThreshold, hasEnvProjectId: !!envProjectId, hasCredentials: !!getRecaptchaClient(), enabled: !!(activeSiteKey && activeProjectId && getRecaptchaClient()) });
  } catch (error) {
    console.error('Get recaptcha settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/recaptcha', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { site_key, project_id, score_threshold } = req.body;

    if (site_key !== undefined) {
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('recaptcha_site_key', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [site_key]);
    }
    if (project_id !== undefined) {
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('recaptcha_project_id', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [project_id]);
    }
    if (score_threshold !== undefined) {
      const clamped = Math.min(1.0, Math.max(0.0, parseFloat(score_threshold) || 0.5));
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('recaptcha_score_threshold', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [String(clamped)]);
    }

    await logActivity({ userId: req.user!.userId, action: 'recaptcha_settings_changed', actionType: 'ADMIN', resourceType: 'setting', details: { siteKeyChanged: site_key !== undefined, projectIdChanged: project_id !== undefined, scoreThresholdChanged: score_threshold !== undefined }, req });
    res.json({ message: 'reCAPTCHA settings saved successfully' });
  } catch (error) {
    console.error('Update recaptcha settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= EMAIL TEMPLATES ROUTES =============

app.get('/api/admin/email-templates', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates ORDER BY is_system DESC, name ASC');
    res.json({ templates: result.rows });
  } catch (error) { console.error('Get templates error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/email-templates/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ template: result.rows[0] });
  } catch (error) { console.error('Get template error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/email-templates', authenticateToken, requireAdmin, [
  body('name').trim().notEmpty(), body('subject').trim().notEmpty(), body('body').trim().notEmpty()
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

  try {
    const { name, subject, body: bodyText, description, trigger_event, is_enabled } = req.body;
    const result = await pool.query(
      'INSERT INTO email_templates (name, subject, body, description, trigger_event, is_enabled) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, subject, bodyText, description || null, trigger_event || null, is_enabled !== false]
    );

    const template = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'email_template_created', actionType: 'admin', resourceType: 'email_template', resourceId: template.id, details: { name: template.name, triggerEvent: template.trigger_event }, req });
    res.status(201).json({ template: result.rows[0] });
  } catch (error) {
    if ((error as PgError).code === '23505') { res.status(400).json({ error: 'Template name already exists' }); return; }
    console.error('Create template error:', error); res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/email-templates/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { subject, body: bodyText, description, trigger_event, is_enabled } = req.body;
    const result = await pool.query(
      'UPDATE email_templates SET subject = $1, body = $2, description = $3, trigger_event = $4, is_enabled = $5 WHERE id = $6 RETURNING *',
      [subject, bodyText, description || null, trigger_event || null, is_enabled !== false, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }

    const template = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'email_template_updated', actionType: 'admin', resourceType: 'email_template', resourceId: template.id, details: { name: template.name, triggerEvent: template.trigger_event, enabled: template.is_enabled }, req });
    res.json({ template: result.rows[0] });
  } catch (error) { console.error('Update template error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/email-templates/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const checkResult = await pool.query('SELECT is_system FROM email_templates WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    if (checkResult.rows[0].is_system) { res.status(400).json({ error: 'Cannot delete system templates' }); return; }

    await pool.query('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
    await logActivity({ userId: req.user!.userId, action: 'email_template_deleted', actionType: 'admin', resourceType: 'email_template', resourceId: parseInt(req.params.id), req });
    res.json({ message: 'Template deleted' });
  } catch (error) { console.error('Delete template error:', error); res.status(500).json({ error: 'Server error' }); }
});

// ============= ANNOUNCEMENTS ROUTES =============

app.get('/api/admin/announcements', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT a.*, u.first_name, u.last_name, u.email as creator_email FROM announcements a LEFT JOIN users u ON a.created_by = u.id ORDER BY a.created_at DESC`);
    res.json({ announcements: result.rows });
  } catch (error) { console.error('Get announcements error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT a.*, u.first_name, u.last_name FROM announcements a LEFT JOIN users u ON a.created_by = u.id WHERE a.id = $1`, [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Announcement not found' }); return; }
    res.json({ announcement: result.rows[0] });
  } catch (error) { console.error('Get announcement error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/announcements', authenticateToken, requireAdmin, [body('title').trim().notEmpty(), body('content').trim().notEmpty()], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

  try {
    const { title, content } = req.body;
    const result = await pool.query('INSERT INTO announcements (title, content, created_by) VALUES ($1, $2, $3) RETURNING *', [title, content, req.user!.userId]);
    const announcement = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'announcement_created', actionType: 'admin', resourceType: 'announcement', resourceId: announcement.id, details: { title: announcement.title }, req });
    res.status(201).json({ announcement: result.rows[0] });
  } catch (error) { console.error('Create announcement error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, content } = req.body;
    const checkResult = await pool.query('SELECT sent_at FROM announcements WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) { res.status(404).json({ error: 'Announcement not found' }); return; }
    if (checkResult.rows[0].sent_at) { res.status(400).json({ error: 'Cannot edit an announcement that has already been sent' }); return; }

    const result = await pool.query('UPDATE announcements SET title = $1, content = $2 WHERE id = $3 RETURNING *', [title, content, req.params.id]);
    const announcement = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'announcement_updated', actionType: 'admin', resourceType: 'announcement', resourceId: announcement.id, details: { title: announcement.title }, req });
    res.json({ announcement: result.rows[0] });
  } catch (error) { console.error('Update announcement error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Announcement not found' }); return; }
    const announcement = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'announcement_deleted', actionType: 'admin', resourceType: 'announcement', resourceId: announcement.id, details: { title: announcement.title }, req });
    res.json({ message: 'Announcement deleted' });
  } catch (error) { console.error('Delete announcement error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/announcements/:id/send', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const checkResult = await pool.query('SELECT sent_at FROM announcements WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) { res.status(404).json({ error: 'Announcement not found' }); return; }
    if (checkResult.rows[0].sent_at) { res.status(400).json({ error: 'Announcement has already been sent' }); return; }

    const result = await emailService.sendAnnouncement(parseInt(req.params.id));
    if (result.success) {
      await logActivity({ userId: req.user!.userId, action: 'announcement_sent', actionType: 'admin', resourceType: 'announcement', resourceId: parseInt(req.params.id), details: { sentCount: result.sentCount, totalUsers: result.totalUsers }, req });
      res.json({ message: `Announcement sent to ${result.sentCount} users`, sentCount: result.sentCount, totalUsers: result.totalUsers });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) { console.error('Send announcement error:', error); res.status(500).json({ error: 'Server error' }); }
});

// ============= ADMIN API USAGE ROUTES =============

app.get('/api/admin/api-usage/stats', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const totalUsageResult = await pool.query(`
      SELECT COUNT(*) as total_calls, SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls, SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens, COALESCE(SUM(output_tokens), 0) as total_output_tokens, COALESCE(SUM(estimated_cost), 0) as total_cost,
        COALESCE(SUM(CASE WHEN used_user_key THEN estimated_cost ELSE 0 END), 0) as user_key_cost, COALESCE(SUM(CASE WHEN NOT used_user_key THEN estimated_cost ELSE 0 END), 0) as system_key_cost
      FROM api_usage_logs WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);

    const dailyUsageResult = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as calls, SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed, COALESCE(SUM(estimated_cost), 0) as cost
      FROM api_usage_logs WHERE created_at >= date_trunc('month', CURRENT_DATE) GROUP BY DATE(created_at) ORDER BY DATE(created_at)
    `);

    const topUsersResult = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, COUNT(*) as total_calls, COALESCE(SUM(a.estimated_cost), 0) as total_cost, SUM(CASE WHEN a.used_user_key THEN 1 ELSE 0 END) as user_key_calls
      FROM api_usage_logs a JOIN users u ON a.user_id = u.id WHERE a.created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY u.id, u.email, u.first_name, u.last_name ORDER BY total_cost DESC LIMIT 10
    `);

    const settingsResult = await pool.query(`SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'api_%'`);
    const settings: Record<string, string> = {};
    settingsResult.rows.forEach((row: { setting_key: string; setting_value: string }) => { settings[row.setting_key] = row.setting_value; });

    const stats = totalUsageResult.rows[0];
    res.json({
      currentMonth: {
        totalCalls: parseInt(stats.total_calls), successfulCalls: parseInt(stats.successful_calls), failedCalls: parseInt(stats.failed_calls),
        successRate: stats.total_calls > 0 ? ((stats.successful_calls / stats.total_calls) * 100).toFixed(1) : 0,
        totalInputTokens: parseInt(stats.total_input_tokens), totalOutputTokens: parseInt(stats.total_output_tokens),
        totalCost: parseFloat(stats.total_cost).toFixed(4), userKeyCost: parseFloat(stats.user_key_cost).toFixed(4), systemKeyCost: parseFloat(stats.system_key_cost).toFixed(4)
      },
      dailyUsage: dailyUsageResult.rows.map(row => ({ date: row.date, calls: parseInt(row.calls), successful: parseInt(row.successful), failed: parseInt(row.failed), cost: parseFloat(row.cost).toFixed(4) })),
      topUsers: topUsersResult.rows.map(row => ({ id: row.id, email: row.email, name: `${row.first_name} ${row.last_name}`, totalCalls: parseInt(row.total_calls), totalCost: parseFloat(row.total_cost).toFixed(4), userKeyCalls: parseInt(row.user_key_calls) })),
      settings: { monthlyLimit: parseFloat(settings.api_monthly_cost_limit || '50'), perUserLimit: parseFloat(settings.api_per_user_monthly_limit || '10'), alertThreshold: parseInt(settings.api_alert_threshold_percent || '80'), alertsEnabled: settings.api_usage_alerts_enabled === 'true' }
    });
  } catch (error) { console.error('Get API usage stats error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/api-usage/logs', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const logsResult = await pool.query(`SELECT a.*, u.email, u.first_name, u.last_name FROM api_usage_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    const countResult = await pool.query('SELECT COUNT(*) FROM api_usage_logs');
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({ logs: logsResult.rows, pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) } });
  } catch (error) { console.error('Get API usage logs error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/api-usage/settings', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { monthlyLimit, perUserLimit, alertThreshold, alertsEnabled } = req.body;
    const updates: [string, string][] = [
      ['api_monthly_cost_limit', monthlyLimit?.toString()], ['api_per_user_monthly_limit', perUserLimit?.toString()],
      ['api_alert_threshold_percent', alertThreshold?.toString()], ['api_usage_alerts_enabled', alertsEnabled?.toString()]
    ].filter(([, value]) => value !== undefined) as [string, string][];

    for (const [key, value] of updates) {
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`, [key, value]);
    }
    res.json({ message: 'Settings updated successfully' });
  } catch (error) { console.error('Update API usage settings error:', error); res.status(500).json({ error: 'Server error' }); }
});

// ============= ADMIN CATEGORIES ROUTES =============

app.get('/api/admin/categories', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT c.*, COUNT(i.id) as item_count FROM categories c LEFT JOIN items i ON LOWER(i.category) = LOWER(c.slug) GROUP BY c.id ORDER BY c.sort_order ASC, c.name ASC`);
    res.json({ categories: result.rows });
  } catch (error) { console.error('Get admin categories error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/categories/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }
    res.json({ category: result.rows[0] });
  } catch (error) { console.error('Get category error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/categories', authenticateToken, requireAdmin, [body('name').trim().notEmpty(), body('display_name').trim().notEmpty()], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

  try {
    const { name, display_name, icon, color, sort_order, is_default } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (is_default) { await pool.query('UPDATE categories SET is_default = false WHERE is_default = true'); }

    const newSortOrder = sort_order || 0;
    if (newSortOrder > 0) {
      await pool.query('UPDATE categories SET sort_order = sort_order + 1 WHERE sort_order >= $1', [newSortOrder]);
    }

    const result = await pool.query(
      `INSERT INTO categories (name, slug, display_name, icon, color, sort_order, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, slug, display_name, icon || null, color || null, newSortOrder, is_default || false]
    );
    const category = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'category_created', actionType: 'admin', resourceType: 'category', resourceId: category.id, details: { name: category.name, displayName: category.display_name }, req });
    res.status(201).json({ category: result.rows[0] });
  } catch (error) {
    if ((error as PgError).code === '23505') { res.status(400).json({ error: 'Category name or slug already exists' }); return; }
    console.error('Create category error:', error); res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/categories/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, display_name, icon, color, sort_order, is_default } = req.body;
    const slug = name ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : undefined;

    const currentResult = await pool.query('SELECT slug, sort_order FROM categories WHERE id = $1', [req.params.id]);
    if (currentResult.rows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }
    const oldSlug = currentResult.rows[0].slug;
    const oldSortOrder = currentResult.rows[0].sort_order;

    if (is_default) { await pool.query('UPDATE categories SET is_default = false WHERE is_default = true AND id != $1', [req.params.id]); }

    if (sort_order != null && sort_order !== oldSortOrder) {
      await pool.query('UPDATE categories SET sort_order = sort_order + 1 WHERE sort_order >= $1 AND id != $2', [sort_order, req.params.id]);
    }

    const result = await pool.query(
      `UPDATE categories SET name = COALESCE($1, name), slug = COALESCE($2, slug), display_name = COALESCE($3, display_name), icon = COALESCE($4, icon), color = COALESCE($5, color), sort_order = COALESCE($6, sort_order), is_default = COALESCE($7, is_default) WHERE id = $8 RETURNING *`,
      [name, slug, display_name, icon, color, sort_order, is_default, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }

    if (slug && slug !== oldSlug) { await pool.query('UPDATE items SET category = $1 WHERE LOWER(category) = LOWER($2)', [slug, oldSlug]); }

    const updatedCategory = result.rows[0];
    await logActivity({ userId: req.user!.userId, action: 'category_updated', actionType: 'admin', resourceType: 'category', resourceId: updatedCategory.id, details: { name: updatedCategory.name, displayName: updatedCategory.display_name }, req });
    res.json({ category: result.rows[0] });
  } catch (error) {
    if ((error as PgError).code === '23505') { res.status(400).json({ error: 'Category name or slug already exists' }); return; }
    console.error('Update category error:', error); res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/categories/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (categoryResult.rows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }
    const category = categoryResult.rows[0];
    if (category.is_default) { res.status(400).json({ error: 'Cannot delete the default category' }); return; }

    const defaultResult = await pool.query('SELECT slug FROM categories WHERE is_default = true');
    const defaultSlug = defaultResult.rows.length > 0 ? defaultResult.rows[0].slug : 'other';
    await pool.query('UPDATE items SET category = $1 WHERE LOWER(category) = LOWER($2)', [defaultSlug, category.slug]);
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);

    await logActivity({ userId: req.user!.userId, action: 'category_deleted', actionType: 'admin', resourceType: 'category', resourceId: parseInt(req.params.id), details: { name: category.name, movedToCategory: defaultSlug }, req });
    res.json({ message: 'Category deleted successfully', movedToCategory: defaultSlug });
  } catch (error) { console.error('Delete category error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/categories/merge', authenticateToken, requireAdmin, [body('sourceId').isInt(), body('targetId').isInt()], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

  try {
    const { sourceId, targetId } = req.body;
    if (sourceId === targetId) { res.status(400).json({ error: 'Source and target categories must be different' }); return; }

    const sourceResult = await pool.query('SELECT * FROM categories WHERE id = $1', [sourceId]);
    const targetResult = await pool.query('SELECT * FROM categories WHERE id = $1', [targetId]);
    if (sourceResult.rows.length === 0) { res.status(404).json({ error: 'Source category not found' }); return; }
    if (targetResult.rows.length === 0) { res.status(404).json({ error: 'Target category not found' }); return; }

    const sourceCategory = sourceResult.rows[0];
    const targetCategory = targetResult.rows[0];
    if (sourceCategory.is_default) { res.status(400).json({ error: 'Cannot merge the default category' }); return; }

    const updateResult = await pool.query('UPDATE items SET category = $1 WHERE LOWER(category) = LOWER($2)', [targetCategory.slug, sourceCategory.slug]);
    await pool.query('DELETE FROM categories WHERE id = $1', [sourceId]);

    await logActivity({ userId: req.user!.userId, action: 'categories_merged', actionType: 'admin', resourceType: 'category', resourceId: targetId, details: { sourceCategory: sourceCategory.name, targetCategory: targetCategory.name, itemsMoved: updateResult.rowCount }, req });
    res.json({ message: 'Categories merged successfully', itemsMoved: updateResult.rowCount, targetCategory });
  } catch (error) { console.error('Merge categories error:', error); res.status(500).json({ error: 'Server error' }); }
});

// ============= NOTIFICATION PREFERENCES ROUTES =============

app.get('/api/notification-preferences', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notification_preferences WHERE user_id = $1', [req.user!.userId]);
    if (result.rows.length === 0) {
      res.json({ preferences: { announcements: true, account_updates: true, item_recommendations: true, weekly_digest: false } });
    } else {
      res.json({ preferences: result.rows[0] });
    }
  } catch (error) { console.error('Get notification preferences error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/notification-preferences', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { announcements, account_updates, item_recommendations, weekly_digest } = req.body;
    const result = await pool.query(`
      INSERT INTO notification_preferences (user_id, announcements, account_updates, item_recommendations, weekly_digest)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET announcements = $2, account_updates = $3, item_recommendations = $4, weekly_digest = $5, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [req.user!.userId, announcements, account_updates, item_recommendations, weekly_digest]);
    res.json({ preferences: result.rows[0] });
  } catch (error) { console.error('Update notification preferences error:', error); res.status(500).json({ error: 'Server error' }); }
});

// User API settings
app.get('/api/user/api-settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT anthropic_api_key, image_analysis_enabled, llm_provider, llm_api_key FROM users WHERE id = $1', [req.user!.userId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }

    const user = result.rows[0];
    const activeKey = user.llm_api_key || user.anthropic_api_key;
    res.json({ hasApiKey: !!activeKey, apiKeyPreview: activeKey ? `...${activeKey.slice(-4)}` : null, imageAnalysisEnabled: user.image_analysis_enabled !== false, llmProvider: user.llm_provider || 'anthropic' });
  } catch (error) { console.error('Get API settings error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/user/api-settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { anthropic_api_key, llm_api_key, image_analysis_enabled, clear_api_key, llm_provider } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramCount = 1;

    if (clear_api_key) { updates.push(`llm_api_key = NULL`); updates.push(`anthropic_api_key = NULL`); }
    else {
      const newKey = llm_api_key || anthropic_api_key;
      if (newKey !== undefined && newKey !== '') { updates.push(`llm_api_key = $${paramCount++}`); params.push(newKey); updates.push(`anthropic_api_key = $${paramCount++}`); params.push(newKey); }
    }

    if (llm_provider !== undefined && llmProviders.getProvider(llm_provider)) { updates.push(`llm_provider = $${paramCount++}`); params.push(llm_provider); }
    if (image_analysis_enabled !== undefined) { updates.push(`image_analysis_enabled = $${paramCount++}`); params.push(image_analysis_enabled); }
    if (updates.length === 0) { res.status(400).json({ error: 'No updates provided' }); return; }

    params.push(req.user!.userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING llm_api_key, anthropic_api_key, image_analysis_enabled, llm_provider`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    const user = result.rows[0];
    const activeKey = user.llm_api_key || user.anthropic_api_key;
    res.json({ hasApiKey: !!activeKey, apiKeyPreview: activeKey ? `...${activeKey.slice(-4)}` : null, imageAnalysisEnabled: user.image_analysis_enabled !== false, llmProvider: user.llm_provider || 'anthropic' });
  } catch (error) { console.error('Update API settings error:', error); res.status(500).json({ error: 'Server error' }); }
});

// Household members
app.get('/api/household-members', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT id, name, relationship, created_at FROM household_members WHERE user_id = $1 ORDER BY name', [req.user!.userId]);
    res.json({ members: result.rows });
  } catch (error) { console.error('Get household members error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/household-members', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name, relationship } = req.body;
    if (!name || !name.trim()) { res.status(400).json({ error: 'Name is required' }); return; }
    const result = await pool.query('INSERT INTO household_members (user_id, name, relationship) VALUES ($1, $2, $3) RETURNING id, name, relationship, created_at', [req.user!.userId, name.trim(), relationship || null]);
    res.status(201).json(result.rows[0]);
  } catch (error) { console.error('Add household member error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/household-members/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, relationship } = req.body;
    if (!name || !name.trim()) { res.status(400).json({ error: 'Name is required' }); return; }
    const result = await pool.query('UPDATE household_members SET name = $1, relationship = $2 WHERE id = $3 AND user_id = $4 RETURNING id, name, relationship, created_at', [name.trim(), relationship || null, id, req.user!.userId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Household member not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) { console.error('Update household member error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/household-members/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM household_members WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user!.userId]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Household member not found' }); return; }
    res.json({ success: true });
  } catch (error) { console.error('Delete household member error:', error); res.status(500).json({ error: 'Server error' }); }
});

// ============= RECOMMENDATION SETTINGS ROUTES =============

app.get('/api/admin/recommendations', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recommendation_weights', 'recommendation_thresholds', 'recommendation_strategies')");
    const settings: Record<string, unknown> = {};
    result.rows.forEach((row: { setting_key: string; setting_value: string }) => {
      try { settings[row.setting_key] = JSON.parse(row.setting_value); } catch (e) { settings[row.setting_key] = row.setting_value; }
    });
    res.json(settings);
  } catch (error) { console.error('Get recommendation settings error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/recommendations/weights', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { weights } = req.body;
    if (!weights || typeof weights !== 'object') { res.status(400).json({ error: 'Invalid weights data' }); return; }
    await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('recommendation_weights', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [JSON.stringify(weights)]);
    await logActivity({ userId: req.user!.userId, action: 'recommendation_weights_updated', actionType: 'admin', resourceType: 'settings', details: { settingType: 'weights' }, req });
    res.json({ message: 'Weights updated successfully' });
  } catch (error) { console.error('Update recommendation weights error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/recommendations/thresholds', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { thresholds } = req.body;
    if (!thresholds || typeof thresholds !== 'object') { res.status(400).json({ error: 'Invalid thresholds data' }); return; }
    await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('recommendation_thresholds', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [JSON.stringify(thresholds)]);
    await logActivity({ userId: req.user!.userId, action: 'recommendation_thresholds_updated', actionType: 'admin', resourceType: 'settings', details: { settingType: 'thresholds' }, req });
    res.json({ message: 'Thresholds updated successfully' });
  } catch (error) { console.error('Update recommendation thresholds error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/recommendations/strategies', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { strategies } = req.body;
    if (!strategies || typeof strategies !== 'object') { res.status(400).json({ error: 'Invalid strategies data' }); return; }
    await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('recommendation_strategies', $1) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`, [JSON.stringify(strategies)]);
    await logActivity({ userId: req.user!.userId, action: 'recommendation_strategies_updated', actionType: 'admin', resourceType: 'settings', details: { settingType: 'strategies', activeStrategy: strategies.active }, req });
    res.json({ message: 'Strategies updated successfully' });
  } catch (error) { console.error('Update recommendation strategies error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/recommendations/settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recommendation_weights', 'recommendation_thresholds', 'recommendation_strategies')");
    const settings: Record<string, unknown> = {};
    result.rows.forEach((row: { setting_key: string; setting_value: string }) => {
      try { settings[row.setting_key] = JSON.parse(row.setting_value); } catch (e) { settings[row.setting_key] = row.setting_value; }
    });

    const strategies = (settings.recommendation_strategies || {}) as Record<string, unknown>;
    let activeStrategy = (strategies.active as string) || 'balanced';

    if (strategies.abTestEnabled && strategies.abTestPercentage) {
      const userIdHash = req.user!.userId % 100;
      if (userIdHash >= (strategies.abTestPercentage as number)) {
        activeStrategy = (strategies.abTestAlternate as string) || activeStrategy;
      }
    }

    res.json({ weights: settings.recommendation_weights, thresholds: settings.recommendation_thresholds, activeStrategy, strategyConfig: (strategies.strategies as Record<string, unknown>)?.[activeStrategy] || null });
  } catch (error) { console.error('Get recommendation settings error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/recommendations/reset', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { settingType } = req.body;
    const defaults: Record<string, unknown> = {
      recommendation_weights: { usage: { yes: { keep: 3, accessible: 2 }, rarely: { storage: 2, accessible: 1 }, no: { donate: 2, sell: 1, discard: 1 } }, sentimental: { high: { keep: 3, storage: 2 }, some: { keep: 1, storage: 2 }, none: { sell: 1, donate: 1 } }, condition: { excellent: { keep: 1, sell: 2, donate: 1 }, good: { keep: 1, sell: 2, donate: 1 }, fair: { donate: 2, discard: 1 }, poor: { discard: 3 } }, value: { high: { keep: 2, sell: 3 }, medium: { sell: 2, donate: 1 }, low: { donate: 2, discard: 1 } }, replaceability: { difficult: { keep: 2, storage: 2 }, moderate: { storage: 1 }, easy: { donate: 1, discard: 1 } }, space: { yes: { keep: 2, accessible: 3 }, limited: { storage: 2 }, no: { storage: 1, sell: 1, donate: 1 } } },
      recommendation_thresholds: { minimumScoreDifference: 2, tieBreakOrder: ['keep', 'accessible', 'storage', 'sell', 'donate', 'discard'] },
      recommendation_strategies: { active: 'balanced', abTestEnabled: false, abTestPercentage: 50, strategies: { balanced: { name: 'Balanced', description: 'Equal consideration of all factors', multipliers: { usage: 1, sentimental: 1, condition: 1, value: 1, replaceability: 1, space: 1 } }, minimalist: { name: 'Minimalist', description: 'Favors letting go of items', multipliers: { usage: 1.5, sentimental: 0.5, condition: 1, value: 0.8, replaceability: 0.7, space: 1.5 } }, sentimental: { name: 'Sentimental', description: 'Prioritizes emotional attachment', multipliers: { usage: 0.8, sentimental: 2, condition: 0.8, value: 0.5, replaceability: 1.5, space: 0.7 } }, practical: { name: 'Practical', description: 'Focuses on usage and condition', multipliers: { usage: 2, sentimental: 0.5, condition: 1.5, value: 1, replaceability: 1, space: 1.2 } }, financial: { name: 'Financial', description: 'Maximizes monetary value recovery', multipliers: { usage: 0.8, sentimental: 0.5, condition: 1.5, value: 2, replaceability: 0.8, space: 0.8 } } } }
    };

    if (settingType && defaults[settingType]) {
      await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`, [settingType, JSON.stringify(defaults[settingType])]);
    } else {
      for (const [key, value] of Object.entries(defaults)) {
        await pool.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`, [key, JSON.stringify(value)]);
      }
    }

    await logActivity({ userId: req.user!.userId, action: 'recommendation_settings_reset', actionType: 'admin', resourceType: 'settings', details: { settingType: settingType || 'all' }, req });
    res.json({ message: 'Settings reset to defaults' });
  } catch (error) { console.error('Reset recommendation settings error:', error); res.status(500).json({ error: 'Server error' }); }
});

// ============================================
// ANALYTICS DASHBOARD ENDPOINTS
// ============================================

app.get('/api/admin/analytics/item-trends', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period as string) || 30;

    const itemsPerDay = await pool.query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' GROUP BY DATE(created_at) ORDER BY date ASC`);
    const recommendationsByType = await pool.query(`SELECT DATE(created_at) as date, recommendation, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation IS NOT NULL GROUP BY DATE(created_at), recommendation ORDER BY date ASC`);
    const recommendationTotals = await pool.query(`SELECT recommendation, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation IS NOT NULL GROUP BY recommendation ORDER BY count DESC`);

    res.json({ itemsPerDay: itemsPerDay.rows, recommendationsByType: recommendationsByType.rows, recommendationTotals: recommendationTotals.rows, period: daysAgo });
  } catch (error) { console.error('Item trends error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/analytics/user-activity', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period as string) || 30;

    const activeUsers = await pool.query(`SELECT COUNT(DISTINCT user_id) as active_users FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'`);
    const totalUsers = await pool.query(`SELECT COUNT(*) as total_users FROM users WHERE is_approved = true`);
    const itemsPerUser = await pool.query(`SELECT u.id, u.first_name, u.last_name, COUNT(i.id) as item_count FROM users u LEFT JOIN items i ON u.id = i.user_id AND i.created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' WHERE u.is_approved = true GROUP BY u.id, u.first_name, u.last_name ORDER BY item_count DESC LIMIT 10`);
    const avgItemsResult = await pool.query(`SELECT COALESCE(AVG(item_count), 0) as avg_items, COALESCE(MAX(item_count), 0) as max_items, COALESCE(MIN(NULLIF(item_count, 0)), 0) as min_items FROM (SELECT user_id, COUNT(*) as item_count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' GROUP BY user_id) subq`);
    const registrations = await pool.query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' GROUP BY DATE(created_at) ORDER BY date ASC`);

    res.json({
      activeUsers: parseInt(activeUsers.rows[0]?.active_users) || 0, totalUsers: parseInt(totalUsers.rows[0]?.total_users) || 0,
      topUsers: itemsPerUser.rows, averageItemsPerUser: parseFloat(avgItemsResult.rows[0]?.avg_items) || 0,
      maxItemsPerUser: parseInt(avgItemsResult.rows[0]?.max_items) || 0, minItemsPerUser: parseInt(avgItemsResult.rows[0]?.min_items) || 0,
      registrations: registrations.rows, period: daysAgo
    });
  } catch (error) { console.error('User activity error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/analytics/categories', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period as string) || 30;

    const categoryDistribution = await pool.query(`SELECT COALESCE(category, 'Uncategorized') as category, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' GROUP BY category ORDER BY count DESC`);
    const categoryTrends = await pool.query(`SELECT DATE(created_at) as date, COALESCE(category, 'Uncategorized') as category, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' GROUP BY DATE(created_at), category ORDER BY date ASC`);
    const recommendationsByCategory = await pool.query(`SELECT COALESCE(category, 'Uncategorized') as category, recommendation, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation IS NOT NULL GROUP BY category, recommendation ORDER BY category, count DESC`);

    res.json({ distribution: categoryDistribution.rows, trends: categoryTrends.rows, recommendationsByCategory: recommendationsByCategory.rows, period: daysAgo });
  } catch (error) { console.error('Category analytics error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/analytics/conversions', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period as string) || 30;

    const conversionData = await pool.query(`SELECT recommendation, decision, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation IS NOT NULL AND decision IS NOT NULL GROUP BY recommendation, decision ORDER BY recommendation, count DESC`);
    const overallConversion = await pool.query(`SELECT COUNT(CASE WHEN recommendation = decision THEN 1 END) as followed, COUNT(CASE WHEN recommendation != decision THEN 1 END) as diverged, COUNT(*) as total FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation IS NOT NULL AND decision IS NOT NULL`);
    const conversionByType = await pool.query(`SELECT recommendation, COUNT(CASE WHEN recommendation = decision THEN 1 END) as followed, COUNT(CASE WHEN recommendation != decision THEN 1 END) as diverged, COUNT(*) as total FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation IS NOT NULL AND decision IS NOT NULL GROUP BY recommendation ORDER BY total DESC`);
    const pendingDecisions = await pool.query(`SELECT recommendation, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation IS NOT NULL AND decision IS NULL GROUP BY recommendation ORDER BY count DESC`);
    const modifiedRecommendations = await pool.query(`SELECT original_recommendation, recommendation as modified_to, COUNT(*) as count FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND original_recommendation IS NOT NULL AND recommendation IS NOT NULL AND original_recommendation != recommendation GROUP BY original_recommendation, recommendation ORDER BY count DESC`);

    const overall = overallConversion.rows[0] || { followed: 0, diverged: 0, total: 0 };
    const followRate = overall.total > 0 ? (overall.followed / overall.total * 100).toFixed(1) : '0';

    res.json({
      conversionMatrix: conversionData.rows,
      overall: { followed: parseInt(overall.followed) || 0, diverged: parseInt(overall.diverged) || 0, total: parseInt(overall.total) || 0, followRate: parseFloat(followRate) },
      byRecommendationType: conversionByType.rows, pendingDecisions: pendingDecisions.rows,
      modifiedRecommendations: modifiedRecommendations.rows, period: daysAgo
    });
  } catch (error) { console.error('Conversion analytics error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/analytics/summary', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period as string) || 30;

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days') as items_added,
        (SELECT COUNT(DISTINCT user_id) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days') as active_users,
        (SELECT COUNT(*) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND decision IS NOT NULL) as decisions_made,
        (SELECT COUNT(*) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation = decision) as recommendations_followed,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days') as new_users
    `);

    const s = stats.rows[0];
    const followRate = s.decisions_made > 0 ? ((s.recommendations_followed / s.decisions_made) * 100).toFixed(1) : '0';

    res.json({ itemsAdded: parseInt(s.items_added) || 0, activeUsers: parseInt(s.active_users) || 0, decisionsMade: parseInt(s.decisions_made) || 0, recommendationsFollowed: parseInt(s.recommendations_followed) || 0, followRate: parseFloat(followRate), newUsers: parseInt(s.new_users) || 0, period: daysAgo });
  } catch (error) { console.error('Analytics summary error:', error); res.status(500).json({ error: 'Server error' }); }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Multer error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') { res.status(400).json({ error: 'File too large. Maximum size is 5MB.' }); return; }
    res.status(400).json({ error: `Upload error: ${err.message}` }); return;
  } else if (err) {
    console.error('Upload error:', err.message);
    res.status(400).json({ error: err.message }); return;
  }
  next();
});

// ============================================
// ACTIVITY LOGS ENDPOINTS
// ============================================

app.get('/api/admin/activity-logs', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '50', actionType, action, userId, startDate, endDate, search } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const params: (string | number)[] = [];
    let paramCount = 1;
    const conditions: string[] = [];

    if (actionType) { conditions.push(`al.action_type = $${paramCount++}`); params.push(actionType as string); }
    if (action) { conditions.push(`al.action = $${paramCount++}`); params.push(action as string); }
    if (userId) { conditions.push(`al.user_id = $${paramCount++}`); params.push(parseInt(userId as string)); }
    if (startDate) { conditions.push(`al.created_at >= $${paramCount++}`); params.push(startDate as string); }
    if (endDate) { conditions.push(`al.created_at <= $${paramCount++}`); params.push(endDate as string); }
    if (search) { conditions.push(`(al.action ILIKE $${paramCount} OR al.details::text ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`); params.push(`%${search}%`); paramCount++; }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) as total FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    params.push(parseInt(limit as string), offset);
    const result = await pool.query(
      `SELECT al.*, u.email as user_email, u.first_name, u.last_name FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ${whereClause} ORDER BY al.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    res.json({ logs: result.rows, pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total, totalPages: Math.ceil(total / parseInt(limit as string)) } });
  } catch (error) { console.error('Get activity logs error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/activity-logs/stats', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { period = '7' } = req.query;
    const daysAgo = parseInt(period as string) || 7;

    const typeCountsResult = await pool.query(`SELECT action_type, COUNT(*) as count FROM activity_logs WHERE created_at >= NOW() - INTERVAL '${daysAgo} days' GROUP BY action_type ORDER BY count DESC`);
    const actionCountsResult = await pool.query(`SELECT action, COUNT(*) as count FROM activity_logs WHERE created_at >= NOW() - INTERVAL '${daysAgo} days' GROUP BY action ORDER BY count DESC LIMIT 10`);
    const dailyResult = await pool.query(`SELECT DATE(created_at) as date, COUNT(*) as total, COUNT(CASE WHEN action_type = 'user' THEN 1 END) as user_actions, COUNT(CASE WHEN action_type = 'item' THEN 1 END) as item_actions, COUNT(CASE WHEN action_type = 'admin' THEN 1 END) as admin_actions, COUNT(CASE WHEN action_type = 'system' THEN 1 END) as system_events FROM activity_logs WHERE created_at >= NOW() - INTERVAL '${daysAgo} days' GROUP BY DATE(created_at) ORDER BY date`);
    const activeUsersResult = await pool.query(`SELECT u.id, u.email, u.first_name, u.last_name, COUNT(*) as action_count FROM activity_logs al JOIN users u ON al.user_id = u.id WHERE al.created_at >= NOW() - INTERVAL '${daysAgo} days' GROUP BY u.id, u.email, u.first_name, u.last_name ORDER BY action_count DESC LIMIT 5`);
    const failedLoginsResult = await pool.query(`SELECT details->>'email' as email, details->>'reason' as reason, ip_address, created_at FROM activity_logs WHERE action = 'login_failed' AND created_at >= NOW() - INTERVAL '${daysAgo} days' ORDER BY created_at DESC LIMIT 10`);

    res.json({ period: daysAgo, typeCounts: typeCountsResult.rows, actionCounts: actionCountsResult.rows, dailyActivity: dailyResult.rows, mostActiveUsers: activeUsersResult.rows, recentFailedLogins: failedLoginsResult.rows });
  } catch (error) { console.error('Get activity logs stats error:', error); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/activity-logs/filters', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const actionTypesResult = await pool.query(`SELECT DISTINCT action_type FROM activity_logs ORDER BY action_type`);
    const actionsResult = await pool.query(`SELECT DISTINCT action FROM activity_logs ORDER BY action`);
    res.json({ actionTypes: actionTypesResult.rows.map((r: { action_type: string }) => r.action_type), actions: actionsResult.rows.map((r: { action: string }) => r.action) });
  } catch (error) { console.error('Get activity logs filters error:', error); res.status(500).json({ error: 'Server error' }); }
});

// System Health Dashboard
app.get('/api/admin/system-health', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString();
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    let dbConnected = true;
    let dbLatencyMs = 0;
    let poolStats: Record<string, number> = {};
    let databaseSize = '0 B';
    let databaseSizeBytes = 0;
    const tableCounts: Record<string, number> = {};
    let tableSizes: { table: string; size: string; sizeBytes: number }[] = [];

    try {
      poolStats = { poolTotal: (pool as unknown as Record<string, number>).totalCount || 0, poolIdle: (pool as unknown as Record<string, number>).idleCount || 0, poolActive: ((pool as unknown as Record<string, number>).totalCount || 0) - ((pool as unknown as Record<string, number>).idleCount || 0), poolWaiting: (pool as unknown as Record<string, number>).waitingCount || 0 };

      const latencyStart = Date.now();
      await pool.query('SELECT 1');
      dbLatencyMs = Date.now() - latencyStart;

      const [dbSizeResult, tableSizesResult, ...countResults] = await Promise.all([
        pool.query('SELECT pg_database_size(current_database()) as size'),
        pool.query(`SELECT relname as table_name, pg_total_relation_size(c.oid) as size_bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname = 'public' ORDER BY pg_total_relation_size(c.oid) DESC`),
        pool.query('SELECT COUNT(*) FROM users'), pool.query('SELECT COUNT(*) FROM items'), pool.query('SELECT COUNT(*) FROM activity_logs'),
        pool.query('SELECT COUNT(*) FROM api_usage_logs'), pool.query('SELECT COUNT(*) FROM categories'), pool.query('SELECT COUNT(*) FROM announcements'), pool.query('SELECT COUNT(*) FROM email_templates')
      ]);

      databaseSizeBytes = parseInt(dbSizeResult.rows[0].size);
      databaseSize = formatBytes(databaseSizeBytes);
      tableSizes = tableSizesResult.rows.map((row: { table_name: string; size_bytes: string }) => ({ table: row.table_name, size: formatBytes(parseInt(row.size_bytes)), sizeBytes: parseInt(row.size_bytes) }));

      const tableNames = ['users', 'items', 'activity_logs', 'api_usage_logs', 'categories', 'announcements', 'email_templates'];
      tableNames.forEach((name, i) => { tableCounts[name] = parseInt(countResults[i].rows[0].count); });
    } catch (dbError) { console.error('System health DB check error:', dbError); dbConnected = false; }

    const endpoints: { name: string; endpoint: string; status: string; latencyMs: number | null }[] = [];

    // Health check endpoint
    try {
      const healthStart = Date.now();
      await new Promise<void>((resolve, reject) => {
        const httpReq = http.get(`http://localhost:${PORT}/health`, (resp) => {
          let data = '';
          resp.on('data', (chunk: string) => data += chunk);
          resp.on('end', () => { if (resp.statusCode === 200) resolve(); else reject(new Error(`Status ${resp.statusCode}`)); });
        });
        httpReq.on('error', reject);
        httpReq.setTimeout(5000, () => { httpReq.destroy(); reject(new Error('Timeout')); });
      });
      endpoints.push({ name: 'Health Check', endpoint: '/health', status: 'healthy', latencyMs: Date.now() - healthStart });
    } catch (e) { endpoints.push({ name: 'Health Check', endpoint: '/health', status: 'down', latencyMs: null }); }

    // Admin stats endpoint
    try {
      const statsStart = Date.now();
      const token = req.headers['authorization']?.split(' ')[1];
      await new Promise<void>((resolve, reject) => {
        const r = http.get(`http://localhost:${PORT}/api/admin/stats`, { headers: { 'Authorization': `Bearer ${token}` } }, (resp) => {
          let data = '';
          resp.on('data', (chunk: string) => data += chunk);
          resp.on('end', () => { if (resp.statusCode === 200) resolve(); else reject(new Error(`Status ${resp.statusCode}`)); });
        });
        r.on('error', reject);
        r.setTimeout(5000, () => { r.destroy(); reject(new Error('Timeout')); });
      });
      endpoints.push({ name: 'Admin Stats', endpoint: '/api/admin/stats', status: 'healthy', latencyMs: Date.now() - statsStart });
    } catch (e) { endpoints.push({ name: 'Admin Stats', endpoint: '/api/admin/stats', status: 'down', latencyMs: null }); }

    // API Usage stats endpoint
    try {
      const apiStart = Date.now();
      const token = req.headers['authorization']?.split(' ')[1];
      await new Promise<void>((resolve, reject) => {
        const r = http.get(`http://localhost:${PORT}/api/admin/api-usage/stats`, { headers: { 'Authorization': `Bearer ${token}` } }, (resp) => {
          let data = '';
          resp.on('data', (chunk: string) => data += chunk);
          resp.on('end', () => { if (resp.statusCode === 200) resolve(); else reject(new Error(`Status ${resp.statusCode}`)); });
        });
        r.on('error', reject);
        r.setTimeout(5000, () => { r.destroy(); reject(new Error('Timeout')); });
      });
      endpoints.push({ name: 'API Usage Stats', endpoint: '/api/admin/api-usage/stats', status: 'healthy', latencyMs: Date.now() - apiStart });
    } catch (e) { endpoints.push({ name: 'API Usage Stats', endpoint: '/api/admin/api-usage/stats', status: 'down', latencyMs: null }); }

    // Database query check
    try {
      const dbStart = Date.now();
      await pool.query('SELECT 1');
      endpoints.push({ name: 'Database Query', endpoint: 'SELECT 1', status: 'healthy', latencyMs: Date.now() - dbStart });
    } catch (e) { endpoints.push({ name: 'Database Query', endpoint: 'SELECT 1', status: 'down', latencyMs: null }); }

    // SMTP check
    try {
      const smtpResult = await emailService.testConnection();
      if (smtpResult.success) { endpoints.push({ name: 'SMTP', endpoint: 'smtp', status: 'healthy', latencyMs: null }); }
      else if (smtpResult.error === 'SMTP not configured') { endpoints.push({ name: 'SMTP', endpoint: 'smtp', status: 'unconfigured', latencyMs: null }); }
      else { endpoints.push({ name: 'SMTP', endpoint: 'smtp', status: 'down', latencyMs: null }); }
    } catch (e) { endpoints.push({ name: 'SMTP', endpoint: 'smtp', status: 'down', latencyMs: null }); }

    // Storage stats
    let uploadsStats = { totalSize: '0 B', totalSizeBytes: 0, fileCount: 0 };
    try {
      const files = fsSync.readdirSync(uploadsDir);
      let totalSize = 0;
      let fileCount = 0;
      for (const file of files) {
        try { const stat = fsSync.statSync(path.join(uploadsDir, file)); if (stat.isFile()) { totalSize += stat.size; fileCount++; } } catch (e) { /* skip */ }
      }
      uploadsStats = { totalSize: formatBytes(totalSize), totalSizeBytes: totalSize, fileCount };
    } catch (e) { console.error('System health uploads check error:', e); }

    // Error rate monitoring
    let errorStats: Record<string, unknown> = {
      last24h: { apiErrors: 0, failedLogins: 0, totalApiCalls: 0, errorRate: '0%' },
      last7d: { apiErrors: 0, failedLogins: 0, totalApiCalls: 0, errorRate: '0%' },
      last30d: { apiErrors: 0, failedLogins: 0, totalApiCalls: 0, errorRate: '0%' },
      dailyErrors: [], recentErrors: []
    };

    try {
      const [errors24h, errors7d, errors30d, logins24h, logins7d, logins30d, total24h, total7d, total30d, dailyErrorsResult, recentErrorsResult] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM api_usage_logs WHERE success = false AND created_at >= NOW() - INTERVAL '24 hours'`),
        pool.query(`SELECT COUNT(*) FROM api_usage_logs WHERE success = false AND created_at >= NOW() - INTERVAL '7 days'`),
        pool.query(`SELECT COUNT(*) FROM api_usage_logs WHERE success = false AND created_at >= NOW() - INTERVAL '30 days'`),
        pool.query(`SELECT COUNT(*) FROM activity_logs WHERE action = 'login_failed' AND created_at >= NOW() - INTERVAL '24 hours'`),
        pool.query(`SELECT COUNT(*) FROM activity_logs WHERE action = 'login_failed' AND created_at >= NOW() - INTERVAL '7 days'`),
        pool.query(`SELECT COUNT(*) FROM activity_logs WHERE action = 'login_failed' AND created_at >= NOW() - INTERVAL '30 days'`),
        pool.query(`SELECT COUNT(*) FROM api_usage_logs WHERE created_at >= NOW() - INTERVAL '24 hours'`),
        pool.query(`SELECT COUNT(*) FROM api_usage_logs WHERE created_at >= NOW() - INTERVAL '7 days'`),
        pool.query(`SELECT COUNT(*) FROM api_usage_logs WHERE created_at >= NOW() - INTERVAL '30 days'`),
        pool.query(`SELECT DATE(created_at) as date, COUNT(*) FILTER (WHERE success = false) as api_errors, COUNT(*) as total_calls FROM api_usage_logs WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY date`),
        pool.query(`SELECT aul.id, aul.endpoint, aul.error_message, aul.created_at, u.email as user_email FROM api_usage_logs aul LEFT JOIN users u ON aul.user_id = u.id WHERE aul.success = false ORDER BY aul.created_at DESC LIMIT 10`)
      ]);

      const dailyLoginsResult = await pool.query(`SELECT DATE(created_at) as date, COUNT(*) as failed_logins FROM activity_logs WHERE action = 'login_failed' AND created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at)`);
      const loginsByDate: Record<string, number> = {};
      dailyLoginsResult.rows.forEach((row: { date: Date; failed_logins: string }) => { loginsByDate[row.date.toISOString().split('T')[0]] = parseInt(row.failed_logins); });

      const calcRate = (errs: number, total: number): string => { if (total === 0) return '0%'; return ((errs / total) * 100).toFixed(1) + '%'; };

      const e24h = parseInt(errors24h.rows[0].count); const t24h = parseInt(total24h.rows[0].count);
      const e7d = parseInt(errors7d.rows[0].count); const t7d = parseInt(total7d.rows[0].count);
      const e30d = parseInt(errors30d.rows[0].count); const t30d = parseInt(total30d.rows[0].count);

      errorStats = {
        last24h: { apiErrors: e24h, failedLogins: parseInt(logins24h.rows[0].count), totalApiCalls: t24h, errorRate: calcRate(e24h, t24h) },
        last7d: { apiErrors: e7d, failedLogins: parseInt(logins7d.rows[0].count), totalApiCalls: t7d, errorRate: calcRate(e7d, t7d) },
        last30d: { apiErrors: e30d, failedLogins: parseInt(logins30d.rows[0].count), totalApiCalls: t30d, errorRate: calcRate(e30d, t30d) },
        dailyErrors: dailyErrorsResult.rows.map((row: { date: Date; api_errors: string; total_calls: string }) => ({ date: row.date.toISOString().split('T')[0], apiErrors: parseInt(row.api_errors), failedLogins: loginsByDate[row.date.toISOString().split('T')[0]] || 0, totalCalls: parseInt(row.total_calls) })),
        recentErrors: recentErrorsResult.rows
      };
    } catch (errError) { console.error('System health error stats error:', errError); }

    const allHealthy = endpoints.every(e => e.status === 'healthy' || e.status === 'unconfigured');
    const anyDown = endpoints.some(e => e.status === 'down');
    const overallStatus = anyDown ? 'down' : (allHealthy ? 'healthy' : 'degraded');

    res.json({ timestamp, overallStatus, database: { connected: dbConnected, latencyMs: dbLatencyMs, ...poolStats, databaseSize, databaseSizeBytes, tableCounts, tableSizes }, endpoints, storage: { uploads: uploadsStats }, errors: errorStats });
  } catch (error) { console.error('System health error:', error); res.status(500).json({ error: 'Server error' }); }
});

// ==================== AI RECOMMENDATION ROUTES ====================

// Update user personality mode
app.patch('/api/users/personality-mode', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { personalityMode } = req.body;

    if (!personalityMode || !VALID_PERSONALITY_MODES.includes(personalityMode)) {
      res.status(400).json({ error: 'Invalid personality mode. Must be one of: ' + VALID_PERSONALITY_MODES.join(', ') });
      return;
    }

    await pool.query(
      'UPDATE users SET personality_mode = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [personalityMode, req.user!.userId]
    );

    await logActivity({
      userId: req.user!.userId,
      action: 'personality_mode_changed',
      actionType: 'USER',
      resourceType: 'user',
      resourceId: req.user!.userId,
      details: { personalityMode },
      req
    });

    res.json({ personalityMode });
  } catch (error) {
    console.error('Error updating personality mode:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user goal
app.patch('/api/users/goal', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userGoal } = req.body;
    const validGoals = ['downsizing', 'organizing', 'estate_planning', 'moving', 'general'];

    if (!userGoal || !validGoals.includes(userGoal)) {
      res.status(400).json({ error: 'Invalid goal. Must be one of: ' + validGoals.join(', ') });
      return;
    }

    await pool.query(
      'UPDATE users SET user_goal = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [userGoal, req.user!.userId]
    );

    res.json({ userGoal });
  } catch (error) {
    console.error('Error updating user goal:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's AI preferences (personality mode, goal)
app.get('/api/users/ai-preferences', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT personality_mode, user_goal FROM users WHERE id = $1',
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const config = getPersonalityConfig(user.personality_mode);

    res.json({
      personalityMode: user.personality_mode || 'balanced',
      userGoal: user.user_goal || 'general',
      personalityConfig: config,
      availableModes: Object.entries(PERSONALITY_MODES).map(([key, val]) => ({
        id: key,
        name: val.name,
        description: val.description,
        icon: val.icon
      }))
    });
  } catch (error) {
    console.error('Error fetching AI preferences:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log a recommendation override
app.post('/api/recommendations/override', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { itemId, aiSuggestion, userChoice, overrideReason } = req.body;

    if (!itemId || !aiSuggestion || !userChoice) {
      res.status(400).json({ error: 'itemId, aiSuggestion, and userChoice are required' });
      return;
    }

    // Get item category
    const itemResult = await pool.query(
      'SELECT category FROM items WHERE id = $1 AND user_id = $2',
      [itemId, req.user!.userId]
    );

    if (itemResult.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    await logOverride(
      pool,
      req.user!.userId,
      itemId,
      itemResult.rows[0].category,
      aiSuggestion,
      userChoice,
      overrideReason || null
    );

    await logActivity({
      userId: req.user!.userId,
      action: 'recommendation_overridden',
      actionType: 'ITEM',
      resourceType: 'item',
      resourceId: itemId,
      details: { aiSuggestion, userChoice, overrideReason: overrideReason || null },
      req
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error logging override:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's override stats and patterns
app.get('/api/recommendations/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await getUserPatterns(pool, req.user!.userId);
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching recommendation stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recommendation context for an item
app.get('/api/recommendations/context/:itemId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);

    // Verify item belongs to user
    const itemResult = await pool.query(
      'SELECT id FROM items WHERE id = $1 AND user_id = $2',
      [itemId, req.user!.userId]
    );

    if (itemResult.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const context = await buildRecommendationContext(pool, req.user!.userId, itemId);
    res.json({ context });
  } catch (error) {
    console.error('Error fetching recommendation context:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get duplicate count for a category
app.get('/api/items/duplicate-count/:category', authenticateToken, async (req: Request, res: Response) => {
  try {
    const count = await getDuplicateCount(pool, req.user!.userId, req.params.category);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching duplicate count:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Detect emotional tone from text
app.post('/api/recommendations/detect-tone', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    const tone = detectEmotionalTone(text);
    const instructions = getToneInstructions(tone);
    res.json({ tone, instructions });
  } catch (error) {
    console.error('Error detecting tone:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SUPPORT TICKET ROUTES ====================

// Submit a support ticket
app.post('/api/support/submit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { subject, message } = req.body;

    if (!subject || !subject.trim()) {
      res.status(400).json({ error: 'Subject is required' });
      return;
    }
    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const ticket = await aiSupportService.createTicket(req.user!.userId, subject.trim(), message.trim());

    // Send email notifications
    if (ticket.aiMatched) {
      // Send AI response to user
      const userResult = await pool.query('SELECT email, first_name FROM users WHERE id = $1', [req.user!.userId]);
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        await emailService.sendEmail(
          user.email,
          `Support Ticket #${ticket.id}: ${subject}`,
          `Hi ${user.first_name || 'there'},\n\nThank you for contacting support. Our system found an answer that may help:\n\n${ticket.aiResponse}\n\nIf this doesn't resolve your issue, an admin will follow up.\n\nNote: This is an automated response.`
        );
      }
    } else {
      // Notify admin users
      const adminResult = await pool.query('SELECT email FROM users WHERE is_admin = true');
      for (const admin of adminResult.rows) {
        await emailService.sendEmail(
          admin.email,
          `New Support Ticket #${ticket.id}: ${subject}`,
          `A new support ticket has been submitted that requires attention.\n\nSubject: ${subject}\nMessage: ${message}\n\nPlease log in to review and respond.`
        );
      }
    }

    await logActivity({
      userId: req.user!.userId,
      action: 'support_ticket_created',
      actionType: 'USER',
      resourceType: 'support_ticket',
      resourceId: ticket.id,
      details: { subject, aiMatched: ticket.aiMatched },
      req
    });

    res.json({ ticket: { id: ticket.id, aiMatched: ticket.aiMatched, aiResponse: ticket.aiResponse } });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user's support tickets
app.get('/api/support/my-tickets', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tickets = await aiSupportService.getTicketsForUser(req.user!.userId);
    res.json({ tickets });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});
