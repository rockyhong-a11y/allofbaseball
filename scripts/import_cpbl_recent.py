"""Preserve verified official regular-season game rows, never infer season totals."""
import json,sys
from pathlib import Path
from datetime import datetime,timezone

def normalize(g):
 if g.get('kindCode')!='A' or g.get('gameStatus')!='FINISHED' or not g.get('gameId','').startswith('2026-A-'):
  raise ValueError('Only completed first-team regular-season games are allowed')
 return {k:g[k] for k in ['gameId','kindCode','gameStatus','preExeDate','home','visiting']}
if __name__=='__main__':
 game=normalize(json.loads(Path(sys.argv[1]).read_text())['game'])
 data={'source':'https://stats.cpbl.com.tw/schedule/','readAt':datetime.fromtimestamp(Path(sys.argv[1]).stat().st_mtime,timezone.utc).isoformat(),'complete':False,'coverageNote':'10/1 이후 정규경기 중 검증된 일부 경기만 포함. 시즌 최신 누적 미확인.','games':[game]}
 Path('data/cpbl_recent_regular.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 Path('assets/cpbl-recent.js').write_text('window.cpblRecentRegular = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
