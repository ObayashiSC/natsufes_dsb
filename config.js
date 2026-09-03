/* =========================================================================
 *  config.js  —  Dashboard configuration (一元管理)
 *  ------------------------------------------------------------------------
 *  データ(json)を日々差し替える場合は DATA_SOURCE のパスのみ確認すればOK。
 *  カラーは styles.css の CSS変数と対応:
 *     Attribute   = 青 (--attr)
 *     Acquisition = 緑 (--acq)
 *     Engagement  = 紫 (--rich)
 *     その他       = グレー
 *
 *  【グラフ定義で使える任意プロパティ】
 *     multi     : 複数選択（カンマ区切り）を分割集計するか
 *     order     : 選択肢マスタ（配列）。指定するとこの順で軸を固定
 *     orderRef  : CFG 内の並び順配列名（order と同義・名前参照）
 *     masterRef : CFG 内のマスタ名。fillZero と併用し、
 *                 「データに一度も出ない選択肢」も 0件として表示する。
 *     limit     : 表示件数。省略=上位N / null=全件表示 / 数値=その件数
 *     fillZero  : true で 0件の選択肢も軸に表示
 * ========================================================================= */
window.DASHBOARD_CONFIG = {
  /* --- データソース (日々差し替えるJSON) --------------------------------- */
  DATA_SOURCE: "line_datamart.json",

  /* --- ブランド ---------------------------------------------------------- */
  brand: {
    title: "LINE Audience Intelligence",
    subtitle: "Friend & Attribution Analytics",
  },

  /* --- フィールド名マッピング -------------------------------------------- */
  fields: {
    id:        "user_id",
    name:      "display_name",
    addedAt:   "friend_added_at",
    blocked:   "blocked",
    gender:    "Q1_単一選択",
    birth:     "Q2_年月日入力",
    building:  "Q3_単一選択",
    area:      "Q4_単一選択",
    heardFrom: "Q5_複数選択",   // 認知経路（複数選択）→ Acquisition
    sentiment: "Q6_複数選択",   // まちへの愛着（複数選択）→ Engagement
    source:    "source",        // 流入経路（登録トリガー）→ Acquisition
    richmenu:  "richmenu",      // リッチメニュークリック → Engagement
  },

  /* --- 年代の並び順（20代→30代…の年代順で固定）------------------------- */
  ageOrder: ["〜19歳", "20代", "30代", "40代", "50代", "60代〜"],

  /* --- 所属ビル(Q3) 選択肢マスタ（stg_answer_option 準拠・全16件）-------- */
  buildingMaster: [
    "品川インターシティA棟",
    "品川インターシティB棟",
    "品川インターシティC棟",
    "品川イーストワンタワー",
    "太陽生命品川ビル",
    "品川グランドセントラルタワー",
    "NBF品川タワー",
    "キヤノンSタワー",
    "京王品川ビル",
    "品川シーズンテラス",
    "品川港南エリアビル",
    "品川高輪エリアビル",
    "北品川エリアビル",
    "天王洲エリアビル",
    "上記以外の東京都内ビル",
    "その他",
  ],

  /* --- 居住エリア(Q4) 選択肢マスタ（stg_answer_option 準拠・全17件）------ */
  areaMaster: [
    "東京都港区(徒歩圏)",
    "東京都港区(徒歩圏外)",
    "東京都品川区（徒歩圏）",
    "東京都品川区（徒歩圏外）",
    "東京都大田区・目黒区",
    "東京都千代田区・中央区",
    "東京都渋谷区・新宿区・豊島区・文京区",
    "東京都墨田区・台東区・葛飾区・江戸川区・江東区",
    "東京都世田谷区・中野区・杉並区・練馬区",
    "東京都荒川区・板橋区・足立区・北区",
    "東京都その他",
    "神奈川県横浜市",
    "神奈川県川崎市",
    "神奈川県その他",
    "千葉県",
    "埼玉県",
    "上記以外の都道府県",
  ],

  /* =====================================================================
   *  まちへの愛着（Q6）: 5段階（段0〜段4）判定
   *  --------------------------------------------------------------------
   *  Q6 は複数選択で、各選択肢にチェック = その段設問が「はい」。
   *  判定は上から順に評価（段4 → 段3 → 段2 → 段1 → 段0）。
   *    段4 一体層 : 4a または 4b が「はい」
   *    段3 定着層 : 3a または 3b が「はい」（段4に該当しない）
   *    段2 選択層 : 2a かつ 2b が「はい」（段3に該当しない）
   *    段1 気づき層: 段1が「はい」（段2に該当しない）
   *    段0 無関係層: 段1が「いいえ」
   *  ※ Q6 完全未回答は「未回答」として集計から除外（段0に混ぜない）。
   *  ※ 各配列の文字列は line_datamart.json の Q6 値と完全一致が必要。
   * ===================================================================== */
  sentimentTierMap: {
    q1:  ["好きだと思える場所が1つ以上ある"],
    q2a: ["何度も通いたい場所がある"],
    q2b: [
      "引っ越すとしても、次の住まいをこのエリアで探したい", // 居住者
      "仕事のない日にも、このまちで過ごしたいと思う",         // 就業者
      "近くに似た場所があっても、このまちに来ると思う",       // 来街者
    ],
    q3a: ["顔なじみのお店がある（店員と顔を覚え合っている）"],
    q3b: ["雰囲気が自分に合っていると感じる"],
    q4a: ["魅力を人に紹介したことがある"],
    q4b: ["悪く言われたら、自分のことのように残念に感じる"],
  },

  /* 段の表示順（グラフ上→下）。段0→段4 の昇順で並べる。 */
  sentimentTierOrder: [
    "段0 無関係層",
    "段1 気づき層",
    "段2 選択層",
    "段3 定着層",
    "段4 一体層",
  ],

  /* --- KPIタイル（2段 × 4 = 8指標）-------------------------------------- */
  kpis: [
    /* Row 1 */
    { key: "total",     label: "総友だち数",        caption: "選択期間の登録合計" },
    { key: "activeRate",label: "アクティブ率",      caption: "未ブロック割合", unit: "%" },
    { key: "blockRate", label: "ブロック率",        caption: "ブロック割合", unit: "%", accent: "gray" },
    { key: "answerRate",label: "回答率",            caption: "アンケート回答割合", unit: "%" },
    /* Row 2 */
    { key: "lastMonth", label: "最新月の増加数",    caption: "直近月の新規登録" },
    { key: "richUsers", label: "リッチメニュー利用者",caption: "1回以上クリック", accent: "rich" },
    { key: "srcUsers",  label: "流入経路 登録数",   caption: "経路が特定できた登録", accent: "acq" },
    { key: "avgAge",    label: "平均年代",          caption: "回答者ベース", unit: "歳", accent: "attr" },
  ],

  /* --- 折れ線グラフ設定 -------------------------------------------------- */
  timeseries: {
    headroom: 1.25,
    cumulative: false,
  },

  /* --- ドメイン① ユーザー属性（青） ------------------------------------- */
  attributeCharts: [
    { key: "gender",   title: "性別",       field: "gender",    multi: true },
    { key: "ageBand",  title: "年代",       field: "__ageBand", multi: false, orderRef: "ageOrder" },
    { key: "area",     title: "居住エリア", field: "area",      multi: false, limit: null, fillZero: true, masterRef: "areaMaster" },
    { key: "building", title: "所属ビル",   field: "building",  multi: false, limit: null, fillZero: true, masterRef: "buildingMaster" },
  ],

  /* --- ドメイン② 流入経路（緑）※属性とは別軸 --------------------------- */
  acquisitionCharts: [
    { key: "source",    title: "流入経路（登録トリガー）", field: "source",    multi: false, limit: null },
    { key: "heardFrom", title: "認知経路（Q5・複数回答）", field: "heardFrom", multi: true,  limit: null },
  ],

  /* --- ドメイン③ エンゲージメント（紫）※さらに別軸 ---------------------
   *  まちへの愛着(Q6) は 5段階（段0〜段4）に振り分けて表示（全段・0件も表示）
   * -------------------------------------------------------------------- */
  engagementCharts: [
    { key: "richmenu",      title: "リッチメニュー クリック",      field: "richmenu",       multi: true },
    { key: "sentimentTier", title: "まちへの愛着（5段階判定）",     field: "__sentimentTier", multi: false, orderRef: "sentimentTierOrder", fillZero: true },
  ],

  /* --- 棒グラフ表示上限（上位N件・横棒）--------------------------------- */
  topN: 10,

  /* --- 空値ラベル -------------------------------------------------------- */
  emptyLabel: "未回答 / 未取得",
};
