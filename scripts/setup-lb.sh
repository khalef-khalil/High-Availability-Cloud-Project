#!/bin/bash
# Configuration du Load Balancer (HAProxy)

set -e

echo "Configuration du Load Balancer HAProxy..."

# Mise à jour du système
apt-get update
apt-get upgrade -y

# Installation d'HAProxy et outils de base
apt-get install -y haproxy curl htop net-tools

# Configuration d'HAProxy optimisée pour faible RAM
cat > /etc/haproxy/haproxy.cfg << 'EOF'
global
    daemon
    maxconn 1024
    tune.maxaccept 64
    tune.bufsize 16384

defaults
    mode http
    timeout connect 5s
    timeout client  30s
    timeout server  30s
    option httplog
    option dontlognull

frontend http_in
    bind *:80
    default_backend app_nodes

backend app_nodes
    option httpchk GET /health
    http-check expect status 200
    balance roundrobin
    server app1 10.0.0.11:8000 check inter 10s
    server app2 10.0.0.12:8000 check inter 10s backup

# Stats pour monitoring
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s
EOF

# Activation et démarrage d'HAProxy
systemctl enable haproxy
systemctl restart haproxy

# Configuration des limites système pour économiser la RAM
echo "* soft nofile 1024" >> /etc/security/limits.conf
echo "* hard nofile 2048" >> /etc/security/limits.conf

echo "Load Balancer configuré avec succès!"
echo "Stats disponibles sur http://10.0.0.10:8404/stats"
