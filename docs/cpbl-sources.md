# CPBL 공식 데이터 출처 (2026-10-06 확인)

새 `https://stats.cpbl.com.tw`는 Next.js 사이트이며 이전 사이트의 CSRF POST 폼과 호환되지 않는다. 단순 호스트 치환 대신 공개 클라이언트에서 확인한 아래 계약을 사용한다.

| 대상 | 검증된 GET 경로 | 공개 코드 근거 |
| --- | --- | --- |
| 월별 일정 | `/api/proxy/v1/games/schedule?kindCode=A&year=2026&month=10` | `3mlo3d6845ra3.js`의 `/v1/games/schedule`와 kindCode/year/month |
| 공식 정규시즌 순위 | `/api/proxy/v1/home?TeamRecordsYear=2026` | `1aq6rqwhwiq84.js`의 `/v1/home` |
| 전체 선수 목록 | `/api/proxy/v1/players/autocomplete` | `0-yezul18f8bw.js` |
| 선수별 등록·계약 이력 | `/api/proxy/v1/players/0000001719` | `0o48_jproh58w.js`의 `/v1/players/${acnt}` |

각 경로를 실제 GET해 HTTP 200 JSON을 확인했다. `2w1bbtj-nfa2r.js`의 공개 fetch wrapper가 `/api/proxy`를 붙인다. wire JSON은 `Data` 등 PascalCase이고 UI가 camelCase로 바꾸므로 응답 원문 기준으로 파싱한다.

## 일정과 순위 검증

- A=정규시즌, E=플레이오프, C=챔피언십. 세 종류의 12개월을 모두 성공적으로 검증한 뒤 시즌 캐시를 교체한다.
- 10월 A 13건(종료 11, 연기 1, 예정 1), E 4건(10월 9~12일 예정), C 0건을 확인했다.
- 새 응답에는 GameDate가 없어 PreExeDate의 날짜를 사용한다. 상태는 GameStatus 공식 enum으로 판정하며 0:0 종료도 유효하다.
- 2026-A-274는 10월 5일 연기와 6일 예정 두 행이다. 같은 GameId라도 날짜별로 보존한다.
- 시즌 정규 완료 359경기를 집계한 승·패·무가 TeamRecords.A.FullYear의 6개 구단과 전부 일치했다. 앱은 공식 Ranking/Pct/GB/Strk를 사용한다.
- Strk의 부호는 완료 경기의 마지막 연속 결과와 6개 구단 모두 교차 검증했다. 양수는 연승, 음수는 연패다.
- 조회 실패, 누락 배열, 잘못된 시즌·월·경기 종류·상태는 기존 캐시와 확인 시각을 유지하며 실패 종료한다. 선수 통계 수집 실패가 검증된 일정·순위의 커밋을 막지 않도록 워크플로를 분리해 처리한다.

## 등록·말소 범위

517명의 공식 프로필을 실제 조회했고 Basic.Rmk에서 완전한 날짜와 명시된 이벤트가 있는 등록·계약·등록 말소 이력 2,502건을 확인했다. 새 사이트의 프로필 이력 최신 날짜는 2026-09-09다. 기존 월별 이동 193건을 보존하면서 자연키로 추가·중복 제거해 2,693건을 제공한다. 전체 최신 기록은 여전히 2026-09-29다.

새 사이트의 공개 메뉴·클라이언트에서 일별 1·2군 승강 전체 피드는 확인되지 않았다. `profilesUpdated`는 프로필 확인 시각이며 기존 `updated`/`movementsUpdated`는 월별 이동 확인 시각을 유지한다. 앱에도 이 범위와 기존 이동의 최신 날짜를 표시한다. 현재 소속 변경, RetiredDate, 연도만 있는 명단, 기간 표기는 이동 이벤트로 추정하지 않는다.

프로필 일괄 조회 첫 시도에 일시적인 HTTP 403이 있었고, 경로별 재조회 후 517명 전원 HTTP 200을 확인했다. 이후 일부 요청이 실패하면 캐시와 확인 시각을 보존하고 자동 갱신을 실패로 표시한다.
