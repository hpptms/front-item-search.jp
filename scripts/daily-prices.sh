#!/bin/bash
# 価格スナップショットの日次更新。LaunchAgent com.serch.price-snapshot が毎朝呼ぶ。
#
#   1. 専用の git worktree（serch/.pricebot）を origin/main に合わせる
#   2. scripts/collect-prices.mjs で data/prices/*.json を更新（ローカル backend を叩く）
#   3. 変化があれば commit して main に push → Cloudflare Pages が自動ビルド
#
# 作業用のチェックアウト（serch/frontend）には一切触らない。手元の未コミットの変更や
# 未 push のコミットを巻き込んで push してしまう事故を避けるため、専用 worktree で動く。
# 手元のチェックアウトは毎日 origin より遅れるので、push 前に git pull --rebase すること
# （bot が触るのは data/prices/ だけなので衝突はしない）。
#
# 手動実行: bash frontend/scripts/daily-prices.sh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

FRONTEND="$(cd "$(dirname "$0")/.." && pwd)"
WT="$(dirname "$FRONTEND")/.pricebot"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

if [ ! -d "${WT}/.git" ] && [ ! -f "${WT}/.git" ]; then
  log "worktree を作成: ${WT}"
  git -C "${FRONTEND}" fetch -q origin
  git -C "${FRONTEND}" worktree add -q --detach "${WT}" origin/main
fi

git -C "${WT}" fetch -q origin
git -C "${WT}" checkout -q --detach -f origin/main
git -C "${WT}" clean -qfd data/prices

# collect-prices.mjs は ../.env（serch/.env）から PROXY_SECRET を読む。
# .pricebot は serch/ 直下にあるので、frontend から実行したときと同じ .env を指す。
if ! node "${WT}/scripts/collect-prices.mjs"; then
  log "収集に失敗（backend 停止の可能性）。commit せず終了"
  exit 1
fi

if [ -z "$(git -C "${WT}" status --porcelain -- data/prices)" ]; then
  log "変更なし"
  exit 0
fi

TODAY="$(TZ=Asia/Tokyo date +%Y-%m-%d)"
git -C "${WT}" add -- data/prices
git -C "${WT}" commit -q -m "価格スナップショットを更新（${TODAY}）" -- data/prices

# 収集中に誰かが main に push していたら、取り込んでからもう一度だけ試す。
for attempt in 1 2; do
  if git -C "${WT}" push -q origin HEAD:main; then
    log "push 完了（${TODAY}）"
    exit 0
  fi
  log "push 失敗（${attempt} 回目）。origin/main に rebase して再試行"
  git -C "${WT}" fetch -q origin
  git -C "${WT}" rebase -q origin/main
done
log "push できませんでした"
exit 1
