# Declutter Assistant

A full-stack web application that helps users make mindful decisions about their belongings through personalized recommendations based on their personality profile, goals, and preferences.

## Features

- 🔐 **User Authentication**: Secure registration and login system
- 👤 **Personality Profiles**: Comprehensive questionnaire to understand your decluttering style, goals, and preferences
- 📸 **Image Upload**: Upload photos of items you're evaluating
- 🤖 **Smart Recommendations**: Get personalized suggestions (Keep, Storage, Accessible, Sell, Donate, or Discard)
- 📊 **Dashboard**: Track your decluttering progress with statistics
- 📝 **Item History**: Review all evaluated items with filtering options
- 💾 **Database Storage**: All items and recommendations are saved for future reference

## Tech Stack

### Backend
- Node.js + Express
- PostgreSQL database
- JWT authentication
- Multer for image uploads
- bcrypt for password hashing

### Frontend
- React 18
- React Router for navigation
- Axios for API calls
- Modern CSS with custom design system

### Infrastructure
- Docker & Docker Compose
- Nginx for frontend serving
- Multi-stage Docker builds

## Prerequisites

- Docker and Docker Compose installed on your system
- At least 2GB of free disk space
- Port 3000 available (only port exposed to host)

**For Reverse Proxy Setup (Synology, Nginx, Traefik, etc.):**
See [REVERSE-PROXY-SETUP.md](REVERSE-PROXY-SETUP.md) for detailed configuration instructions.

## Installation & Setup

### 1. Clone or Download the Project

```bash
# If using git
git clone <repository-url>
cd declutter-app

# Or simply ensure all files are in a directory called 'declutter-app'
```

### 2. Project Structure

Ensure your directory structure looks like this:

```
declutter-app/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   └── init.sql
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.js
│       ├── App.css
│       ├── index.js
│       └── pages/
│           ├── Login.js
│           ├── Register.js
│           ├── Dashboard.js
│           ├── PersonalityProfile.js
│           ├── EvaluateItem.js
│           ├── ItemHistory.js
│           ├── ItemDetail.js
│           └── [CSS files]
└── README.md
```

### 3. Configure Environment Variables (Optional)

The application works out-of-the-box with default settings. For production, you should change the JWT secret:

Edit `docker-compose.yml` and update:
```yaml
JWT_SECRET: your-secure-secret-key-here
```

### 4. Build and Start the Application

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up --build -d
```

This will:
- Build the frontend and backend Docker images
- Start PostgreSQL database
- Initialize the database schema
- Start the backend API server
- Start the frontend web server

### 5. Access the Application

Once all services are running, open your browser and navigate to:

```
http://localhost:3000
```

## Using the Application

### 1. Create an Account
- Click "Sign up" on the login page
- Fill in your information
- You'll be redirected to create your personality profile

### 2. Set Up Your Personality Profile
Answer questions about:
- Your decluttering goals
- Relationship with sentimental items
- Minimalist preferences
- Budget priorities
- Living space
- Personal style

This profile helps personalize your recommendations.

### 3. Evaluate Items
- Click "Evaluate Item" from the dashboard
- Enter item details (name, description, location, category)
- Optionally upload a photo
- Answer evaluation questions:
  - Usage frequency
  - Sentimental value
  - Condition
  - Monetary value
  - Replaceability
  - Space availability
- Get a personalized recommendation with reasoning

### 4. View Your History
- See all evaluated items
- Filter by recommendation type
- Click on any item to view full details
- Delete items you no longer need to track

## Docker Commands

```bash
# Start services
docker-compose up

# Start services in background
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs

# View logs for specific service
docker-compose logs backend
docker-compose logs frontend

# Rebuild after code changes
docker-compose up --build

# Reset everything (including database)
docker-compose down -v
docker-compose up --build
```

## Architecture & Network

The application uses a single exposed port (3000) for security:

```
┌─────────────────────────────────────────────┐
│  Host Machine                               │
│                                             │
│  Port 3000 (exposed) ──┐                   │
│                         │                   │
│  ┌─────────────────────┼────────────────┐  │
│  │ Docker Network      │                │  │
│  │                     ▼                │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │ Frontend (Nginx)             │   │  │
│  │  │ Port 80 (internal)           │   │  │
│  │  └────────────┬─────────────────┘   │  │
│  │               │                      │  │
│  │               ▼                      │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │ Backend (Node.js/Express)    │   │  │
│  │  │ Port 3001 (internal only)    │   │  │
│  │  └────────────┬─────────────────┘   │  │
│  │               │                      │  │
│  │               ▼                      │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │ PostgreSQL Database          │   │  │
│  │  │ Port 5432 (internal only)    │   │  │
│  │  └──────────────────────────────┘   │  │
│  │                                      │  │
│  └──────────────────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

**Security Benefits:**
- Backend API not directly accessible from host
- Database not directly accessible from host
- All internal communication via Docker bridge network
- Only frontend exposed for reverse proxy connection

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Login and receive JWT token
- `GET /api/auth/me` - Get current user info

### Personality Profile
- `GET /api/profile` - Get user's personality profile
- `POST /api/profile` - Create or update personality profile

### Items
- `GET /api/items` - Get all items (with optional filters)
- `GET /api/items/:id` - Get specific item
- `POST /api/items` - Create new item (with image upload)
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item

### Statistics
- `GET /api/stats` - Get user statistics

## Database Schema

### users
- id, email, password_hash, first_name, last_name
- created_at, updated_at

### personality_profiles
- id, user_id, profile_data (JSONB)
- created_at, updated_at

### items
- id, user_id, name, description, location, category
- image_url, recommendation, recommendation_reasoning
- answers (JSONB), status
- created_at, updated_at

## Troubleshooting

### Port Already in Use
If you get a port conflict error:
```bash
# Check what's using the port
lsof -i :3000
lsof -i :3001
lsof -i :5432

# Change ports in docker-compose.yml if needed
```

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose ps

# View database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Frontend Not Loading
```bash
# Check frontend logs
docker-compose logs frontend

# Rebuild frontend
docker-compose up --build frontend
```

### Clear All Data and Restart
```bash
# Stop all containers and remove volumes
docker-compose down -v

# Rebuild and start fresh
docker-compose up --build
```

## Development

### Local Development (Without Docker)

#### Backend
```bash
cd backend
npm install
# Create a local PostgreSQL database
# Update connection string in server.js
npm start
```

#### Frontend
```bash
cd frontend
npm install
npm start
```

### Making Changes

After making code changes:
```bash
# Rebuild specific service
docker-compose up --build backend

# Or rebuild all
docker-compose up --build
```

## Security Notes

For production deployment:
1. Change the JWT_SECRET to a strong, random value
2. Use environment variables for sensitive data
3. Enable HTTPS (via reverse proxy recommended)
4. Set up proper CORS policies
5. Use a strong database password
6. Implement rate limiting
7. Add input validation and sanitization
8. **See REVERSE-PROXY-SETUP.md for complete production setup guide**

## Deployment with Reverse Proxy

For production deployment behind a reverse proxy (Synology, Nginx, Traefik, Caddy, etc.):

**📖 Complete Guide**: See [REVERSE-PROXY-SETUP.md](REVERSE-PROXY-SETUP.md)

The application is pre-configured to work behind a reverse proxy with:
- Proper header forwarding (X-Forwarded-For, X-Forwarded-Proto, etc.)
- Real IP detection
- WebSocket support
- File upload handling through proxy

**Quick Setup for Synology Users:**
1. Start the application: `docker-compose up -d`
2. Configure Synology reverse proxy to point to `localhost:3000`
3. Add SSL certificate (Let's Encrypt recommended)
4. See detailed steps in REVERSE-PROXY-SETUP.md

## Design System

The application uses a warm, calming color palette:
- **Cream/Warm White**: Background colors
- **Terracotta**: Primary brand color
- **Sage**: Secondary/accent color
- **Charcoal**: Text color
- Color-coded recommendations (Keep, Storage, Sell, Donate, Discard)

Fonts:
- **Crimson Pro**: Headings (serif)
- **DM Sans**: Body text (sans-serif)

## License

This project is provided as-is for personal use.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Docker logs: `docker-compose logs`
3. Ensure all files are in the correct directory structure
4. Verify Docker and Docker Compose are properly installed

## Future Enhancements

Potential features to add:
- Export data to CSV/PDF
- Sharing items with family members
- Progress tracking over time
- Integration with selling platforms
- Donation center locator
- Before/after room photos
- Gamification elements
