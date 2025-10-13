#!/bin/bash
# First VM post-installation setup

echo "=== Ubuntu 22.04 VM Setup ==="

# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git htop net-tools jq

# Configure static IP for host-only network
sudo tee /etc/netplan/01-netcfg.yaml > /dev/null <<EOF
network:
  version: 2
  ethernets:
    enp0s8:  # Host-only adapter
      addresses:
        - 10.0.0.10/24
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
EOF

# Apply network config
sudo netplan apply

# Show IP configuration
echo "=== Network Configuration ==="
ip addr show

echo "=== Setup Complete! ==="
echo "VM should be accessible at: 10.0.0.10"
echo "Test with: ping 10.0.0.10"
