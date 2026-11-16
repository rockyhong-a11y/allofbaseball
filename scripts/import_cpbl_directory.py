"""Import a verified official CPBL /players response, preserving source timestamp."""
import json, re, sys
from pathlib import Path

def build(players, read_at):
    if not isinstance(players, list) or not players:
        raise ValueError('Empty official player directory')
    ids = [p.get('acnt') for p in players]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r'\d{10}', str(i)) for i in ids):
        raise ValueError('Invalid/duplicate CPBL player ID')
    positions={'1':'Pitcher','2':'Catcher','3':'First Base','4':'Second Base','5':'Third Base','6':'Shortstop','7':'Left Field','8':'Center Field','9':'Right Field','10':'DH'}
    normalized={}
    for p in players:
        if not p.get('chName') or not p.get('team',{}).get('name'):
            raise ValueError('Missing player identity/team')
        normalized[p['acnt']] = {'n':p.get('engname') or p['chName'], 'zh':p['chName'].lstrip('#'), 'j':p.get('uniformNo',''), 't':p['team']['name'], 'tc':p['team'].get('code',''), 'p':positions.get(str(p.get('defendStation')),'Unknown'), 'ph':p.get('acntImgPath',''), 'aliases':[p.get('aboriginalName','')], 'retiredDate':p.get('retiredDate'), 'directoryReadAt':read_at}
    return {'source':'https://stats.cpbl.com.tw/players','readAt':read_at,'count':len(normalized),'players':normalized}

if __name__=='__main__':
    raw=json.loads(Path(sys.argv[1]).read_text())
    data=build(raw, sys.argv[2])
    Path('data/cpbl_players.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    # Synchronous source snapshot makes all names available even if remote services fail.
    Path('assets/cpbl-directory.js').write_text('window.cpblDirectory = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\nfor (const [id, player] of Object.entries(window.cpblDirectory.players)) { CPBL_PLAYERS[id] = {...(CPBL_PLAYERS[id] || {}), ...player}; CPBL_INDEX[player.n] = id; CPBL_NAME_INDEX[player.n.toLowerCase().replace(/\\s+/g, \"\")] = id; CPBL_ZH_MAP[player.zh] = player.n; }\n')
