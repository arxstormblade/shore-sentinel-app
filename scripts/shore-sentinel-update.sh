#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-status}"
APP_DIR="${SHORE_SENTINEL_APP_DIR:-${SHORE_SENTINEL_REPO_DIR:-/workspace/shore360-workspace/apps/shore-sentinel}}"
REMOTE="${SHORE_SENTINEL_UPDATE_REMOTE:-origin}"
BRANCH="${SHORE_SENTINEL_UPDATE_BRANCH:-main}"
COMPOSE_FILE="${SHORE_SENTINEL_COMPOSE_FILE:-docker-compose.yml}"
ALLOW_DIRTY="${SHORE_SENTINEL_UPDATE_ALLOW_DIRTY:-false}"
BACKUP_PREFIX="${SHORE_SENTINEL_UPDATE_BACKUP_PREFIX:-backup/pre-update}"

log() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }
need() { command -v "$1" >/dev/null 2>&1 || { err "Missing required command: $1"; exit 10; }; }

case "$MODE" in
  status|check|apply) ;;
  *) err "Usage: $0 {status|check|apply}"; exit 2 ;;
esac

need git
need docker

if [ ! -d "$APP_DIR" ]; then
  err "Application directory not found: $APP_DIR"
  exit 11
fi

GIT_ROOT="$(git -C "$APP_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$GIT_ROOT" ] || [ ! -d "$GIT_ROOT/.git" ]; then
  err "Git checkout not found for application directory: $APP_DIR"
  exit 11
fi

COMPOSE_PATH="$APP_DIR/$COMPOSE_FILE"
if [ ! -f "$COMPOSE_PATH" ]; then
  err "Compose file not found: $COMPOSE_PATH"
  exit 12
fi

cd "$GIT_ROOT"

current_branch="$(git branch --show-current)"
local_sha="$(git rev-parse HEAD)"
dirty="false"
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  dirty="true"
fi

log "Shore Sentinel update ${MODE}"
log "git_root=$GIT_ROOT"
log "app_dir=$APP_DIR"
log "compose_file=$COMPOSE_PATH"
log "branch=$current_branch"
log "target=$REMOTE/$BRANCH"
log "local_sha=$local_sha"
log "dirty=$dirty"

if [ "$MODE" = "status" ]; then
  git remote -v | sed 's/^/remote: /'
  exit 0
fi

if [ "$dirty" = "true" ] && [ "$ALLOW_DIRTY" != "true" ]; then
  err "Refusing to update with local uncommitted changes. Commit/stash changes or set SHORE_SENTINEL_UPDATE_ALLOW_DIRTY=true."
  git status --short
  exit 20
fi

log "Fetching $REMOTE $BRANCH..."
git fetch --prune "$REMOTE" "$BRANCH"
remote_sha="$(git rev-parse "$REMOTE/$BRANCH")"
merge_base="$(git merge-base HEAD "$REMOTE/$BRANCH")"

log "remote_sha=$remote_sha"

if [ "$local_sha" = "$remote_sha" ]; then
  log "Already up to date."
  exit 0
fi

if [ "$merge_base" != "$local_sha" ]; then
  err "Local branch cannot fast-forward cleanly to $REMOTE/$BRANCH. Manual update required."
  exit 21
fi

log "Update available: $local_sha -> $remote_sha"

if [ "$MODE" = "check" ]; then
  git log --oneline --decorate --no-merges "HEAD..$REMOTE/$BRANCH" | sed 's/^/pending: /'
  exit 0
fi

backup_branch="${BACKUP_PREFIX}-$(date -u +%Y%m%dT%H%M%SZ)"
log "Creating backup branch $backup_branch at $local_sha"
git branch "$backup_branch" "$local_sha"

log "Fast-forwarding to $remote_sha"
git merge --ff-only "$REMOTE/$BRANCH"

log "Rebuilding and restarting Docker Compose stack"
cd "$APP_DIR"
docker compose -f "$COMPOSE_PATH" pull --ignore-pull-failures || true
docker compose -f "$COMPOSE_PATH" up -d --build

log "Waiting for service health"
docker compose -f "$COMPOSE_PATH" ps

log "Update applied successfully"
log "backup_branch=$backup_branch"
log "new_sha=$(git -C "$GIT_ROOT" rev-parse HEAD)"
