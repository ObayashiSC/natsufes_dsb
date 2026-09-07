/* =========================================================================
 *  shopdrop-period.js — ShopDrop 用「期間フィルター」左サイドバー配置
 *  ------------------------------------------------------------------------
 *  ShopDrop ダッシュボードには性別/年代などの絞り込みUIが無いため、
 *  期間フィルター（.slider-panel）だけをサイドバー内（Analytics の下・
 *  Data source の上）へ物理移動する自己完結モジュール。
 *
 *  ・ノードごと移動するので noUiSlider の実体や dashboard-core.js の
 *    イベントはそのまま生きる（日付フィルターの挙動は不変）。
 *  ・スタイルは filters.css の .side-filter / .gf-period-panel を再利用。
 * ======================================================================= */
(function () {
  "use strict";

  function inject() {
    if (document.getElementById("sdPeriodBar")) return true;

    var sidebar = document.querySelector(".sidebar");
    var slider  = document.querySelector(".slider-panel");
    if (!sidebar || !slider) return false;

    // サイドバー内パネル（LINE版の .side-filter と同じ見た目）
    var bar = document.createElement("section");
    bar.className = "side-filter";
    bar.id = "sdPeriodBar";
    bar.innerHTML =
      '<div class="gf-head"><span class="gf-title">🗓 期間フィルター</span></div>' +
      '<div class="gf-period" id="sdPeriod"></div>';

    var foot = sidebar.querySelector(".side-foot");
    if (foot) sidebar.insertBefore(bar, foot);
    else sidebar.appendChild(bar);

    // 期間フィルター本体を移動
    var host = document.getElementById("sdPeriod");
    if (host && slider.parentNode !== host) {
      slider.classList.add("gf-period-panel");
      // 本文側に元からある「🗓 期間フィルター」ラベルは重複するので隠す
      var innerTitle = slider.querySelector(".s-title");
      if (innerTitle) innerTitle.style.display = "none";
      host.appendChild(slider);
    }
    return true;
  }

  function boot() {
    if (inject()) return;
    // noUiSlider 生成（dashboard-core.js の boot）を待って再試行
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (inject() || tries > 100) clearInterval(timer);
    }, 120);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
