import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('directory',Path(__file__).parents[1]/'scripts/import_cpbl_directory.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DirectoryTest(unittest.TestCase):
 def test_duplicate_ids_rejected(self):
  with self.assertRaises(ValueError):m.build([{'acnt':'0000001618'}]*2,'now')
 def test_identity_required(self):
  with self.assertRaises(ValueError):m.build([{'acnt':'0000001618'}],'now')
 def test_second_team_and_retirement_preserved(self):
  p={'acnt':'0000001618','chName':'林子偉','engname':'LIN Tzu Wei','uniformNo':'15','defendStation':'4','team':{'name':'樂天桃猿二軍'},'retiredDate':None}
  data=m.build([p],'2026-11-16T00:00:00Z');self.assertEqual(data['count'],1);self.assertEqual(data['players'][p['acnt']]['t'],'樂天桃猿二軍');self.assertEqual(data['players'][p['acnt']]['p'],'Second Base')
