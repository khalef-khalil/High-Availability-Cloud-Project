#!/bin/bash
# Configuration de la base de données MySQL Master

set -e

echo "Configuration de la base de données MySQL Master..."

# Mise à jour du système
apt-get update
apt-get upgrade -y

# Installation de MySQL Server
DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server curl htop net-tools

# Configuration MySQL optimisée pour faible RAM
cat > /etc/mysql/mysql.conf.d/cloud-optimized.cnf << 'EOF'
[mysqld]
# Configuration optimisée pour 1GB RAM
innodb_buffer_pool_size = 512M
innodb_log_file_size = 32M
innodb_log_buffer_size = 8M
max_connections = 50
table_open_cache = 256
query_cache_size = 32M
query_cache_limit = 2M
thread_cache_size = 8
tmp_table_size = 32M
max_heap_table_size = 32M

# Configuration pour la réplication Master
server-id = 1
log-bin = mysql-bin
binlog-format = ROW
binlog-do-db = cloud_app

# Bind sur toutes les interfaces
bind-address = 0.0.0.0
EOF

# Redémarrage de MySQL avec la nouvelle configuration
systemctl restart mysql

# Configuration de la base de données et des utilisateurs
mysql << 'EOF'
-- Création de la base de données
CREATE DATABASE IF NOT EXISTS cloud_app;

-- Utilisateur pour l'application
CREATE USER IF NOT EXISTS 'cloud_user'@'%' IDENTIFIED BY 'cloud_secure_2024';
GRANT ALL PRIVILEGES ON cloud_app.* TO 'cloud_user'@'%';

-- Utilisateur pour la réplication
CREATE USER IF NOT EXISTS 'repl_user'@'%' IDENTIFIED BY 'repl_secure_2024';
GRANT REPLICATION SLAVE ON *.* TO 'repl_user'@'%';

-- Création de la table images
USE cloud_app;
CREATE TABLE IF NOT EXISTS images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  image_path VARCHAR(1024) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

FLUSH PRIVILEGES;
EOF

# Configuration du firewall pour MySQL
ufw allow 3306

# Configuration des limites système
echo "mysql soft nofile 1024" >> /etc/security/limits.conf
echo "mysql hard nofile 2048" >> /etc/security/limits.conf

# Configuration de swappiness
echo "vm.swappiness=10" >> /etc/sysctl.conf

systemctl enable mysql

echo "Base de données MySQL Master configurée avec succès!"
echo "Utilisateur app: cloud_user / cloud_secure_2024"
echo "Utilisateur réplication: repl_user / repl_secure_2024"
