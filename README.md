# Cloud Project Architecture

## Overview
A two-host high-availability photo application. Six Ubuntu VMs are split evenly across the hosts and fronted by a Keepalived virtual IP (`192.168.64.10`). HAProxy balances HTTP requests, ProxySQL manages database endpoints, and MySQL operates in Group Replication with an external orchestrator to guarantee automatic failover *and* failback. MinIO provides mirrored object storage for uploaded images.

```
Physical Host 1                         Physical Host 2
──────────────────────────────────      ──────────────────────────────────
LB1 192.168.64.12  ─┐  VIP owner         LB2 192.168.64.15  ─┐  VIP backup
APP1 192.168.64.13 ─┼─ round-robin ──►   APP2 192.168.64.16 ─┼─ round-robin
MDB  192.168.64.14 ─┘  MySQL primary     SDB  192.168.64.17 ─┘  MySQL replica
```

| Component | Address | Purpose |
|-----------|---------|---------|
| VIP | `192.168.64.10:80` | Entry point (Keepalived + HAProxy) |
| ProxySQL (LB1/LB2) | `:6033` | Read/write router to MySQL |
| ProxySQL admin | `:6032` | Manage hostgroups and health |
| MySQL primary | `192.168.64.14:3306` | Group Replication single-primary |
| MySQL replica | `192.168.64.17:3306` | Replica promoted on failover |
| MinIO site 1 | `192.168.64.14:9000` | Object storage (active) |
| MinIO site 2 | `192.168.64.17:9000` | Object storage (replica) |

## Design Decisions
- **Networking:** Keepalived VRRP pair provides the VIP; HAProxy keeps health-checked, connectionless round-robin balancing between APP1 and APP2.
- **Database routing:** ProxySQL is deployed on both load balancers to expose a stable SQL endpoint, track read_only state, and remove the need for application-level endpoint shuffling.
- **Replication & control plane:** MySQL Group Replication runs in single-primary mode on `cloud-mdb`/`cloud-sdb`. OpenArk Orchestrator is deployed (SQLite backend) on LB1/LB2/APP1 for leader election and automatic promotion.
- **Automatic failback:** A lightweight agent on LB1 (`orchestrator-failback-agent.service`) watches Orchestrator, promotes the recovered primary, clears `super_read_only`, and reconfigures the secondary so the topology always returns to the intended master when it comes back online.
- **Storage:** MinIO runs on both database nodes with site replication enabled; the application uses a multi-endpoint client that retries across both sites.
- **Application servers:** Identical Node/Express servers run on APP1/APP2. State is externalised—database + MinIO—so either server can handle any request.

## Failure Handling
| Event | Response |
|-------|----------|
| LB1 goes down | Keepalived moves the VIP to LB2 (<2 s). ProxySQL on LB2 continues serving connections. |
| APP node failure | HAProxy health checks remove the node; traffic continues on the surviving app. |
| `cloud-mdb` outage | Group Replication elects `cloud-sdb` primary (<5 s). ProxySQL reroutes writes. |
| `cloud-sdb` outage | Primary keeps running; ProxySQL marks the replica offline until it returns. |
| `cloud-mdb` return | Failback agent (through Orchestrator) performs a graceful master takeover back to MDB, resets `super_read_only`, and rebuilds replication automatically. |
| MinIO site loss | Client retries target the surviving endpoint; replication resynchronises when the peer returns. |

## Operations
### Deploy (fresh environment)
1. Provision six Ubuntu VMs with the addresses shown above.
2. On each VM, clone the repository and run the appropriate setup script:
   - `scripts/setup-lb.sh` on LB1/LB2 (installs HAProxy, Keepalived, ProxySQL, Orchestrator binary).
   - `scripts/setup-app.sh <server_number>` on APP1/APP2, followed by `scripts/deploy-app.sh`.
   - `scripts/setup-db-master.sh` (MDB) and `scripts/setup-db-slave.sh` (SDB), then `scripts/setup-replication.sh` to seed Group Replication.
3. Enable site replication in MinIO (`mc admin replicate add site1 site2`).
4. Confirm Orchestrator RAFT health via `curl -su admin:adminPass!2024 http://192.168.64.12:3000/api/raft-state`.

### Routine checks
```bash
# Application health
curl http://192.168.64.10/health
curl http://192.168.64.10/api/info

# ProxySQL runtime view
mysql -u admin -padmin -h 192.168.64.12 -P 6032 -e "SELECT hostgroup_id, hostname, status FROM runtime_mysql_servers;"

# Replication health
ssh cloud-sdb@192.168.64.17 "mysql -e 'SHOW SLAVE STATUS\G' | egrep 'Running|Seconds_Behind'"

# Failback agent
ssh cloud-lb@192.168.64.12 "systemctl status orchestrator-failback-agent"
```
Logs of the failback agent live in `/var/log/orchestrator-failback.log` on LB1.

### Exercising failover
1. **Database failover:** `ssh cloud-mdb@192.168.64.14 'sudo systemctl stop mysql'`. Within a few seconds ProxySQL reports writer `192.168.64.17`. Start MySQL again to watch the agent return the role to MDB.
2. **Load balancer failover:** `sudo systemctl stop keepalived` on LB1. The VIP moves to LB2 and HAProxy keeps serving.
3. **Application failover:** `sudo systemctl stop cloud-app` on APP1. HAProxy serves requests from APP2 only.

## File Map
| Path | Purpose |
|------|---------|
| `scripts/setup-*` | Provisioning helpers for each VM role |
| `.env` | Runtime configuration consumed by both app instances |
| `public/` | Static assets served by the Node application |
| `tests/` | Playwright UI tests validating carousel, deletion, and status behaviour |
| `scripts/setup-time-sync.sh` | Installs chrony and aligns VM clocks (run on every node) |

## Notes
- All automation assumes passwordless SSH between orchestrator nodes for Orchestrator RAFT health and the failback agent.
- ProxySQL stores configuration on disk; use the admin interface after changes (`SAVE MYSQL SERVERS TO DISK`) to persist across reboots.
- The system is intentionally certificate-free; add TLS termination at HAProxy if public exposure is required.
