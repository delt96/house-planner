# 혼수 목록 & 평면도 배치 설계 문서

- **작성일:** 2026-07-01
- **상태:** 설계 확정 (구현 대기)
- **프로젝트 위치:** `C:\Users\USER\Desktop\이범수\honsu-planner`

## 1. 개요 / 목적

여자친구와 함께 혼수(가전·가구)를 계획하기 위한 웹 도구.

두 가지 목적을 순서대로 달성한다.

1. **살 것을 정하고 총 비용을 확인한다.** 필요한 항목을 적고, 후보 제품을 여러 개 비교한 뒤 하나를 확정하면 전체 예상 금액이 계산된다.
2. **집 치수에 맞춰 배치해본다.** 확정된 가구를 실제 크기 그대로 평면도 위에 마우스로 드래그해 배치한다.

로그인은 없다. 로컬 서버에 올려 같은 네트워크에서 둘이 같은 데이터를 공유한다.

## 2. 범위

### Phase 1 — 목록 & 예산 (먼저 구현)
- 필요 항목 CRUD
- 항목별 후보 제품 CRUD (이름·가격·URL·메모·치수)
- 후보 중 하나 확정 / 확정 해제
- 총액 요약 (확정 합계 + 미확정 건수)

### Phase 2 — 평면도 배치 (Phase 1 완료 후 구현, 설계는 여기 포함)
- 사각형 방 블록 CRUD, 아파트 한 캔버스에 이어 붙여 평면도 구성
- 확정 가구를 실제 치수 사각형으로 캔버스에 드래그 배치·회전·저장
- 치수 없는 확정 항목은 "배치 불가 목록"에 분리 표시 → 치수 입력 시 배치 가능

### 비범위 (후순위 / 이번엔 안 함)
- 구매 완료 추적 / 완료 목록 (드롭됨)
- 겹침(충돌) 감지, 비사각형·곡선 벽, 대각선 방
- 문·창문 표시, 자동 배치 추천
- 사용자 인증, 다중 가구 세트/버전 관리
- 외부 쇼핑몰 URL 자동 크롤링(가격·이미지 자동 수집)

## 3. 데이터 모델 (PostgreSQL)

Phase 2까지 한 번에 설계한다. 금액은 정수 원(KRW), 치수는 cm(소수 허용).

```
items                     필요 항목
  id                      serial PK
  name                    text NOT NULL            예: "냉장고"
  sort_order              int  DEFAULT 0
  confirmed_candidate_id  int  NULL FK -> candidates(id) ON DELETE SET NULL
  created_at              timestamptz DEFAULT now()

candidates                후보 제품 (항목당 여러 개)
  id                      serial PK
  item_id                 int  NOT NULL FK -> items(id) ON DELETE CASCADE
  name                    text NOT NULL
  price                   bigint NULL              원 단위, 미입력 허용
  url                     text NULL
  memo                    text NULL
  width_cm                numeric NULL             가로 (좌우)
  depth_cm                numeric NULL             세로/깊이 (앞뒤)
  height_cm               numeric NULL             높이 (선택, 참고용)
  sort_order              int  DEFAULT 0
  created_at              timestamptz DEFAULT now()

rooms                     방 (사각형 블록)
  id                      serial PK
  name                    text NOT NULL            예: "거실"
  x                       numeric NOT NULL DEFAULT 0   아파트 캔버스 좌표(cm)
  y                       numeric NOT NULL DEFAULT 0
  width_cm                numeric NOT NULL
  depth_cm                numeric NOT NULL
  sort_order              int  DEFAULT 0
  created_at              timestamptz DEFAULT now()

placements                가구 배치 (확정 항목 1개당 최대 1개)
  id                      serial PK
  item_id                 int NOT NULL UNIQUE FK -> items(id) ON DELETE CASCADE
  x                       numeric NOT NULL         아파트 전체 좌표계(cm)
  y                       numeric NOT NULL
  rotation                int NOT NULL DEFAULT 0   0 / 90 / 180 / 270
  created_at              timestamptz DEFAULT now()
```

**관계 및 규칙**
- `items.confirmed_candidate_id`는 nullable. 후보 생성 후 확정 시 설정된다(순환 참조 회피).
- 배치 대상은 **확정 항목**만. 배치에 쓰는 치수는 확정 후보(`confirmed_candidate_id`)의 `width_cm × depth_cm`에서 가져온다.
- 확정 후보에 치수가 없으면 "배치 불가"로 분류(별도 목록).
- 항목 삭제 시 후보·배치도 함께 삭제(CASCADE).

## 4. 총액 계산 규칙

- **확정 합계** = 확정된 후보들의 `price` 합 (메인 숫자).
- **미확정 건수** = 확정 후보가 없는 항목 수 (건수만 표시, 금액 추정 안 함).
- 확정됐지만 `price`가 없는 항목은 "가격 미입력" 태그로 표시하고 합계에는 0으로 반영.

## 5. Phase 1 상세

### 화면
- **홈 (목록)**
  - 상단 요약 바: `확정 합계 3,200,000원 · 미확정 3건`
  - 항목 리스트: 각 행에 이름 · 상태(⚪ 비교중 / ✅ 확정) · 확정 시 가격 표시
  - "＋ 항목 추가" (이름 입력)
  - 항목 클릭 → 상세로 이동
- **항목 상세**
  - 후보 카드 목록: 이름 · 가격 · URL 링크(새 탭) · 메모 · 치수(있으면)
  - 각 후보에 "이걸로 확정" 버튼 (확정된 후보엔 ⭐ 표시, "확정 해제" 가능)
  - "＋ 후보 추가" 폼: 이름(필수) · 가격 · URL · 메모 · 가로 · 세로 · 높이
  - 후보 수정/삭제

### API
```
GET    /api/summary                     확정 합계, 미확정 건수
GET    /api/items                       항목 목록(확정 후보/가격 포함)
POST   /api/items                       { name }
PATCH  /api/items/:id                   { name?, sort_order? }
DELETE /api/items/:id
GET    /api/items/:id                   항목 + 후보 목록
POST   /api/items/:id/candidates        { name, price?, url?, memo?, width_cm?, depth_cm?, height_cm? }
PATCH  /api/candidates/:id              위 필드 부분 수정
DELETE /api/candidates/:id
PUT    /api/items/:id/confirm           { candidate_id }  확정
DELETE /api/items/:id/confirm           확정 해제
```

## 6. Phase 2 상세

### 화면
- **아파트 캔버스** (위에서 내려다본 평면도, cm→px 축척)
  - **방 배치 모드:** "방 추가" → 이름·가로·세로 입력 → 사각형 블록 생성 → 드래그로 위치 이동, 모서리 근처에서 스냅. 방 크기/이름 수정·삭제.
  - **가구 배치:** 좌측 팔레트에 "배치 가능"(확정+치수 있음, 아직 미배치) 항목이 실제 축척 사각형으로 표시 → 캔버스로 드래그. 배치된 가구는 이동·90° 회전(스냅), 위치 저장. 캔버스 밖으로 드래그하면 배치 해제.
  - **배치 불가 목록:** 확정됐지만 치수 없는 항목 리스트 → 클릭해 치수 입력하면 "배치 가능"으로 이동.
- 격자(grid) 스냅, 축척 표시(예: 1m 눈금). 방 라벨에 이름·크기 표기.

### API
```
GET    /api/rooms
POST   /api/rooms                       { name, width_cm, depth_cm, x?, y? }
PATCH  /api/rooms/:id                    { name?, width_cm?, depth_cm?, x?, y? }
DELETE /api/rooms/:id
GET    /api/placements                  배치 목록(항목·치수·좌표·회전 포함)
PUT    /api/items/:id/placement          { x, y, rotation }  생성/갱신(upsert)
DELETE /api/items/:id/placement          배치 해제
GET    /api/placeable                    확정 항목을 배치가능/배치불가로 분류해 반환
```

## 7. 기술 스택 & 아키텍처

- **백엔드:** Node.js + Express, `pg`로 PostgreSQL 접근. REST JSON API.
- **DB 마이그레이션:** 간단한 SQL 마이그레이션 파일(`migrations/*.sql`) + 실행 스크립트.
- **프론트엔드:** React + Vite, 반응형(폰·PC). 평면도는 SVG 또는 Canvas 기반 드래그.
- **서빙:** 단일 Node 프로세스가 `/api/*`를 처리하고, 빌드된 프론트 정적 파일을 함께 서빙.
- **설정:** DB 접속 정보는 환경변수(`DATABASE_URL` 등). `.env.example` 제공.
- **드래그 구현:** 라이브러리는 구현 계획 단계에서 결정(예: 순수 포인터 이벤트 또는 경량 dnd 라이브러리). 좌표는 모두 cm 기준으로 저장하고 렌더 시 축척 변환.

### 프로젝트 구조(안)
```
honsu-planner/
  server/          Express 앱, 라우트, DB 접근
  migrations/      SQL 스키마
  web/             React + Vite 프론트
  docs/            본 설계 문서 등
  .env.example
  README.md
```

## 8. 에러 처리

- **입력 검증:** 항목 이름 필수, 가격은 0 이상 정수, 치수는 0 초과 숫자. 위반 시 400 + 메시지.
- **없는 리소스:** 404.
- **DB 오류/연결 실패:** 500 + 일반 메시지, 서버 로그에 상세 기록.
- **프론트:** 실패 시 사용자에게 토스트/인라인 오류 표시, 낙관적 업데이트 실패 시 롤백.

## 9. 테스트 전략

- **백엔드:** API 라우트 통합 테스트(각 엔드포인트 정상/검증실패/404). 테스트용 PostgreSQL 또는 트랜잭션 롤백 사용. TDD로 라우트별 작성.
- **총액 계산:** 확정/미확정/가격 미입력 조합에 대한 단위 테스트.
- **Phase 2 좌표/축척:** cm↔px 변환, 회전 시 바운딩 계산, 배치가능/불가 분류 로직 단위 테스트.
- **프론트:** 핵심 상호작용(항목 추가, 확정, 드래그 배치) 위주 최소 컴포넌트 테스트.

## 10. 구현 순서(요약)

1. 프로젝트 스캐폴딩(server/web/migrations), DB 스키마, `.env.example`.
2. Phase 1 백엔드 API + 테스트.
3. Phase 1 프론트(홈, 항목 상세, 총액 요약).
4. Phase 2 백엔드(rooms/placements/placeable) + 테스트.
5. Phase 2 프론트(아파트 캔버스, 방 배치, 가구 드래그, 배치 불가 목록).

## 11. 향후 개선 (후순위)

- 겹침(충돌) 감지 및 경고
- 비사각형/대각선 방, 문·창문 표시
- URL에서 가격·이미지·이름 자동 수집
- 구매 완료 상태/이력, 예산 상한 설정 및 초과 경고
