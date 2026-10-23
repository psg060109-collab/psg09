# 불판 대첩

동아리 부스용 2인 대전 먹기 게임. PC 한 대, 키보드 하나를 둘이 나눠 쓴다.
공용 접시와 공용 불판에서 음식을 먼저 집어 먹으며 **단백질·탄수화물·비타민**을 지키고, 하나라도 먼저 0이 되는 쪽이 진다.

기획서: [design/plan.md](design/plan.md)

## 조작

| | 1P (왼쪽) | 2P (오른쪽) |
|---|---|---|
| 접시 (밥 · 고기 · 버섯 · 상추) | `Q` `W` `E` `R` | `U` `I` `O` `P` |
| 불판 윗줄 1~4번 칸 | `A` `S` `D` `F` | `J` `K` `L` `;` |
| 불판 아랫줄 5~8번 칸 | `Z` `X` `C` `V` | `M` `,` `.` `/` |

- 밥·상추는 접시 키로 바로 먹는다. 고기·버섯은 접시 키로 불판에 올리고, 초록색으로 익었을 때 칸 키로 먹는다.
- 익은 음식은 먼저 누른 사람이 먹는다. 탄 음식은 칸 키로 치운다.
- `Space` 시작·다시 하기, `Esc` 일시정지, 타이틀에서 `T` 키 테스트(고스팅 확인).

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
- 바꾼 뒤에는 `npm run sim`으로 봇 대결 결과를 확인한다.

## 테스트

```bash
npm test               # 규칙·피버·밸런스 (Node만 있으면 됨)
npm i -D playwright    # 처음 한 번
npm run test:browser   # 실제 브라우저에서 키 입력·랭킹·화면 크기·fps·콘솔 에러 확인
```

## 부스 운영 팁

- 행사 전에 타이틀 화면에서 `T`를 눌러 키 테스트: 두 사람이 동시에 여러 키를 눌렀을 때 전부 켜지는지 확인한다. 빠지는 키가 있으면 N키 롤오버(게이밍) 키보드로 바꾼다.
- 랭킹(명승부 TOP 5)은 그 브라우저에만 저장된다. 부스 PC 하나로 계속 운영할 것.
- 브라우저는 전체 화면(`F11`)으로.

## 크레딧

- 폰트: [Galmuri](https://github.com/quiple/galmuri) by Lee Minseo — SIL Open Font License 1.1 ([fonts/Galmuri-LICENSE.txt](fonts/Galmuri-LICENSE.txt))
