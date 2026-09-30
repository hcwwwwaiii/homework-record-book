# 功課記錄簿

三個班別的功課、學生、每日收交紀錄和警示。網站託管在 GitHub Pages；登入、共用資料庫 API 和私人功課樣本由 Supabase 提供。

## 資料結構

homework_classes、homework_students、homework_assignments、homework_daily_records 和 homework_warning_actions 分別保存資料。每筆資料均屬於一個教師帳戶，關聯與每日紀錄唯一性由資料庫檢查。

網站呼叫 homework_load 和 homework_apply_patch API。後者以版本號檢查並在單一資料庫交易中寫入變更；不同裝置修改同一紀錄時，網站會要求老師選擇保留版本。資料表只准帳戶本人讀取，寫入必須經過 API。私人樣本檔亦限對應功課的帳戶存取。

## 現有網站升級

1. 在 Supabase SQL Editor 執行 supabase-migration-01.sql。它會保留舊快照、建立私人備份並搬移資料；要求資料庫中恰有一個現有教師帳戶。
2. 核對班別、學生、功課、每日紀錄及警示筆數，並確認七份現有功課樣本可對應檔案。
3. 上載新的 index.html、app.js、cloud-model.js 和 styles.css 前，在 SQL Editor 執行 supabase-migration-02-cutover.sql。若舊快照在搬移後曾更新，此步會停止，避免漏資料。
4. 發佈網站後以原本教師帳戶登入，檢查名單、每日紀錄、樣本預覽，再新增與修改一筆可還原的紀錄作讀寫檢查。

舊快照與私人備份均保留供核對。新註冊帳戶不會自動取得任何班別資料或 API 權限；如需加入另一位教師，必須另外設計和授權共享方式。

## 備份

網站「班別與資料」可匯出包含樣本的完整 JSON 備份。備份有學生姓名，請私下保存。匯入會取代目前帳戶的紀錄，網站在確認後才提交資料庫變更。
