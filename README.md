# Cloud Project App (Node/Express)

## Architecture

High-availability setup with load balancing and database replication across multiple VMs:

- **Load Balancer**: HAProxy (512MB RAM)
- **App Servers**: 2x Node.js instances (1GB RAM each)  
- **Database**: MySQL Master-Slave replication (1GB + 768MB RAM)

## Quick Start (Manual Setup)

1. **Follow the manual setup guide**: `MANUAL_SETUP.md`
2. **Deploy the application**: `./scripts/deploy-app.sh`
3. **Test the setup**: `./scripts/monitor.sh`

## Local Development

```bash
PORT=8000 npm run dev
```

## Database Options

### SQLite (Default)
```bash
npm run dev
```

### MySQL (Production)
```bash
export DB_DRIVER=mysql
export MYSQL_HOST=10.0.0.20
export MYSQL_USER=cloud_user
export MYSQL_PASSWORD=cloud_secure_2024
export MYSQL_DATABASE=cloud_app
npm run dev
```

## Health and Info
- Health: `GET /health` -> 200 OK
- Info: `GET /api/info`

## File Sync Between Servers
```bash
./scripts/sync_uploads.sh cloud@10.0.0.12:/opt/cloud-app/uploads/
```

## HAProxy Configuration
Use `ops/haproxy.cfg` with server IPs. Health checks use `/health`.

## Testing with curl

```bash
# Latest record
curl -s http://10.0.0.10/api/latest | jq .

# Upload
curl -s -X POST http://10.0.0.10/api/upload \
  -F "name=Test" -F "image=@/path/to/image.jpg" | jq .

# Health check
curl -s http://10.0.0.10/health

# HAProxy stats
curl -s http://10.0.0.10:8404/stats
```

## Architecture Benefits

- **High Availability**: Multiple app servers with failover
- **Load Distribution**: HAProxy balances requests
- **Data Redundancy**: Master-slave database replication  
- **Scalability**: Easy to add more app servers
- **Monitoring**: Built-in health checks and stats
