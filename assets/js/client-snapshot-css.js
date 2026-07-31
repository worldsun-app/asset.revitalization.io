/* ==========================================================================
   client-snapshot-css.js
   「匯出客戶快照 HTML」產生的是一個單檔、可離線開啟、可轉寄的 HTML，
   所以它不能 <link> 本專案的 CSS —— 樣式必須內嵌。這裡把那份樣式集中成
   一個常數，維護時只改這一個地方（而不是散在 app.js 的字串裡）。

   版型策略與主程式一致：mobile-first、流體級距、漏斗圖寬窄雙版由 CSS 切換。
   ========================================================================== */

window.CLIENT_SNAPSHOT_CSS = `
:root{
  --ink:#222a36;--ink-soft:#7e8694;--paper:#eef0f2;--paper-2:#fbfbfc;--paper-3:#fbf8f2;
  --line:#dde0e4;--line-strong:#c7ccd3;--maroon:#2e3a4d;--maroon-deep:#252f3f;
  --maroon-soft:#5a6577;--gold:#b08833;--green:#3f7a57;--red:#b3473c;
  --font-sans:'Libre Franklin','Noto Sans TC',system-ui,sans-serif;
  --font-serif:'Source Serif 4','Noto Serif TC',Georgia,serif;
  --fs-2xs:clamp(0.75rem,0.725rem + 0.125vw,0.8125rem);
  --fs-xs:clamp(0.8125rem,0.7875rem + 0.125vw,0.875rem);
  --fs-sm:clamp(0.875rem,0.8375rem + 0.1875vw,0.96875rem);
  --fs-md:clamp(1rem,0.9625rem + 0.1875vw,1.09375rem);
  --fs-lg:clamp(1.125rem,1.0625rem + 0.3125vw,1.28125rem);
  --fs-xl:clamp(1.1875rem,1.0875rem + 0.5vw,1.4375rem);
  --fs-2xl:clamp(1.5rem,1.35rem + 0.75vw,2.03125rem);
  --fs-num:clamp(1.375rem,1.2375rem + 0.6875vw,1.5625rem);
  --fs-num-md:clamp(1.625rem,1.4375rem + 0.9375vw,2.09375rem);
  --sp-page-x:clamp(0.875rem,0.675rem + 1vw,1.25rem);
  --sp-panel-x:clamp(1rem,0.6rem + 2vw,2rem);
  --gap:clamp(0.75rem,0.6rem + 0.75vw,1.125rem);
  --gap-lg:clamp(1rem,0.7rem + 1.5vw,1.75rem);
  --r:11px;--r-md:14px;--r-lg:16px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;overflow-x:hidden}
body{
  font-family:var(--font-sans);font-size:var(--fs-md);line-height:1.55;color:var(--ink);
  background:radial-gradient(120% 80% at 100% 0%,rgba(176,136,51,.09),transparent 60%),
             radial-gradient(100% 70% at 0% 100%,rgba(46,58,77,.08),transparent 55%),var(--paper);
  background-attachment:fixed;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;
  padding:clamp(1.25rem,1rem + 1.5vw,2rem) max(var(--sp-page-x),env(safe-area-inset-right))
          calc(3rem + env(safe-area-inset-bottom)) max(var(--sp-page-x),env(safe-area-inset-left));
  min-height:100vh;
}
h1,h2{font-family:var(--font-serif);line-height:1.15;overflow-wrap:break-word}
svg{max-width:100%;height:auto}
.wrap{max-width:53.75rem;margin-inline:auto}

.print-btn{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:var(--gap-lg)}
.print-btn button{
  font-family:inherit;font-size:var(--fs-sm);font-weight:500;padding:11px 18px;
  border-radius:9px;cursor:pointer;border:1.5px solid var(--maroon);
  background:var(--maroon);color:#fff;transition:.15s;min-height:44px
}
.print-btn button:hover{background:var(--maroon-deep)}
@media(min-width:36rem){.print-btn{display:flex;justify-content:flex-end}}

.snap-head{
  position:relative;overflow:hidden;background:linear-gradient(135deg,#fbfbfc,#e6e9ed);
  color:var(--ink);border:1px solid var(--line);border-top:2px solid var(--maroon);
  border-radius:var(--r-lg);padding:var(--gap-lg) var(--sp-panel-x);margin-bottom:var(--gap-lg)
}
.snap-head::after{
  content:"";position:absolute;right:-50px;top:-50px;width:190px;height:190px;
  border:1px solid rgba(46,58,77,.18);border-radius:50%
}
.snap-head h1{font-weight:700;font-size:var(--fs-2xl)}
.snap-head .sub{font-size:var(--fs-sm);color:var(--ink-soft);margin-top:7px}
.snap-head .tag{
  position:static;margin-top:var(--gap);padding-top:12px;
  border-top:1px dashed var(--line-strong);font-size:var(--fs-xs);
  line-height:1.7;color:var(--ink-soft)
}
.snap-head .tag b{color:var(--maroon);font-weight:700}
@media(min-width:48rem),print{
  .snap-head{padding-right:13rem}
  .snap-head .tag{
    position:absolute;right:var(--sp-panel-x);bottom:var(--gap);
    margin:0;padding:0;border:none;text-align:right
  }
}

.snap-sec{margin-bottom:var(--gap-lg)}
.snap-sectitle{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 11px;margin-bottom:5px}
.snap-sectitle .n{font-family:var(--font-serif);font-size:var(--fs-2xl);font-weight:700;line-height:1;color:var(--maroon-soft)}
.snap-sectitle h2{font-weight:700;font-size:var(--fs-xl)}
.snap-sectitle .en{font-family:var(--font-serif);font-size:var(--fs-xs);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-soft)}
@media(min-width:48rem),print{.snap-sectitle .en{margin-left:auto}}
.snap-rule{height:2px;background:linear-gradient(90deg,var(--maroon),transparent);border-radius:2px;margin:7px 0 var(--gap)}

.funnel-wrap{background:var(--paper-3);border:1px solid var(--line);border-radius:var(--r-md);padding:var(--gap) 10px 6px}
.funnel-svg{display:block;width:100%;height:auto}
.funnel--wide{display:none}
.funnel--narrow{display:block}
@media(min-width:48rem),print{.funnel--wide{display:block}.funnel--narrow{display:none}}
.fcaption{text-align:center;font-size:var(--fs-sm);line-height:1.6;color:var(--ink-soft);margin:6px 0 12px}
.funnel-notes{list-style:none;display:flex;flex-direction:column;gap:10px;margin:var(--gap) 0 4px}
.funnel-notes li{position:relative;display:flex;flex-direction:column;gap:2px;padding-left:18px;font-size:var(--fs-xs);line-height:1.55;color:var(--ink-soft)}
.funnel-notes li i{position:absolute;left:0;top:.45em;width:9px;height:9px;border-radius:2px}
.funnel-notes li b{font-size:var(--fs-sm);font-weight:700;color:var(--ink)}
.funnel-notes .fn-yield{color:var(--green);font-weight:600}

.snap-chips{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr));
  gap:1px;background:var(--line);border:1px solid var(--line-strong);
  border-radius:var(--r);overflow:hidden;margin-top:var(--gap)
}
.snap-chips>div{background:var(--paper-3);padding:13px 14px;text-align:center;min-width:0}
.snap-chips .l{font-size:var(--fs-xs);color:var(--ink-soft);margin-bottom:5px}
.snap-chips .v{font-family:var(--font-serif);font-weight:700;font-size:var(--fs-num);line-height:1.1;overflow-wrap:anywhere}
.snap-chips .v.m{color:var(--maroon)}.snap-chips .v.g{color:var(--gold)}
.snap-chips .v.gr{color:var(--green)}.snap-chips .v.r{color:var(--red)}

.pnl-grid{display:grid;grid-template-columns:1fr;gap:var(--gap-lg);align-items:start}
@media(min-width:56.25rem),print{.pnl-grid{grid-template-columns:1.4fr 1fr}}

.ledger{background:var(--paper-3);border:1px solid var(--line);border-radius:var(--r-md);overflow-x:auto}
.ledger table{width:100%;min-width:17.5rem;border-collapse:collapse;font-size:var(--fs-md)}
.ledger th{
  text-align:left;font-weight:500;font-size:var(--fs-2xs);letter-spacing:.07em;
  text-transform:uppercase;color:var(--maroon);padding:11px var(--gap) 7px;
  border-bottom:1.5px solid var(--line-strong)
}
.ledger th.num,.ledger td.num{text-align:right}
.ledger td{padding:7px var(--gap);border-bottom:1px solid var(--line)}
.ledger .grp td{background:rgba(176,136,51,.10);font-weight:600;font-size:var(--fs-xs);color:var(--maroon)}
.ledger .inc td.num{color:var(--green);font-weight:600}
.ledger .cost td.num{color:var(--red);font-weight:600}
.ledger .sub td{font-weight:700;border-top:1.5px solid var(--line-strong)}
.ledger .sub td.num{font-family:var(--font-serif)}
.ledger .net td{background:var(--maroon);color:#fff;font-weight:700;font-size:var(--fs-md)}
.ledger .net td.num{font-family:var(--font-serif);font-size:var(--fs-lg);color:#fff}
.ledger .meta{font-size:var(--fs-xs);color:var(--ink-soft)}

.snap-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:13px}
@media(min-width:56.25rem),print{.snap-stats{grid-template-columns:1fr}}
.snap-stat{position:relative;overflow:hidden;background:var(--paper-3);border:1px solid var(--line);border-radius:var(--r-md);padding:15px 17px;min-width:0}
.snap-stat::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px}
.snap-stat.s1::before{background:var(--maroon)}
.snap-stat.s2::before{background:var(--gold)}
.snap-stat.s3::before{background:var(--green)}
.snap-stat .l{font-size:var(--fs-xs);color:var(--ink-soft);margin-bottom:5px}
.snap-stat .v{font-family:var(--font-serif);font-weight:900;font-size:var(--fs-num-md);line-height:1.05;overflow-wrap:anywhere}
.snap-stat.s1 .v{color:var(--maroon)}.snap-stat.s2 .v{color:var(--gold)}.snap-stat.s3 .v{color:var(--green)}
.snap-stat .v .u{font-size:var(--fs-md);font-weight:600;color:var(--ink-soft)}
.snap-stat .s{font-size:var(--fs-xs);color:var(--ink-soft);margin-top:5px}

.snap-foot{margin-top:8px;padding-top:var(--gap);border-top:1px dashed var(--line);font-size:var(--fs-xs);line-height:1.7;color:var(--ink-soft)}
.snap-foot b{color:var(--maroon)}
footer{
  margin-top:var(--gap-lg);text-align:center;font-size:var(--fs-xs);letter-spacing:.04em;
  color:var(--ink-soft);border-top:1px solid var(--line);padding-top:var(--gap)
}

@media print{
  @page{margin:12mm}
  html{overflow-x:visible}
  body{background:#fff;padding:0;font-size:11pt}
  .print-btn{display:none!important}
  .snap-sec,.snap-head,.funnel-wrap,.ledger,.snap-stat{break-inside:avoid}
  .snap-sectitle{break-after:avoid}
  .ledger{overflow:visible!important}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important}
}
`;
