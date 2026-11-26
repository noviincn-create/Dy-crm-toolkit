/** Dashboard stylesheet, scoped to #dy-report. The font ("DY Vazir") is bundled with the extension (invoice/font.css), no web font is loaded. */
export const REPORT_CSS = `

    

    #dy-report,
    #dy-report * { box-sizing: border-box; }

    #dy-report {
        --bg: #f2f5fa;
        --card: #ffffff;
        --text: #17243a;
        --title: #173454;
        --muted: #718096;
        --border: #e3e9f1;
        --input-border: #dce4ef;
        --head: #f6f8fc;
        --hover: #f6faff;
        --track: #edf2f7;
        --primary: #1768a5;
        --bar1: #35a7dc;
        --bar2: #1766a5;
        --up: #17884f;
        --down: #c0392b;
        --error-bg: #fff0ef;
        --error-text: #a52c20;
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        direction: rtl;
        overflow: auto;
        background: var(--bg);
        color: var(--text);
        font-family: "DY Vazir", Vazirmatn, Tahoma, sans-serif;
        font-size: 13px;
    }

    #dy-report.dark {
        --bg: #0f1724;
        --card: #182233;
        --text: #dbe5f3;
        --title: #e8f0fb;
        --muted: #8fa0b8;
        --border: #263449;
        --input-border: #33445d;
        --head: #1d2a3f;
        --hover: #1e2c43;
        --track: #263449;
        --primary: #2f8fd8;
        --bar1: #4fc0ee;
        --bar2: #2b7fc7;
        --up: #4ac98a;
        --down: #ff7f6e;
        --error-bg: #3a1e1e;
        --error-text: #ffb4aa;
    }

    #dy-report .container {
        max-width: 1800px;
        margin: auto;
        padding: 22px;
    }

    #dy-report .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 15px;
        margin-bottom: 20px;
    }

    #dy-report h1 {
        font-size: 22px;
        font-weight: 800;
        margin: 0;
        color: var(--title);
    }

    #dy-report .subtitle {
        color: var(--muted);
        margin-top: 5px;
        font-size: 12px;
    }

    #dy-report .brand { display: flex; gap: 12px; align-items: center; }

    #dy-report .logo {
        width: 46px;
        height: 46px;
        background: linear-gradient(135deg,#102d56,#087fae);
        color: white;
        border-radius: 13px;
        display: grid;
        place-items: center;
        font-size: 23px;
        font-weight: 800;
    }

    #dy-report button,
    #dy-report input,
    #dy-report select { font-family: inherit; }

    #dy-report button { cursor: pointer; }

    #dy-report .actions { display: flex; gap: 8px; flex-wrap: wrap; }

    #dy-report .btn {
        background: var(--card);
        color: var(--text);
        border: 1px solid var(--input-border);
        padding: 9px 14px;
        border-radius: 9px;
        font-weight: 600;
    }

    #dy-report .btn:hover { border-color: var(--primary); }

    #dy-report .btn.primary {
        background: var(--primary);
        color: white;
        border-color: var(--primary);
    }

    #dy-report .filters {
        display: grid;
        grid-template-columns: repeat(7,minmax(120px,1fr));
        gap: 12px;
        background: var(--card);
        border: 1px solid var(--border);
        padding: 16px;
        border-radius: 14px;
        margin-bottom: 16px;
        align-items: end;
    }

    #dy-report label {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        color: var(--muted);
        font-weight: 700;
    }

    #dy-report .jhint {
        font-weight: 500;
        color: var(--primary);
        margin-right: 4px;
    }

    #dy-report input,
    #dy-report select {
        width: 100%;
        height: 38px;
        padding: 0 10px;
        border: 1px solid var(--input-border);
        border-radius: 8px;
        background: var(--card);
        color: var(--text);
    }

    #dy-report .kpis {
        display: grid;
        grid-template-columns: repeat(4,minmax(0,1fr));
        gap: 13px;
        margin-bottom: 16px;
    }

    #dy-report .kpi {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 17px;
        min-width: 0;
    }

    #dy-report .kpi-title { color: var(--muted); font-size: 12px; }

    #dy-report .kpi-value {
        font-size: 20px;
        font-weight: 800;
        margin-top: 10px;
        color: var(--title);
        overflow-wrap: anywhere;
    }

    #dy-report .kpi-sub,
    #dy-report .delta {
        margin-top: 8px;
        font-size: 11px;
        color: var(--muted);
    }

    #dy-report .delta.up { color: var(--up); font-weight: 700; }
    #dy-report .delta.down { color: var(--down); font-weight: 700; }

    #dy-report .panels {
        display: grid;
        grid-template-columns: 1.5fr 1fr 0.8fr;
        gap: 14px;
        margin-bottom: 16px;
    }

    #dy-report .panel,
    #dy-report .table-panel {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 16px;
        min-width: 0;
    }

    #dy-report .panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
    }

    #dy-report .panel-head select { width: auto; height: 30px; font-size: 11px; }

    #dy-report .panel-title {
        font-size: 14px;
        font-weight: 800;
        margin: 0;
        color: var(--title);
    }

    #dy-report .chart {
        display: flex;
        align-items: end;
        gap: 10px;
        min-height: 220px;
        overflow-x: auto;
        padding-top: 10px;
    }

    #dy-report .bar-column {
        flex: 1;
        min-width: 56px;
        height: 205px;
        display: flex;
        flex-direction: column;
        justify-content: end;
        align-items: center;
        gap: 7px;
    }

    #dy-report .bar {
        width: 28px;
        min-height: 3px;
        border-radius: 6px 6px 0 0;
        background: linear-gradient(180deg,var(--bar1),var(--bar2));
    }

    #dy-report .bar-label,
    #dy-report .bar-value {
        font-size: 10px;
        color: var(--muted);
        white-space: nowrap;
    }

    #dy-report .ranking { display: flex; flex-direction: column; gap: 13px; }

    #dy-report .rank-row {
        display: grid;
        grid-template-columns: 110px 1fr auto;
        gap: 9px;
        align-items: center;
    }

    #dy-report .rank-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
    }

    #dy-report .track {
        height: 9px;
        background: var(--track);
        border-radius: 20px;
        overflow: hidden;
    }

    #dy-report .track span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg,var(--bar1),var(--bar2));
        border-radius: 20px;
    }

    #dy-report .rank-value { font-size: 10px; white-space: nowrap; }

    #dy-report .donut-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
    }

    #dy-report .donut {
        width: 150px;
        height: 150px;
        border-radius: 50%;
        position: relative;
    }

    #dy-report .donut::after {
        content: "";
        position: absolute;
        inset: 32px;
        border-radius: 50%;
        background: var(--card);
    }

    #dy-report .legend { width: 100%; display: flex; flex-direction: column; gap: 7px; }

    #dy-report .legend-row {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 11px;
    }

    #dy-report .legend-row i {
        width: 10px;
        height: 10px;
        border-radius: 3px;
        flex: none;
    }

    #dy-report .legend-row span:nth-child(2) {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    #dy-report .table-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 14px;
    }

    #dy-report .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }

    #dy-report .tab {
        border: 1px solid var(--input-border);
        background: var(--card);
        color: var(--text);
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
    }

    #dy-report .tab.active {
        background: var(--primary);
        border-color: var(--primary);
        color: white;
    }

    #dy-report .table-tools { display: flex; gap: 8px; flex-wrap: wrap; }
    #dy-report .table-tools input { width: 240px; }
    #dy-report .table-tools select { width: auto; }

    #dy-report .table-wrap { overflow: auto; }

    #dy-report table {
        width: 100%;
        min-width: 1000px;
        border-collapse: collapse;
    }

    #dy-report th {
        background: var(--head);
        color: var(--muted);
        text-align: right;
        padding: 13px;
        font-size: 11px;
        white-space: nowrap;
        cursor: pointer;
    }

    #dy-report td {
        padding: 13px;
        border-top: 1px solid var(--border);
        font-size: 12px;
        white-space: nowrap;
    }

    #dy-report tbody tr { cursor: pointer; }
    #dy-report tbody tr:hover { background: var(--hover); }

    #dy-report .product-name { font-weight: 700; color: var(--title); }

    #dy-report .share-cell { display: flex; align-items: center; gap: 8px; min-width: 110px; }
    #dy-report .share-cell .track { flex: 1; }

    #dy-report a { color: var(--primary); text-decoration: none; }
    #dy-report a:hover { text-decoration: underline; }

    #dy-report .pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding-top: 14px;
        margin-top: 12px;
        border-top: 1px solid var(--border);
        flex-wrap: wrap;
    }

    #dy-report .pagination button {
        border: 1px solid var(--input-border);
        background: var(--card);
        color: var(--text);
        border-radius: 8px;
        padding: 7px 12px;
    }

    #dy-report .pagination button:disabled { opacity: .4; cursor: not-allowed; }

    #dy-report .status { margin-top: 12px; color: var(--muted); font-size: 11px; }

    #dy-report .error {
        background: var(--error-bg);
        color: var(--error-text);
        padding: 13px;
        margin-bottom: 13px;
        border-radius: 9px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    #dy-report .loading {
        position: fixed;
        inset: 0;
        z-index: 10;
        background: #10243b77;
        display: grid;
        place-items: center;
    }

    #dy-report .loading-card {
        background: var(--card);
        padding: 25px;
        border-radius: 14px;
        text-align: center;
        min-width: 250px;
    }

    #dy-report .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--track);
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: nvspin .8s linear infinite;
        margin: 0 auto 12px;
    }

    @keyframes nvspin { to { transform: rotate(360deg); } }

    #dy-report .empty { text-align: center; color: var(--muted); padding: 30px; }

    #dy-report .modal {
        position: fixed;
        inset: 0;
        z-index: 20;
        background: #10243b99;
        display: grid;
        place-items: center;
        padding: 20px;
    }

    #dy-report .modal-card {
        background: var(--card);
        border-radius: 16px;
        width: min(1100px, 100%);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        padding: 20px;
    }

    #dy-report .modal-head {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 12px;
        margin-bottom: 14px;
    }

    #dy-report .modal-body { overflow: auto; }
    #dy-report .modal-body table { min-width: 800px; }

    @media(max-width:1200px) {
        #dy-report .panels { grid-template-columns: 1fr 1fr; }
        #dy-report .panels .panel:first-child { grid-column: 1 / -1; }
    }

    @media(max-width:1000px) {
        #dy-report .filters { grid-template-columns: repeat(3,1fr); }
        #dy-report .kpis { grid-template-columns: repeat(2,1fr); }
        #dy-report .panels { grid-template-columns: 1fr; }
    }

    @media(max-width:650px) {
        #dy-report .container { padding: 10px; }
        #dy-report .filters { grid-template-columns: repeat(2,1fr); }
        #dy-report .kpi-value { font-size: 15px; }
    }

    @media print {
        #dy-report {
            position: static;
            overflow: visible;
            background: white;
        }
        #dy-report .filters,
        #dy-report .actions,
        #dy-report .table-tools,
        #dy-report .tabs,
        #dy-report .pagination,
        #dy-report .loading,
        #dy-report .modal { display: none !important; }
        #dy-report .container { padding: 0; }
    }
`;
