const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const EmailService = require('./emailService');

// Email transporter configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_LOGIN,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: process.env.SMTP_OPENSSL_VERIFY_MODE === 'peer'
  }
});

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

  const { email, password, firstName, lastName, recaptchaToken } = req.body;

  // Verify reCAPTCHA token
  if (!recaptchaToken) {
    return res.status(400).json({ error: 'reCAPTCHA verification required' });
  }

  try {
    const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
    });
    const recaptchaData = await recaptchaResponse.json();

    if (!recaptchaData.success) {
      return res.status(400).json({ error: 'reCAPTCHA verification failed' });
    }
  } catch (recaptchaError) {
    console.error('reCAPTCHA verification error:', recaptchaError);
    return res.status(500).json({ error: 'reCAPTCHA verification error' });
  }

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

    // Send welcome email (don't block registration if it fails)
    emailService.sendTemplatedEmail('welcome', email, {
      firstName: firstName,
      lastName: lastName,
      email: email
    }).catch(err => console.error('Failed to send welcome email:', err));

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

// Forgot Password - Request reset link
app.post('/api/auth/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    // Check if user exists
    const userResult = await pool.query('SELECT id, first_name FROM users WHERE email = $1', [email]);

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      return res.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const user = userResult.rows[0];

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    // Invalidate any existing tokens for this user
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);

    // Store new token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetToken, expiresAt]
    );

    // Build reset URL
    const resetUrl = `${process.env.APP_URL || 'http://localhost'}/reset-password/${resetToken}`;

    // Send email using template
    const emailResult = await emailService.sendTemplatedEmail('password_reset', email, {
      firstName: user.first_name || 'User',
      resetLink: resetUrl
    });

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
    }

    res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset Password - Set new password
app.post('/api/auth/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token, password } = req.body;

  try {
    // Find valid token
    const tokenResult = await pool.query(
      `SELECT prt.id, prt.user_id FROM password_reset_tokens prt
       WHERE prt.token = $1 AND prt.used = FALSE AND prt.expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const resetToken = tokenResult.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);

    // Mark token as used
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [resetToken.id]);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change Password (authenticated user)
app.post('/api/auth/change-password', authenticateToken, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  try {
    // Get user's current password hash
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash and save new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, req.user.userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
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

// ============= ROOMS ROUTES =============

// Get user's rooms
app.get('/api/rooms', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, created_at FROM rooms WHERE user_id = $1 ORDER BY name ASC',
      [req.user.userId]
    );
    res.json({ rooms: result.rows });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a room
app.post('/api/rooms', authenticateToken, [
  body('name').trim().notEmpty().isLength({ max: 100 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name } = req.body;

  try {
    // Check for duplicate room name for this user
    const existing = await pool.query(
      'SELECT id FROM rooms WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
      [req.user.userId, name]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'A room with this name already exists' });
    }

    const result = await pool.query(
      'INSERT INTO rooms (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at',
      [req.user.userId, name]
    );
    res.status(201).json({ room: result.rows[0] });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a room
app.delete('/api/rooms/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM rooms WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Delete room error:', error);
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

// Analyze image with Claude
app.post('/api/analyze-image', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  try {
    // Read the uploaded image file
    const imageBuffer = await fs.readFile(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    // Determine the media type
    const mediaType = req.file.mimetype;

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Send to Claude for analysis
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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
  "category": "One of these categories: clothing, books, electronics, kitchen, decor, furniture, toys, tools, or other"
}

Be specific and descriptive. If multiple items are visible, focus on the main/central item.`
            }
          ],
        },
      ],
    });

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

    // Validate the category
    const validCategories = ['clothing', 'books', 'electronics', 'kitchen', 'decor', 'furniture', 'toys', 'tools', 'other'];
    if (!validCategories.includes(analysisResult.category)) {
      analysisResult.category = 'other';
    }

    res.json({
      name: analysisResult.name || 'Unknown Item',
      description: analysisResult.description || '',
      category: analysisResult.category || 'other'
    });

  } catch (error) {
    console.error('Image analysis error:', error);

    if (error.status === 401) {
      return res.status(500).json({
        error: 'API key not configured. Please set ANTHROPIC_API_KEY environment variable.'
      });
    }

    res.status(500).json({
      error: 'Error analyzing image',
      details: error.message
    });
  }
});

// ============= HOUSEHOLD MEMBERS ROUTES =============

// Get all household members for user
app.get('/api/household-members', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, relationship, created_at, updated_at FROM household_members WHERE user_id = $1 ORDER BY name ASC',
      [req.user.userId]
    );
    res.json({ members: result.rows });
  } catch (error) {
    console.error('Get household members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create household member
app.post('/api/household-members', authenticateToken, [
  body('name').trim().notEmpty().isLength({ max: 100 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, relationship } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO household_members (user_id, name, relationship) VALUES ($1, $2, $3) RETURNING *',
      [req.user.userId, name, relationship || null]
    );
    res.status(201).json({ member: result.rows[0] });
  } catch (error) {
    console.error('Create household member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update household member
app.put('/api/household-members/:id', authenticateToken, [
  body('name').trim().notEmpty().isLength({ max: 100 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, relationship } = req.body;

  try {
    const result = await pool.query(
      'UPDATE household_members SET name = $1, relationship = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, relationship || null, req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Household member not found' });
    }

    res.json({ member: result.rows[0] });
  } catch (error) {
    console.error('Update household member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete household member
app.delete('/api/household-members/:id', authenticateToken, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);

    // First, remove this member from all items' owner_ids
    await pool.query(
      'UPDATE items SET owner_ids = array_remove(owner_ids, $1) WHERE user_id = $2',
      [memberId, req.user.userId]
    );

    // Then delete the member
    const result = await pool.query(
      'DELETE FROM household_members WHERE id = $1 AND user_id = $2 RETURNING id',
      [memberId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Household member not found' });
    }

    res.json({ message: 'Household member deleted successfully' });
  } catch (error) {
    console.error('Delete household member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= ITEM ROUTES =============

// Get all items for user
app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const { status, recommendation, ownerId } = req.query;
    let query = 'SELECT * FROM items WHERE user_id = $1';
    const params = [req.user.userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (recommendation) {
      paramCount++;
      query += ` AND recommendation = $${paramCount}`;
      params.push(recommendation);
    }

    // Filter by owner
    if (ownerId === 'shared') {
      // Items with no owners (shared items)
      query += ' AND (owner_ids IS NULL OR owner_ids = \'{}\')';
    } else if (ownerId) {
      // Items belonging to specific owner
      paramCount++;
      query += ` AND $${paramCount} = ANY(owner_ids)`;
      params.push(parseInt(ownerId));
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

// Create item
app.post('/api/items', authenticateToken, upload.single('image'), async (req, res) => {
  const { name, description, location, category, recommendation, recommendationReasoning, answers, status, ownerIds } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  if (req.file) {
    console.log('Image saved successfully:', req.file.path, 'URL:', imageUrl);
  } else {
    console.log('No image file in request or upload failed');
  }

  // Parse ownerIds from JSON string if provided
  let parsedOwnerIds = [];
  if (ownerIds) {
    try {
      parsedOwnerIds = JSON.parse(ownerIds);
    } catch (e) {
      console.error('Error parsing ownerIds:', e);
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO items (user_id, name, description, location, category, image_url, recommendation, recommendation_reasoning, answers, status, owner_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        status || 'pending',
        parsedOwnerIds
      ]
    );

    res.status(201).json({ item: result.rows[0] });
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
    if (ownerIds !== undefined) {
      updates.push(`owner_ids = $${paramCount++}`);
      // Parse ownerIds from JSON string if it's a string
      let parsedOwnerIds = ownerIds;
      if (typeof ownerIds === 'string') {
        try {
          parsedOwnerIds = JSON.parse(ownerIds);
        } catch (e) {
          parsedOwnerIds = [];
        }
      }
      params.push(parsedOwnerIds);
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
    const { name, subject, body, description, is_system } = req.body;
    const result = await pool.query(
      'INSERT INTO email_templates (name, subject, body, description, is_system) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, subject, body, description || null, is_system || false]
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
    const { subject, body, description, is_system } = req.body;
    const result = await pool.query(
      'UPDATE email_templates SET subject = $1, body = $2, description = $3, is_system = $4 WHERE id = $5 RETURNING *',
      [subject, body, description || null, is_system || false, req.params.id]
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
