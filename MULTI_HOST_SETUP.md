# Multi-Host Deployment - Quick Reference

## 🎯 Objective

Split your 6 VMs across 2 physical machines to achieve true geographic redundancy.

## 📊 VM Distribution

### Host 1 (Primary Site)
```
┌─────────────────────────────────┐
│     Physical Machine 1          │
│     (Mac/PC)                    │
├─────────────────────────────────┤
│                                 │
│  ╔═══════════════════════════╗  │
│  ║ LB1 - 192.168.64.12       ║  │
│  ║ HAProxy + Keepalived      ║  │
│  ║ MySQL Router              ║  │
│  ║ RAM: 1.4GB                ║  │
│  ╚═══════════════════════════╝  │
│                                 │
│  ╔═══════════════════════════╗  │
│  ║ APP1 - 192.168.64.13      ║  │
│  ║ Node.js Application       ║  │
│  ║ RAM: 1.4GB                ║  │
│  ╚═══════════════════════════╝  │
│                                 │
│  ╔═══════════════════════════╗  │
│  ║ MDB - 192.168.64.14       ║  │
│  ║ MySQL Master              ║  │
│  ║ MinIO Site 1              ║  │
│  ║ RAM: 1.4GB                ║  │
│  ╚═══════════════════════════╝  │
│                                 │
└─────────────────────────────────┘
```

### Host 2 (Secondary Site)
```
┌─────────────────────────────────┐
│     Physical Machine 2          │
│     (Mac/PC)                    │
├─────────────────────────────────┤
│                                 │
│  ╔═══════════════════════════╗  │
│  ║ LB2 - 192.168.64.15       ║  │
│  ║ HAProxy + Keepalived      ║  │
│  ║ MySQL Router              ║  │
│  ║ RAM: 1.4GB                ║  │
│  ╚═══════════════════════════╝  │
│                                 │
│  ╔═══════════════════════════╗  │
│  ║ APP2 - 192.168.64.16      ║  │
│  ║ Node.js Application       ║  │
│  ║ RAM: 1.4GB                ║  │
│  ╚═══════════════════════════╝  │
│                                 │
│  ╔═══════════════════════════╗  │
│  ║ SDB - 192.168.64.17       ║  │
│  ║ MySQL Slave               ║  │
│  ║ MinIO Site 2              ║  │
│  ║ RAM: 1.4GB                ║  │
│  ╚═══════════════════════════╝  │
│                                 │
└─────────────────────────────────┘
```

## 🚀 Quick Setup Steps

### 1. Prepare Virtual Machines

#### On Host 1:
```bash
# Create 3 VMs with Ubuntu 24.04 LTS
VM1: cloud-lb   (IP: 192.168.64.12) - 1.5GB RAM, 10GB disk
VM2: cloud-app1 (IP: 192.168.64.13) - 1.5GB RAM, 10GB disk  
VM3: cloud-mdb  (IP: 192.168.64.14) - 1.5GB RAM, 10GB disk
```

#### On Host 2:
```bash
# Create 3 VMs with Ubuntu 24.04 LTS
VM1: cloud-lb2  (IP: 192.168.64.15) - 1.5GB RAM, 10GB disk
VM2: cloud-app2 (IP: 192.168.64.16) - 1.5GB RAM, 10GB disk
VM3: cloud-sdb  (IP: 192.168.64.17) - 1.5GB RAM, 10GB disk
```

### 2. Network Configuration

**Both hosts must be on the same network!**

**Option A: Bridged Network** (Recommended)
- Set VM network to "Bridged Adapter"
- VMs appear as devices on your physical network
- Assign static IPs or DHCP reservations

**Option B: Host-Only Network**
- Create shared network between both physical hosts
- More complex but isolated from main network
- Requires virtual network configuration

**Test connectivity:**
```bash
# From any VM on Host 1, ping Host 2 VMs
ping 192.168.64.15
ping 192.168.64.16
ping 192.168.64.17

# From any VM on Host 2, ping Host 1 VMs  
ping 192.168.64.12
ping 192.168.64.13
ping 192.168.64.14
```

### 3. Install Services on Each VM

#### LB1 (192.168.64.12) on Host 1:
```bash
git clone <your-repo> /opt/cloud-app
cd /opt/cloud-app

# Install HAProxy + Keepalived
sudo ./scripts/setup-lb.sh

# Install MySQL Router
sudo apt-get install -y mysql-router
sudo mkdir -p /etc/mysqlrouter

# Configure MySQL Router
sudo tee /etc/mysqlrouter/mysqlrouter.conf << 'EOF'
[DEFAULT]
logging_folder = /var/log/mysqlrouter
runtime_folder = /run/mysqlrouter

[routing:primary]
bind_address = 0.0.0.0
bind_port = 3306
destinations = 192.168.64.14:3306,192.168.64.17:3306
routing_strategy = first-available
mode = read-write

[routing:secondary]
bind_address = 0.0.0.0
bind_port = 3307
destinations = 192.168.64.17:3306,192.168.64.14:3306
routing_strategy = round-robin
mode = read-only
EOF

sudo systemctl enable mysqlrouter
sudo systemctl start mysqlrouter

# Configure Keepalived as MASTER
sudo tee /etc/keepalived/keepalived.conf << 'EOF'
global_defs {
    enable_script_security
}

vrrp_instance VI_1 {
    state MASTER
    interface enp0s1
    virtual_router_id 51
    priority 100
    advert_int 1
    
    authentication {
        auth_type PASS
        auth_pass cloud2024
    }
    
    virtual_ipaddress {
        192.168.64.10/24
    }
}
EOF

sudo systemctl restart keepalived
```

#### APP1 (192.168.64.13) on Host 1:
```bash
cd /opt/cloud-app
sudo ./scripts/setup-app.sh 1

# Configure to use MySQL Router
sudo tee /opt/cloud-app/.env << 'EOF'
PORT=8000
SERVER_NUMBER=1
DB_DRIVER=mysql
MYSQL_MASTER_HOST=192.168.64.12
MYSQL_SLAVE_HOST=192.168.64.12
MYSQL_MASTER_PORT=3306
MYSQL_SLAVE_PORT=3307
MYSQL_USER=cloud_user
MYSQL_PASSWORD=cloud_secure_2024
MYSQL_DATABASE=cloud_app
MINIO_ENDPOINT=192.168.64.14
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minio_secure_2024
MINIO_BUCKET=uploads
EOF

# Deploy application
sudo ./scripts/deploy-app.sh
```

#### MDB (192.168.64.14) on Host 1:
```bash
cd /opt/cloud-app
sudo ./scripts/setup-db-master.sh

# Install MinIO
wget https://dl.min.io/server/minio/release/linux-arm64/minio
sudo mv minio /usr/local/bin/
sudo chmod +x /usr/local/bin/minio

# Configure MinIO
sudo mkdir -p /data/minio
sudo tee /etc/default/minio << 'EOF'
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minio_secure_2024
MINIO_VOLUMES=/data/minio
MINIO_OPTS='--address :9000 --console-address :9001'
EOF

# Create systemd service
sudo tee /etc/systemd/system/minio.service << 'EOF'
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
Type=notify
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable minio
sudo systemctl start minio
```

#### LB2 (192.168.64.15) on Host 2:
```bash
# Same as LB1, but configure Keepalived as BACKUP:

sudo tee /etc/keepalived/keepalived.conf << 'EOF'
global_defs {
    enable_script_security
}

vrrp_instance VI_1 {
    state BACKUP
    interface enp0s1
    virtual_router_id 51
    priority 90
    advert_int 1
    
    authentication {
        auth_type PASS
        auth_pass cloud2024
    }
    
    virtual_ipaddress {
        192.168.64.10/24
    }
}
EOF

sudo systemctl restart keepalived
```

#### APP2 (192.168.64.16) on Host 2:
```bash
# Same as APP1, but set SERVER_NUMBER=2
cd /opt/cloud-app
sudo ./scripts/setup-app.sh 2
# Configure .env same as APP1 but with SERVER_NUMBER=2
```

#### SDB (192.168.64.17) on Host 2:
```bash
cd /opt/cloud-app
sudo ./scripts/setup-db-slave.sh

# Set up replication
sudo mysql << 'EOF'
CHANGE MASTER TO
    MASTER_HOST='192.168.64.14',
    MASTER_USER='repl_user',
    MASTER_PASSWORD='repl_secure_2024',
    MASTER_LOG_FILE='mysql-bin.000027',
    MASTER_LOG_POS=4959;
START SLAVE;
EOF

# Install MinIO (same as MDB)
wget https://dl.min.io/server/minio/release/linux-arm64/minio
sudo mv minio /usr/local/bin/
sudo chmod +x /usr/local/bin/minio
# Configure MinIO service (same as MDB)

# Set up MinIO site replication
# On MDB, run:
mc alias set site1 http://192.168.64.14:9000 minioadmin minio_secure_2024
mc alias set site2 http://192.168.64.17:9000 minioadmin minio_secure_2024
mc admin replicate add site1 site2
```

### 4. Verification Checklist

**Network Connectivity:**
- [ ] All VMs can ping each other across hosts
- [ ] No firewall blocking inter-VM communication

**Keepalived VIP:**
```bash
# Check VIP is on LB1
ssh cloud-lb@192.168.64.12 "ip addr show | grep 192.168.64.10"

# Access via VIP
curl http://192.168.64.10/health
```

**Database Replication:**
```bash
# On SDB
ssh cloud-sdb@192.168.64.17 "sudo mysql -e 'SHOW SLAVE STATUS\G' | grep Running"
# Should show: Slave_IO_Running: Yes, Slave_SQL_Running: Yes
```

**MinIO Replication:**
```bash
# On MDB
ssh cloud-mdb@192.168.64.14 "mc admin replicate info site1"
# Should show both sites configured
```

**MySQL Router:**
```bash
# Test write path (should go to master)
mysql -h 192.168.64.12 -P 3306 -u cloud_user -pcloud_secure_2024 -e 'SELECT @@hostname'
# Should return: cloud-mdb

# Test read path (should go to slave)
mysql -h 192.168.64.12 -P 3307 -u cloud_user -pcloud_secure_2024 -e 'SELECT @@hostname'
# Should return: cloud-sdb
```

**Application:**
```bash
# Test from client machine
curl http://192.168.64.10/api/info
# Should return app info from either APP1 or APP2
```

### 5. Failover Testing

**Test 1: Shutdown Host 1 completely**
```bash
# On Host 1, shut down all VMs or disconnect network

# From client machine
curl http://192.168.64.10/health
# Should still return OK (from Host 2)

curl http://192.168.64.10/api/info  
# Should return APP2 info

# VIP should now be on LB2
ssh cloud-lb2@192.168.64.15 "ip addr show | grep 192.168.64.10"
```

**Expected Results:**
- ✅ VIP moves to LB2 (1-2 second downtime)
- ✅ Application accessible via APP2
- ✅ Database writes go to SDB
- ✅ MinIO serves files from Site2

**Test 2: Bring Host 1 back up**
```bash
# Start all VMs on Host 1

# VIP should return to LB1
ssh cloud-lb@192.168.64.12 "ip addr show | grep 192.168.64.10"

# Application should balance between APP1 and APP2
for i in {1..10}; do curl -s http://192.168.64.10/api/info | grep serverNumber; done
# Should show mix of "1" and "2"
```

## 🔧 Networking Details

### Required Ports

**Between Hosts (must be open):**
| Protocol | Port  | Purpose                    |
|----------|-------|----------------------------|
| VRRP     | 112   | Keepalived heartbeat       |
| TCP      | 80    | HTTP traffic               |
| TCP      | 3306  | MySQL replication          |
| TCP      | 9000  | MinIO site replication     |
| TCP      | 22    | SSH management             |

**Firewall Rules:**
```bash
# On all VMs
sudo ufw allow from 192.168.64.0/24 to any port 112 proto vrrp
sudo ufw allow from 192.168.64.0/24 to any port 22
sudo ufw allow from 192.168.64.0/24 to any port 3306
sudo ufw allow from 192.168.64.0/24 to any port 9000

# On LBs
sudo ufw allow 80/tcp
sudo ufw allow 8404/tcp

sudo ufw enable
```

## 📊 Expected Behavior

### Normal Operation
- **VIP Location:** LB1 (192.168.64.12)
- **Traffic Flow:** Client → VIP → LB1 → APP1/APP2 → MySQL Router → MDB/SDB
- **Files:** Uploaded to MinIO Site1, replicated to Site2
- **Database:** Writes to MDB, reads from SDB

### Host 1 Failure
- **VIP Location:** LB2 (192.168.64.15)
- **Traffic Flow:** Client → VIP → LB2 → APP2 → MySQL Router → SDB
- **Files:** Served from MinIO Site2
- **Database:** All operations on SDB
- **Downtime:** 1-3 seconds

### Host 2 Failure
- **VIP Location:** LB1 (192.168.64.12)
- **Traffic Flow:** Client → VIP → LB1 → APP1 → MySQL Router → MDB
- **Files:** Served from MinIO Site1
- **Database:** All operations on MDB
- **Downtime:** 0 seconds (50% capacity reduction)

## 🎯 Client Machine Setup

The client can be **any device on the same network**:
- Your laptop
- Another VM
- Smartphone on WiFi
- Tablet

**Access Methods:**

**1. Web Browser:**
```
http://192.168.64.10
```

**2. Command Line:**
```bash
# Health check
curl http://192.168.64.10/health

# API info
curl http://192.168.64.10/api/info

# Upload file
curl -X POST http://192.168.64.10/api/upload \
  -F "name=Test" \
  -F "image=@file.jpg"
```

**3. Monitoring:**
```
HAProxy Stats: http://192.168.64.10:8404/stats
```

## 📝 Important Notes

### IP Address Planning
- Make sure 192.168.64.10 is **not already in use** on your network
- All 6 VM IPs should be in the same subnet
- Configure static IPs or DHCP reservations to prevent conflicts

### Time Synchronization
```bash
# On all VMs, enable NTP
sudo apt-get install -y chrony
sudo systemctl enable chrony
sudo systemctl start chrony
```

### Resource Requirements
- **Host 1:** Minimum 4GB RAM, 30GB disk
- **Host 2:** Minimum 4GB RAM, 30GB disk
- **Network:** 100Mbps+ connection between hosts

### Backup Considerations
- Backups run on both MDB and SDB daily
- Store backups on external drive accessible from both hosts
- Test restore procedure regularly

## 🚨 Common Issues

**VIP not accessible:**
```bash
# Check Keepalived on both LBs
systemctl status keepalived

# Check which node has VIP
ip addr show | grep 192.168.64.10

# Check VRRP communication
tcpdump -i enp0s1 vrrp
```

**Replication broken:**
```bash
# Check replication status
mysql -e "SHOW SLAVE STATUS\G" | grep Error

# Rebuild if needed
# See main README replication guide
```

**MinIO not syncing:**
```bash
# Check site replication status
mc admin replicate info site1

# Manual sync if needed
mc mirror site1/uploads site2/uploads
```

## ✅ Success Criteria

Your multi-host setup is successful when:

- [ ] All 6 VMs are running on correct hosts
- [ ] VIP (192.168.64.10) is accessible from client
- [ ] Application loads in browser via VIP
- [ ] Keepalived fails over when LB1 stops
- [ ] Database replication shows 0 seconds lag
- [ ] MinIO site replication is active
- [ ] Shutting down Host 1 = app still accessible
- [ ] Shutting down Host 2 = app still accessible
- [ ] HAProxy shows both APP1 and APP2 as UP

---

**You now have true high availability across 2 physical machines! 🎉**

