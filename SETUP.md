# 🏠 Declutter Assistant - Complete Package

Welcome! This zip file contains everything you need to run the Declutter Assistant application.

## 📦 What's Inside

```
declutter-assistant/
├── backend/              # Node.js/Express API server
├── frontend/             # React web application
├── docker-compose.yml    # Main Docker configuration
├── start.sh             # Quick start script
├── README.md            # Complete documentation
├── QUICKSTART.md        # Quick start guide
├── REVERSE-PROXY-SETUP.md  # Synology reverse proxy guide
├── .env.example         # Environment variables template
├── .gitignore           # Git ignore file
└── docker-compose.override.yml.example  # Configuration overrides
```

## 🚀 Quick Start (3 Steps)

### 1. Extract the Files
```bash
unzip declutter-assistant.zip
cd declutter-assistant
```

### 2. Start the Application

**Option A - Using the start script (Recommended):**
```bash
chmod +x start.sh
./start.sh
```

**Option B - Manual start:**
```bash
docker-compose up --build -d
```

### 3. Access the Application
Open your browser and go to:
```
http://localhost:3000
```

## 📖 Documentation

- **QUICKSTART.md** - Get started in 5 minutes
- **README.md** - Complete documentation and API reference
- **REVERSE-PROXY-SETUP.md** - Production deployment with Synology

## 🔧 Requirements

- Docker and Docker Compose installed
- Port 3000 available
- At least 2GB free disk space

## 🌐 Reverse Proxy (Synology)

To deploy behind a Synology reverse proxy:

1. Start the application: `./start.sh`
2. Configure Synology reverse proxy to point to `localhost:3000`
3. See **REVERSE-PROXY-SETUP.md** for detailed instructions

## 📁 File Structure After Extraction

The application will create an `uploads/` folder automatically for storing item images.

## ⚙️ Configuration

To customize settings (ports, passwords, etc.):

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
# Edit docker-compose.override.yml with your preferences
docker-compose up -d
```

## 🆘 Troubleshooting

**Port already in use?**
```bash
# Stop the application
docker-compose down

# Change port in docker-compose.override.yml
# Or stop the service using port 3000
```

**View logs:**
```bash
docker-compose logs -f
```

**Reset everything:**
```bash
docker-compose down -v
docker-compose up --build
```

## 📞 Support

For detailed help, see:
- README.md - Complete documentation
- QUICKSTART.md - Common questions
- REVERSE-PROXY-SETUP.md - Production setup

## 🎉 That's It!

You're ready to start decluttering! Create an account, set up your personality profile, and begin evaluating items.

Happy organizing! 📦✨
