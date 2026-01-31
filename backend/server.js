/**
 * ============================================================================
 * DECLUTTER ASSISTANT - BACKEND API SERVER
 * ============================================================================
 *
 * Main Express.js server providing RESTful API endpoints for the Declutter
 * Assistant application.
 *
 * @author Declutter Team
 * @version 1.2.0
 *
 * ## Architecture
 * - Express.js REST API
 * - PostgreSQL database via node-postgres (pg)
 * - JWT authentication
 * - Multer for file uploads
 * - Anthropic Claude API for AI features
 *
 * ## API Sections
 * - Authentication: /api/auth/* - Login, register, password reset
 * - Profile: /api/profile - User personality profiles
 * - Items: /api/items/* - Item CRUD and decision recording
 * - Categories: /api/categories - Item categorization
 * - Household: /api/household-members - Family member tracking
 * - Admin: /api/admin/* - Admin-only endpoints
 *   - Users management
 *   - System settings
 *   - Email templates
 *   - Announcements
 *   - Categories management
 *   - Recommendation engine tuning
 *   - Analytics dashboard
 *   - API usage monitoring
 *
 * ## Environment Variables
 * - PORT: Server port (default: 3001)
 * - DATABASE_URL: PostgreSQL connection string
 * - JWT_SECRET: Secret for JWT token signing
 * - ANTHROPIC_API_KEY: API key for Claude AI
 * - SMTP_* : Email configuration
 *
 * ## Documentation
 * See /docs/API.md for complete API documentation
 *
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const llmProviders = require('./llmProviders');
const EmailService = require('./emailService');
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');

let recaptchaClient = null;
function getRecaptchaClient() {
  if (!recaptchaClient) {
    try {
      recaptchaClient = new RecaptchaEnterpriseServiceClient();
    } catch (err) {
      console.error('Failed to initialize reCAPTCHA Enterprise client:', err.message);
    }
  }
  return recaptchaClient;
}

async function createAssessment({ projectID, recaptchaKey, token, recaptchaAction }) {
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

    if (!response.tokenProperties.valid) {
      console.error('reCAPTCHA token invalid:', response.tokenProperties.invalidReason);
      return null;
    }

    if (response.tokenProperties.action !== recaptchaAction) {
      console.error('reCAPTCHA action mismatch: expected', recaptchaAction, 'got', response.tokenProperties.action);
      return null;
    }

    return response.riskAnalysis.score;
  } catch (err) {
    console.error('reCAPTCHA Enterprise createAssessment error:', err.message);
    return null;
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists at runtime (important when volume is mounted)
const uploadsDir = path.join(__dirname, 'uploads');
const fsSync = require('fs');
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

// Run idempotent migrations for multi-LLM provider support
const runMigrations = async () => {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_provider VARCHAR(50) DEFAULT 'anthropic';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_api_key TEXT;
      UPDATE users SET llm_api_key = anthropic_api_key, llm_provider = 'anthropic'
        WHERE anthropic_api_key IS NOT NULL AND llm_api_key IS NULL;
      ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'anthropic';
      INSERT INTO system_settings (setting_key, setting_value) VALUES
        ('llm_provider', 'anthropic'),
        ('openai_api_key', ''),
        ('google_api_key', ''),
        ('ollama_base_url', 'http://localhost:11434')
      ON CONFLICT (setting_key) DO NOTHING;
      INSERT INTO system_settings (setting_key, setting_value) VALUES
        ('recaptcha_site_key', ''),
        ('recaptcha_secret_key', '')
      ON CONFLICT (setting_key) DO NOTHING;
      INSERT INTO system_settings (setting_key, setting_value) VALUES
        ('recaptcha_project_id', ''),
        ('recaptcha_score_threshold', '0.5')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    console.log('LLM provider migrations applied successfully');
  } catch (err) {
    // Tables may not exist yet on first run (init.sql handles that)
    console.log('LLM provider migration skipped (tables may not exist yet):', err.message);
  }
};

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
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
app.use('/uploads', express.static('uploads'));

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure uploads directory exists before saving
    if (!fsSync.existsSync(uploadsDir)) {
      fsSync.mkdirSync(uploadsDir, { recursive: true });
      console.log('Created uploads directory on demand:', uploadsDir);
    }
    console.log('Saving file to:', uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ============================================
// ACTIVITY LOGGING HELPER
// ============================================
/**
 * Logs an activity to the audit trail
 * @param {Object} params - Activity parameters
 * @param {number|null} params.userId - User who performed the action
 * @param {string} params.action - Action performed (e.g., 'login', 'item_create')
 * @param {string} params.actionType - Category: USER, ITEM, ADMIN, SYSTEM
 * @param {string|null} params.resourceType - Type of resource (user, item, setting, etc.)
 * @param {number|null} params.resourceId - ID of affected resource
 * @param {Object|null} params.details - Additional context as JSON
 * @param {Object|null} params.req - Express request object for IP/user agent
 */
const logActivity = async ({ userId, action, actionType, resourceType = null, resourceId = null, details = null, req = null }) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    await pool.query(
      `INSERT INTO activity_logs (user_id, action, action_type, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, action, actionType, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress, userAgent]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
};

// ============= PUBLIC CONFIG ROUTES =============

// Get reCAPTCHA config (public - no auth required)
app.get('/api/config/recaptcha', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recaptcha_site_key', 'recaptcha_project_id')"
    );
    const settings = {};
    result.rows.forEach(row => { settings[row.setting_key] = row.setting_value; });

    const siteKey = (settings.recaptcha_site_key && settings.recaptcha_site_key.trim()) || process.env.REACT_APP_RECAPTCHA_SITE_KEY || '';
    const projectId = (settings.recaptcha_project_id && settings.recaptcha_project_id.trim()) || process.env.RECAPTCHA_PROJECT_ID || '';
    const enabled = !!(siteKey && projectId && getRecaptchaClient());

    const response = { enabled };
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
app.post('/api/auth/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, firstName, lastName, recaptchaToken } = req.body;

  try {
    // reCAPTCHA Enterprise server-side verification
    const recaptchaResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recaptcha_site_key', 'recaptcha_project_id', 'recaptcha_score_threshold')"
    );
    const recaptchaSettings = {};
    recaptchaResult.rows.forEach(row => { recaptchaSettings[row.setting_key] = row.setting_value; });

    const siteKey = (recaptchaSettings.recaptcha_site_key && recaptchaSettings.recaptcha_site_key.trim()) || process.env.REACT_APP_RECAPTCHA_SITE_KEY || '';
    const projectId = (recaptchaSettings.recaptcha_project_id && recaptchaSettings.recaptcha_project_id.trim()) || process.env.RECAPTCHA_PROJECT_ID || '';
    const scoreThreshold = parseFloat(recaptchaSettings.recaptcha_score_threshold) || 0.5;
    const client = getRecaptchaClient();

    if (siteKey && projectId && client) {
      if (!recaptchaToken) {
        return res.status(400).json({ error: 'reCAPTCHA verification required' });
      }

      const score = await createAssessment({
        projectID: projectId,
        recaptchaKey: siteKey,
        token: recaptchaToken,
        recaptchaAction: 'register',
      });

      if (score === null) {
        return res.status(500).json({ error: 'Unable to verify reCAPTCHA. Please try again.' });
      }

      if (score < scoreThreshold) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
      }
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name',
      [email, passwordHash, firstName, lastName]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
      { expiresIn: '7d' }
    );

    // Log registration
    await logActivity({
      userId: user.id,
      action: 'register',
      actionType: 'USER',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email },
      req
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, is_admin FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Log failed login - unknown email
      await logActivity({
        userId: null,
        action: 'login_failed',
        actionType: 'SYSTEM',
        details: { email, reason: 'unknown_email' },
        req
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      // Log failed login - wrong password
      await logActivity({
        userId: user.id,
        action: 'login_failed',
        actionType: 'SYSTEM',
        resourceType: 'user',
        resourceId: user.id,
        details: { email, reason: 'invalid_password' },
        req
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
      { expiresIn: '7d' }
    );

    // Log successful login
    await logActivity({
      userId: user.id,
      action: 'login',
      actionType: 'USER',
      resourceType: 'user',
      resourceId: user.id,
      details: { email: user.email },
      req
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= PERSONALITY PROFILE ROUTES =============

// Get personality profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT profile_data FROM personality_profiles WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ profile: null });
    }

    res.json({ profile: result.rows[0].profile_data });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or update personality profile
app.post('/api/profile', authenticateToken, async (req, res) => {
  const { profileData } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO personality_profiles (user_id, profile_data)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET profile_data = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING profile_data`,
      [req.user.userId, JSON.stringify(profileData)]
    );

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'profile_updated',
      actionType: 'user',
      resourceType: 'profile',
      resourceId: req.user.userId,
      details: { profileType: profileData.declutterPersonality },
      req
    });

    res.json({ profile: result.rows[0].profile_data });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= IMAGE ANALYSIS ROUTE =============

// Helper function to calculate estimated cost (delegates to llmProviders)
const calculateApiCost = (inputTokens, outputTokens, providerName = 'anthropic') => {
  return llmProviders.calculateCost(providerName, inputTokens, outputTokens);
};

// Helper function to log API usage
const logApiUsage = async (userId, endpoint, model, inputTokens, outputTokens, success, errorMessage = null, usedUserKey = false, provider = 'anthropic') => {
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

// Helper function to check usage limits
const checkUsageLimits = async (userId) => {
  try {
    // Get limit settings
    const settingsResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('api_monthly_cost_limit', 'api_per_user_monthly_limit')"
    );
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.setting_key] = parseFloat(row.setting_value);
    });

    const monthlyLimit = settings.api_monthly_cost_limit || 50;
    const perUserLimit = settings.api_per_user_monthly_limit || 10;

    // Get current month's usage
    const totalUsageResult = await pool.query(
      `SELECT COALESCE(SUM(estimated_cost), 0) as total_cost
       FROM api_usage_logs
       WHERE created_at >= date_trunc('month', CURRENT_DATE)
       AND used_user_key = false`
    );
    const totalCost = parseFloat(totalUsageResult.rows[0].total_cost);

    // Get user's current month usage
    const userUsageResult = await pool.query(
      `SELECT COALESCE(SUM(estimated_cost), 0) as user_cost
       FROM api_usage_logs
       WHERE user_id = $1
       AND created_at >= date_trunc('month', CURRENT_DATE)
       AND used_user_key = false`,
      [userId]
    );
    const userCost = parseFloat(userUsageResult.rows[0].user_cost);

    return {
      allowed: totalCost < monthlyLimit && userCost < perUserLimit,
      totalCost,
      userCost,
      monthlyLimit,
      perUserLimit,
      reason: totalCost >= monthlyLimit
        ? 'Monthly system limit reached'
        : userCost >= perUserLimit
          ? 'Your monthly usage limit reached'
          : null
    };
  } catch (err) {
    console.error('Error checking usage limits:', err);
    return { allowed: true }; // Allow on error to not block users
  }
};

// Analyze image with LLM provider
app.post('/api/analyze-image', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  let usedUserKey = false;
  let providerName = 'anthropic';
  let modelName = '';

  try {
    // Get user's provider preference and keys
    const userResult = await pool.query(
      'SELECT llm_provider, llm_api_key, anthropic_api_key FROM users WHERE id = $1',
      [req.user.userId]
    );
    const userRow = userResult.rows[0];
    const userProvider = userRow?.llm_provider;
    const userApiKey = userRow?.llm_api_key || userRow?.anthropic_api_key;
    usedUserKey = !!userApiKey;

    // Determine which provider to use: user preference > system default
    if (userProvider && llmProviders.getProvider(userProvider)) {
      providerName = userProvider;
    } else {
      // Fall back to system default provider
      const sysProv = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'llm_provider'"
      );
      if (sysProv.rows[0]?.setting_value && llmProviders.getProvider(sysProv.rows[0].setting_value)) {
        providerName = sysProv.rows[0].setting_value;
      }
    }

    const providerConfig = llmProviders.getProvider(providerName);
    modelName = providerConfig.defaultModel;

    // If not using user's key, check system usage limits
    if (!usedUserKey) {
      const limitCheck = await checkUsageLimits(req.user.userId);
      if (!limitCheck.allowed) {
        return res.status(429).json({
          error: 'Usage limit exceeded',
          message: limitCheck.reason + '. Add your own API key in settings to continue.',
          userCost: limitCheck.userCost,
          perUserLimit: limitCheck.perUserLimit
        });
      }
    }

    // Resolve the API key or base URL for the chosen provider
    let apiKeyOrUrl = userApiKey;

    if (!apiKeyOrUrl) {
      if (providerName === 'ollama') {
        // Ollama uses a base URL, not an API key
        const ollamaResult = await pool.query(
          "SELECT setting_value FROM system_settings WHERE setting_key = 'ollama_base_url'"
        );
        apiKeyOrUrl = ollamaResult.rows[0]?.setting_value || 'http://localhost:11434';
      } else {
        // Try provider-specific system DB key, then env var
        const envKeyMap = {
          anthropic: 'ANTHROPIC_API_KEY',
          openai: 'OPENAI_API_KEY',
          google: 'GOOGLE_API_KEY',
        };
        const dbKeyMap = {
          anthropic: 'anthropic_api_key',
          openai: 'openai_api_key',
          google: 'google_api_key',
        };

        // Database key takes priority
        const sysKeyResult = await pool.query(
          "SELECT setting_value FROM system_settings WHERE setting_key = $1",
          [dbKeyMap[providerName]]
        );
        const dbKey = sysKeyResult.rows[0]?.setting_value;
        const envKey = process.env[envKeyMap[providerName]];

        apiKeyOrUrl = (dbKey && dbKey.trim()) ? dbKey : envKey;
      }
    }

    if (!apiKeyOrUrl) {
      return res.status(400).json({
        error: 'No API key available',
        message: `Please add your ${providerConfig.name} API key in settings or contact the administrator`
      });
    }

    // Fetch categories from database for the prompt
    const categoriesResult = await pool.query(
      'SELECT slug FROM categories ORDER BY sort_order ASC, name ASC'
    );
    const categoryList = categoriesResult.rows.map(c => c.slug).join(', ');

    // Read the uploaded image file
    const imageBuffer = await fs.readFile(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = req.file.mimetype;

    // Call the LLM provider
    const result = await llmProviders.analyzeImage(providerName, apiKeyOrUrl, base64Image, mediaType, categoryList);

    const inputTokens = result.inputTokens;
    const outputTokens = result.outputTokens;
    modelName = result.model || modelName;

    // Log successful API usage
    await logApiUsage(req.user.userId, '/api/analyze-image', modelName, inputTokens, outputTokens, true, null, usedUserKey, providerName);

    // Parse the response
    const responseText = result.text;
    let analysisResult;
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
      return res.status(500).json({
        error: 'Could not parse AI response',
        rawResponse: responseText
      });
    }

    // Validate the category against database
    const validSlugs = categoriesResult.rows.map(c => c.slug.toLowerCase());
    if (!validSlugs.includes(analysisResult.category?.toLowerCase())) {
      const defaultResult = await pool.query('SELECT slug FROM categories WHERE is_default = true');
      analysisResult.category = defaultResult.rows.length > 0 ? defaultResult.rows[0].slug : 'other';
    }

    res.json({
      name: analysisResult.name || 'Unknown Item',
      description: analysisResult.description || '',
      category: analysisResult.category || 'other'
    });

  } catch (error) {
    console.error('Image analysis error:', error);

    // Log failed API usage
    await logApiUsage(req.user.userId, '/api/analyze-image', modelName, 0, 0, false, error.message, usedUserKey, providerName);

    if (error.status === 401) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: usedUserKey
          ? 'Your API key is invalid. Please check your API key in settings.'
          : 'System API key is not configured. Please add your own API key in settings.'
      });
    }

    res.status(500).json({
      error: 'Error analyzing image',
      details: error.message
    });
  }
});

// Get available LLM providers
app.get('/api/llm-providers', authenticateToken, async (req, res) => {
  try {
    // Get system default provider
    const sysProvResult = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'llm_provider'"
    );
    const systemProvider = sysProvResult.rows[0]?.setting_value || 'anthropic';

    // Check which providers have system-level keys configured
    const sysKeysResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('anthropic_api_key', 'openai_api_key', 'google_api_key', 'ollama_base_url')"
    );
    const sysKeys = {};
    sysKeysResult.rows.forEach(row => {
      sysKeys[row.setting_key] = row.setting_value;
    });

    const envKeyMap = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY',
    };
    const dbKeyMap = {
      anthropic: 'anthropic_api_key',
      openai: 'openai_api_key',
      google: 'google_api_key',
    };

    const providers = llmProviders.getAvailableProviders().map(p => {
      let systemConfigured = false;
      if (p.id === 'ollama') {
        systemConfigured = !!(sysKeys['ollama_base_url'] && sysKeys['ollama_base_url'].trim());
      } else {
        const dbVal = sysKeys[dbKeyMap[p.id]];
        const envVal = process.env[envKeyMap[p.id]];
        systemConfigured = !!(dbVal && dbVal.trim()) || !!envVal;
      }
      return {
        ...p,
        systemConfigured,
        isSystemDefault: p.id === systemProvider,
      };
    });

    res.json({ providers });
  } catch (error) {
    console.error('Get LLM providers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ITEM ROUTES =============

// Get all items for user
app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const { status, recommendation } = req.query;
    let query = 'SELECT * FROM items WHERE user_id = $1';
    const params = [req.user.userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    if (recommendation && !status) {
      query += ' AND recommendation = $2';
      params.push(recommendation);
    } else if (recommendation && status) {
      query += ' AND recommendation = $3';
      params.push(recommendation);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json({ items: result.rows });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single item
app.get('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM items WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get item owners
app.get('/api/items/:id/owners', authenticateToken, async (req, res) => {
  try {
    // Verify item belongs to user
    const itemResult = await pool.query(
      'SELECT id FROM items WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const result = await pool.query(
      'SELECT member_id FROM item_members WHERE item_id = $1',
      [req.params.id]
    );

    const ownerIds = result.rows.map(row => row.member_id);
    res.json({ ownerIds });
  } catch (error) {
    console.error('Get item owners error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create item
app.post('/api/items', authenticateToken, upload.single('image'), async (req, res) => {
  const { name, description, location, category, recommendation, recommendationReasoning, answers, status, ownerIds } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  if (req.file) {
    console.log('Image saved successfully:', req.file.path, 'URL:', imageUrl);
  } else {
    console.log('No image file in request or upload failed');
  }

  try {
    const result = await pool.query(
      `INSERT INTO items (user_id, name, description, location, category, image_url, recommendation, recommendation_reasoning, answers, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.user.userId,
        name,
        description || null,
        location || null,
        category || null,
        imageUrl,
        recommendation || null,
        recommendationReasoning || null,
        answers ? JSON.stringify(JSON.parse(answers)) : null,
        status || 'pending'
      ]
    );

    const item = result.rows[0];

    // Save item owners if provided
    if (ownerIds) {
      const parsedOwnerIds = JSON.parse(ownerIds);
      if (Array.isArray(parsedOwnerIds) && parsedOwnerIds.length > 0) {
        for (const memberId of parsedOwnerIds) {
          await pool.query(
            'INSERT INTO item_members (item_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [item.id, memberId]
          );
        }
      }
    }

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'item_created',
      actionType: 'item',
      resourceType: 'item',
      resourceId: item.id,
      details: { name: item.name, category: item.category, recommendation: item.recommendation },
      req
    });

    res.status(201).json({ item });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update item
app.put('/api/items/:id', authenticateToken, upload.single('image'), async (req, res) => {
  const { name, description, location, category, recommendation, recommendationReasoning, answers, status, ownerIds } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(description);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      params.push(location);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramCount++}`);
      params.push(category);
    }
    if (imageUrl !== undefined) {
      updates.push(`image_url = $${paramCount++}`);
      params.push(imageUrl);
    }
    if (recommendation !== undefined) {
      updates.push(`recommendation = $${paramCount++}`);
      params.push(recommendation);
    }
    if (recommendationReasoning !== undefined) {
      updates.push(`recommendation_reasoning = $${paramCount++}`);
      params.push(recommendationReasoning);
    }
    if (answers !== undefined) {
      updates.push(`answers = $${paramCount++}`);
      params.push(JSON.stringify(JSON.parse(answers)));
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(req.params.id, req.user.userId);

    const query = `UPDATE items SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++} RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Update item owners if provided
    if (ownerIds !== undefined) {
      const parsedOwnerIds = Array.isArray(ownerIds) ? ownerIds : JSON.parse(ownerIds);

      // Delete existing owners
      await pool.query('DELETE FROM item_members WHERE item_id = $1', [req.params.id]);

      // Insert new owners
      if (Array.isArray(parsedOwnerIds) && parsedOwnerIds.length > 0) {
        for (const memberId of parsedOwnerIds) {
          await pool.query(
            'INSERT INTO item_members (item_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, memberId]
          );
        }
      }
    }

    // Log activity
    const updatedItem = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'item_updated',
      actionType: 'item',
      resourceType: 'item',
      resourceId: updatedItem.id,
      details: { name: updatedItem.name, fieldsUpdated: updates.map(u => u.split(' = ')[0]) },
      req
    });

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete item
app.delete('/api/items/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM items WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Log activity
    const deletedItem = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'item_deleted',
      actionType: 'item',
      resourceType: 'item',
      resourceId: deletedItem.id,
      details: { name: deletedItem.name, category: deletedItem.category },
      req
    });

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record decision for an item
app.put('/api/items/:id/decision', authenticateToken, async (req, res) => {
  try {
    const { decision } = req.body;
    const validDecisions = ['keep', 'accessible', 'storage', 'sell', 'donate', 'discard'];

    if (!decision || !validDecisions.includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision. Must be one of: ' + validDecisions.join(', ') });
    }

    const result = await pool.query(
      `UPDATE items
       SET decision = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [decision, req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Log activity
    const item = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'decision_recorded',
      actionType: 'item',
      resourceType: 'item',
      resourceId: item.id,
      details: {
        name: item.name,
        decision,
        recommendation: item.recommendation,
        followedRecommendation: decision === item.recommendation
      },
      req
    });

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Record decision error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear decision for an item
app.delete('/api/items/:id/decision', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE items
       SET decision = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Log activity
    const item = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'decision_cleared',
      actionType: 'item',
      resourceType: 'item',
      resourceId: item.id,
      details: { name: item.name },
      req
    });

    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('Clear decision error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get statistics
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM items WHERE user_id = $1',
      [req.user.userId]
    );

    const recommendationResult = await pool.query(
      `SELECT recommendation, COUNT(*) as count 
       FROM items 
       WHERE user_id = $1 AND recommendation IS NOT NULL 
       GROUP BY recommendation`,
      [req.user.userId]
    );

    const statusResult = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM items 
       WHERE user_id = $1 
       GROUP BY status`,
      [req.user.userId]
    );

    res.json({
      total: parseInt(totalResult.rows[0].total),
      byRecommendation: recommendationResult.rows,
      byStatus: statusResult.rows
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= CATEGORIES ROUTES =============

// Get all categories (public - for dropdowns)
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug, display_name, icon, color, sort_order, is_default FROM categories ORDER BY sort_order ASC, name ASC'
    );
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ADMIN ROUTES =============

// Admin middleware - check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get admin dashboard stats
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    const pendingUsers = await pool.query('SELECT COUNT(*) FROM users WHERE is_approved = false');
    const totalItems = await pool.query('SELECT COUNT(*) FROM items');
    const recentUsers = await pool.query(
      'SELECT id, email, first_name, last_name, is_approved, is_admin, created_at FROM users ORDER BY created_at DESC LIMIT 5'
    );

    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      pendingUsers: parseInt(pendingUsers.rows[0].count),
      totalItems: parseInt(totalItems.rows[0].count),
      recentUsers: recentUsers.rows
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users (admin)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin, u.is_approved, u.created_at,
             (u.llm_api_key IS NOT NULL OR u.anthropic_api_key IS NOT NULL) as has_api_key, u.image_analysis_enabled,
             COUNT(i.id) as item_count
      FROM users u
      LEFT JOIN items i ON u.id = i.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve user
app.patch('/api/admin/users/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE users SET is_approved = true WHERE id = $1', [id]);

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'user_approved',
      actionType: 'admin',
      resourceType: 'user',
      resourceId: parseInt(id),
      details: { approvedUserId: parseInt(id) },
      req
    });

    res.json({ message: 'User approved' });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user API settings (admin)
app.put('/api/admin/users/:id/api-settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { anthropic_api_key, llm_api_key, image_analysis_enabled, clear_api_key } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (clear_api_key) {
      updates.push(`llm_api_key = NULL`);
      updates.push(`anthropic_api_key = NULL`);
    } else {
      const newKey = llm_api_key || anthropic_api_key;
      if (newKey !== undefined && newKey !== '') {
        updates.push(`llm_api_key = $${paramCount++}`);
        params.push(newKey);
        updates.push(`anthropic_api_key = $${paramCount++}`);
        params.push(newKey);
      }
    }

    if (image_analysis_enabled !== undefined) {
      updates.push(`image_analysis_enabled = $${paramCount++}`);
      params.push(image_analysis_enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, llm_api_key, anthropic_api_key, image_analysis_enabled`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'user_api_settings_updated',
      actionType: 'admin',
      resourceType: 'user',
      resourceId: parseInt(id),
      details: {
        targetUserId: parseInt(id),
        apiKeyCleared: !!clear_api_key,
        apiKeySet: !!(llm_api_key || anthropic_api_key) && !clear_api_key,
        imageAnalysisEnabled: image_analysis_enabled
      },
      req
    });

    res.json({
      id: user.id,
      hasApiKey: !!(user.llm_api_key || user.anthropic_api_key),
      imageAnalysisEnabled: user.image_analysis_enabled !== false
    });
  } catch (error) {
    console.error('Update user API settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user info before deleting for logging
    const userResult = await pool.query('SELECT email, first_name, last_name FROM users WHERE id = $1', [id]);
    const deletedUserInfo = userResult.rows[0];

    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'user_deleted',
      actionType: 'admin',
      resourceType: 'user',
      resourceId: parseInt(id),
      details: { deletedUserId: parseInt(id), deletedUserEmail: deletedUserInfo?.email },
      req
    });

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get system settings
app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update registration mode
app.put('/api/admin/settings/registration_mode', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { value } = req.body;
    if (!['automatic', 'approval', 'disallowed'].includes(value)) {
      return res.status(400).json({ error: 'Invalid registration mode' });
    }

    await pool.query(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP',
      ['registration_mode', value]
    );
    res.json({ message: 'Setting updated' });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= SMTP CONFIGURATION ROUTES =============

// Get SMTP settings
app.get('/api/admin/smtp', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'smtp_%'"
    );
    const settings = {};
    result.rows.forEach(row => {
      // Don't expose the password
      if (row.setting_key === 'smtp_password') {
        settings[row.setting_key] = row.setting_value ? '••••••••' : '';
      } else {
        settings[row.setting_key] = row.setting_value;
      }
    });
    res.json(settings);
  } catch (error) {
    console.error('Get SMTP settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save SMTP settings
app.put('/api/admin/smtp', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_address } = req.body;

    const settings = [
      ['smtp_host', smtp_host],
      ['smtp_port', smtp_port],
      ['smtp_user', smtp_user],
      ['smtp_from_address', smtp_from_address]
    ];

    // Only update password if a new one was provided (not the masked value)
    if (smtp_password && !smtp_password.includes('•')) {
      settings.push(['smtp_password', smtp_password]);
    }

    for (const [key, value] of settings) {
      await pool.query(
        'INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP',
        [key, value || '']
      );
    }

    res.json({ message: 'SMTP settings saved' });
  } catch (error) {
    console.error('Save SMTP settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test SMTP connection
app.post('/api/admin/smtp/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await emailService.testConnection();
    res.json(result);
  } catch (error) {
    console.error('Test SMTP error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============= ADMIN API KEY SETTINGS =============

// Get system API key status (multi-provider)
app.get('/api/admin/api-key', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('anthropic_api_key', 'openai_api_key', 'google_api_key', 'ollama_base_url', 'llm_provider')"
    );
    const settings = {};
    result.rows.forEach(row => { settings[row.setting_key] = row.setting_value; });

    const dbKey = settings.anthropic_api_key;
    const envKey = process.env.ANTHROPIC_API_KEY;

    const keyPreview = (key) => key ? `...${key.slice(-4)}` : null;

    res.json({
      // Backward-compatible fields
      hasDbKey: !!(dbKey && dbKey.trim()),
      dbKeyPreview: dbKey ? keyPreview(dbKey) : null,
      hasEnvKey: !!envKey,
      envKeyPreview: envKey ? keyPreview(envKey) : null,
      activeSource: (dbKey && dbKey.trim()) ? 'database' : (envKey ? 'environment' : 'none'),
      // Multi-provider fields
      systemProvider: settings.llm_provider || 'anthropic',
      anthropic: {
        hasDbKey: !!(dbKey && dbKey.trim()),
        dbKeyPreview: (dbKey && dbKey.trim()) ? keyPreview(dbKey) : null,
        hasEnvKey: !!envKey,
      },
      openai: {
        hasDbKey: !!(settings.openai_api_key && settings.openai_api_key.trim()),
        dbKeyPreview: (settings.openai_api_key && settings.openai_api_key.trim()) ? keyPreview(settings.openai_api_key) : null,
        hasEnvKey: !!process.env.OPENAI_API_KEY,
      },
      google: {
        hasDbKey: !!(settings.google_api_key && settings.google_api_key.trim()),
        dbKeyPreview: (settings.google_api_key && settings.google_api_key.trim()) ? keyPreview(settings.google_api_key) : null,
        hasEnvKey: !!process.env.GOOGLE_API_KEY,
      },
      ollama: {
        baseUrl: settings.ollama_base_url || 'http://localhost:11434',
      },
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update system API key (multi-provider)
app.put('/api/admin/api-key', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { api_key, clear_key, provider, system_provider, ollama_base_url } = req.body;

    // Update system default provider
    if (system_provider && llmProviders.getProvider(system_provider)) {
      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('llm_provider', $1)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
      `, [system_provider]);
    }

    // Update Ollama base URL
    if (ollama_base_url !== undefined) {
      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('ollama_base_url', $1)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
      `, [ollama_base_url]);
    }

    // Determine which provider's key is being updated
    const targetProvider = provider || 'anthropic';
    const dbKeyMap = {
      anthropic: 'anthropic_api_key',
      openai: 'openai_api_key',
      google: 'google_api_key',
    };
    const settingKey = dbKeyMap[targetProvider];

    if (clear_key && settingKey) {
      await pool.query(
        "UPDATE system_settings SET setting_value = '', updated_at = CURRENT_TIMESTAMP WHERE setting_key = $1",
        [settingKey]
      );
      return res.json({
        message: `${targetProvider} API key removed`,
        provider: targetProvider,
        hasDbKey: false,
      });
    }

    if (api_key && settingKey) {
      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES ($1, $2)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
      `, [settingKey, api_key]);

      return res.json({
        message: `${targetProvider} API key saved successfully`,
        provider: targetProvider,
        hasDbKey: true,
        dbKeyPreview: `...${api_key.slice(-4)}`,
      });
    }

    // If only system_provider or ollama_base_url was changed
    res.json({ message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= RECAPTCHA ADMIN ROUTES =============

// Get reCAPTCHA settings (admin)
app.get('/api/admin/recaptcha', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recaptcha_site_key', 'recaptcha_project_id', 'recaptcha_score_threshold')"
    );
    const settings = {};
    result.rows.forEach(row => { settings[row.setting_key] = row.setting_value; });

    const dbSiteKey = settings.recaptcha_site_key || '';
    const dbProjectId = settings.recaptcha_project_id || '';
    const scoreThreshold = settings.recaptcha_score_threshold || '0.5';
    const envProjectId = process.env.RECAPTCHA_PROJECT_ID || '';

    const activeSiteKey = (dbSiteKey.trim()) || process.env.REACT_APP_RECAPTCHA_SITE_KEY || '';
    const activeProjectId = (dbProjectId.trim()) || envProjectId;

    res.json({
      siteKey: dbSiteKey,
      projectId: dbProjectId,
      scoreThreshold: scoreThreshold,
      hasEnvProjectId: !!envProjectId,
      hasCredentials: !!getRecaptchaClient(),
      enabled: !!(activeSiteKey && activeProjectId && getRecaptchaClient()),
    });
  } catch (error) {
    console.error('Get recaptcha settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update reCAPTCHA settings (admin)
app.put('/api/admin/recaptcha', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { site_key, project_id, score_threshold } = req.body;

    if (site_key !== undefined) {
      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('recaptcha_site_key', $1)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
      `, [site_key]);
    }

    if (project_id !== undefined) {
      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('recaptcha_project_id', $1)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
      `, [project_id]);
    }

    if (score_threshold !== undefined) {
      const clamped = Math.min(1.0, Math.max(0.0, parseFloat(score_threshold) || 0.5));
      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('recaptcha_score_threshold', $1)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
      `, [String(clamped)]);
    }

    // Log the settings change
    await logActivity({
      userId: req.user.userId,
      action: 'recaptcha_settings_changed',
      actionType: 'ADMIN',
      resourceType: 'setting',
      details: {
        siteKeyChanged: site_key !== undefined,
        projectIdChanged: project_id !== undefined,
        scoreThresholdChanged: score_threshold !== undefined,
      },
      req
    });

    res.json({ message: 'reCAPTCHA settings saved successfully' });
  } catch (error) {
    console.error('Update recaptcha settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= EMAIL TEMPLATES ROUTES =============

// Get all email templates
app.get('/api/admin/email-templates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates ORDER BY is_system DESC, name ASC');
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single email template
app.get('/api/admin/email-templates/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create email template
app.post('/api/admin/email-templates', authenticateToken, requireAdmin, [
  body('name').trim().notEmpty(),
  body('subject').trim().notEmpty(),
  body('body').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { name, subject, body, description, trigger_event, is_enabled } = req.body;
    const result = await pool.query(
      'INSERT INTO email_templates (name, subject, body, description, trigger_event, is_enabled) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, subject, body, description || null, trigger_event || null, is_enabled !== false]
    );

    // Log activity
    const template = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'email_template_created',
      actionType: 'admin',
      resourceType: 'email_template',
      resourceId: template.id,
      details: { name: template.name, triggerEvent: template.trigger_event },
      req
    });

    res.status(201).json({ template: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Template name already exists' });
    }
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update email template
app.put('/api/admin/email-templates/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { subject, body, description, trigger_event, is_enabled } = req.body;
    const result = await pool.query(
      'UPDATE email_templates SET subject = $1, body = $2, description = $3, trigger_event = $4, is_enabled = $5 WHERE id = $6 RETURNING *',
      [subject, body, description || null, trigger_event || null, is_enabled !== false, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Log activity
    const template = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'email_template_updated',
      actionType: 'admin',
      resourceType: 'email_template',
      resourceId: template.id,
      details: { name: template.name, triggerEvent: template.trigger_event, enabled: template.is_enabled },
      req
    });

    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete email template
app.delete('/api/admin/email-templates/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Check if it's a system template
    const checkResult = await pool.query('SELECT is_system FROM email_templates WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (checkResult.rows[0].is_system) {
      return res.status(400).json({ error: 'Cannot delete system templates' });
    }

    await pool.query('DELETE FROM email_templates WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'email_template_deleted',
      actionType: 'admin',
      resourceType: 'email_template',
      resourceId: parseInt(req.params.id),
      req
    });

    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ANNOUNCEMENTS ROUTES =============

// Get all announcements
app.get('/api/admin/announcements', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.first_name, u.last_name, u.email as creator_email
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
    `);
    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single announcement
app.get('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.first_name, u.last_name
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create announcement
app.post('/api/admin/announcements', authenticateToken, requireAdmin, [
  body('title').trim().notEmpty(),
  body('content').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { title, content } = req.body;
    const result = await pool.query(
      'INSERT INTO announcements (title, content, created_by) VALUES ($1, $2, $3) RETURNING *',
      [title, content, req.user.userId]
    );

    // Log activity
    const announcement = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'announcement_created',
      actionType: 'admin',
      resourceType: 'announcement',
      resourceId: announcement.id,
      details: { title: announcement.title },
      req
    });

    res.status(201).json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update announcement
app.put('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;

    // Check if already sent
    const checkResult = await pool.query('SELECT sent_at FROM announcements WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    if (checkResult.rows[0].sent_at) {
      return res.status(400).json({ error: 'Cannot edit an announcement that has already been sent' });
    }

    const result = await pool.query(
      'UPDATE announcements SET title = $1, content = $2 WHERE id = $3 RETURNING *',
      [title, content, req.params.id]
    );

    // Log activity
    const announcement = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'announcement_updated',
      actionType: 'admin',
      resourceType: 'announcement',
      resourceId: announcement.id,
      details: { title: announcement.title },
      req
    });

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete announcement
app.delete('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Log activity
    const announcement = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'announcement_deleted',
      actionType: 'admin',
      resourceType: 'announcement',
      resourceId: announcement.id,
      details: { title: announcement.title },
      req
    });

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send announcement to all users
app.post('/api/admin/announcements/:id/send', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Check if already sent
    const checkResult = await pool.query('SELECT sent_at FROM announcements WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    if (checkResult.rows[0].sent_at) {
      return res.status(400).json({ error: 'Announcement has already been sent' });
    }

    const result = await emailService.sendAnnouncement(req.params.id);
    if (result.success) {
      // Log activity
      await logActivity({
        userId: req.user.userId,
        action: 'announcement_sent',
        actionType: 'admin',
        resourceType: 'announcement',
        resourceId: parseInt(req.params.id),
        details: { sentCount: result.sentCount, totalUsers: result.totalUsers },
        req
      });

      res.json({
        message: `Announcement sent to ${result.sentCount} users`,
        sentCount: result.sentCount,
        totalUsers: result.totalUsers
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ADMIN API USAGE ROUTES =============

// Get API usage statistics
app.get('/api/admin/api-usage/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get current month's total usage
    const totalUsageResult = await pool.query(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(estimated_cost), 0) as total_cost,
        COALESCE(SUM(CASE WHEN used_user_key THEN estimated_cost ELSE 0 END), 0) as user_key_cost,
        COALESCE(SUM(CASE WHEN NOT used_user_key THEN estimated_cost ELSE 0 END), 0) as system_key_cost
      FROM api_usage_logs
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `);

    // Get daily usage for the current month
    const dailyUsageResult = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as calls,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(estimated_cost), 0) as cost
      FROM api_usage_logs
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `);

    // Get top users by usage
    const topUsersResult = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        COUNT(*) as total_calls,
        COALESCE(SUM(a.estimated_cost), 0) as total_cost,
        SUM(CASE WHEN a.used_user_key THEN 1 ELSE 0 END) as user_key_calls
      FROM api_usage_logs a
      JOIN users u ON a.user_id = u.id
      WHERE a.created_at >= date_trunc('month', CURRENT_DATE)
      GROUP BY u.id, u.email, u.first_name, u.last_name
      ORDER BY total_cost DESC
      LIMIT 10
    `);

    // Get settings
    const settingsResult = await pool.query(`
      SELECT setting_key, setting_value
      FROM system_settings
      WHERE setting_key LIKE 'api_%'
    `);
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    const stats = totalUsageResult.rows[0];
    res.json({
      currentMonth: {
        totalCalls: parseInt(stats.total_calls),
        successfulCalls: parseInt(stats.successful_calls),
        failedCalls: parseInt(stats.failed_calls),
        successRate: stats.total_calls > 0
          ? ((stats.successful_calls / stats.total_calls) * 100).toFixed(1)
          : 0,
        totalInputTokens: parseInt(stats.total_input_tokens),
        totalOutputTokens: parseInt(stats.total_output_tokens),
        totalCost: parseFloat(stats.total_cost).toFixed(4),
        userKeyCost: parseFloat(stats.user_key_cost).toFixed(4),
        systemKeyCost: parseFloat(stats.system_key_cost).toFixed(4)
      },
      dailyUsage: dailyUsageResult.rows.map(row => ({
        date: row.date,
        calls: parseInt(row.calls),
        successful: parseInt(row.successful),
        failed: parseInt(row.failed),
        cost: parseFloat(row.cost).toFixed(4)
      })),
      topUsers: topUsersResult.rows.map(row => ({
        id: row.id,
        email: row.email,
        name: `${row.first_name} ${row.last_name}`,
        totalCalls: parseInt(row.total_calls),
        totalCost: parseFloat(row.total_cost).toFixed(4),
        userKeyCalls: parseInt(row.user_key_calls)
      })),
      settings: {
        monthlyLimit: parseFloat(settings.api_monthly_cost_limit || 50),
        perUserLimit: parseFloat(settings.api_per_user_monthly_limit || 10),
        alertThreshold: parseInt(settings.api_alert_threshold_percent || 80),
        alertsEnabled: settings.api_usage_alerts_enabled === 'true'
      }
    });
  } catch (error) {
    console.error('Get API usage stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get API usage logs (paginated)
app.get('/api/admin/api-usage/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const logsResult = await pool.query(`
      SELECT a.*, u.email, u.first_name, u.last_name
      FROM api_usage_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await pool.query('SELECT COUNT(*) FROM api_usage_logs');
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      logs: logsResult.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get API usage logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update API usage settings
app.put('/api/admin/api-usage/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { monthlyLimit, perUserLimit, alertThreshold, alertsEnabled } = req.body;

    const updates = [
      ['api_monthly_cost_limit', monthlyLimit?.toString()],
      ['api_per_user_monthly_limit', perUserLimit?.toString()],
      ['api_alert_threshold_percent', alertThreshold?.toString()],
      ['api_usage_alerts_enabled', alertsEnabled?.toString()]
    ].filter(([key, value]) => value !== undefined);

    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update API usage settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ADMIN CATEGORIES ROUTES =============

// Get all categories with item counts (admin)
app.get('/api/admin/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COUNT(i.id) as item_count
      FROM categories c
      LEFT JOIN items i ON LOWER(i.category) = LOWER(c.slug)
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `);
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get admin categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single category (admin)
app.get('/api/admin/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ category: result.rows[0] });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create category (admin)
app.post('/api/admin/categories', authenticateToken, requireAdmin, [
  body('name').trim().notEmpty(),
  body('display_name').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { name, display_name, icon, color, sort_order, is_default } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query('UPDATE categories SET is_default = false WHERE is_default = true');
    }

    const result = await pool.query(
      `INSERT INTO categories (name, slug, display_name, icon, color, sort_order, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, slug, display_name, icon || null, color || null, sort_order || 0, is_default || false]
    );

    // Log activity
    const category = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'category_created',
      actionType: 'admin',
      resourceType: 'category',
      resourceId: category.id,
      details: { name: category.name, displayName: category.display_name },
      req
    });

    res.status(201).json({ category: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Category name or slug already exists' });
    }
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update category (admin)
app.put('/api/admin/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, display_name, icon, color, sort_order, is_default } = req.body;
    const slug = name ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : undefined;

    // Get current category to check old slug for item updates
    const currentResult = await pool.query('SELECT slug FROM categories WHERE id = $1', [req.params.id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const oldSlug = currentResult.rows[0].slug;

    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query('UPDATE categories SET is_default = false WHERE is_default = true AND id != $1', [req.params.id]);
    }

    const result = await pool.query(
      `UPDATE categories SET
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        display_name = COALESCE($3, display_name),
        icon = COALESCE($4, icon),
        color = COALESCE($5, color),
        sort_order = COALESCE($6, sort_order),
        is_default = COALESCE($7, is_default)
       WHERE id = $8 RETURNING *`,
      [name, slug, display_name, icon, color, sort_order, is_default, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Update items if slug changed
    if (slug && slug !== oldSlug) {
      await pool.query(
        'UPDATE items SET category = $1 WHERE LOWER(category) = LOWER($2)',
        [slug, oldSlug]
      );
    }

    // Log activity
    const updatedCategory = result.rows[0];
    await logActivity({
      userId: req.user.userId,
      action: 'category_updated',
      actionType: 'admin',
      resourceType: 'category',
      resourceId: updatedCategory.id,
      details: { name: updatedCategory.name, displayName: updatedCategory.display_name },
      req
    });

    res.json({ category: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Category name or slug already exists' });
    }
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete category (admin) - moves items to default category
app.delete('/api/admin/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get the category to delete
    const categoryResult = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = categoryResult.rows[0];

    // Cannot delete the default category
    if (category.is_default) {
      return res.status(400).json({ error: 'Cannot delete the default category' });
    }

    // Get the default category
    const defaultResult = await pool.query('SELECT slug FROM categories WHERE is_default = true');
    const defaultSlug = defaultResult.rows.length > 0 ? defaultResult.rows[0].slug : 'other';

    // Move items to default category
    await pool.query(
      'UPDATE items SET category = $1 WHERE LOWER(category) = LOWER($2)',
      [defaultSlug, category.slug]
    );

    // Delete the category
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'category_deleted',
      actionType: 'admin',
      resourceType: 'category',
      resourceId: parseInt(req.params.id),
      details: { name: category.name, movedToCategory: defaultSlug },
      req
    });

    res.json({ message: 'Category deleted successfully', movedToCategory: defaultSlug });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Merge categories (admin) - merge source into target
app.post('/api/admin/categories/merge', authenticateToken, requireAdmin, [
  body('sourceId').isInt(),
  body('targetId').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { sourceId, targetId } = req.body;

    if (sourceId === targetId) {
      return res.status(400).json({ error: 'Source and target categories must be different' });
    }

    // Get both categories
    const sourceResult = await pool.query('SELECT * FROM categories WHERE id = $1', [sourceId]);
    const targetResult = await pool.query('SELECT * FROM categories WHERE id = $1', [targetId]);

    if (sourceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Source category not found' });
    }
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target category not found' });
    }

    const sourceCategory = sourceResult.rows[0];
    const targetCategory = targetResult.rows[0];

    // Cannot merge default category into another
    if (sourceCategory.is_default) {
      return res.status(400).json({ error: 'Cannot merge the default category' });
    }

    // Move all items from source to target
    const updateResult = await pool.query(
      'UPDATE items SET category = $1 WHERE LOWER(category) = LOWER($2)',
      [targetCategory.slug, sourceCategory.slug]
    );

    // Delete source category
    await pool.query('DELETE FROM categories WHERE id = $1', [sourceId]);

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'categories_merged',
      actionType: 'admin',
      resourceType: 'category',
      resourceId: targetId,
      details: {
        sourceCategory: sourceCategory.name,
        targetCategory: targetCategory.name,
        itemsMoved: updateResult.rowCount
      },
      req
    });

    res.json({
      message: 'Categories merged successfully',
      itemsMoved: updateResult.rowCount,
      targetCategory: targetCategory
    });
  } catch (error) {
    console.error('Merge categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= NOTIFICATION PREFERENCES ROUTES =============

// Get user's notification preferences
app.get('/api/notification-preferences', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      // Return default preferences
      res.json({
        preferences: {
          announcements: true,
          account_updates: true,
          item_recommendations: true,
          weekly_digest: false
        }
      });
    } else {
      res.json({ preferences: result.rows[0] });
    }
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user's notification preferences
app.put('/api/notification-preferences', authenticateToken, async (req, res) => {
  try {
    const { announcements, account_updates, item_recommendations, weekly_digest } = req.body;

    const result = await pool.query(`
      INSERT INTO notification_preferences (user_id, announcements, account_updates, item_recommendations, weekly_digest)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id)
      DO UPDATE SET
        announcements = $2,
        account_updates = $3,
        item_recommendations = $4,
        weekly_digest = $5,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [req.user.userId, announcements, account_updates, item_recommendations, weekly_digest]);

    res.json({ preferences: result.rows[0] });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's API settings
app.get('/api/user/api-settings', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT anthropic_api_key, image_analysis_enabled, llm_provider, llm_api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const activeKey = user.llm_api_key || user.anthropic_api_key;
    res.json({
      hasApiKey: !!activeKey,
      apiKeyPreview: activeKey ? `...${activeKey.slice(-4)}` : null,
      imageAnalysisEnabled: user.image_analysis_enabled !== false,
      llmProvider: user.llm_provider || 'anthropic',
    });
  } catch (error) {
    console.error('Get API settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user's API settings
app.put('/api/user/api-settings', authenticateToken, async (req, res) => {
  try {
    const { anthropic_api_key, llm_api_key, image_analysis_enabled, clear_api_key, llm_provider } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (clear_api_key) {
      updates.push(`llm_api_key = NULL`);
      updates.push(`anthropic_api_key = NULL`);
    } else {
      const newKey = llm_api_key || anthropic_api_key;
      if (newKey !== undefined && newKey !== '') {
        updates.push(`llm_api_key = $${paramCount++}`);
        params.push(newKey);
        updates.push(`anthropic_api_key = $${paramCount++}`);
        params.push(newKey);
      }
    }

    if (llm_provider !== undefined && llmProviders.getProvider(llm_provider)) {
      updates.push(`llm_provider = $${paramCount++}`);
      params.push(llm_provider);
    }

    if (image_analysis_enabled !== undefined) {
      updates.push(`image_analysis_enabled = $${paramCount++}`);
      params.push(image_analysis_enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(req.user.userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING llm_api_key, anthropic_api_key, image_analysis_enabled, llm_provider`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const activeKey = user.llm_api_key || user.anthropic_api_key;
    res.json({
      hasApiKey: !!activeKey,
      apiKeyPreview: activeKey ? `...${activeKey.slice(-4)}` : null,
      imageAnalysisEnabled: user.image_analysis_enabled !== false,
      llmProvider: user.llm_provider || 'anthropic',
    });
  } catch (error) {
    console.error('Update API settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get household members
app.get('/api/household-members', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, relationship, created_at FROM household_members WHERE user_id = $1 ORDER BY name',
      [req.user.userId]
    );
    res.json({ members: result.rows });
  } catch (error) {
    console.error('Get household members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add household member
app.post('/api/household-members', authenticateToken, async (req, res) => {
  try {
    const { name, relationship } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      'INSERT INTO household_members (user_id, name, relationship) VALUES ($1, $2, $3) RETURNING id, name, relationship, created_at',
      [req.user.userId, name.trim(), relationship || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add household member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update household member
app.put('/api/household-members/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, relationship } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      'UPDATE household_members SET name = $1, relationship = $2 WHERE id = $3 AND user_id = $4 RETURNING id, name, relationship, created_at',
      [name.trim(), relationship || null, id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Household member not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update household member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete household member
app.delete('/api/household-members/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM household_members WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Household member not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete household member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= RECOMMENDATION SETTINGS ROUTES =============

// Get recommendation settings (admin)
app.get('/api/admin/recommendations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recommendation_weights', 'recommendation_thresholds', 'recommendation_strategies')"
    );

    const settings = {};
    result.rows.forEach(row => {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch (e) {
        settings[row.setting_key] = row.setting_value;
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Get recommendation settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update recommendation weights (admin)
app.put('/api/admin/recommendations/weights', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { weights } = req.body;

    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({ error: 'Invalid weights data' });
    }

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('recommendation_weights', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(weights)]
    );

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'recommendation_weights_updated',
      actionType: 'admin',
      resourceType: 'settings',
      details: { settingType: 'weights' },
      req
    });

    res.json({ message: 'Weights updated successfully' });
  } catch (error) {
    console.error('Update recommendation weights error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update recommendation thresholds (admin)
app.put('/api/admin/recommendations/thresholds', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { thresholds } = req.body;

    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({ error: 'Invalid thresholds data' });
    }

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('recommendation_thresholds', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(thresholds)]
    );

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'recommendation_thresholds_updated',
      actionType: 'admin',
      resourceType: 'settings',
      details: { settingType: 'thresholds' },
      req
    });

    res.json({ message: 'Thresholds updated successfully' });
  } catch (error) {
    console.error('Update recommendation thresholds error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update recommendation strategies (admin)
app.put('/api/admin/recommendations/strategies', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { strategies } = req.body;

    if (!strategies || typeof strategies !== 'object') {
      return res.status(400).json({ error: 'Invalid strategies data' });
    }

    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('recommendation_strategies', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(strategies)]
    );

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'recommendation_strategies_updated',
      actionType: 'admin',
      resourceType: 'settings',
      details: { settingType: 'strategies', activeStrategy: strategies.active },
      req
    });

    res.json({ message: 'Strategies updated successfully' });
  } catch (error) {
    console.error('Update recommendation strategies error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recommendation settings (for frontend - public for authenticated users)
app.get('/api/recommendations/settings', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('recommendation_weights', 'recommendation_thresholds', 'recommendation_strategies')"
    );

    const settings = {};
    result.rows.forEach(row => {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch (e) {
        settings[row.setting_key] = row.setting_value;
      }
    });

    // Determine which strategy to use (for A/B testing)
    const strategies = settings.recommendation_strategies || {};
    let activeStrategy = strategies.active || 'balanced';

    if (strategies.abTestEnabled && strategies.abTestPercentage) {
      // Use user ID to consistently assign them to a test group
      const userIdHash = req.user.userId % 100;
      if (userIdHash >= strategies.abTestPercentage) {
        // User is in the B group - use the alternate strategy
        activeStrategy = strategies.abTestAlternate || activeStrategy;
      }
    }

    res.json({
      weights: settings.recommendation_weights,
      thresholds: settings.recommendation_thresholds,
      activeStrategy,
      strategyConfig: strategies.strategies?.[activeStrategy] || null
    });
  } catch (error) {
    console.error('Get recommendation settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset recommendation settings to defaults (admin)
app.post('/api/admin/recommendations/reset', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { settingType } = req.body;

    const defaults = {
      recommendation_weights: {
        usage: { yes: { keep: 3, accessible: 2 }, rarely: { storage: 2, accessible: 1 }, no: { donate: 2, sell: 1, discard: 1 } },
        sentimental: { high: { keep: 3, storage: 2 }, some: { keep: 1, storage: 2 }, none: { sell: 1, donate: 1 } },
        condition: { excellent: { keep: 1, sell: 2, donate: 1 }, good: { keep: 1, sell: 2, donate: 1 }, fair: { donate: 2, discard: 1 }, poor: { discard: 3 } },
        value: { high: { keep: 2, sell: 3 }, medium: { sell: 2, donate: 1 }, low: { donate: 2, discard: 1 } },
        replaceability: { difficult: { keep: 2, storage: 2 }, moderate: { storage: 1 }, easy: { donate: 1, discard: 1 } },
        space: { yes: { keep: 2, accessible: 3 }, limited: { storage: 2 }, no: { storage: 1, sell: 1, donate: 1 } }
      },
      recommendation_thresholds: {
        minimumScoreDifference: 2,
        tieBreakOrder: ['keep', 'accessible', 'storage', 'sell', 'donate', 'discard']
      },
      recommendation_strategies: {
        active: 'balanced',
        abTestEnabled: false,
        abTestPercentage: 50,
        strategies: {
          balanced: { name: 'Balanced', description: 'Equal consideration of all factors', multipliers: { usage: 1, sentimental: 1, condition: 1, value: 1, replaceability: 1, space: 1 } },
          minimalist: { name: 'Minimalist', description: 'Favors letting go of items', multipliers: { usage: 1.5, sentimental: 0.5, condition: 1, value: 0.8, replaceability: 0.7, space: 1.5 } },
          sentimental: { name: 'Sentimental', description: 'Prioritizes emotional attachment', multipliers: { usage: 0.8, sentimental: 2, condition: 0.8, value: 0.5, replaceability: 1.5, space: 0.7 } },
          practical: { name: 'Practical', description: 'Focuses on usage and condition', multipliers: { usage: 2, sentimental: 0.5, condition: 1.5, value: 1, replaceability: 1, space: 1.2 } },
          financial: { name: 'Financial', description: 'Maximizes monetary value recovery', multipliers: { usage: 0.8, sentimental: 0.5, condition: 1.5, value: 2, replaceability: 0.8, space: 0.8 } }
        }
      }
    };

    if (settingType && defaults[settingType]) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [settingType, JSON.stringify(defaults[settingType])]
      );
    } else {
      // Reset all
      for (const [key, value] of Object.entries(defaults)) {
        await pool.query(
          `INSERT INTO system_settings (setting_key, setting_value)
           VALUES ($1, $2)
           ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
          [key, JSON.stringify(value)]
        );
      }
    }

    // Log activity
    await logActivity({
      userId: req.user.userId,
      action: 'recommendation_settings_reset',
      actionType: 'admin',
      resourceType: 'settings',
      details: { settingType: settingType || 'all' },
      req
    });

    res.json({ message: 'Settings reset to defaults' });
  } catch (error) {
    console.error('Reset recommendation settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ANALYTICS DASHBOARD ENDPOINTS
// ============================================

// Get item trends over time
app.get('/api/admin/analytics/item-trends', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const daysAgo = parseInt(period) || 30;

    // Items added per day
    const itemsPerDay = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Recommendations by type over time
    const recommendationsByType = await pool.query(`
      SELECT
        DATE(created_at) as date,
        recommendation,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND recommendation IS NOT NULL
      GROUP BY DATE(created_at), recommendation
      ORDER BY date ASC
    `);

    // Aggregate recommendations by type
    const recommendationTotals = await pool.query(`
      SELECT
        recommendation,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND recommendation IS NOT NULL
      GROUP BY recommendation
      ORDER BY count DESC
    `);

    res.json({
      itemsPerDay: itemsPerDay.rows,
      recommendationsByType: recommendationsByType.rows,
      recommendationTotals: recommendationTotals.rows,
      period: daysAgo
    });
  } catch (error) {
    console.error('Item trends error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user activity metrics
app.get('/api/admin/analytics/user-activity', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period) || 30;

    // Active users (users who added items in the period)
    const activeUsers = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as active_users
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
    `);

    // Total users
    const totalUsers = await pool.query(`
      SELECT COUNT(*) as total_users FROM users WHERE is_approved = true
    `);

    // Items per user (average and distribution)
    const itemsPerUser = await pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        COUNT(i.id) as item_count
      FROM users u
      LEFT JOIN items i ON u.id = i.user_id AND i.created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
      WHERE u.is_approved = true
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY item_count DESC
      LIMIT 10
    `);

    // Calculate average items per active user
    const avgItemsResult = await pool.query(`
      SELECT
        COALESCE(AVG(item_count), 0) as avg_items,
        COALESCE(MAX(item_count), 0) as max_items,
        COALESCE(MIN(NULLIF(item_count, 0)), 0) as min_items
      FROM (
        SELECT user_id, COUNT(*) as item_count
        FROM items
        WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        GROUP BY user_id
      ) subq
    `);

    // User registrations over time
    const registrations = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    res.json({
      activeUsers: parseInt(activeUsers.rows[0]?.active_users) || 0,
      totalUsers: parseInt(totalUsers.rows[0]?.total_users) || 0,
      topUsers: itemsPerUser.rows,
      averageItemsPerUser: parseFloat(avgItemsResult.rows[0]?.avg_items) || 0,
      maxItemsPerUser: parseInt(avgItemsResult.rows[0]?.max_items) || 0,
      minItemsPerUser: parseInt(avgItemsResult.rows[0]?.min_items) || 0,
      registrations: registrations.rows,
      period: daysAgo
    });
  } catch (error) {
    console.error('User activity error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get category distribution
app.get('/api/admin/analytics/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period) || 30;

    // Items by category
    const categoryDistribution = await pool.query(`
      SELECT
        COALESCE(category, 'Uncategorized') as category,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
      GROUP BY category
      ORDER BY count DESC
    `);

    // Category trends over time
    const categoryTrends = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COALESCE(category, 'Uncategorized') as category,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
      GROUP BY DATE(created_at), category
      ORDER BY date ASC
    `);

    // Recommendations by category
    const recommendationsByCategory = await pool.query(`
      SELECT
        COALESCE(category, 'Uncategorized') as category,
        recommendation,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND recommendation IS NOT NULL
      GROUP BY category, recommendation
      ORDER BY category, count DESC
    `);

    res.json({
      distribution: categoryDistribution.rows,
      trends: categoryTrends.rows,
      recommendationsByCategory: recommendationsByCategory.rows,
      period: daysAgo
    });
  } catch (error) {
    console.error('Category analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recommendation conversion tracking
app.get('/api/admin/analytics/conversions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period) || 30;

    // Items with decisions made (comparing recommendation to final decision)
    const conversionData = await pool.query(`
      SELECT
        recommendation,
        decision,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND recommendation IS NOT NULL
        AND decision IS NOT NULL
      GROUP BY recommendation, decision
      ORDER BY recommendation, count DESC
    `);

    // Overall conversion rate (users following recommendations)
    const overallConversion = await pool.query(`
      SELECT
        COUNT(CASE WHEN recommendation = decision THEN 1 END) as followed,
        COUNT(CASE WHEN recommendation != decision THEN 1 END) as diverged,
        COUNT(*) as total
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND recommendation IS NOT NULL
        AND decision IS NOT NULL
    `);

    // Conversion by recommendation type
    const conversionByType = await pool.query(`
      SELECT
        recommendation,
        COUNT(CASE WHEN recommendation = decision THEN 1 END) as followed,
        COUNT(CASE WHEN recommendation != decision THEN 1 END) as diverged,
        COUNT(*) as total
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND recommendation IS NOT NULL
        AND decision IS NOT NULL
      GROUP BY recommendation
      ORDER BY total DESC
    `);

    // Pending decisions (no decision yet)
    const pendingDecisions = await pool.query(`
      SELECT
        recommendation,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND recommendation IS NOT NULL
        AND decision IS NULL
      GROUP BY recommendation
      ORDER BY count DESC
    `);

    // Modified recommendations (admin changed the AI recommendation)
    const modifiedRecommendations = await pool.query(`
      SELECT
        original_recommendation,
        recommendation as modified_to,
        COUNT(*) as count
      FROM items
      WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days'
        AND original_recommendation IS NOT NULL
        AND recommendation IS NOT NULL
        AND original_recommendation != recommendation
      GROUP BY original_recommendation, recommendation
      ORDER BY count DESC
    `);

    const overall = overallConversion.rows[0] || { followed: 0, diverged: 0, total: 0 };
    const followRate = overall.total > 0 ? (overall.followed / overall.total * 100).toFixed(1) : 0;

    res.json({
      conversionMatrix: conversionData.rows,
      overall: {
        followed: parseInt(overall.followed) || 0,
        diverged: parseInt(overall.diverged) || 0,
        total: parseInt(overall.total) || 0,
        followRate: parseFloat(followRate)
      },
      byRecommendationType: conversionByType.rows,
      pendingDecisions: pendingDecisions.rows,
      modifiedRecommendations: modifiedRecommendations.rows,
      period: daysAgo
    });
  } catch (error) {
    console.error('Conversion analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get dashboard summary
app.get('/api/admin/analytics/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period) || 30;

    // Quick stats
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days') as items_added,
        (SELECT COUNT(DISTINCT user_id) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days') as active_users,
        (SELECT COUNT(*) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND decision IS NOT NULL) as decisions_made,
        (SELECT COUNT(*) FROM items WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days' AND recommendation = decision) as recommendations_followed,
        (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '${daysAgo} days') as new_users
    `);

    const s = stats.rows[0];
    const followRate = s.decisions_made > 0 ? ((s.recommendations_followed / s.decisions_made) * 100).toFixed(1) : 0;

    res.json({
      itemsAdded: parseInt(s.items_added) || 0,
      activeUsers: parseInt(s.active_users) || 0,
      decisionsMade: parseInt(s.decisions_made) || 0,
      recommendationsFollowed: parseInt(s.recommendations_followed) || 0,
      followRate: parseFloat(followRate),
      newUsers: parseInt(s.new_users) || 0,
      period: daysAgo
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  } else if (err) {
    console.error('Upload error:', err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ============================================
// ACTIVITY LOGS ENDPOINTS
// ============================================

// Get activity logs with filtering and pagination
app.get('/api/admin/activity-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      actionType,
      action,
      userId,
      startDate,
      endDate,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let paramCount = 1;
    const conditions = [];

    if (actionType) {
      conditions.push(`al.action_type = $${paramCount++}`);
      params.push(actionType);
    }

    if (action) {
      conditions.push(`al.action = $${paramCount++}`);
      params.push(action);
    }

    if (userId) {
      conditions.push(`al.user_id = $${paramCount++}`);
      params.push(parseInt(userId));
    }

    if (startDate) {
      conditions.push(`al.created_at >= $${paramCount++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`al.created_at <= $${paramCount++}`);
      params.push(endDate);
    }

    if (search) {
      conditions.push(`(al.action ILIKE $${paramCount} OR al.details::text ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get logs with user info
    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT
        al.*,
        u.email as user_email,
        u.first_name,
        u.last_name
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    res.json({
      logs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get activity log summary/stats
app.get('/api/admin/activity-logs/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '7' } = req.query;
    const daysAgo = parseInt(period) || 7;

    // Get counts by action type
    const typeCountsResult = await pool.query(`
      SELECT action_type, COUNT(*) as count
      FROM activity_logs
      WHERE created_at >= NOW() - INTERVAL '${daysAgo} days'
      GROUP BY action_type
      ORDER BY count DESC
    `);

    // Get counts by action
    const actionCountsResult = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM activity_logs
      WHERE created_at >= NOW() - INTERVAL '${daysAgo} days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);

    // Get daily activity for chart
    const dailyResult = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN action_type = 'user' THEN 1 END) as user_actions,
        COUNT(CASE WHEN action_type = 'item' THEN 1 END) as item_actions,
        COUNT(CASE WHEN action_type = 'admin' THEN 1 END) as admin_actions,
        COUNT(CASE WHEN action_type = 'system' THEN 1 END) as system_events
      FROM activity_logs
      WHERE created_at >= NOW() - INTERVAL '${daysAgo} days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Get most active users
    const activeUsersResult = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        COUNT(*) as action_count
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.created_at >= NOW() - INTERVAL '${daysAgo} days'
      GROUP BY u.id, u.email, u.first_name, u.last_name
      ORDER BY action_count DESC
      LIMIT 5
    `);

    // Get recent failed logins
    const failedLoginsResult = await pool.query(`
      SELECT
        details->>'email' as email,
        details->>'reason' as reason,
        ip_address,
        created_at
      FROM activity_logs
      WHERE action = 'login_failed'
        AND created_at >= NOW() - INTERVAL '${daysAgo} days'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      period: daysAgo,
      typeCounts: typeCountsResult.rows,
      actionCounts: actionCountsResult.rows,
      dailyActivity: dailyResult.rows,
      mostActiveUsers: activeUsersResult.rows,
      recentFailedLogins: failedLoginsResult.rows
    });
  } catch (error) {
    console.error('Get activity logs stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get distinct action types and actions for filters
app.get('/api/admin/activity-logs/filters', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const actionTypesResult = await pool.query(`
      SELECT DISTINCT action_type FROM activity_logs ORDER BY action_type
    `);

    const actionsResult = await pool.query(`
      SELECT DISTINCT action FROM activity_logs ORDER BY action
    `);

    res.json({
      actionTypes: actionTypesResult.rows.map(r => r.action_type),
      actions: actionsResult.rows.map(r => r.action)
    });
  } catch (error) {
    console.error('Get activity logs filters error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});
