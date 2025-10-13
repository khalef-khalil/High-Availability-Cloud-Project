#!/usr/bin/env bash
set -euo pipefail

# Script de développement avec arrêt/redémarrage automatique
echo "🔄 Arrêt des serveurs existants sur le port 8000..."
lsof -nP -iTCP:8000 -sTCP:LISTEN -t 2>/dev/null | xargs -r kill -9 || true

echo "🚀 Démarrage du serveur de développement..."
exec nodemon server.js
