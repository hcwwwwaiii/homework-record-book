# 功課記錄簿

三個班別的功課收交記錄、每日欠交與缺席、警示、封存，以及每月表現查閱。GitHub Pages 使用 Supabase 儲存登入教師的共用紀錄，功課樣本放在私人 Storage bucket。

## Supabase 初始設定

1. 在 Supabase Authentication 設定停用新用戶註冊及匿名登入，並在 Authentication > Users 建立教師帳戶。
2. 在 SQL Editor 執行 supabase-setup.sql，建立受登入保護的同步資料表及私人樣本儲存空間。
3. 網站只提供登入，不提供公開註冊。共用帳戶可在多部裝置使用。

瀏覽器程式碼只使用 Publishable key；資料庫和檔案存取由 RLS 政策限制。不要把 Secret 或 service_role key 放入網站。

## 本機版資料轉移

1. 在本機版開啟「班別設定」，按「匯出完整備份」。備份包含學生資料與功課樣本，請私下保存。
2. 登入 GitHub 網站後，在「班別設定」按「匯入備份」。匯入會取代目前雲端共用記錄，請先確認已選擇正確的備份。
