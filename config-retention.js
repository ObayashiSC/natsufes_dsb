/* =========================================================================
 *  config-retention.js  —  Retention Dashboard configuration (一元管理)
 *  ------------------------------------------------------------------------
 *  元の LINE ダッシュボード (config.js) の設計を踏襲したリテンション版。
 *  データ(json)を日々差し替える場合は DATA_SOURCE のパスのみ確認すればOK。
 *  カラー方針: LINE=緑(acq) / DROP=青(attr) / 全体=グレー(gray)
 * ========================================================================= */
window.RETENTION_CONFIG = {
  /* --- データソース (日々差し替えるJSON) ---------------------------------
   *  retention_report.py が output/ に吐く固定名ファイル。
   *  日付は JSON 内の run_date を参照するため、ファイル名の変更は不要。
   * -------------------------------------------------------------------- */
  DATA_SOURCE: "retention_result.json",

  /* --- ブランド ---------------------------------------------------------- */
  brand: {
    title: "Retention Effect Tracker",
    subtitle: "LINE / DROP Retention Funnel Analytics",
  },

  /* --- チャネルの並び順と配色 -------------------------------------------
   *  accent は styles.css の CSS変数（--acq / --attr / --gray）に対応。
   * -------------------------------------------------------------------- */
  channelOrder: ["LINE", "DROP", "SHOP", "MAIL"],
  channelAccent: {
    LINE: "acq",    // 緑
    DROP: "attr",   // 青
    SHOP: "attr",
    MAIL: "gray",
  },

  /* --- KPIタイル（1段 × 4指標）------------------------------------------
   *  リテンション数 / 遷移率 / 予約率 / 開封率
   * -------------------------------------------------------------------- */
  kpis: [
    { key: "base_count",       label: "リテンション数", caption: "母数（登録者ベース）" },
    { key: "transition_rate",  label: "遷移率",        caption: "サイト流入 ÷ 母数",   pct: true },
    { key: "reservation_rate", label: "予約率",        caption: "予約完了 ÷ 母数",     pct: true },
    { key: "open_rate",        label: "開封率",        caption: "開封数 ÷ 送信数",     pct: true },
  ],

  /* --- ブロック増加数タイル -----------------------------------------------
   *  JSON の block_trend（LINE友だち一覧の期間差分）から算出するため、
   *  LINE チャネルの段にのみ追加表示する。blockKpiChannel で対象を指定。
   * -------------------------------------------------------------------- */
  blockKpi: { label: "ブロック増加数", caption: "期間内のブロック増（LINEのみ）" },
  blockKpiChannel: "LINE",

  /* --- ファネルの段（open_count が無いチャネルは開封段を自動スキップ）--- */
  funnelSteps: [
    { key: "message_delivery_count", label: "送信数" },
    { key: "open_count",             label: "開封数", optional: true },
    { key: "transition_users",       label: "遷移数" },
    { key: "reservation_users",      label: "予約数" },
  ],

  /* --- 構成比の基準 ------------------------------------------------------
   *  "first" = 先頭ステップ(送信数)を100%とする / "base" = 母数を100%
   * -------------------------------------------------------------------- */
  ratioBase: "first",

  /* --- 空値ラベル -------------------------------------------------------- */
  emptyLabel: "取得不可",
};
