#!/bin/bash
# Déploiement de l'application sur les serveurs

set -e

SERVERS=("10.0.0.11" "10.0.0.12")
APP_DIR="/opt/cloud-app"
USER="cloud"

echo "Déploiement de l'application sur les serveurs..."

# Copie des fichiers de l'application vers chaque serveur
for i in "${!SERVERS[@]}"; do
    SERVER=${SERVERS[$i]}
    SERVER_NUM=$((i + 1))
    
    echo "Déploiement sur le serveur ${SERVER_NUM} (${SERVER})..."
    
    # Copie des fichiers principaux
    scp server.js package.json package-lock.json ${USER}@${SERVER}:${APP_DIR}/
    scp -r public ${USER}@${SERVER}:${APP_DIR}/
    
    # Installation des dépendances et démarrage
    ssh ${USER}@${SERVER} << EOF
        cd ${APP_DIR}
        sudo chown -R cloudapp:cloudapp .
        sudo -u cloudapp npm install --production
        sudo systemctl restart cloud-app
        sudo systemctl status cloud-app --no-pager
EOF
    
    echo "Serveur ${SERVER_NUM} déployé avec succès!"
done

echo "Déploiement terminé sur tous les serveurs!"
