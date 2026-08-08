# apps/web

HighProfit 프런트엔드 — Next.js 16 App Router, **정적 export**(`output: 'export'`).
모든 분석은 브라우저에서 `@highprofit/core` 순수 함수로 계산한다.

```bash
npm run dev     # localhost:3000  (레포 루트에서 실행해도 된다)
npm run build   # → out/  정적 사이트
npm run lint
```

데이터는 `public/data/`(gitignore)에서 읽는다. 클론 직후엔 비어 있으므로
[루트 README 의 "데이터 갱신"](../../README.md#데이터-갱신)을 먼저 돌려야 화면이 뜬다.
경로는 `NEXT_PUBLIC_DATA_BASE`(기본 `/data`)로 바꿀 수 있다.

## 문서

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 이 워크스페이스의 규칙·구조 (**작업 전 필독**) |
| [`../../docs/frontend-architecture.md`](../../docs/frontend-architecture.md) | 라우트·컴포넌트·훅·테마·차트 |
