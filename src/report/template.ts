import { DIMS } from "./dims";

/** Static markup of the dashboard (ids are prefixed rp-). */
export const reportHtml = (): string => {
    const tabs = Object.entries(DIMS)
        .map(([key, d]) => `<button class="tab" data-dim="${key}">بر اساس ${d.label}</button>`)
        .join("");
    return `
    
    <div class="container">

        <header class="header">

            <div class="brand">
                <div class="logo">N</div>
                <div>
                    <h1>داشبورد هوشمند فروش نوین</h1>
                    <div class="subtitle">Dynamics 365 · Opportunity Analytics · DY CRM Toolkit ${__VERSION__}</div>
                </div>
            </div>

            <div class="actions">
                <button class="btn" id="rp-theme">حالت تیره</button>
                <button class="btn" id="rp-print">چاپ گزارش</button>
                <button class="btn" id="rp-csv">خروجی CSV</button>
                <button class="btn" id="rp-export">خروجی Excel</button>
                <button class="btn primary" id="rp-refresh">بروزرسانی</button>
                <button class="btn" id="rp-close">بستن</button>
            </div>

        </header>


        <section class="filters">

            <div>
                <label>از تاریخ <span class="jhint" id="rp-start-j"></span></label>
                <input type="date" id="rp-start">
            </div>

            <div>
                <label>تا تاریخ <span class="jhint" id="rp-end-j"></span></label>
                <input type="date" id="rp-end">
            </div>

            <div>
                <label>بازه زمانی</label>
                <select id="rp-period">
                    <option value="thisMonth">ماه جاری (شمسی)</option>
                    <option value="today">امروز</option>
                    <option value="last30">۳۰ روز اخیر</option>
                    <option value="lastMonth">ماه قبل</option>
                    <option value="thisYear">سال جاری (شمسی)</option>
                    <option value="lastYear">سال قبل</option>
                    <option value="all">تمام دوره‌ها</option>
                    <option value="custom">دلخواه</option>
                </select>
            </div>

            <div>
                <label>مبنای تاریخ</label>
                <select id="rp-basis">
                    <option value="close">تاریخ بسته‌شدن فرصت</option>
                    <option value="created">تاریخ ایجاد فرصت</option>
                </select>
            </div>

            <div>
                <label>واحد نمایش</label>
                <select id="rp-currency">
                    <option value="ریال">ریال</option>
                    <option value="تومان">تومان</option>
                </select>
            </div>

            <div>
                <label>بروزرسانی خودکار</label>
                <select id="rp-auto">
                    <option value="0">خاموش</option>
                    <option value="5">هر ۵ دقیقه</option>
                    <option value="15">هر ۱۵ دقیقه</option>
                    <option value="30">هر ۳۰ دقیقه</option>
                </select>
            </div>

            <div>
                <button class="btn primary" id="rp-apply" style="width:100%;height:38px">
                    اعمال فیلتر
                </button>
            </div>

        </section>


        <div id="rp-error"></div>

        <section class="kpis" id="rp-kpis"></section>


        <section class="panels">

            <div class="panel">
                <div class="panel-head">
                    <h2 class="panel-title">نمودار روند فروش</h2>
                    <div style="display:flex;gap:6px">
                        <select id="rp-trend-metric">
                            <option value="revenue">مبلغ فروش</option>
                            <option value="quantity">تعداد</option>
                            <option value="opps">تعداد فرصت</option>
                        </select>
                        <select id="rp-trend-mode">
                            <option value="month">ماهانه</option>
                            <option value="day">روزانه</option>
                        </select>
                    </div>
                </div>
                <div class="chart" id="rp-trend"></div>
            </div>

            <div class="panel">
                <div class="panel-head">
                    <h2 class="panel-title" id="rp-rank-title">ده برتر</h2>
                </div>
                <div class="ranking" id="rp-ranking"></div>
            </div>

            <div class="panel">
                <div class="panel-head">
                    <h2 class="panel-title">سهم از فروش</h2>
                </div>
                <div class="donut-wrap" id="rp-donut"></div>
            </div>

        </section>


        <section class="table-panel">

            <div class="table-head">

                <div>
                    <h2 class="panel-title">گزارش تجمیعی فروش</h2>
                    <div class="subtitle">برای مشاهده جزئیات روی هر ردیف کلیک کنید</div>
                    <div class="tabs" id="rp-tabs">
                        ${tabs}
                    </div>
                </div>

                <div class="table-tools">
                    <input type="search" id="rp-search" placeholder="جست‌وجو...">
                    <select id="rp-page-size">
                        <option value="20">۲۰ ردیف</option>
                        <option value="50">۵۰ ردیف</option>
                        <option value="100">۱۰۰ ردیف</option>
                        <option value="all">همه</option>
                    </select>
                </div>

            </div>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th data-sort="name" id="rp-th-name">نام ↕</th>
                            <th data-sort="oppCount">تعداد فرصت ↕</th>
                            <th data-sort="quantity">تعداد ↕</th>
                            <th data-sort="unitPrice">میانگین قیمت واحد ↕</th>
                            <th data-sort="base">مبلغ پایه ↕</th>
                            <th data-sort="discount">تخفیف ↕</th>
                            <th data-sort="discountPct">درصد تخفیف ↕</th>
                            <th data-sort="revenue">مبلغ نهایی ↕</th>
                            <th data-sort="share">سهم ↕</th>
                        </tr>
                    </thead>
                    <tbody id="rp-tbody">
                        <tr><td colspan="9" class="empty">در حال آماده‌سازی</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="pagination">
                <span id="rp-table-info">بدون داده</span>
                <div>
                    <button id="rp-prev">قبلی</button>
                    <span id="rp-page-label">صفحه ۱</span>
                    <button id="rp-next">بعدی</button>
                </div>
            </div>

        </section>

        <div class="status" id="rp-status">آماده اتصال به Dynamics 365</div>

    </div>


    <div class="loading" id="rp-loading" style="display:none">
        <div class="loading-card">
            <div class="spinner"></div>
            <strong id="rp-loading-title">در حال دریافت اطلاعات</strong>
            <div class="subtitle" id="rp-loading-detail">لطفاً منتظر بمانید</div>
        </div>
    </div>

    <div class="modal" id="rp-modal" style="display:none"></div>

`;
};
