#!/bin/bash
# Script de monitoring de l'infrastructure

set -e

VMS=("10.0.0.10:lb" "10.0.0.11:app1" "10.0.0.12:app2" "10.0.0.20:db-master" "10.0.0.21:db-slave")
USER="cloud"

echo "=== Monitoring de l'infrastructure Cloud ==="
echo "Date: $(date)"
echo

for vm in "${VMS[@]}"; do
    IFS=':' read -r ip name <<< "$vm"
    echo "=== ${name} (${ip}) ==="
    
    # Test de connectivité
    if ping -c 1 -W 1 ${ip} > /dev/null 2>&1; then
        echo "✓ Connectivité: OK"
        
        # RAM et CPU
        ssh -o ConnectTimeout=5 ${USER}@${ip} "free -h | head -2; uptime" 2>/dev/null || echo "✗ SSH non disponible"
        
        # Services spécifiques
        case $name in
            "lb")
                curl -s http://${ip}:8404/stats > /dev/null && echo "✓ HAProxy Stats: OK" || echo "✗ HAProxy Stats: DOWN"
                ;;
            "app1"|"app2")
                curl -s http://${ip}:8000/health > /dev/null && echo "✓ App Health: OK" || echo "✗ App Health: DOWN"
                ;;
            "db-master"|"db-slave")
                ssh -o ConnectTimeout=5 ${USER}@${ip} "mysql -e 'SELECT 1' > /dev/null 2>&1" && echo "✓ MySQL: OK" || echo "✗ MySQL: DOWN"
                ;;
        esac
    else
        echo "✗ Connectivité: DOWN"
    fi
    echo
done

# Test du Load Balancer
echo "=== Test Load Balancer ==="
curl -s http://10.0.0.10/api/info | jq . 2>/dev/null || echo "Load Balancer non accessible"
