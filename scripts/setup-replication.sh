#!/bin/bash
# Configuration de la réplication MySQL Master-Slave

set -e

MASTER_IP="10.0.0.20"
SLAVE_IP="10.0.0.21"
USER="cloud"

echo "Configuration de la réplication MySQL Master-Slave..."

# Obtenir la position du binlog du Master
echo "Récupération de la position du Master..."
MASTER_STATUS=$(ssh ${USER}@${MASTER_IP} "mysql -e 'SHOW MASTER STATUS\G'" | grep -E "(File|Position)")
MASTER_FILE=$(echo "$MASTER_STATUS" | grep "File:" | awk '{print $2}')
MASTER_POS=$(echo "$MASTER_STATUS" | grep "Position:" | awk '{print $2}')

echo "Master File: $MASTER_FILE"
echo "Master Position: $MASTER_POS"

# Configuration de la réplication sur le Slave
echo "Configuration du Slave..."
ssh ${USER}@${SLAVE_IP} << EOF
mysql << 'SQL'
STOP SLAVE;

CHANGE MASTER TO
    MASTER_HOST='${MASTER_IP}',
    MASTER_USER='repl_user',
    MASTER_PASSWORD='repl_secure_2024',
    MASTER_LOG_FILE='${MASTER_FILE}',
    MASTER_LOG_POS=${MASTER_POS};

START SLAVE;

SHOW SLAVE STATUS\G
SQL
EOF

echo "Réplication configurée avec succès!"
echo "Vérifiez le statut avec: ssh ${USER}@${SLAVE_IP} \"mysql -e 'SHOW SLAVE STATUS\\G'\""
