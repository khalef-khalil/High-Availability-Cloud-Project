#!/bin/bash
# Configuration de la base de données MySQL Slave

set -e

echo "Configuration de la base de données MySQL Slave..."

# Mise à jour du système
apt-get update
apt-get upgrade -y

# Installation de MySQL Server
DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server curl htop net-tools

# Configuration MySQL optimisée pour faible RAM (slave)
cat > /etc/mysql/mysql.conf.d/cloud-slave.cnf << 'EOF'
[mysqld]
# Configuration optimisée pour 768MB RAM
innodb_buffer_pool_size = 384M
innodb_log_file_size = 16M
innodb_log_buffer_size = 4M
max_connections = 30
table_open_cache = 128
query_cache_size = 16M
query_cache_limit = 1M
thread_cache_size = 4
tmp_table_size = 16M
max_heap_table_size = 16M

# Configuration pour la réplication Slave
server-id = 2
relay-log = relay-bin
read_only = 1
replicate-do-db = cloud_app

# Bind sur toutes les interfaces
bind-address = 0.0.0.0
EOF

# Redémarrage de MySQL avec la nouvelle configuration
systemctl restart mysql

# Configuration de la base de données
mysql << 'EOF'
-- Création de la base de données
CREATE DATABASE IF NOT EXISTS cloud_app;

-- Utilisateur pour l'application (lecture seule)
CREATE USER IF NOT EXISTS 'cloud_user'@'%' IDENTIFIED BY 'cloud_secure_2024';
GRANT SELECT ON cloud_app.* TO 'cloud_user'@'%';

FLUSH PRIVILEGES;
EOF

# Configuration du firewall pour MySQL
ufw allow 3306

# Configuration des limites système
echo "mysql soft nofile 512" >> /etc/security/limits.conf
echo "mysql hard nofile 1024" >> /etc/security/limits.conf

# Configuration de swappiness
echo "vm.swappiness=10" >> /etc/sysctl.conf

systemctl enable mysql

echo "Base de données MySQL Slave configurée avec succès!"
echo "Pour configurer la réplication, exécutez setup-replication.sh après le démarrage du Master"
