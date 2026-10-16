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

舊快照與私人備份均保留供核對。

## 指定教師使用獨立工作區

依次執行 `supabase/migrations/20261016014253_approved_teacher_workspaces.sql` 及 `20261016014448_private_homework_rpc_implementations.sql`，在現有 API 上加入教師批准機制，並把特權實作移至私人 schema。執行前要求恰有一個現有工作區，將其已驗證的帳戶設為網站管理老師。它不搬移或重寫既有學生、功課或每日紀錄。

1. 管理老師登入後，在「班別與資料 → 教師使用權限」批准指定 Email。批准只記錄使用權限，不發送邀請郵件。
2. 將網站連結交給老師。老師用該 Email 註冊、完成電郵驗證後登入。Supabase 的 Site URL / Redirect URLs 應包含 `https://hcwwwwaiii.github.io/homework-record-book/`。
3. 首次登入建立獨立工作區，預設三個可改名的班別欄位，沒有學生或功課。各教師使用自己的 Email 登入，不共用帳戶。
4. 管理老師可停用或重新批准 Email。停用會拒絕 RPC、資料表讀取及檔案存取，保留工作區。已下載的本機副本不能遠端收回。管理老師不能藉此介面讀取其他老師的功課資料。

批准名單與管理角色保存在私人 schema，API 使用已驗證的 Auth 帳戶辨認教師，不信任可自行修改的 user metadata。批准 Email 首次登入後綁定帳戶 UUID；同 Email 的新帳戶不會繼承舊帳戶的工作區。未獲批准的 Auth 帳戶不能建立工作區或讀寫資料。

班別、學生、功課、每日紀錄、警示、同步比較副本、本機快取及樣本均按教師區分。新樣本路徑為 `<teacher UUID>/<assignment ID>`；舊樣本仍須同時符合原上載者與功課擁有人才能存取，避免匯入相同功課 ID 後跨帳戶取檔。

註冊郵件必須能寄到新老師的 Email。Supabase 內建郵件服務只寄給專案團隊成員，對外使用應設定自己的 SMTP；不要為了省略寄信而關閉電郵驗證，也不要把老師加入 Supabase 專案管理團隊來繞過寄信限制。參考 [Supabase SMTP 說明](https://supabase.com/docs/guides/auth/auth-smtp)。

## 備份

網站「班別與資料」可匯出包含樣本的完整 JSON 備份。備份有學生姓名，請私下保存。匯入會取代目前帳戶的紀錄，網站在確認後才提交資料庫變更。

