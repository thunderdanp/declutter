# Reverse Proxy Setup Guide

## Overview

This application is configured to work behind a reverse proxy. The internal nginx server handles routing between the React frontend and Node.js backend, while your Synology reverse proxy handles external access and SSL/TLS termination.

## Architecture

```
Internet → Synology Reverse Proxy (HTTPS) → Docker Frontend (HTTP :3000) → Backend/Database
```

## Synology Reverse Proxy Configuration

### Step 1: Start the Application

First, ensure the Docker containers are running:

```bash
cd /path/to/declutter-app
docker-compose up -d
```

Verify services are running:
```bash
docker-compose ps
```

You should see:
- declutter_frontend (port 3000)
- declutter_backend (port 3001)
- declutter_db (port 5432)

### Step 2: Configure Synology Reverse Proxy

1. **Open Synology Control Panel**
   - Go to: Control Panel → Login Portal → Advanced → Reverse Proxy

2. **Create New Reverse Proxy Rule**
   - Click "Create"

3. **General Settings**
   - **Description**: `Declutter Assistant`
   - **Protocol**: HTTPS (recommended) or HTTP
   - **Hostname**: Your domain (e.g., `declutter.yourdomain.com`)
   - **Port**: 443 (for HTTPS) or 80 (for HTTP)
   - **Enable HSTS**: ✓ (if using HTTPS)
   - **Enable HTTP/2**: ✓ (if using HTTPS)

4. **Backend Server**
   - **Protocol**: HTTP
   - **Hostname**: `localhost` (or your Synology IP)
   - **Port**: `3000`

5. **Custom Headers** (Click "Custom Header" tab)
   Add these headers:

   | Header Name | Value |
   |-------------|-------|
   | X-Forwarded-Proto | $scheme |
   | X-Forwarded-Host | $http_host |
   | X-Real-IP | $remote_addr |

6. **WebSocket Settings**
   - Enable WebSocket: ✓ (if you see this option)

7. **Click "Save"**

### Step 3: SSL/TLS Certificate (Recommended)

If using HTTPS:

1. **Go to**: Control Panel → Security → Certificate
2. **Add or configure certificate** for your domain
3. **Assign the certificate** to your reverse proxy rule

You can use:
- Let's Encrypt (free, auto-renewal)
- Your own certificate
- Synology's default certificate (for testing only)

### Step 4: Test the Setup

1. **Access your application**:
   - HTTPS: `https://declutter.yourdomain.com`
   - HTTP: `http://declutter.yourdomain.com`

2. **Test functionality**:
   - Register a new account
   - Upload an image (tests file uploads through proxy)
   - Evaluate an item
   - Check all pages load correctly

## Firewall Configuration

### On Your Router/Firewall
- Open port 443 (HTTPS) or 80 (HTTP)
- Forward to your Synology NAS

### On Synology Firewall
- Allow port 3000 from localhost only (Docker access)
- Allow port 443/80 from all (external access)

## DNS Configuration

Point your domain to your external IP:

```
A Record: declutter.yourdomain.com → Your.Public.IP.Address
```

Or use Synology DDNS:
- Control Panel → External Access → DDNS
- Register a free Synology DDNS name

## Troubleshooting

### Issue: Can't access the application

**Check Docker containers are running:**
```bash
docker-compose ps
```

**Check container logs:**
```bash
docker-compose logs frontend
docker-compose logs backend
```

**Test direct access (from Synology):**
```bash
curl http://localhost:3000
```

### Issue: Login works but images don't upload

**Problem**: File upload path issues through reverse proxy

**Solution**: Ensure the reverse proxy passes the correct headers (already configured in nginx.conf)

**Verify**: Check backend logs when uploading:
```bash
docker-compose logs -f backend
```

### Issue: "Mixed content" warnings (HTTP/HTTPS)

**Problem**: Accessing HTTPS site but app makes HTTP requests

**Solution**: The app respects the X-Forwarded-Proto header (already configured)

**Verify**: Check browser console for mixed content errors

### Issue: Session/Authentication problems

**Problem**: JWT tokens not being saved/sent correctly

**Solution**: 
1. Check browser cookies are enabled
2. Verify domain name is consistent
3. Clear browser cache and cookies

### Issue: Slow image loading

**Problem**: Large images being proxied

**Solution**: 
- Images are stored in Docker volume
- Consider adding caching headers in Synology reverse proxy
- Check network bandwidth

## Advanced Configuration

### Using a Subdirectory Path

If you want to host at `yourdomain.com/declutter` instead of `declutter.yourdomain.com`:

**This requires additional configuration** and is not recommended due to complexity with React Router and API paths.

### Multiple Instances

You can run multiple instances on different ports:

1. Copy the entire application directory
2. Edit `docker-compose.yml` in each copy:
   ```yaml
   ports:
     - "3010:80"  # Change port number for each instance
   ```
3. Create separate reverse proxy rules for each instance

### Database Backup

**Automated backups** (recommended):

Since the database is not exposed to the host, use Docker exec for backups:

```bash
#!/bin/bash
# Backup script - save as backup-database.sh
docker exec declutter_db pg_dump -U declutter_user declutter_db > /volume1/backups/declutter_$(date +%Y%m%d).sql
```

Make it executable:
```bash
chmod +x backup-database.sh
```

Add to Synology Task Scheduler (daily):
- Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script
- User: root
- Schedule: Daily at 2:00 AM
- Task: `/path/to/backup-database.sh`

**Manual backup:**
```bash
docker exec declutter_db pg_dump -U declutter_user declutter_db > backup.sql
```

**Restore from backup:**
```bash
cat backup.sql | docker exec -i declutter_db psql -U declutter_user -d declutter_db
```

**Note:** If you need direct database access (e.g., for pgAdmin), you can expose port 5432 using a docker-compose.override.yml file, but this is NOT recommended for production.

### Monitoring

**View application logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

**Monitor resource usage:**
```bash
docker stats
```

## Security Best Practices

1. **Always use HTTPS** for production
2. **Change JWT_SECRET** in docker-compose.yml to a strong random value
3. **Change database password** in docker-compose.yml
4. **Keep Docker images updated**:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```
5. **Regular database backups** (see above)
6. **Restrict database port** (5432) - should only be accessible from Docker network
7. **Use strong passwords** for user accounts
8. **Enable Synology firewall** and auto-block
9. **Monitor failed login attempts**

## Port Summary

| Service | Internal Port | Exposed Port | Access |
|---------|--------------|--------------|--------|
| Frontend (Nginx) | 80 | 3000 | **Via reverse proxy** |
| Backend (Node.js) | 3001 | - | Internal only (Docker network) |
| Database (PostgreSQL) | 5432 | - | Internal only (Docker network) |

**Note**: Only port 3000 is exposed to the host. Backend and database are only accessible within the Docker network for security.

## Example Synology Reverse Proxy Rule (Summary)

```
Description: Declutter Assistant
Source:
  Protocol: HTTPS
  Hostname: declutter.mydomain.com
  Port: 443
  Certificate: Let's Encrypt (declutter.mydomain.com)

Destination:
  Protocol: HTTP
  Hostname: localhost
  Port: 3000

Custom Headers:
  X-Forwarded-Proto: $scheme
  X-Forwarded-Host: $http_host
  X-Real-IP: $remote_addr
```

## Support

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review Docker logs: `docker-compose logs`
3. Verify Synology reverse proxy settings
4. Check firewall and port forwarding
5. Test direct access (localhost:3000) vs. reverse proxy access
