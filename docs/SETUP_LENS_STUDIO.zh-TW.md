# 在 Lens Studio 打開這個作品（中文操作手冊）

## 最快的方法：直接打開已經設定好的專案

這台 Mac 已經裝好 Lens Studio 5.24.1，也替你建好專案。
1. 雙擊 `lens/QuakeGlobe.esproj`，或從 Lens Studio 開啟它。
2. 確認 Preview 面板的裝置是 **SPECS 27**，按播放就會看到地球儀。

專案裡已經有互動套件（SIK）、介面套件（UI Kit）、世界追蹤相機、材質，以及掛好元件的「Quake Globe」物件。下面的手動步驟只有在你要給舊款 Spectacles（Lens Studio 5.15）另建專案時才需要。

README 裡的截圖用的是 Preview 內建的模擬場景 **Evening Room**（傍晚的房間）。眼鏡是在真實環境上「加光」，昏暗房間最接近戴上眼鏡看到的樣子。

## 手動建立（舊款 Spectacles 或其他專案）

大約十分鐘。整個場景由程式在執行時自動建好，你只需要做四件事：裝一個套件、複製一個資料夾、建一個材質、掛一個元件。

## 1. 先選 Lens Studio 版本

| 裝置 | Lens Studio 版本 | 專案範本 |
|---|---|---|
| Spectacles（2024 開發者版） | **5.15.x**，最新是 5.15.4 | Spectacles → Base Template |
| SPECS 27（2026 新款） | **5.22 以上** | SPECS → Base Template |

下載頁：https://ar.snap.com/download

參賽前先看當屆挑戰賽頁面要求哪一種裝置。程式只用兩個版本都有的功能，所以兩邊都能開。

## 2. 建專案、放入程式

1. 打開 Lens Studio，在首頁用上表的 Base Template 建新專案。範本已經內建相機和互動套件（SIK）。
2. 用 Finder 把這個專案的 `lens/Assets/QuakeGlobe` 整個資料夾，複製到新專案的 `Assets/` 資料夾裡。Lens Studio 會自動讀進來。
3. 在 Asset Browser 按 **+**，搜尋 **Unlit**，建立一個 Unlit 材質。Base Texture 留空。雙面顯示、深度、混合這些設定由程式鎖定，材質本身怎麼設都沒關係。
4. 到 Asset Library 安裝 **Spectacles UI Kit**。這是 Snap 官方的免費套件，面板的按鈕和底板都來自它。Snap 的範例在 5.15 版用 UI Kit 0.1.5，在 5.22 以上用 2.0；程式只用兩個版本都有的元件。

## 3. 掛上元件

1. 在 Scene Hierarchy 按 **+**，新增 Empty Object。放在最外層，不要放在相機底下。名稱改成 `Quake Globe`。
2. 選取它，把 Asset Browser 裡的 `QuakeGlobe/Scripts/QuakeGlobeLens.ts` 拖到右邊的 Inspector。也可以按 **Add Component** 搜尋 `QuakeGlobeLens`。
3. 把剛剛建的 Unlit 材質拖進 **Base Material** 欄位。
4. 可選：把 `Camera Object` 拖進 **Camera Object** 欄位。不放也可以，程式會自己找相機。
5. 其他欄位用預設值即可：地球半徑 12 公分、距離 100 公分、地球中心比眼睛低 8 公分（Height Offset Cm 填 -8）。這個高度是在 SPECS 27 預覽裡實測決定的：預覽的相機預設往下看 12 度，地球和下方面板都完整落在畫面內。原本的「高 6 公分」會讓地球頂端被切掉。按鈕尺寸符合 Snap 規定的最小值。
6. 可選：**Font** 欄位可以放任何字型，例如用 Lens Studio 的字型工具加入的 Google Fonts。留空就用預設字型。

## 4. 預覽

1. 在 Preview 面板把 **Device Type Override** 設成 Spectacles（5.15 版）或 SPECS 27（5.22 以上）。**這步一定要做**，否則所有網路請求都會回傳 404，地球是空的。
2. Logger 會先印出 `Lens Opened: v0.1.0`。幾秒後，面板狀態列會從 `Loading earthquake data...` 變成 `Updated just now`。
3. 互動預覽的操作：W/A/S/D/Q/E 移動，按住右鍵轉視角。左鍵點按鈕；左鍵拖曳地球可以移動它。雙手旋轉和縮放要在實機上才能測。

## 5. 錄示範影片與投稿

依照 `docs/SUBMISSION_KIT.md` 的分鏡錄 30 秒影片。

沒有實機的話有兩個辦法：
- 錄 Lens Studio 的預覽畫面。
- 到 Reddit 的 r/Spectacles 請有實機的人幫忙錄。

官方強烈建議投稿前在實機上測過。

## 常見問題

| 現象 | 原因與解法 |
|---|---|
| 狀態列顯示 `Could not load data (HTTP 404)` | Device Type Override 沒設成 Spectacles 或 SPECS 27 |
| 什麼都沒顯示，Logger 說某個輸入未定義 | Base Material 沒放材質 |
| 按鈕按了沒反應 | 場景裡少了範本自帶的 `SpectaclesInteractionKit` 物件 |
| 編譯錯誤 `Cannot find module 'SpectaclesUIKit.lspkg/...'` | 還沒裝 Spectacles UI Kit（第 2 節第 4 步） |
| 地球出現在背後或太高 | 開啟瞬間相機位置還沒就緒。把地球抓過來，或把 Distance Cm 調大 |

## 已驗證和未驗證

已驗證：
- 核心邏輯的自動測試。
- 網頁預覽版畫面，方位已用數字驗證。
- 眼鏡端程式以嚴格模式通過官方 5.12、5.19、5.24 三個 API 版本的型別檢查，包含 UI Kit 0.1.5 和 2.0 兩個版本。

- 附上的專案已在 Lens Studio 5.24.1 的 SPECS 27 預覽裡實際跑過，抓到即時地震資料，沒有任何執行錯誤或警告。用模擬手勢按 Strongest、30 days、24 h，結果都正確：震央環出現、圖例的發光時間窗跟著切換。大氣光環的縮放比例也從執行中的 Lens 讀回來核對過，距離 100 公分和拉近到 50 公分時都和公式一致。

未驗證：沒有實機，所以還沒在眼鏡上跑過，也還沒測舊款 Spectacles 的 5.15 版。實機幀率、100 公分外文字清不清楚、雙手操作的手感，要上機才能確認。

另外有一位獨立審查者對照 Snap 官方範例、SIK 原始碼和設計規範審過眼鏡端程式。結果沒有會讓作品打不開的問題，提出的修正項目已全部改完。
