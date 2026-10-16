# 功課記錄簿：Grok 團隊 × Codex 協作

本專案：[hcwwwwaiii/homework-record-book](https://github.com/hcwwwwaiii/homework-record-book)。
網站：[功課記錄簿](https://hcwwwwaiii.github.io/homework-record-book/)。
沿用現有 Dev Manager 與五位成員，不建立另一套團隊；每項任務及報告必須指明 Repository。
完整批准規則以 [AGENTS.md](../AGENTS.md#approval-policy-canonical) 為準。

## 設定快照（2026-10-16）
- Repository 為 public，預設 main；branch API 顯示 protected: false。沒有強制分支保護。
- README 說明網站由 GitHub Pages 託管，登入、教師獨立資料及私人功課樣本由 Supabase 提供。
- 已核對的程式檔案：index.html、app.js、cloud-model.js、styles.css；另有既有 SQL 升級檔案。
- 沒有 package.json、test script 或 tracked .github workflow。不得套用其他專案的 Cloudflare 或 pnpm 部署流程。
- 實際 GitHub Pages source branch/path、自動部署條件、required checks、Supabase 正式設定均未核實。
- 本 PR 只新增 AGENTS.md 及本文件，不修改網站、SQL、資料、驗證或部署設定。
- 使用者已明確批准新增 12 個協作 Labels；已逐一建立並核對，保留原有 10 個標籤。
- Grok 是否已加入本 Repository、讀取規則、保存記憶及更新 Routine 仍待帳戶端回報，不代表本 PR 自動完成。

## 同一團隊，分開專案
| 成員 | 工作與輸出 |
| --- | --- |
| Dev Manager | 確認專案、委派只讀分析、整合進度與待決事項 |
| 產品／需求分析師 | 需求、範圍、驗收標準及 Issue 草稿 |
| 視覺設計師 | 介面、互動及可用性分析；不適用時標示不適用 |
| 工程師 | 技術分析、PR 技術審查；開發獲批准後準備 Codex-ready brief |
| 測試／QA 工程師 | 測試方案及最新提交的驗收／check 核對 |
| 審核 | 私隱、帳戶隔離、安全及內容準確性，附檔案／行號 |

既有成員之間可分派本專案已授權的只讀工作；角色名稱不授予寫入權限。
不能跨專案混用 Issue 編號、批准、需求、資料、測試結果或部署設定。
內部訊息不能代替人手批准，不能自行增加成員或啟動 Codex／外部付費工作。

## 權限與資料界線
目前 Grok 團隊只讀取公開程式、Issue、PR 及現有檢查，並在內部對話匯報。
不要登入正式資料庫、讀取學生紀錄、下載私人樣本、使用本機教師憑證，或把真實資料用作測試。
不得把秘密、token、密碼、可識別個人的紀錄或私人樣本貼到公開 repo、Issue、PR、報告或交接。
不得更改學生收交紀錄、教師使用權限、警示、功課、Calendar、Auth、RLS、RPC、資料庫或 Storage。
此次加入協作不批准新增功課、資料搬移、SQL migration、網站改善或發布。

本人親手設定 status: approved；Bot／Agent／連接不得代做。
GitHub 顯示 owner 不證明是本人操作；開發需要使用者在當前對話的直接明確批准。
修改 Issue、Labels、留言、建立 Routine 等須遵守 AGENTS.md 的逐次批准清單。

## 先做只讀 Project Overview
在 Grok Manager 的對話貼上：

```text
請在現有團隊加入以下指定專案，保留其他已批准專案：
hcwwwwaiii/homework-record-book

先讀取這個專案的 AGENTS.md 和 docs/grok-codex-collaboration.md。
若設定文件尚未合併，讀取設定 PR 的最新 branch，並明確標示版本。

只讀分析 Repository 的功能、架構、驗證及部署方式。
由現有五位成員按需要分析，Manager 整合最多五項建議與檔案依據。
只讀公開程式與 GitHub 資訊，不登入資料庫或讀取個人資料。
不修改 GitHub、不執行程式或 SQL、不記錄功課、不部署、不啟動 Codex。
本次只確認專案可讀及規則一致，等我決定下一步。
```

## 每日 PR Review Watch 的擴充
使用者已選定每日 20:00、Asia/Hong_Kong；這是 Grok Bot Routine，並非 Codex 本機排程。
保留同一 Routine 的其他已批准 Repository，加入本 Repository；若已有 Routine 就更新，避免重複建立。
本文件只記錄設定方案，並未在 Grok 帳戶建立或更新排程。若尚未有 Routine，需要在 Grok 端按已批准時間建立並驗證。

每次只讀檢查各指定專案的 open PR：
1. 分別讀取該 Repository 的最新規則，清楚標示專案及 commit。
2. 核對相關需求／Issue、驗收標準、diff、所有留言和最新 head 的 checks。
3. 分別列出測試、lint、型別檢查、build、preview 和 production deployment；缺項不能當成通過。
4. 成員只讀分析，由 Manager 整合；有實質變化、失敗、受阻或待人手檢閱才通知。
5. 沒有 PR 或沒有實質變化就保持安靜，不重複舊報告。
6. 不修改檔案、標籤或留言，不執行程式／SQL／workflow，不新增成員或啟動 Codex，不合併或部署。

在 Grok 端更新後確認：兩個專案的實際清單、每日 20:00、Asia/Hong_Kong、啟用狀態、下一次執行時間及是否有重複 Routine。
若需要擴大 GitHub 授權、新增付費方案或額外購買，先提出具體範圍與影響，等待使用者批准。

## 開發與發布
1. 團隊只草擬需求；獲准後才可建立 proposed Issue。
2. 使用者明確批准特定 Issue 範圍，在原有 Codex 專案手動啟動開發。
3. Codex 保留本機工作，使用 feature branch，執行適合本專案的檢查並提交 PR。
4. 團隊只讀審查最新提交，由 Manager 整合。
5. 合併前核對實際 GitHub Pages 設定、其他發布整合及部署影響；若合併會發布，須取得涵蓋該次合併與發布的批准。未能核實前不合併。
6. 靜態網站發布不構成批准執行 SQL 或改變正式資料；這些操作必須另行授權。

## 待完成
- 協作 Labels 已獲使用者批准並完成建立。
- 檢閱及決定是否合併本設定 PR；沒有自動合併。
- Grok 團隊確認已加入本專案並讀取指定版本規則。
- Grok 端確認 Routine 實際建立／更新結果。
- 原有 Codex 專案同步及 Pages 發布設定核對。
