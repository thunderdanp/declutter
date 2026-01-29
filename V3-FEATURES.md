# Declutter Assistant V3 - Complete Feature Set

## 🎉 New Features in V3

### 1. ✅ Change Item Recommendations
- Users can override AI recommendations
- Original AI recommendation preserved for reference
- Visual indicator shows when user has modified recommendation
- Track change history with timestamps

### 2. ✅ Admin Panel
Complete admin dashboard with:
- User management (approve, delete, view stats)
- System settings configuration
- Registration mode control
- Real-time statistics

### 3. ✅ User Approval Workflow
Three registration modes:
- **Automatic**: Users register and login immediately (default)
- **Approval Required**: Admin must approve before user can login
- **Disallowed**: Registration completely blocked

### 4. ✅ Password Reset by Email
- Users request reset link via email
- Secure token with 1-hour expiration
- Email sent via SMTP (Gmail, SendGrid, etc.)
- Token invalidated after use

### 5. ✅ Enhanced Security
- Admin-only routes protected
- Password reset tokens expire
- User approval workflow
- Email verification optional

## 📦 What's in This Package

### Backend (`backend/`)
- **server.js**: Complete API with all admin features
- **package.json**: Updated with nodemailer dependency
- **init.sql**: Database schema with admin tables

### Frontend (`frontend/src/pages/`)
- **AdminDashboard.js**: Admin overview page
- **AdminUsers.js**: User management interface
- **AdminSettings.js**: System configuration
- **ForgotPassword.js**: Request password reset
- **ResetPassword.js**: Set new password
- **ItemDetail.js**: Enhanced with recommendation change
- **Admin.css**: Admin panel styling

### Database Updates
New tables and columns:
- `users`: Added is_admin, is_approved, reset_token fields
- `items`: Added original_recommendation, recommendation_changed_by_user
- `system_settings`: New table for configuration

## 🚀 Quick Start

### Step 1: Set Up Email (Optional but Recommended)

Add to your `.env` or docker-compose.yml:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
APP_URL=https://your-domain.com
```

For Gmail:
1. Enable 2-factor authentication
2. Generate app-specific password at https://myaccount.google.com/apppasswords
3. Use that password as SMTP_PASS

### Step 2: Build and Deploy

```bash
# Build new image with v3 features
cd docker-build
docker build -t thunderdanp/declutter:v3 .
docker push thunderdanp/declutter:v3

# Or use latest tag
docker build -t thunderdanp/declutter:latest .
docker push thunderdanp/declutter:latest

# Deploy
docker-compose down -v
docker-compose up -d
```

### Step 3: Create First Admin User

```bash
# Connect to database
docker exec -it declutter_db psql -U declutter_user -d declutter_db

# Make your user an admin
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';

# Exit
\q
```

## 🎯 Using the Features

### Changing Recommendations

1. Go to Item Detail page
2. Click "Change Recommendation" button
3. Select new recommendation from dropdown
4. Click "Save"
5. Original AI recommendation shows below as reference

### Admin Panel Access

1. Login as admin user
2. Click "Admin" in navigation (only visible to admins)
3. Access:
   - Dashboard: Overview and statistics
   - Users: Manage all users
   - Settings: Configure system

### User Approval Workflow

**As Admin:**
1. Go to Admin → Settings
2. Change "Registration Mode" to "Approval Required"
3. Go to Admin → Users
4. See pending users with "Approve" button
5. Click "Approve" to allow login

**As New User:**
1. Register account
2. See "Pending Approval" message
3. Wait for admin approval
4. Login after approval

### Password Reset

**As User:**
1. Click "Forgot Password" on login page
2. Enter email address
3. Check email for reset link
4. Click link and enter new password
5. Login with new password

## 🔧 Configuration Options

### Registration Modes

**automatic** (default):
- Users register and can login immediately
- Good for open communities
- No admin intervention needed

**approval**:
- Users register but cannot login until approved
- Admin reviews and approves each user
- Good for controlled access

**disallowed**:
- Registration form shows "Registration disabled"
- No new users can sign up
- Good for private/closed systems

### Email Settings

Without email configuration:
- Password reset still works but shows token in logs
- Copy from logs for manual testing
- Not recommended for production

With email configuration:
- Automated password reset emails
- Professional user experience
- Production-ready

## 📊 Admin Dashboard Features

### Statistics Cards
- Total Users: Count of all registered users
- Pending Approval: Users waiting for approval (click to review)
- Total Items: All items across all users

### Recent Users Table
- Shows last 10 registered users
- Displays email, name, registration date
- Shows approval status

### Quick Actions
- Manage Users: Jump to user management
- System Settings: Configure registration mode

## 👥 User Management Features

### User List
- Email and full name
- Registration date
- Admin status
- Approval status
- Item count per user
- Actions: Approve, Delete

### Filtering
- All Users
- Pending Approval
- Approved Users
- Admin Users

### Actions
- **Approve**: Allow pending user to login
- **Delete**: Remove user and all their items
- **Make Admin**: Grant admin privileges (coming soon)

## ⚙️ System Settings

### Registration Mode
Dropdown selector with three options:
- Automatic
- Approval Required
- Disallowed

### Email Configuration
- SMTP Host
- SMTP Port
- SMTP Username
- SMTP Password
- Application URL

## 🔒 Security Features

### Admin Protection
- Admin routes check is_admin flag
- Non-admins redirected to dashboard
- Admin links only visible to admins

### Password Reset Security
- Tokens are 32-byte random hex
- Expire after 1 hour
- Invalidated after use
- Email doesn't reveal if account exists

### User Approval
- Unapproved users cannot login
- Clear error message shown
- Admin notified of pending users

## 🎨 UI Updates

### Admin Navigation
- Separate navigation for admin pages
- "Admin" link in main nav (admin-only)
- "User View" link to return to regular interface

### Item Detail Enhancements
- "Change Recommendation" button
- Dropdown with all recommendation types
- Visual indicator: "Modified by you"
- Show original AI recommendation
- Change timestamp displayed

### Status Badges
- Approved: Green badge
- Pending: Yellow badge
- Admin: Blue badge

## 📝 API Endpoints Added

### Admin Routes
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/users` - List all users
- `PATCH /api/admin/users/:id/approve` - Approve user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/settings` - Get system settings
- `PUT /api/admin/settings/:key` - Update setting

### Password Reset
- `POST /api/auth/forgot-password` - Request reset
- `POST /api/auth/reset-password` - Reset with token

### User Management
- `GET /api/auth/me` - Get current user (includes isAdmin)
- Updated `/api/auth/register` - Respects registration mode
- Updated `/api/auth/login` - Checks approval status

### Items
- `PATCH /api/items/:id/recommendation` - Change recommendation

## 🔄 Migration from V2 to V3

If you have existing V2 data:

```sql
-- Add new columns to existing database
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

ALTER TABLE items ADD COLUMN IF NOT EXISTS original_recommendation VARCHAR(50);
ALTER TABLE items ADD COLUMN IF NOT EXISTS recommendation_changed_by_user BOOLEAN DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS recommendation_changed_at TIMESTAMP;

-- Copy existing recommendations to original_recommendation
UPDATE items SET original_recommendation = recommendation WHERE original_recommendation IS NULL;

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (setting_key, setting_value) 
VALUES ('registration_mode', 'automatic')
ON CONFLICT (setting_key) DO NOTHING;

-- Make yourself admin
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

## 📖 User Guide

### For Regular Users

**Changing a Recommendation:**
1. Click on any item in your history
2. See the current recommendation
3. Click "Change Recommendation"
4. Select new recommendation from dropdown
5. Click "Save Changes"
6. Original AI recommendation shown below for reference

**Resetting Password:**
1. On login page, click "Forgot Password?"
2. Enter your email address
3. Check your email inbox
4. Click the reset link
5. Enter your new password
6. You can now login with new password

### For Administrators

**Approving New Users:**
1. Login as admin
2. Click "Admin" in top navigation
3. See pending users count on dashboard
4. Click "Review Now" or go to Users page
5. Click "Approve" next to pending user
6. User can now login

**Changing Registration Mode:**
1. Go to Admin → Settings
2. Find "Registration Mode" dropdown
3. Select desired mode:
   - Automatic: Anyone can register
   - Approval: You approve each user
   - Disallowed: No new registrations
4. Click "Save Changes"

**Managing Users:**
1. Go to Admin → Users
2. See list of all users with stats
3. Filter by status if needed
4. Actions available:
   - Approve pending users
   - Delete users (caution: deletes all their items)

## 🐛 Troubleshooting

### Email Not Sending
- Check SMTP credentials in environment variables
- For Gmail: Must use app-specific password
- Check firewall allows outbound SMTP
- Look in container logs: `docker logs declutter_app`

### Can't Access Admin Panel
- Make sure your user has is_admin = true
- Check database: `SELECT is_admin FROM users WHERE email = 'your@email.com';`
- Logout and login again to refresh token

### Password Reset Link Doesn't Work
- Check link hasn't expired (1 hour limit)
- Verify APP_URL environment variable is set correctly
- Check token in database hasn't been used already

### User Can't Login After Registration
- Check if registration_mode is set to 'approval'
- Check if user is_approved = true in database
- Admin needs to approve user first

## 🎉 What's Next?

V3 is production-ready with:
- ✅ Full admin panel
- ✅ User management
- ✅ Password reset
- ✅ Recommendation changes
- ✅ Security features

Future enhancements could include:
- Bulk user actions
- Activity logging
- Email templates customization
- Two-factor authentication
- User roles beyond admin/user
- Export data functionality

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review container logs: `docker-compose logs`
3. Check database directly if needed
4. Verify environment variables are set

Enjoy your enhanced Declutter Assistant! 🏠✨
