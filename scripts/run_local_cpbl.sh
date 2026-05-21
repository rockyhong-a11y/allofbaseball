#!/bin/bash
# CPBL 데이터 로컬 수집 스크립트
# 맥(주거용 IP)에서 실행 → CPBL 정상 접근 가능
#
# 사용:
#   --schedule   스케줄(경기 결과)만 수집  [기본]
#   --stats      선수 기록만 수집
#   --all        스케줄 + 선수 기록 모두 수집
#
# crontab 설정 (crontab -e):
#   # 매일 06:00 — 선수 기록 + 스케줄
#   0 6 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" --all >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1
#   # 12:00 / 18:00 / 23:30 — 스케줄(경기 결과)만
#   0 12 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1
#   0 18 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1
#   30 23 * * * /bin/bash "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/run_local_cpbl.sh" >> "/Users/rockyhong/Documents/AI 연구/allofbaseball/scripts/cpbl_run.log" 2>&1

REPO="/Users/rockyhong/Documents/AI 연구/allofbaseball"
PYTHON="/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"
YEAR=2026
MODE="${1:---schedule}"

echo ""
echo "===== $(date '+%Y-%m-%d %H:%M KST') CPBL 수집 시작 (mode=$MODE) ====="

cd "$REPO"
git pull --rebase origin main 2>&1 | tail -2 || true

case "$MODE" in
  --all)
    "$PYTHON" scripts/fetch_cpbl.py --schedule --year $YEAR
    "$PYTHON" scripts/fetch_cpbl.py --stats    --year $YEAR
    ;;
  --stats)
    "$PYTHON" scripts/fetch_cpbl.py --stats    --year $YEAR
    ;;
  *)  # --schedule (기본)
    "$PYTHON" scripts/fetch_cpbl.py --schedule --year $YEAR
    ;;
esac

git add data/
if git diff --staged --quiet; then
    echo "변경사항 없음 — 커밋 건너뜀"
else
    git commit -m "chore: CPBL 데이터 자동 업데이트 $(date '+%Y-%m-%d %H:%M KST')"
    git push origin main
    echo "✅ GitHub 업로드 완료"
fi

echo "===== 완료 ====="
