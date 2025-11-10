#!/usr/bin/env bash
#
# Configure consistent time synchronisation on a host.
# Installs chrony, points it to external NTP sources,
# forces an immediate step, and enables on boot.
#
# Usage: sudo ./scripts/setup-time-sync.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo)."
  exit 1
fi

apt-get update -y
apt-get install -y chrony

mkdir -p /etc/chrony/sources.d
cat >/etc/chrony/sources.d/cloud-project.sources <<'EOF'
pool time.cloudflare.com iburst
pool time.google.com iburst
pool pool.ntp.org iburst
EOF

systemctl enable chrony.service
systemctl restart chrony.service

# Apply any current offset immediately.
chronyc makestep

echo "chrony status:"
chronyc tracking

