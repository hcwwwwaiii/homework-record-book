# 功課記錄簿：Grok 團隊 × Codex 協作

本專案：[hcwwwwaiii/homework-record-book](https://github.com/hcwwwwaiii/homework-record-book)。
網站：[功課記錄簿](https://hcwwwwaiii.github.io/homework-record-book/)。
沿用現有 Dev Manager 與五位成員，不建立另一套團隊；每項任務及報告必須指明 Repository。
完整批准規則以 [AGENTS.md](../AGENTS.md#approval-policy-canonical) 為準。2026-10-17 清潔 PR 常設授權的中文對照見下文；英文清單仍是唯一準則。

## 設定快照（Repository 基線：2026-10-16；團隊回報更新：2026-10-17）
以下狀態有時效性，每次審查須重新核對最新提交。團隊及排程狀態來自使用者轉述，不是 Codex 從 Grok 帳戶獨立核驗。
- Repository 為 public，預設 main；branch API 顯示 protected: false。沒有強制分支保護。
- README 說明網站由 GitHub Pages 託管，登入、教師獨立資料及私人功課樣本由 Supabase 提供。
- 已核對的程式檔案：index.html、app.js、cloud-model.js、styles.css；根目錄另有 supabase-setup.sql、supabase-migration-01.sql、supabase-migration-02-cutover.sql，以及 supabase/migrations/ 內的兩個 migration。檔案存在不證明有自動執行，也不能據此決定重跑或執行次序。
- 沒有 package.json、test script 或 tracked .github workflow。不得套用其他專案的 Cloudflare 或 pnpm 部署流程。
- 2026-10-17 Codex 只讀查看已登入的 GitHub Pages 設定：Source 為 Deploy from a branch、branch 為 main、目錄為 / (root)。合併到 main 會重新發布網站。
- 同日以程式的公開 backend URL 配對正確 Supabase 專案，只讀查看 Project Overview：GITHUB 為 No repository connected，RECENT BRANCH 為 No branches。該專案沒有設定原生 GitHub／branching 自動 migration；沒有執行 SQL 或改資料。
- Repository 的 Webhooks 頁面沒有列出 webhook，main 沒有 tracked .github workflow。GitHub Apps 頁面列出 Codex、Cloudflare、Cursor 及 Netlify；App 安裝本身不證明已設定發布本專案，未全面核對每個外部服務的內部設定。其他 Supabase 正式設定、Grok 實際權限及原專案同步仍未獨立驗證。
- PR #3（已合併，d5c27bc）新增 AGENTS.md 及本文件，沒有修改網站、SQL、資料、驗證或部署設定。
- 使用者已明確批准新增 12 個協作 Labels；已逐一建立並核對，保留原有 10 個標籤。
- 使用者轉述：Grok 已將本 Repository 納入 PR Review Watch，已讀 PR head 規則並只讀審查。19:05 的執行結果已回報；目前排程據報為每日 19:00、Asia/Hong_Kong。完整記憶保存、實際排程設定和下次執行時間未由 Codex 獨立核驗。

## 同一團隊，分開專案
| 成員 | 工作與輸出 |
| --- | --- |
| Dev Manager | 確認專案、委派只讀分析、整合進度與待決事項 |
| 產品／需求分析師 | 需求、範圍、驗收標準及 Issue 草稿 |
| 視覺設計師 | 介面、互動及可用性分析；不適用時標示不適用 |
| 工程師 | 技術分析、PR 技術審查；開發獲批准後準備 Codex-ready brief |
| 測試／QA 工程師 | 測試方案及最新提交的驗收／check 核對 |
| 審核 | 私隱、帳戶隔離、安全及內容準確性，附檔案／行號 |

既有成員之間可分派本專案已授權的只讀工作；角色名稱不授予寫入權限。五位成員維持只讀。Dev Manager 僅在 [AGENTS.md](../AGENTS.md#clean-pr-standing-authorization-2026-10-17) 所載 2026-10-17 清潔 PR 常設授權的先決條件全部成立時，可就該 PR 執行該段所列四步；該授權不授予其他角色、Codex 或排程。
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
修改 Issue、Labels、留言、建立或修改 Routine（包括擴大範圍、改時間、時區、啟停及刪除）等須遵守 AGENTS.md 的逐次批准清單。

## 先做只讀 Project Overview
在 Grok Manager 的對話貼上：

```text
請在現有團隊加入以下指定專案，保留其他已批准專案：
hcwwwwaiii/homework-record-book

先讀取這個專案 main 的 AGENTS.md 和 docs/grok-codex-collaboration.md，並明確標示版本。

只讀分析 Repository 的功能、架構、驗證及部署方式。
由現有五位成員按需要分析，Manager 整合最多五項建議與檔案依據。
只讀公開程式與 GitHub 資訊，不登入資料庫或讀取個人資料。
不修改 GitHub、不執行程式或 SQL、不記錄功課、不部署、不啟動 Codex。
本次只確認專案可讀及規則一致，等我決定下一步。
```

## 每日 PR Review Watch 的擴充
按使用者最新轉述，Grok Bot Routine 已改為每日 19:00、Asia/Hong_Kong；本次只同步文件，不操作 Grok 排程，也不追認之前變更的批准流程。這並非 Codex 本機排程。
既有 Routine 已據報涵蓋本專案，毋須重複建立。日後建立、修改、擴大 Repository／權限範圍、改時間／時區或啟停／刪除前，先列出原設定、擬改內容及影響，取得使用者對該次變更的直接明確批准。未獲批准不得更新。
已批准的只讀 Routine 可依批准的範圍及時間重複執行，不必每次重新批准；這不授予寫入或修改 Routine 的權限。Codex 此次沒有在 Grok 帳戶建立、修改或驗證排程。

每次只讀檢查各指定專案的 open PR：
1. 分別讀取該 Repository 的最新規則，清楚標示專案及 commit。
2. 核對相關需求／Issue、驗收標準、diff、所有留言和最新 head 的 checks。
3. 分別列出測試、lint、型別檢查、build、preview 和 production deployment；缺項不能當成通過。
4. 成員只讀分析，由 Manager 整合；有實質變化、失敗、受阻或待人手檢閱才通知。
5. 沒有 PR 或沒有實質變化就保持安靜，不重複舊報告。
6. 不修改檔案、標籤或留言，不執行程式／SQL／workflow，不新增成員或啟動 Codex，不合併或部署。

在 Grok 端更新後確認：兩個專案的實際清單、每日 19:00、Asia/Hong_Kong、啟用狀態、下一次執行時間及是否有重複 Routine。
若需要擴大 GitHub 授權、新增付費方案或額外購買，先提出具體範圍與影響，等待使用者批准。

## 開發與發布
1. 團隊只草擬需求；獲准後才可建立 proposed Issue。
2. 使用者明確批准特定 Issue 範圍，在原有 Codex 專案手動啟動開發。
3. Codex 保留本機工作，使用 feature branch，執行適合本專案的檢查並提交 PR。
4. 團隊只讀審查最新提交，由 Manager 整合。
5. 合併前只讀核對 GitHub Pages source branch/path、發布條件，以及 Supabase GitHub 整合／branching、自動 migration 是否啟用及目標環境。另核對其他 merge-triggered workflow／外部整合。不能只看 repo 沒有 workflow 就推定不會改資料庫；無法核實任一項影響就不合併，也不以執行 SQL 作驗證。符合下文清潔 PR 常設授權時，這些核對結果仍須寫入審查所依據的報告。
6. 合併會發布時，取得該次合併及發布批准。若該 PR 完全符合下文「清潔 PR 常設授權（2026-10-17）」的全部先決條件，該常設授權就是該 PR 的合併及 GitHub Pages 重新發布批准，毋須第二次對話批准。若也會套用 migration，本常設授權不適用；另說明確切 SQL／migration、資料庫環境及影響，取得涵蓋資料庫操作的明確批准。現有 SQL 檔案不是執行授權。
7. Repository 為 public，tracked SQL 本身已可由 GitHub 讀取；是否亦經 Pages 提供需按實際發布內容核對，不把未核實的公開路徑當成事實。此次不搬移／刪除 SQL，也不修改 migration 次序。

## 清潔 PR 常設授權（2026-10-17）

此段對照 [AGENTS.md 的 Clean PR standing authorization (2026-10-17)](../AGENTS.md#clean-pr-standing-authorization-2026-10-17)。英文清單是準則；此段不放寬其他批准關卡，也不把其他專案同日的授權套用到本倉庫。

2026-10-17，本人直接授權本倉庫（hcwwwwaiii/homework-record-book）。這是核准清單內唯一已記載的常設例外，範圍限於本倉庫的 GitHub Pages 託管，不是 Always allow。

Dev Manager 統籌五位成員對某一個未合併 PR 完成只讀審查，整合報告列明零項必須修正（zero must-fixes），而且該 PR 的 head SHA 仍等於已審查 SHA 之後，本人授權 Dev Manager（不是其他角色、不是 Codex、不是排程）只就該 PR、毋須在對話再取得第二次批准：

1. 取消 draft，或標示為 ready for review。
2. 以 squash-merge 把該 PR 合併到 main。這不是直接 push 到 main，不是 force-push，也不是開啟 auto-merge。
3. 接受已知、由合併觸發的 GitHub Pages 重新發布。2026-10-17 已登入核對的 Pages 設定為 Deploy from a branch、branch 為 main、目錄為 / (root)；合併到 main 會重新發布 [功課記錄簿](https://hcwwwwaiii.github.io/homework-record-book/)。合併前仍須覆核 Pages 的 source branch 與路徑；當日快照不是永久豁免。
4. 若正式網站（GitHub Pages）在合理等待後仍落後於已合併的 SHA，只有本倉庫已經記載手動正式部署路徑時才可呼叫，例如本倉庫已追蹤的 `workflow_dispatch` workflow。不得新造部署 workflow，不得執行 SQL，不得改動 Supabase。2026-10-17 的倉庫快照沒有 tracked `.github` workflow，因此沒有已記載的 `workflow_dispatch` 正式部署路徑；在本倉庫記載該路徑之前，第 4 步沒有可呼叫的對象。不得借用其他專案的 Cloudflare、pnpm 或其他部署流程。執行前須覆核倉庫，不可把當日「沒有 workflow」當成永久事實。

先決條件（必須全部符合）：審查報告在當前與本人的對話，並寫明 PR 編號及已審查 SHA；零項必須修正；head SHA 未變；合併沒有被阻擋（須覆核分支保護；設定當時 main 為 unprotected）。合併前仍須覆核 Pages、Supabase GitHub 整合／branching，以及該合併會否套用 migration。2026-10-17 配對的 Supabase 專案 Overview 顯示 No repository connected、No branches，該次查看沒有原生 GitHub／branching migration 觸發；該快照不是永久豁免。無法確認整合狀態或資料庫影響時，不得依本例外合併，亦不得執行 SQL 來查明整合是否啟用。

會改動資料庫的合併，仍要按原有規定另取得涵蓋確切 migration 及目標環境的明確批准。本常設規則不涵蓋會套用 migration 的合併。

以下仍須在當前對話取得全新的明確人手批准：審查有必須修正或阻擋項的 PR，或 head SHA 在審查後已變；不合併而關閉；開啟 auto-merge；秘密、環境變數、Pages 或 Supabase（Auth、SMTP、RLS、RPC、storage、schema 或其他設定）；刪除分支或資料；建立或修改 Issue、標籤或 GitHub 留言；啟動 Codex 或任何外部編碼代理；正式資料或 SQL；分支保護、可見性、存取或權限；付費服務或 API 工作；以及超出本例外範圍而選擇 Always allow。

其他受批准關卡約束的操作維持 Ask first。本例外只授權上面四步，而且只適用於一個已審查、先決條件全部成立的 PR。

## 已完成與待確認
- 已完成：12 個協作 Labels 建立及核對。
- 已完成：PR #3 已合併至 main（d5c27bc），GitHub Pages 已重新發布。
- 使用者已轉述 Grok 團隊加入專案、讀取 PR head 並完成只讀審查；部分成員後續意見仍待補報。
- 使用者已回報 Routine 執行結果；待 Grok 顯示的排程、兩專案範圍、啟用狀態及下次執行時間作設定核對。
- 已核對：Pages 使用 main／根目錄，Supabase 沒有 GitHub／branching 連接。
- 原有 Codex 專案同步與 Grok 帳戶內細項權限仍待各帳戶端確認。
