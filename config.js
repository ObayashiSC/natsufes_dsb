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
 *     limit     : 表示件数。省略=上位N / null=全件表示 / 数値=その件数
 *     fillZero  : true で 0件の選択肢も軸に表示
 *                  - order 指定時: order に列挙した 0件項目も表示
 *                  - order 無し時: 全期間に存在する選択肢を 0件補完
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

  /* --- まちへの愛着（Q6）の選択肢順（この順でグラフを並べる）----------- */
  sentimentOrder: [
    "好きだと思える場所が1つ以上ある",
    "何度も通いたい場所がある",
    "引っ越すとしても、次の住まいをこのエリアで探したい",
    "仕事のない日にも、このまちで過ごしたいと思う",
    "近くに似た場所があっても、このまちに来ると思う",
    "顔なじみのお店がある（店員と顔を覚え合っている）",
    "雰囲気が自分に合っていると感じる",
    "魅力を人に紹介したことがある",
    "悪く言われたら、自分のことのように残念に感じる",
    "上記に当てはまらない",
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
    headroom: 1.25,     // Y軸上限 = ピーク × この倍率 を「切りの良い数」に丸め
    cumulative: false,
  },

  /* --- ドメイン① ユーザー属性（青） -------------------------------------
   *  年代    : ageOrder の順で固定（20代→30代…）
   *  居住エリア: 上位N撤廃・全件・0件も表示
   *  所属ビル : 上位N撤廃・全件・0件も表示
   * -------------------------------------------------------------------- */
  attributeCharts: [
    { key: "gender",   title: "性別",       field: "gender",    multi: true },
    { key: "ageBand",  title: "年代",       field: "__ageBand", multi: false, orderRef: "ageOrder" },
    { key: "area",     title: "居住エリア", field: "area",      multi: false, limit: null, fillZero: true },
    { key: "building", title: "所属ビル",   field: "building",  multi: true,  limit: null, fillZero: true },
  ],

  /* --- ドメイン② 流入経路（緑）※属性とは別軸 ---------------------------
   *  流入経路・認知経路とも 上位N撤廃・全件表示
   * -------------------------------------------------------------------- */
  acquisitionCharts: [
    { key: "source",    title: "流入経路（登録トリガー）", field: "source",    multi: false, limit: null },
    { key: "heardFrom", title: "認知経路（Q5・複数回答）", field: "heardFrom", multi: true,  limit: null },
  ],

  /* --- ドメイン③ エンゲージメント（紫）※さらに別軸 ---------------------
   *  まちへの愛着(Q6): 選択肢順（sentimentOrder）で並べる・全件
   * -------------------------------------------------------------------- */
  engagementCharts: [
    { key: "richmenu",  title: "リッチメニュー クリック",  field: "richmenu",  multi: true },
    { key: "sentiment", title: "まちへの愛着（Q6・複数回答）", field: "sentiment", multi: true, orderRef: "sentimentOrder", limit: null },
  ],

  /* --- 棒グラフ表示上限（上位N件・横棒）--------------------------------- */
  topN: 10,

  /* --- 空値ラベル -------------------------------------------------------- */
  emptyLabel: "未回答 / 未取得",
};
