/**
 * TradingView 무료 임베드 위젯의 출처 표기.
 *
 * TV 약관이 무료 위젯 사용 시 TradingView 로 향하는 어트리뷰션 링크를 요구한다
 * (공식 스니펫의 `tradingview-widget-copyright` 블록). 위젯 스크립트만 주입하고
 * 이 표기를 빼면 약관 위반이므로, TV 위젯을 쓰는 모든 곳에서 함께 렌더한다.
 */
export function TvAttribution() {
  return (
    <div className="shrink-0 px-3 py-1 text-micro text-fg-mute">
      <a
        href="https://www.tradingview.com/"
        rel="noopener nofollow"
        target="_blank"
        className="hover:text-accent transition-colors"
      >
        Track all markets on TradingView
      </a>
    </div>
  );
}
