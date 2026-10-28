# 불판 대첩

동아리 부스용 먹기 대결 게임. 고깃집 식탁에서 **컴퓨터(CPU)와 마주 앉아** 대결한다.
공용 접시와 공용 불판에서 음식을 먼저 집어 먹으며 **단백질·탄수화물·비타민**을 지키고, 하나라도 먼저 0이 되는 쪽이 진다.

기획서: [design/plan.md](design/plan.md)

## 조작

| 키 | 하는 일 |
|---|---|
| `Q` `W` `E` `R` | 접시: 밥 먹기 · 고기 올리기 · 버섯 올리기 · 상추 먹기 |
| `Shift` + `Q` `W` `E` `R` | 불판 **윗줄** 1~4번 칸의 익은 음식 먹기 |
| `Shift` + `U` `I` `O` `P` | 불판 **아랫줄** 5~8번 칸의 익은 음식 먹기 |

- 불판 칸 아래에 초록색 `⇧Q` 같은 키 표시가 있다. 익은(초록 테두리) 칸의 키를 누르면 먹는다.
- 익은 음식은 먼저 누른 사람(나 또는 CPU)이 먹는다. 탄 음식은 2초 뒤 저절로 치워진다.
- 익자마자(0.6초 안) 먹으면 **PERFECT** — 영양 1.5배.
- 가끔 나오는 **황금 고기**는 모든 수치 +35, **청양고추**를 먹으면 상대가 2초 동안 못 먹는다.
- 빈 접시, 빈 칸, 덜 익은 칸, 탄 칸을 누르면 **헛손질**로 0.5초 동안 손이 묶인다.
- 타이틀에서 `←` `→` 또는 `1` `2` `3`으로 CPU 난이도(쉬움·보통·어려움)를 고른다.
- `Space` 시작·다시 하기, `Esc` 일시정지, 타이틀에서 `T` 키 테스트.

## GitHub Pages로 배포

빌드가 없는 정적 파일이라 그대로 올리면 된다.

1. 이 저장소를 GitHub에 push
2. 저장소 **Settings → Pages → Build and deployment**에서 Source를 `Deploy from a branch`, 브랜치를 `main` / `(root)`로 선택
3. 1~2분 뒤 `https://<계정>.github.io/<저장소>/`에서 실행

로컬에서 확인할 때는 `npm run serve` (또는 `python3 -m http.server`) 후 `http://localhost:8000`.
ES 모듈을 쓰기 때문에 `index.html`을 더블클릭해서 `file://`로 열면 동작하지 않는다.

## 밸런스 조정

모든 숫자는 [js/config.js](js/config.js) 한 곳에 있다.

- 판이 너무 길면 `rampStart`(기본 390초)를 줄인다.
- 너무 빨리 끝나면 `decaySlope`를 줄이거나 접시 `refill` 간격을 줄인다.
- CPU 난이도는 [js/ai.js](js/ai.js)의 `DIFFICULTY`(반응 시간·망설임 확률·특수 음식 노림)에서 조정한다.
- 바꾼 뒤에는 `npm run sim`으로 사람 모델 vs CPU 승률을 확인한다.

## 테스트

```bash
npm test               # 규칙·피버·밸런스 (Node만 있으면 됨)
npm i -D playwright    # 처음 한 번
npm run test:browser   # 실제 브라우저에서 키 입력·랭킹·화면 크기·fps·콘솔 에러 확인
```

## 부스 운영 팁

- 처음 하는 손님은 **쉬움**으로. 시뮬레이션 기준 처음 하는 사람도 쉬움 CPU는 약 84% 이긴다. 보통은 익숙한 사람, 어려움은 도전용.
- 랭킹은 난이도별 **최단 승리 시간 TOP 5**이고, 이겼을 때만 기록된다. 그 브라우저에만 저장되니 부스 PC 하나로 계속 운영할 것.
- 브라우저는 전체 화면(`F11`)으로.
- **Windows 고정 키 끄기**: Shift를 5번 연달아 누르면 '고정 키' 창이 떠서 게임을 가린다. 행사 전에 설정 → 접근성 → 키보드 → 고정 키의 **바로 가기 키**를 꺼 둘 것.

## 크레딧

- 폰트: [Galmuri](https://github.com/quiple/galmuri) by Lee Minseo — SIL Open Font License 1.1 ([fonts/Galmuri-LICENSE.txt](fonts/Galmuri-LICENSE.txt))
