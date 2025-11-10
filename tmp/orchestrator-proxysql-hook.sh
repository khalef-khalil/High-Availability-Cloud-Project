#!/usr/bin/env bash
set -euo pipefail

EVENT=""
NEW_MASTER=""
OLD_MASTER=""
CLUSTER=""

for arg in "$@"; do
  case "$arg" in
    --event=*) EVENT="${arg#*=}" ;;
    --new-master=*) NEW_MASTER="${arg#*=}" ;;
    --old-master=*) OLD_MASTER="${arg#*=}" ;;
    --cluster=*) CLUSTER="${arg#*=}" ;;
  esac
done

if [[ -z "$NEW_MASTER" ]]; then
  exit 0
fi

new_host="${NEW_MASTER%%:*}"
new_port="${NEW_MASTER##*:}"
if [[ -z "$new_port" || "$new_port" == "$new_host" ]]; then
  new_port=3306
fi

ALL_HOSTS=("cloud-mdb" "cloud-sdb")
PROXIES=("192.168.64.12" "192.168.64.15")
ADMIN_USER="admin"
ADMIN_PASS="admin"
WRITER_HG=10
READER_HG=20
MAX_CONN=200
WEIGHT=1

for proxy in "${PROXIES[@]}"; do
  if ! mysql -u"$ADMIN_USER" -p"$ADMIN_PASS" -h "$proxy" -P 6032 -e "SELECT 1" >/dev/null 2>&1; then
    continue
  fi

  mysql -u"$ADMIN_USER" -p"$ADMIN_PASS" -h "$proxy" -P 6032 <<EOSQL
DELETE FROM mysql_replication_hostgroups WHERE writer_hostgroup=$WRITER_HG AND reader_hostgroup=$READER_HG;
INSERT INTO mysql_replication_hostgroups (writer_hostgroup, reader_hostgroup, check_type, comment)
VALUES ($WRITER_HG, $READER_HG, 'read_only', 'cloud_app');

DELETE FROM mysql_servers WHERE hostname IN ('cloud-mdb','cloud-sdb');
INSERT INTO mysql_servers (hostgroup_id, hostname, port, gtid_port, status, weight, compression, max_connections, max_replication_lag, use_ssl, max_latency_ms, comment)
VALUES ($WRITER_HG, '$new_host', $new_port, 0, 'ONLINE', $WEIGHT, 0, $MAX_CONN, 0, 0, 0, 'writer-$new_host');
EOSQL

  for host in "${ALL_HOSTS[@]}"; do
    mysql -u"$ADMIN_USER" -p"$ADMIN_PASS" -h "$proxy" -P 6032 <<EOSQL
INSERT INTO mysql_servers (hostgroup_id, hostname, port, gtid_port, status, weight, compression, max_connections, max_replication_lag, use_ssl, max_latency_ms, comment)
VALUES ($READER_HG, '$host', 3306, 0, 'ONLINE', $WEIGHT, 0, $MAX_CONN, 0, 0, 0, 'reader-$host');
EOSQL
  done

  mysql -u"$ADMIN_USER" -p"$ADMIN_PASS" -h "$proxy" -P 6032 <<EOSQL
LOAD MYSQL SERVERS TO RUNTIME;
SAVE MYSQL SERVERS TO DISK;
EOSQL
done

exit 0
