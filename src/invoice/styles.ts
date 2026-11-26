/** Print-only stylesheet of the standard sales invoice (A4 landscape). Scoped under #dy-inv-root; hidden on screen. */

/** Page setup: bottom margin leaves room for the print footer (@page margin boxes of footer/css.ts). */
export const INVOICE_PAGE_CSS = "@page{size:A4 landscape;margin:7mm 8mm 13mm}";

const YEKAN = '"DY Yekan","DY Yekan Emb","DY Vazir",Tahoma,sans-serif';
const TITR = '"DY Titr","DY Titr Emb","DY Yekan","DY Yekan Emb","DY Vazir",Tahoma,sans-serif';

export const INVOICE_CSS = `
    @media screen{#dy-inv-root{display:none!important}}
    #dy-inv-root{--bd:#000;--g:#555;--tt:${TITR};
      font:9.5pt/1.5 ${YEKAN};font-weight:400;color:#000;direction:rtl;text-align:right;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
    #dy-inv-root *{box-sizing:border-box;font-weight:400}
    #dy-inv-root .inv{width:100%}
    #dy-inv-root .l,#dy-inv-root .band,#dy-inv-root h1,#dy-inv-root th,#dy-inv-root .tl,#dy-inv-root .tt,#dy-inv-root .sign{font-family:var(--tt);font-weight:700}

    #dy-inv-root .hd{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:0 0 2.2mm}
    #dy-inv-root h1{margin:0;font-size:17pt;line-height:1.3;text-align:center;white-space:nowrap}
    #dy-inv-root .meta{justify-self:end;display:grid;gap:1.4mm}
    #dy-inv-root .m{display:flex;align-items:center;gap:2.5mm}
    #dy-inv-root .m .l{font-size:9pt;min-width:21mm;text-align:left}
    #dy-inv-root .m i{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11pt;width:44mm;height:7.2mm;border:.3mm solid var(--bd);padding:0 2mm;direction:rtl;white-space:nowrap}

    #dy-inv-root .band{margin-top:1.4mm;height:5.6mm;display:flex;align-items:center;justify-content:center;border:.3mm solid var(--bd);border-radius:1.6mm;font-size:9.5pt;break-after:avoid}
    #dy-inv-root .pbox{margin-top:.8mm;border:.3mm solid var(--bd);border-radius:1.6mm;padding:1.2mm 3mm;display:grid;
      grid-template-columns:1.25fr .9fr 1.15fr 1.1fr;gap:.7mm 4mm;break-inside:avoid}
    #dy-inv-root .f{display:flex;gap:1.6mm;align-items:baseline;min-height:5.6mm;min-width:0}
    #dy-inv-root .f .l{font-size:8.6pt;white-space:nowrap}
    #dy-inv-root .f .v{flex:1;min-width:0;padding:0 1mm;font-size:9.5pt;border-bottom:.2mm dotted var(--g);overflow-wrap:anywhere}
    #dy-inv-root .f.name{grid-column:1/3}
    #dy-inv-root .f.addr{grid-column:1/4}

    #dy-inv-root table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:.8mm;border:.45mm solid var(--bd)}
    #dy-inv-root thead{display:table-header-group}
    #dy-inv-root tfoot{display:table-row-group}
    #dy-inv-root th,#dy-inv-root td{border:.25mm solid var(--bd);text-align:center;vertical-align:middle;padding:0 1mm}
    #dy-inv-root th:not(:first-child),#dy-inv-root td:not(:first-child){border-right-width:.25mm}
    #dy-inv-root tr.nums th{height:4.8mm;font-size:8.5pt;border-bottom:.25mm solid var(--bd);padding:0}
    #dy-inv-root tr.ttl th{height:11.5mm;font-size:8.4pt;line-height:1.45;border-bottom:.45mm solid var(--bd)}
    #dy-inv-root tbody td{height:6.3mm;font-size:9.3pt;line-height:1.35;padding:.4mm 1mm;border-color:var(--g)}
    #dy-inv-root tbody tr{break-inside:avoid}
    #dy-inv-root td.desc{text-align:right;padding-inline:1.6mm}
    #dy-inv-root td.desc small{display:block;font-size:7.6pt;color:var(--g);line-height:1.3}
    #dy-inv-root tfoot td{height:7.4mm;font-size:10pt;border-color:var(--bd)}
    #dy-inv-root tfoot tr:first-child td{border-top:.45mm solid var(--bd)}
    #dy-inv-root td.tl{font-size:10pt}
    #dy-inv-root tr.pay td.tl{text-align:right;padding-inline:3mm}
    #dy-inv-root tr{break-inside:avoid}

    #dy-inv-root .foot{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:1.4mm;break-inside:avoid}
    #dy-inv-root .box{border:.3mm solid var(--bd);border-radius:1.6mm}
    #dy-inv-root .fr{display:grid;gap:1mm;align-content:start}
    #dy-inv-root .terms,#dy-inv-root .notes{display:flex;align-items:center;gap:6mm;height:6.8mm;padding:0 3mm;font-size:9.5pt}
    #dy-inv-root .tt{font-size:10pt}
    #dy-inv-root .ck{display:inline-flex;align-items:center;gap:2mm}
    #dy-inv-root .ck u{display:inline-block;width:4.6mm;height:4.6mm;border:.3mm solid var(--bd);text-decoration:none}
    #dy-inv-root .dots{flex:1;border-bottom:.35mm dotted var(--g);height:3mm}
    #dy-inv-root .sign{height:15mm;padding:2mm 3mm;font-size:9.5pt;font-weight:700}

    @media print{
      html.dy-inv-on,html.dy-inv-on body{height:auto!important;min-height:0!important;overflow:visible!important;position:static!important;
        margin:0!important;padding:0!important;background:#fff!important}
      html.dy-inv-on body>*:not(#dy-inv-root){display:none!important}
      html.dy-inv-on #dy-inv-root{display:block!important;position:static!important}
    }`;
