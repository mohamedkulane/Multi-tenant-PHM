#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=/etc/phms/compose.yml
LOCAL_DIR=/opt/backups/daawokaal
RCLONE_CONFIG=/etc/rclone/daawokaal-b2.conf
VALIDATION_FILE=/etc/daawokaal-backup/b2-bucket.validation
REMOTE_NAME=daawokaal-b2
BUCKET_NAME=daawokaal-backups
REMOTE_DIR=postgresql
LOCAL_KEEP=3
REMOTE_KEEP_DAYS=30
LOCK_FILE=/run/lock/backup-daawokaal.lock

restore_test=false
case "${1:-}" in
  "") ;;
  --restore-test) restore_test=true ;;
  *) echo "Usage: $0 [--restore-test]" >&2; exit 64 ;;
esac

if [[ $EUID -ne 0 ]]; then
  echo "This backup must run as root." >&2
  exit 77
fi

for required in "$COMPOSE_FILE" "$RCLONE_CONFIG" "$VALIDATION_FILE"; do
  [[ -f "$required" && ! -L "$required" ]] || { echo "Required regular file missing: $required" >&2; exit 78; }
done
[[ "$(stat -c '%U:%G:%a' "$RCLONE_CONFIG")" == "root:root:600" ]] || {
  echo "Unsafe rclone configuration permissions." >&2
  exit 78
}
grep -qx 'remote=daawokaal-b2' "$VALIDATION_FILE"
grep -qx 'bucket=daawokaal-backups' "$VALIDATION_FILE"
grep -qx 'bucket_type=allPrivate' "$VALIDATION_FILE"
[[ -d "$LOCAL_DIR" && ! -L "$LOCAL_DIR" && "$(readlink -f "$LOCAL_DIR")" == "$LOCAL_DIR" ]] || {
  echo "Unsafe local backup directory." >&2
  exit 78
}

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another DaawoKaal backup is already running." >&2; exit 75; }
umask 077

stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="daawokaal-${stamp}.sql.gz"
partial="$LOCAL_DIR/.${name}.partial"
final="$LOCAL_DIR/$name"
remote_path="${REMOTE_NAME}:${BUCKET_NAME}/${REMOTE_DIR}"
restore_db="daawokaal_restore_${stamp,,}"
restore_db=${restore_db//-/}
restore_db=${restore_db//:/}
restore_created=false

cleanup() {
  rm -f -- "$partial"
  if [[ "$restore_created" == true && "$restore_db" =~ ^daawokaal_restore_[0-9tz]+$ ]]; then
    docker compose -f "$COMPOSE_FILE" exec -T postgres dropdb -U postgres --if-exists "$restore_db" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Creating PostgreSQL plain-text dump: $name"
if ! docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U postgres -d phms_prod --format=plain --no-owner --no-acl \
  | gzip -9 > "$partial"; then
  echo "pg_dump or gzip failed." >&2
  exit 1
fi
[[ -s "$partial" ]] || { echo "Compressed archive is empty." >&2; exit 1; }
gzip -t "$partial"
mv -- "$partial" "$final"
chmod 0600 "$final"
local_size=$(stat -c %s "$final")
(( local_size > 0 )) || { echo "Local archive size is zero." >&2; exit 1; }

echo "Uploading verified archive to private Backblaze B2 bucket."
rclone --config "$RCLONE_CONFIG" copyto "$final" "$remote_path/$name" \
  --immutable --transfers 1 --checkers 2 --retries 3 --low-level-retries 10

remote_record=$(rclone --config "$RCLONE_CONFIG" lsf "$remote_path" \
  --files-only --include "$name" --format sp --separator '|')
[[ $(printf '%s\n' "$remote_record" | sed '/^$/d' | wc -l) -eq 1 ]] || {
  echo "Remote object was not uniquely found." >&2
  exit 1
}
remote_size=${remote_record%%|*}
remote_name=${remote_record#*|}
[[ "$remote_name" == "$name" && "$remote_size" =~ ^[0-9]+$ && "$remote_size" -gt 0 && "$remote_size" -eq "$local_size" ]] || {
  echo "Remote object name or size verification failed." >&2
  exit 1
}
rclone --config "$RCLONE_CONFIG" check "$LOCAL_DIR" "$remote_path" \
  --include "$name" --one-way --checkers 1

echo "Applying remote retention: permanently remove matching backups older than ${REMOTE_KEEP_DAYS} days."
rclone --config "$RCLONE_CONFIG" delete "$remote_path" \
  --include 'daawokaal-*.sql.gz' --min-age "${REMOTE_KEEP_DAYS}d" \
  --b2-hard-delete --checkers 2 --transfers 1

mapfile -t local_backups < <(
  find "$LOCAL_DIR" -maxdepth 1 -type f -name 'daawokaal-*.sql.gz' -printf '%T@ %p\n' \
    | sort -nr | cut -d' ' -f2-
)
for ((index=LOCAL_KEEP; index<${#local_backups[@]}; index++)); do
  old_backup=${local_backups[$index]}
  [[ "$old_backup" =~ ^/opt/backups/daawokaal/daawokaal-[0-9TZ]+\.sql\.gz$ ]] || {
    echo "Refusing unsafe local retention target: $old_backup" >&2
    exit 1
  }
  rm -f -- "$old_backup"
done

if [[ "$restore_test" == true ]]; then
  [[ "$restore_db" =~ ^daawokaal_restore_[0-9tz]+$ ]] || { echo "Unsafe restore database name." >&2; exit 1; }
  exists=$(docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -d postgres -Atc \
    "SELECT count(*) FROM pg_database WHERE datname='$restore_db';")
  [[ "$exists" == 0 ]] || { echo "Restore test database already exists." >&2; exit 1; }
  production_signature=$(docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -d phms_prod -Atc \
    'SELECT (SELECT count(*) FROM platform_users) || chr(124) || (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL);')
  docker compose -f "$COMPOSE_FILE" exec -T postgres createdb -U postgres -T template0 "$restore_db"
  restore_created=true
  gzip -dc "$final" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U postgres -d "$restore_db" -v ON_ERROR_STOP=1 >/dev/null
  restored_signature=$(docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -d "$restore_db" -Atc \
    'SELECT (SELECT count(*) FROM platform_users) || chr(124) || (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL);')
  [[ "$restored_signature" == "$production_signature" ]] || { echo "Isolated restore signature mismatch." >&2; exit 1; }
  docker compose -f "$COMPOSE_FILE" exec -T postgres dropdb -U postgres "$restore_db"
  restore_created=false
  production_signature_after=$(docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -d phms_prod -Atc \
    'SELECT (SELECT count(*) FROM platform_users) || chr(124) || (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL);')
  [[ "$production_signature_after" == "$production_signature" ]] || { echo "Production signature changed during restore test." >&2; exit 1; }
  echo "Isolated restore test passed; temporary database removed."
fi

trap - EXIT
echo "BACKUP_OK file=$name bytes=$local_size remote=$remote_path/$name local_keep=$LOCAL_KEEP remote_days=$REMOTE_KEEP_DAYS restore_test=$restore_test"
