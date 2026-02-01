# Declutter Assistant

🏠 **Smart home organization and decluttering assistant with AI-powered recommendations.**

Help users make decisions about their belongings through personalized recommendations based on usage patterns, sentimental value, condition, and space constraints.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)
![Node](https://img.shields.io/badge/node-18+-green.svg)
![React](https://img.shields.io/badge/react-18-blue.svg)

---

## ✨ Features

### For Users
| Feature | Description |
|---------|-------------|
| 🔐 **Secure Auth** | JWT-based authentication with password reset |
| 👤 **Personality Profiles** | Customized recommendations based on decluttering style |
| 📸 **Image Upload** | Photo documentation with optional AI analysis |
| 🤖 **Smart Recommendations** | AI suggests: keep, sell, donate, storage, or discard |
| ✅ **Decision Tracking** | Record what you actually did with each item |
| 👨‍👩‍👧‍👦 **Household Members** | Attribute items to family members |
| 📊 **Progress Dashboard** | Track your decluttering journey |
| 🌙 **Dark Mode** | Light and dark theme support |

### For Admins
| Feature | Description |
|---------|-------------|
| 👥 **User Management** | Approve, manage, and monitor users |
| 📧 **Email Templates** | Customizable email communications |
| 📢 **Announcements** | Broadcast updates to all users |
| 🏷️ **Categories** | Create and organize item categories |
| ⚙️ **Recommendation Tuning** | Adjust scoring weights and strategies |
| 🧪 **A/B Testing** | Compare different recommendation strategies |
| 📈 **Analytics Dashboard** | Item trends, user activity, conversion rates |
| 💰 **API Monitoring** | Track AI API usage and costs |

---

## 🚀 Quick Start

### Prerequisites
- [Docker](https://www.docker.com/get-started) and Docker Compose
- [Anthropic API Key](https://console.anthropic.com/) (optional, for AI image analysis)

### Deploy with Pre-built Image

```bash
# 1. Create a project directory
mkdir declutter && cd declutter

# 2. Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  app:
    image: thunderdanp/declutter:latest
    ports:
      - "3000:80"
    environment:
      - DATABASE_URL=postgresql://declutter_user:declutter_password@db:5432/declutter_db
      - JWT_SECRET=change-this-to-a-secure-random-string
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
    depends_on:
      - db
    volumes:
      - uploads:/app/backend/uploads

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=declutter_user
      - POSTGRES_PASSWORD=declutter_password
      - POSTGRES_DB=declutter_db
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
  uploads:
EOF

# 3. Start the application
docker-compose up -d

# 4. Open http://localhost:3000
```

### First User = Admin
The first user to register automatically becomes an admin.

---

## 🔨 Development Setup

### Build from Source

```bash
# Clone the repository
git clone https://github.com/thunderdanp/declutter.git
cd declutter

# Start with local build
docker-compose up --build -d
```

### Build and Push Docker Image

```bash
# Navigate to docker-build directory
cd docker-build

# Build for linux/amd64 and push to Docker Hub
docker buildx build --platform linux/amd64 -t thunderdanp/declutter:latest --push .
```

### Development Workflow

```bash
# 1. Make changes in frontend/ or backend/

# 2. Sync to docker-build (includes bcrypt fix for Alpine)
cp -r frontend/* docker-build/frontend/
cp -r backend/* docker-build/backend/
sed -i '' "s/require('bcrypt')/require('bcryptjs')/g" docker-build/backend/server.js
sed -i '' 's/"bcrypt": "^5.1.1"/"bcryptjs": "^2.4.3"/g' docker-build/backend/package.json

# 3. Build and push
cd docker-build
docker buildx build --platform linux/amd64 -t thunderdanp/declutter:latest --push .
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│                Host Machine                  │
│                                             │
│    Port 3000 ─────┐                         │
│                   │                          │
│    ┌──────────────┼────────────────────┐    │
│    │   Docker     │                    │    │
│    │              ▼                    │    │
│    │   ┌──────────────────┐            │    │
│    │   │  App Container   │            │    │
│    │   │  ┌────────────┐  │            │    │
│    │   │  │   Nginx    │  │ ← Static   │    │
│    │   │  │   :80      │  │   files    │    │
│    │   │  └─────┬──────┘  │            │    │
│    │   │        │         │            │    │
│    │   │  ┌─────▼──────┐  │            │    │
│    │   │  │  Node.js   │  │ ← API      │    │
│    │   │  │   :3001    │  │            │    │
│    │   │  └─────┬──────┘  │            │    │
│    │   └────────┼─────────┘            │    │
│    │            │                      │    │
│    │   ┌────────▼─────────┐            │    │
│    │   │   PostgreSQL     │ ← Database │    │
│    │   │      :5432       │            │    │
│    │   └──────────────────┘            │    │
│    └───────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, React Router v6, Context API, CSS Variables |
| **Backend** | Node.js, Express.js, JWT Auth, Multer |
| **Database** | PostgreSQL 15 |
| **AI** | Anthropic Claude API |
| **Email** | Nodemailer |
| **Infrastructure** | Docker, Nginx, Multi-stage builds |

---

## 📖 Documentation

- **[Interactive Development Roadmap](https://thunderdanp.github.io/declutter/roadmap.html)** — Visual overview of all features with status tracking
- **[API Reference](docs/API.md)** — Full backend API documentation

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| GET | `/api/items` | Get user's items |
| POST | `/api/items` | Create item with image |
| PUT | `/api/items/:id/decision` | Record item decision |
| GET | `/api/admin/analytics/summary` | Analytics overview |

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret for JWT signing | Yes |
| `ANTHROPIC_API_KEY` | Claude API key for AI features | No |
| `SMTP_HOST` | Email server host | No |
| `SMTP_PORT` | Email server port | No |
| `SMTP_USER` | Email username | No |
| `SMTP_PASS` | Email password | No |

### Database Migrations

When updating to a new version, run any required migrations:

```bash
# Add new columns for analytics
docker exec declutter_db psql -U declutter_user -d declutter_db -c "
  ALTER TABLE items ADD COLUMN IF NOT EXISTS decision VARCHAR(50);
  ALTER TABLE items ADD COLUMN IF NOT EXISTS original_recommendation VARCHAR(50);
"
```

---

## 📁 Project Structure

```
declutter/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── context/         # React Context providers
│   │   ├── pages/           # Page components
│   │   └── utils/           # Utilities (recommendation engine)
│   └── public/
│
├── backend/                  # Node.js API server
│   ├── server.js            # Express application
│   ├── emailService.js      # Email functionality
│   └── init.sql             # Database schema
│
├── docker-build/            # Docker build context
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── frontend/            # Synced frontend
│   └── backend/             # Synced backend
│
├── docs/                    # Documentation
│   ├── API.md               # API reference
│   └── roadmap.html         # Interactive development roadmap
│
└── docker-compose.yml       # Development compose file
```

---

## 🔒 Security

**Production Checklist:**

- [ ] Change `JWT_SECRET` to a cryptographically secure value
- [ ] Change database password from default
- [ ] Use HTTPS via reverse proxy (Nginx, Traefik, Caddy)
- [ ] Configure firewall to only expose port 3000/443
- [ ] Set up automated backups for PostgreSQL
- [ ] Review and restrict CORS settings if needed

---

## 🆘 Troubleshooting

### Container won't start
```bash
docker-compose logs -f app  # Check application logs
docker-compose logs -f db   # Check database logs
```

### Database connection errors
```bash
# Ensure database is ready before app starts
docker-compose down -v  # Remove volumes
docker-compose up -d    # Fresh start
```

### Port already in use
```bash
# Find process using port 3000
lsof -i :3000           # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Or change port in docker-compose.yml
ports:
  - "8080:80"  # Use port 8080 instead
```

### Reset admin password
```bash
docker exec declutter_db psql -U declutter_user -d declutter_db -c "
  UPDATE users SET password_hash = '\$2b\$10\$...' WHERE email = 'admin@example.com';
"
```

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/thunderdanp/declutter/issues)
- **Docker Hub**: [thunderdanp/declutter](https://hub.docker.com/r/thunderdanp/declutter)

---

<p align="center">Made with ❤️ for organized homes</p>
