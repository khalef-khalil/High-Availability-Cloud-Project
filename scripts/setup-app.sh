#!/bin/bash
# Configuration des serveurs d'application Node.js

set -e

SERVER_NUMBER=${1:-1}

echo "Configuration du serveur d'application #${SERVER_NUMBER}..."

# Mise à jour du système
apt-get update
apt-get upgrade -y

# Installation de Node.js 18.x (LTS) et outils de base
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs git curl htop net-tools rsync

# Création de l'utilisateur pour l'application
useradd -m -s /bin/bash cloudapp
usermod -aG sudo cloudapp

# Création du répertoire de l'application
mkdir -p /opt/cloud-app
cd /opt/cloud-app

# Configuration des variables d'environnement
cat > /opt/cloud-app/.env << EOF
PORT=8000
SERVER_NUMBER=${SERVER_NUMBER}
DB_DRIVER=mysql
MYSQL_HOST=10.0.0.20
MYSQL_PORT=3306
MYSQL_USER=cloud_user
MYSQL_PASSWORD=cloud_secure_2024
MYSQL_DATABASE=cloud_app
EOF

# Création des répertoires nécessaires
mkdir -p uploads data public

# Configuration systemd pour l'application
cat > /etc/systemd/system/cloud-app.service << EOF
[Unit]
Description=Cloud App Server ${SERVER_NUMBER}
After=network.target

[Service]
Type=simple
User=cloudapp
WorkingDirectory=/opt/cloud-app
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/cloud-app/.env

# Limites pour économiser la RAM
LimitNOFILE=1024
MemoryMax=800M

[Install]
WantedBy=multi-user.target
EOF

# Configuration des limites système
echo "cloudapp soft nofile 1024" >> /etc/security/limits.conf
echo "cloudapp hard nofile 2048" >> /etc/security/limits.conf

# Configuration de swappiness pour économiser la RAM
echo "vm.swappiness=10" >> /etc/sysctl.conf

# Changement de propriétaire
chown -R cloudapp:cloudapp /opt/cloud-app

# Activation du service (sera démarré après le déploiement du code)
systemctl enable cloud-app

echo "Serveur d'application #${SERVER_NUMBER} configuré avec succès!"
echo "Déployez le code dans /opt/cloud-app et démarrez avec: systemctl start cloud-app"
