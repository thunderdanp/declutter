# Quick Deployment with Pre-Built Image

This guide shows how to deploy Declutter Assistant using the pre-built Docker image from Docker Hub.

## What You Need

- Docker and Docker Compose installed
- Port 3000 available
- 2 files: `docker-compose-hub.yml` and `init.sql`

## Deployment Steps

### 1. Create Deployment Directory

```bash
mkdir declutter-assistant
cd declutter-assistant
```

### 2. Download Required Files

Download these 2 files into your directory:
- `docker-compose-hub.yml` (rename to `docker-compose.yml`)
- `init.sql`

Or create them manually:

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: declutter_db
    environment:
      POSTGRES_DB: declutter_db
      POSTGRES_USER: declutter_user
      POSTGRES_PASSWORD: declutter_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U declutter_user -d declutter_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - declutter-network
    restart: unless-stopped

  app:
    image: thunderdanp/declutter:latest
    container_name: declutter_app
    ports:
      - "3000:80"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://declutter_user:declutter_password@postgres:5432/declutter_db
      JWT_SECRET: your-secret-key-change-this-in-production
      PORT: 3001
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./uploads:/app/uploads
    networks:
      - declutter-network
    restart: unless-stopped

volumes:
  postgres_data:

networks:
  declutter-network:
    driver: bridge
```

Copy `init.sql` from the full package or create a minimal version.

### 3. Start the Application

```bash
docker-compose up -d
```

That's it! The application will:
1. Pull the pre-built image from Docker Hub
2. Start PostgreSQL database
3. Initialize the database schema
4. Start the application

### 4. Access the Application

Open your browser to:
```
http://localhost:3000
```

## Updating the Application

When a new version is released:

```bash
docker-compose pull
docker-compose up -d
```

## Configuration

### Change Port

Edit `docker-compose.yml`:
```yaml
app:
  ports:
    - "8080:80"  # Change 8080 to your desired port
```

### Change Database Password

Edit `docker-compose.yml`:
```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: your-secure-password

app:
  environment:
    DATABASE_URL: postgresql://declutter_user:your-secure-password@postgres:5432/declutter_db
```

### Change JWT Secret (IMPORTANT for production)

Edit `docker-compose.yml`:
```yaml
app:
  environment:
    JWT_SECRET: your-very-long-random-secret-key-here
```

Generate a secure secret:
```bash
openssl rand -base64 32
```

## File Structure

Your deployment directory should look like:
```
declutter-assistant/
├── docker-compose.yml
├── init.sql
└── uploads/           (created automatically)
```

## Backup

### Backup Database

```bash
docker exec declutter_db pg_dump -U declutter_user declutter_db > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker exec -i declutter_db psql -U declutter_user -d declutter_db
```

### Backup Uploaded Images

```bash
tar -czf uploads-backup.tar.gz uploads/
```

## Troubleshooting

### View Logs

```bash
docker-compose logs -f
```

### Restart Services

```bash
docker-compose restart
```

### Stop Services

```bash
docker-compose down
```

### Reset Everything

```bash
docker-compose down -v
docker-compose up -d
```

## Synology Deployment

1. **Create folder**: `/docker/declutter-assistant`
2. **Upload files**: `docker-compose.yml` and `init.sql`
3. **Open Terminal** (SSH or Synology Terminal)
4. **Navigate**: `cd /volume1/docker/declutter-assistant`
5. **Start**: `sudo docker-compose up -d`
6. **Configure reverse proxy**: See REVERSE-PROXY-SETUP.md

## Advantages of Pre-Built Image

✅ **Faster deployment** - No build time required  
✅ **Consistent** - Same image across all deployments  
✅ **Smaller download** - Only 2 files needed  
✅ **Easy updates** - Just pull and restart  
✅ **Multi-platform** - Works on x86_64 and ARM  

## Image Details

- **Repository**: thunderdanp/declutter
- **Tag**: latest (or specific version like 1.0.0)
- **Size**: ~150-200 MB compressed
- **Platforms**: linux/amd64, linux/arm64

## Security Notes

Before deploying to production:
1. ✅ Change `POSTGRES_PASSWORD`
2. ✅ Change `JWT_SECRET` to a strong random value
3. ✅ Set up reverse proxy with HTTPS
4. ✅ Configure firewall to only allow port 443/80
5. ✅ Regular backups of database and uploads
6. ✅ Keep image updated: `docker-compose pull`
