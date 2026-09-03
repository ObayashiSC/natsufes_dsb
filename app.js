/* =========================================================================
 *  app.js — LINE Growth Tracker（ページ固有ロジック）
 *  ------------------------------------------------------------------------
 *  共通処理は dashboard-core.js（window.DashCore）に集約済み。
 *  このファイルは LINE 版だけの描画（KPI 2段8指標 / 属性・流入・行動の
 *  3ドメイン横棒グラフ / 折れ線）と、年齢計算・愛着段判定などの
 *  固有ロジックのみを持つ。
 *
 *  カラー: 属性=青 / 流入=緑 / エンゲージメント=紫 / その他=グレー
 * ========================================================================= */
(function () {
  "use strict";
  const D = window.DashCore;
  const { CFG, F, C } = D;

  /* ---- ドメイン別パレット（config の accent と対応）---- */
  const PALETTE = {
    attr: ["#3b82f6", "#60a5fa", "#2563eb", "#1d4ed8", "#93c5fd", "#38bdf8", "#0ea5e9", "#1e40af"],
    acq:  ["#22c55e", "#2fbf71", "#16a34a", "#3ddc84", "#0e9f6e", "#65d6a0", "#0b7d54", "#4ade80"],
    rich: ["#a855f7", "#c084fc", "#9333ea", "#7c3aed", "#d8b4fe", "#8b5cf6", "#6d28d9", "#e9d5ff"],
  };

  /* ========================= 固有: 年齢計算 ========================= */
  function calculateAge(birth) {
    if (!birth) return null;
    const bd = D.toDate(birth);
    if (!bd || isNaN(bd) || bd.getFullYear() < 1900) return null;
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    if (today < new Date(today.getFullYear(), bd.getMonth(), bd.getDate())) age--;
    if (age <= 0 || age > 120) return null;
    return age;
  }
  function ageBand(birth) {
    const age = calculateAge(birth);
    if (age === null) return "";
    if (age < 20) return "〜19歳";
    if (age < 30) return "20代";
    if (age < 40) return "30代";
    if (age < 50) return "40代";
    if (age < 60) return "50代";
    return "60代〜";
  }

  /* ========================= 固有: まちへの愛着 5段階判定 ==========
   *  Q6（複数選択）を段0〜段4に振り分ける。
   *  判定は「上から順」に評価（段4→段3→段2→段1→段0）。
   *  Q6 完全未回答は "" を返し、集計から除外する（段0に混ぜない）。
   * ================================================================ */
  function sentimentTier(record) {
    const M = CFG.sentimentTierMap;
    const toks = new Set(D.tokens(record[F.sentiment], true)); // カンマ分割
    if (toks.size === 0) return "";                            // 未回答 → 除外
    const yes = (arr) => arr.some((t) => toks.has(t));         // 1つでも該当=はい
    const q1  = yes(M.q1);
    const q2a = yes(M.q2a);
    const q2b = yes(M.q2b);
    const q3a = yes(M.q3a);
    const q3b = yes(M.q3b);
    const q4a = yes(M.q4a);
    const q4b = yes(M.q4b);
    if (q4a || q4b) return "段4 一体層";
    if (q3a || q3b) return "段3 定着層";
    if (q2a && q2b) return "段2 選択層";
    if (q1)         return "段1 気づき層";
    return "段0 無関係層";
  }

  /* ---- 仮想フィールド解決（コアの countBy から呼ばれる）---- */
  function resolveValue(record, field) {
    if (field === "__ageBand")       return ageBand(record[F.birth]);
    if (field === "__sentimentTier") return sentimentTier(record);
    return record[field];
  }

  /* ========================= ページ描画 ========================= */
  function render(rows) {
    D.safe("KPI",       () => renderKPIs(rows));
    D.safe("折れ線",     () => renderTimeseries());
    D.safe("属性チャート", () => renderCharts(rows, CFG.attributeCharts,   "#attrGrid", PALETTE.attr, "属性"));
    D.safe("流入チャート", () => renderCharts(rows, CFG.acquisitionCharts, "#acqGrid",  PALETTE.acq,  "流入"));
    D.safe("行動チャート", () => renderCharts(rows, CFG.engagementCharts,  "#engGrid",  PALETTE.rich, "行動"));
    D.safe("メタ更新",    () => updateMeta(rows));
  }

  /* ---- KPI (2段8指標) ---- */
  function renderKPIs(rows) {
    const total    = rows.length;
    const blocked  = rows.filter((r) => String(r[F.blocked]) === "1").length;
    const active   = total - blocked;
    const answered = rows.filter((r) => D.tokens(r[F.gender]).length || D.tokens(r[F.area]).length).length;
    const richU    = rows.filter((r) => D.tokens(r[F.richmenu], true).length).length;
    const srcU     = rows.filter((r) => D.tokens(r[F.source], false).length).length;
    const byMonth = {};
    rows.forEach((r) => { const m = (r[F.addedAt] || "").slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + 1; });
    const months = Object.keys(byMonth).sort();
    const lastMonth = months.length ? byMonth[months[months.length - 1]] : 0;
    const ages = rows.map((r) => calculateAge(r[F.birth])).filter((a) => a !== null);
    const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    const vals = {
      total, activeRate: pct(active), blockRate: pct(blocked), answerRate: pct(answered),
      lastMonth, richUsers: richU, srcUsers: srcU, avgAge,
    };
    const html = CFG.kpis.map((k) => {
      const accent = k.accent || "";
      const v = vals[k.key] ?? 0;
      const unit = k.unit ? `<span class="u">${k.unit}</span>` : "";
      return `
        <div class="kpi ${accent}">
          <div class="k-label">${k.label}</div>
          <div class="k-val">${v.toLocaleString()}${unit}</div>
          <div class="k-cap">${k.caption}</div>
        </div>`;
    });
    D.setHTML("#kpisRow1", html.slice(0, 4).join(""));
    D.setHTML("#kpisRow2", html.slice(4).join(""));
  }

  /* ---- 折れ線: 日毎の登録者数（Y軸上限 動的）---- */
  function renderTimeseries() {
    const { days, series } = D.seriesForRange(D.state.from, D.state.to);
    const peak = Math.max(1, ...series);
    const dynMax = D.niceCeil(Math.ceil(peak * CFG.timeseries.headroom));
    D.setText("#lineMeta", `ピーク ${peak}名 / 上限 ${dynMax}（自動）`);
    D.drawLine(days, series, dynMax, "148,163,184"); // グレー
  }

  /* ---- ドメイン別 横棒グラフ群 ----
   *  グラフ定義(c)のプロパティで挙動を切り替える:
   *    orderRef  : CFG 内の並び順配列名（軸を固定）
   *    masterRef : CFG 内マスタ名。0件の選択肢も表示（件数順は維持）
   *    fillZero  : 0件も表示（order 指定時は order の 0件も表示）
   *    limit     : null=全件 / 数値=件数上限 / 省略=上位N
   * -------------------------------------------------------------------- */
  function renderCharts(rows, list, hostSel, palette, tag) {
    const host = D.$(hostSel);
    if (!host) { console.warn(`[dashboard] ${hostSel} が見つかりません`); return; }
    host.innerHTML = "";
    list.forEach((c, i) => {
      const canvasId = `${hostSel.slice(1)}_${c.key}`;
      const field = D.realField(c.field);
      const split = c.multi || c.key === "gender";

      const opts = { includeEmpty: false, splitComma: split };
      if (c.orderRef && CFG[c.orderRef]) opts.order = CFG[c.orderRef];
      if (c.order) opts.order = c.order;
      if (c.fillZero) {
        opts.fillZero = true;
        if (!opts.order) {
          opts.globalCategories = (c.masterRef && CFG[c.masterRef])
            ? CFG[c.masterRef]
            : D.globalCategoriesFor(field, split);
        }
      }
      if (c.limit !== undefined) opts.limit = c.limit;

      const agg = D.countBy(rows, field, opts);
      if (!agg.labels.length) {
        host.insertAdjacentHTML("beforeend", D.panelEmpty(c.title, tag));
        return;
      }

      const showAll = !!(opts.order || c.fillZero || c.limit === null);
      const sub = showAll ? `${tag} · 全${agg.labels.length}項目` : `${tag} · 上位${CFG.topN}`;

      host.insertAdjacentHTML("beforeend", D.panelCanvas(c.title, canvasId, sub, agg.labels.length));
      D.drawBarH(canvasId, agg, palette, i);
    });
  }

  /* ---- meta 更新 ---- */
  function updateMeta(rows) {
    const richTotal = rows.reduce((s, r) => s + D.tokens(r[F.richmenu], true).length, 0);
    D.setText("#richMeta", `のべ ${richTotal} クリック`);
    D.setText("#attrMeta", `対象 ${rows.length}名`);
    D.setText("#acqMeta",  `対象 ${rows.length}名`);
  }

  /* ========================= 起動 ========================= */
  D.start({ render, resolveValue });
})();
