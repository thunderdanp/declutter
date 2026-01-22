# Quick Start Guide

## Get Started in 3 Steps

### 1. Prerequisites
Make sure you have installed:
- Docker Desktop (https://www.docker.com/products/docker-desktop)
- Docker Compose (usually included with Docker Desktop)

### 2. Configure Environment Variables (Optional but Recommended)

To enable AI-powered image analysis, you'll need an Anthropic API key:

1. **Get an API key:**
   - Visit https://console.anthropic.com/
   - Sign up or log in
   - Generate an API key

2. **Set the environment variable:**
   - Create a `.env` file in the project root:
     ```bash
     echo "ANTHROPIC_API_KEY=your-api-key-here" > .env
     ```
   - Or set it in your shell:
     ```bash
     export ANTHROPIC_API_KEY=your-api-key-here
     ```

**Note:** Without this key, the app will still work but won't auto-fill item details from photos.

### 3. Start the Application

**Option A: Using the startup script (Recommended)**
```bash
./start.sh
```

**Option B: Manual start**
```bash
docker-compose up --build -d
```

### 4. Access the Application
Open your browser and go to:
```
http://localhost:3000
```

## First Time Setup

1. **Create an account**
   - Click "Sign up"
   - Fill in your details
   - Create your account

2. **Set up your personality profile**
   - Answer questions about your decluttering goals
   - Share your preferences and style
   - This helps personalize recommendations

3. **Start evaluating items**
   - Click "Evaluate Item"
   - Upload a photo (optional - AI will auto-fill item details!)
   - Review and edit the auto-filled details
   - Answer the evaluation questions
   - Get your personalized recommendation

## Common Commands

```bash
# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Restart services
docker-compose restart

# Reset everything (deletes all data)
docker-compose down -v
docker-compose up --build
```

## Troubleshooting

**Port already in use?**
```bash
# Stop other services using ports 3000, 3001, or 5432
# Or change ports in docker-compose.yml
```

**Application not loading?**
```bash
# Check if services are running
docker-compose ps

# View logs for errors
docker-compose logs
```

**Need to reset the database?**
```bash
docker-compose down -v
docker-compose up --build
```

## What Next?

- Explore the Dashboard to see your statistics
- Evaluate multiple items to build your history
- Update your personality profile as your goals change
- Use filters in Item History to review decisions by category

## Support

For detailed information, see the full README.md file.
