const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const Anthropic = require('@anthropic-ai/sdk');
const EmailService = require('./emailService');

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

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
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

  const { email, password, firstName, lastName } = req.body;

  try {
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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
      { expiresIn: '7d' }
    );

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

    res.json({ profile: result.rows[0].profile_data });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= IMAGE ANALYSIS ROUTE =============

// Helper function to calculate estimated cost (Claude Sonnet pricing)
const calculateApiCost = (inputTokens, outputTokens) => {
  // Claude Sonnet 4 pricing: $3/M input, $15/M output
  const inputCost = (inputTokens / 1000000) * 3;
  const outputCost = (outputTokens / 1000000) * 15;
  return inputCost + outputCost;
};

// Helper function to log API usage
const logApiUsage = async (userId, endpoint, model, inputTokens, outputTokens, success, errorMessage = null, usedUserKey = false) => {
  try {
    const estimatedCost = calculateApiCost(inputTokens, outputTokens);
    await pool.query(
      `INSERT INTO api_usage_logs (user_id, endpoint, model, input_tokens, output_tokens, estimated_cost, success, error_message, used_user_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, endpoint, model, inputTokens, outputTokens, estimatedCost, success, errorMessage, usedUserKey]
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

// Analyze image with Claude
app.post('/api/analyze-image', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  const modelName = 'claude-sonnet-4-20250514';
  let usedUserKey = false;

  try {
    // Check if user has their own API key
    const userResult = await pool.query(
      'SELECT anthropic_api_key FROM users WHERE id = $1',
      [req.user.userId]
    );
    const userApiKey = userResult.rows[0]?.anthropic_api_key;
    usedUserKey = !!userApiKey;

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

    // Get system API key (database takes priority over environment)
    let systemApiKey = process.env.ANTHROPIC_API_KEY;
    if (!userApiKey) {
      const sysKeyResult = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'anthropic_api_key'"
      );
      if (sysKeyResult.rows[0]?.setting_value) {
        systemApiKey = sysKeyResult.rows[0].setting_value;
      }
    }

    const apiKey = userApiKey || systemApiKey;
    if (!apiKey) {
      return res.status(400).json({
        error: 'No API key available',
        message: 'Please add your Anthropic API key in settings or contact the administrator'
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

    // Determine the media type
    const mediaType = req.file.mimetype;

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: apiKey
    });

    // Send to Claude for analysis
    const message = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Please analyze this image and identify what item or items are shown. Provide your response in the following JSON format only, with no additional text:

{
  "name": "A brief, clear name for the item (e.g., 'Vintage Record Player', 'Winter Coat', 'Kitchen Blender')",
  "description": "A detailed description of the item including its appearance, condition, and any notable features (2-3 sentences)",
  "category": "One of these categories: ${categoryList}",
  "location": "Suggest the most likely room where this item is typically found or used. One of: bedroom, living-room, kitchen, bathroom, garage, attic, basement, closet, other"
}

Be specific and descriptive. If multiple items are visible, focus on the main/central item.`
            }
          ],
        },
      ],
    });

    // Log successful API usage
    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;
    await logApiUsage(req.user.userId, '/api/analyze-image', modelName, inputTokens, outputTokens, true, null, usedUserKey);

    // Parse Claude's response
    const responseText = message.content[0].text;

    // Try to extract JSON from the response
    let analysisResult;
    try {
      // Check if the response is wrapped in code blocks
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('Error parsing Claude response:', parseError);
      console.error('Response was:', responseText);
      return res.status(500).json({
        error: 'Could not parse AI response',
        rawResponse: responseText
      });
    }

    // Validate the category against database
    const validSlugs = categoriesResult.rows.map(c => c.slug.toLowerCase());
    if (!validSlugs.includes(analysisResult.category?.toLowerCase())) {
      // Get default category slug
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
    await logApiUsage(req.user.userId, '/api/analyze-image', modelName, 0, 0, false, error.message, usedUserKey);

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

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error);
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
             u.anthropic_api_key IS NOT NULL as has_api_key, u.image_analysis_enabled,
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
    const { anthropic_api_key, image_analysis_enabled, clear_api_key } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (clear_api_key) {
      updates.push(`anthropic_api_key = NULL`);
    } else if (anthropic_api_key !== undefined && anthropic_api_key !== '') {
      updates.push(`anthropic_api_key = $${paramCount++}`);
      params.push(anthropic_api_key);
    }

    if (image_analysis_enabled !== undefined) {
      updates.push(`image_analysis_enabled = $${paramCount++}`);
      params.push(image_analysis_enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, anthropic_api_key, image_analysis_enabled`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      hasApiKey: !!user.anthropic_api_key,
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

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
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

// Get system API key status
app.get('/api/admin/api-key', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'anthropic_api_key'"
    );
    const dbKey = result.rows[0]?.setting_value;
    const envKey = process.env.ANTHROPIC_API_KEY;

    res.json({
      hasDbKey: !!dbKey,
      dbKeyPreview: dbKey ? `sk-...${dbKey.slice(-4)}` : null,
      hasEnvKey: !!envKey,
      envKeyPreview: envKey ? `sk-...${envKey.slice(-4)}` : null,
      activeSource: dbKey ? 'database' : (envKey ? 'environment' : 'none')
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update system API key
app.put('/api/admin/api-key', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { api_key, clear_key } = req.body;

    if (clear_key) {
      await pool.query(
        "DELETE FROM system_settings WHERE setting_key = 'anthropic_api_key'"
      );
      const envKey = process.env.ANTHROPIC_API_KEY;
      return res.json({
        message: 'API key removed from database',
        hasDbKey: false,
        hasEnvKey: !!envKey,
        activeSource: envKey ? 'environment' : 'none'
      });
    }

    if (!api_key) {
      return res.status(400).json({ error: 'API key is required' });
    }

    await pool.query(`
      INSERT INTO system_settings (setting_key, setting_value)
      VALUES ('anthropic_api_key', $1)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = CURRENT_TIMESTAMP
    `, [api_key]);

    res.json({
      message: 'API key saved successfully',
      hasDbKey: true,
      dbKeyPreview: `sk-...${api_key.slice(-4)}`,
      activeSource: 'database'
    });
  } catch (error) {
    console.error('Update API key error:', error);
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
    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete announcement
app.delete('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
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
      'SELECT anthropic_api_key, image_analysis_enabled FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      hasApiKey: !!user.anthropic_api_key,
      apiKeyPreview: user.anthropic_api_key ? `sk-...${user.anthropic_api_key.slice(-4)}` : null,
      imageAnalysisEnabled: user.image_analysis_enabled !== false
    });
  } catch (error) {
    console.error('Get API settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user's API settings
app.put('/api/user/api-settings', authenticateToken, async (req, res) => {
  try {
    const { anthropic_api_key, image_analysis_enabled, clear_api_key } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (clear_api_key) {
      updates.push(`anthropic_api_key = NULL`);
    } else if (anthropic_api_key !== undefined && anthropic_api_key !== '') {
      updates.push(`anthropic_api_key = $${paramCount++}`);
      params.push(anthropic_api_key);
    }

    if (image_analysis_enabled !== undefined) {
      updates.push(`image_analysis_enabled = $${paramCount++}`);
      params.push(image_analysis_enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(req.user.userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING anthropic_api_key, image_analysis_enabled`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      hasApiKey: !!user.anthropic_api_key,
      apiKeyPreview: user.anthropic_api_key ? `sk-...${user.anthropic_api_key.slice(-4)}` : null,
      imageAnalysisEnabled: user.image_analysis_enabled !== false
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

    res.json({ message: 'Settings reset to defaults' });
  } catch (error) {
    console.error('Reset recommendation settings error:', error);
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});
