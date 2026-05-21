#!/bin/bash
# CPBL 스케줄 로컬 수집 스크립트
# 맥에서 실행 → 주거용 IP로 CPBL 접근 (GitHub Actions Azure IP는 차단됨)
#
# 설치:
#   chmod +x scripts/run_local_cpbl.sh
#   crontab -e 에 아래 4줄 추가:
#   0 6 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1
#   0 12 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1
#   0 18 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1
#   30 23 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1

set -e
REPO="/Users/rockyhong/Documents/AI 연구/allofbaseball"
PYTHON="/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"
GH="/usr/local/bin/gh"
YEAR=2026

echo ""
echo "===== $(date '+%Y-%m-%d %H:%M KST') CPBL 스케줄 수집 시작 ====="

cd "$REPO"

# git pull (충돌 방지)
git pull --rebase origin main 2>&1 || true

# 스케줄 수집
"$PYTHON" scripts/fetch_cpbl.py --schedule --year $YEAR

# 변경사항 있으면 커밋 + 푸시
git add data/cpbl_schedule_${YEAR}.json
if git diff --staged --quiet; then
    echo "변경사항 없음 — 커밋 건너뜀"
else
    git commit -m "chore: CPBL 스케줄 로컬 업데이트 $(date '+%Y-%m-%d %H:%M KST')"
    git push origin main
    echo "✅ 업로드 완료"
fi

echo "===== 완료 ====="
