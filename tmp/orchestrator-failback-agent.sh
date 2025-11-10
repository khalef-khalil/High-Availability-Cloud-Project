#!/usr/bin/env bash
set -euo pipefail

ORCH_NODES=("192.168.64.12" "192.168.64.15" "192.168.64.13")
AUTH_USER="admin"
AUTH_PASS="adminPass!2024"
CLUSTER="cloud-mdb:3306"
MDB_HOST="192.168.64.14"
SDB_HOST="192.168.64.17"
REPL_USER="rs_recovery"
REPL_PASS="rsRecoveryPass!"
SQL_USER="orchestrator"
SQL_PASS="orchPass!2024"
SLEEP_SECONDS=5
ATTEMPTS=10
LAST_RECOVERY_TS=0
LOG_FILE="/var/log/orchestrator-failback.log"

log() {
  local message="$*"
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$message" | sudo tee -a "$LOG_FILE" >/dev/null
  echo "$message"
}

mysql_value() {
  local host=$1
  local query=$2
  mysql -h "$host" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 -Nse "$query" 2>/dev/null || echo ""
}

run_sql_batch() {
  local host=$1
  shift
  mysql -h "$host" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 <<SQL >/dev/null 2>&1
$*
SQL
}

exec_sql() {
  local host=$1
  shift
  local stmt="$*"
  if ! mysql -h "$host" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 -e "$stmt" >/dev/null 2>&1; then
    log "exec_sql failure on $host: $stmt"
    return 1
  fi
}

get_leader() {
  for node in "${ORCH_NODES[@]}"; do
    state=$(curl -s -u "${AUTH_USER}:${AUTH_PASS}" --max-time 2 "http://$node:3000/api/raft-state" || true)
    if [[ "$state" == '"Leader"' ]]; then
      echo "$node"
      return 0
    fi
  done
  return 1
}

candidate_ready() {
  if mysql -h "$SDB_HOST" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 -e "SELECT 1" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

read_only_state() {
  local host=$1
  mysql_value "$host" "SELECT @@global.read_only;" | tr -d ' \n\r'
}

attempt_failover() {
  local leader=$1
  local analysis_json
  analysis_json=$(curl -s -u "${AUTH_USER}:${AUTH_PASS}" --max-time 3 "http://$leader:3000/api/replication-analysis" || echo '')
  if [[ -z "$analysis_json" ]]; then
    return 0
  fi
  if [[ "$analysis_json" == *"DeadMaster"* ]]; then
    if candidate_ready; then
      local now epoch_diff
      now=$(date +%s)
      epoch_diff=$((now - LAST_RECOVERY_TS))
      if (( epoch_diff < 15 )); then
        log "Dead master detected; recovery already attempted ${epoch_diff}s ago"
        return 0
      fi
      log "Dead master detected; requesting orchestrator recovery via API"
      curl -s -u "${AUTH_USER}:${AUTH_PASS}" --max-time 5 \
        "http://$leader:3000/api/end-downtime/cloud-mdb/3306" >/dev/null || true
      local response
      response=$(curl -s -u "${AUTH_USER}:${AUTH_PASS}" --max-time 10 \
        "http://$leader:3000/api/force-master-failover/cloud-mdb/3306" || true)
      if [[ "$response" == *"\"Code\":\"OK\""* ]]; then
        log "Recovery request accepted"
        LAST_RECOVERY_TS=$now
      else
        log "Recovery request failed: ${response:-no response}"
      fi
    else
      log "Candidate not reachable yet, postponing failover"
    fi
  fi
}

configure_mdb_replica() {
  exec_sql "$MDB_HOST" "STOP REPLICA FOR CHANNEL '';" || true
  if ! exec_sql "$MDB_HOST" "RESET SLAVE ALL;"; then
    log "RESET SLAVE ALL failed on $MDB_HOST (continuing)"
  fi
  exec_sql "$MDB_HOST" "SET GLOBAL super_read_only = 1;" || return 1
  exec_sql "$MDB_HOST" "SET GLOBAL read_only = 1;" || return 1
  exec_sql "$MDB_HOST" "CHANGE REPLICATION SOURCE TO SOURCE_HOST='$SDB_HOST', SOURCE_PORT=3306, SOURCE_USER='$REPL_USER', SOURCE_PASSWORD='$REPL_PASS', SOURCE_AUTO_POSITION=1;" || return 1
  exec_sql "$MDB_HOST" "START REPLICA;" || return 1
  for attempt in $(seq 1 "$ATTEMPTS"); do
    STATUS=$(mysql -h "$MDB_HOST" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 -Nse "SHOW SLAVE STATUS\\G" 2>/dev/null || true)
    if [[ -n "$STATUS" ]]; then
      IO=$(printf "%s" "$STATUS" | awk -F: '/Slave_IO_Running/{gsub(/ /,"",$2); print $2; exit}')
      SQLRUN=$(printf "%s" "$STATUS" | awk -F: '/Slave_SQL_Running/{gsub(/ /,"",$2); print $2; exit}')
      if [[ "$IO" == "Yes" && "$SQLRUN" == "Yes" ]]; then
        return 0
      fi
    fi
    sleep 2
  done
  log "MDB replica alignment timed out. Status dump: ${STATUS:-<empty>}"
  return 1
}

finalize_mdb_primary() {
  mysql -h "$MDB_HOST" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 -e "STOP REPLICA;" >/dev/null 2>&1 || true
  mysql -h "$MDB_HOST" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 -e "RESET SLAVE ALL;" >/dev/null 2>&1 || true
  mysql -h "$MDB_HOST" -u "$SQL_USER" -p"$SQL_PASS" --connect-timeout=3 -e "SET GLOBAL super_read_only = 0;" >/dev/null 2>&1 || return 1
  return 0
}

configure_sdb_replica() {
  exec_sql "$SDB_HOST" "STOP REPLICA FOR CHANNEL '';" || true
  if ! exec_sql "$SDB_HOST" "RESET SLAVE ALL;"; then
    log "RESET SLAVE ALL failed on $SDB_HOST (continuing)"
  fi
  exec_sql "$SDB_HOST" "CHANGE REPLICATION SOURCE TO SOURCE_HOST='$MDB_HOST', SOURCE_PORT=3306, SOURCE_USER='$REPL_USER', SOURCE_PASSWORD='$REPL_PASS', SOURCE_AUTO_POSITION=1;" || return 1
  exec_sql "$SDB_HOST" "START REPLICA;" || return 1
  exec_sql "$SDB_HOST" "SET GLOBAL read_only = 1;" || return 1
  exec_sql "$SDB_HOST" "SET GLOBAL super_read_only = 1;" || return 1
  return 0
}

ensure_alignment() {
  local super_ro
  super_ro=$(mysql_value "$MDB_HOST" "SELECT @@global.super_read_only;")
  if [[ -z "$super_ro" ]]; then
    log "MDB unreachable during alignment; skipping"
    return
  fi
  if [[ "$super_ro" == "1" ]]; then
    log "MDB still read-only; clearing"
    finalize_mdb_primary || log "Warning: finalize_mdb_primary failed"
  fi
  local sdb_ro
  sdb_ro=$(mysql_value "$SDB_HOST" "SELECT @@global.super_read_only;")
  if [[ "$sdb_ro" == "0" ]]; then
    log "SDB writable; reconfiguring replica"
    configure_sdb_replica || log "Warning: failed to reconfigure SDB as replica"
  fi
}

handle_failback() {
  local leader=$1
  log "Detected SDB as primary; preparing for failback"
  if configure_mdb_replica; then
    log "MDB replication ready; initiating graceful takeover"
    if curl -s -u "${AUTH_USER}:${AUTH_PASS}" --max-time 10 \
      "http://$leader:3000/api/graceful-master-takeover/${CLUSTER}/cloud-mdb/3306" >/dev/null; then
      sleep 5
      finalize_mdb_primary || log "Warning: finalize_mdb_primary failed"
      configure_sdb_replica || log "Warning: failed to reconfigure SDB as replica"
      log "Failback completed"
    else
      log "Takeover request failed"
    fi
  else
    log "Failed to configure MDB as replica"
  fi
}

while true; do
  leader=$(get_leader) || { sleep "$SLEEP_SECONDS"; continue; }
  mdb_ro=$(read_only_state "$MDB_HOST")
  sdb_ro=$(read_only_state "$SDB_HOST")

  master=$(curl -s -u "${AUTH_USER}:${AUTH_PASS}" --max-time 3 "http://$leader:3000/api/master/${CLUSTER}" \
    | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['Key']['Hostname'])" 2>/dev/null || echo "")

  if [[ "$master" != "cloud-mdb" ]]; then
    if [[ "$sdb_ro" != "0" ]]; then
      attempt_failover "$leader"
    fi
  fi

  if [[ "$master" == "cloud-mdb" ]]; then
    ensure_alignment
  elif [[ "$master" == "cloud-sdb" ]]; then
    handle_failback "$leader"
  fi

  sleep "$SLEEP_SECONDS"
done
