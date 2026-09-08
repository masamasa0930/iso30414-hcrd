# ISO 30414 人的資本レポート作成システム — 引き継ぎ書（Claude Code用）

このフォルダは株式会社ロジック・ブレインの「ISO 30414 人的資本レポート作成システム」の正本。
別のClaude Codeセッションで開発を引き継ぐために必要な情報をここに集約する。
2026-07-07に構築・公開。発案者は服部真人（CEO）。認定HRコンサルタントが顧客企業の
人的資本データを入力し、指標計算・グラフ化・Human Capital Report（People Fact Book）生成に使う。

## URL・場所

| 用途 | 場所 |
|---|---|
| 本番（関係者限定・パスワードゲート付き） | https://masamasa0930.github.io/iso30414-hcrd/ |
| GitHubリポジトリ（public） | https://github.com/masamasa0930/iso30414-hcrd |
| アプリ本体（平文マスター・**このMacにのみ存在**） | `app.html`（.gitignore対象） |
| 公開ファイル（暗号化済み・コミット対象） | `index.html`（build.mjsが生成） |
| 補助Artifact（旧・服部さんのclaude.aiのみ） | https://claude.ai/code/artifact/2232cbcf-3500-4083-8b9d-0065a70ae06d |
| 規格原文PDF | `~/Downloads/C2_ISO_30414_2025規格　日本語.pdf`（26ページ・JSA英和対訳版） |

パスワードは **`HANDOFF-local.md`（このフォルダ・git除外）** と、Claude Codeの
メモリ `~/.claude/projects/-Users-masato-Desktop-Claude-Context-----/memory/iso30414-hcrd-tool.md` にある。
**リポジトリ・CLAUDE.md・README.mdには絶対に書かないこと（repoはpublic）。**

## 絶対に守ること

1. **`index.html` を直接編集しない**。build.mjsの出力で上書きされる。編集は必ず `app.html`。
2. **`app.html` をコミットしない**（.gitignore済み）。平文がpublic repoに載るとゲートが無意味になる。
   過去に平文が載った履歴は2026-07-07にorphanブランチで破棄済み。復活させない。
3. **ISO規格本文を転載しない**。PDFはJSAライセンス品（岩田洋子名義・複製再配布不可）。
   ツールに入れてよいのは指標名・参照番号・算出式（事実）のみ。規格の説明文はパラフレーズする。
4. 顧客の実データをリポジトリ・Artifact・チャットへ出さない（アプリ設計上、データは利用者ブラウザ内のみ）。

## 更新→デプロイ手順（毎回これ）

```bash
cd "/Users/masato/Desktop/Claude Context/新規作成/iso30414-hcrd"
# 1) app.html を編集
# 2) 暗号化ビルド（パスワードは HANDOFF-local.md 参照）
node build.mjs "＜パスワード＞"
# 3) コミット＆プッシュ（約1分で本番反映）
git add index.html && git commit -m "..." && git push
# 4) 反映確認（ハッシュ照合）
l=$(shasum -a 256 index.html|cut -d' ' -f1); r=$(curl -s https://masamasa0930.github.io/iso30414-hcrd/|shasum -a 256|cut -d' ' -f1); [ "$l" = "$r" ] && echo DEPLOYED
```

- git push が503で失敗することがある→そのままリトライで通る。
- パスワード変更も同じコマンド（新パスワードでビルド）。saltはパスワード由来の固定値なので、
  **アプリ更新では利用者の「記憶」ログインが維持され、パスワード変更時のみ全員無効化**される。

## ローカル動作確認

- 最速: `app.html` をブラウザで直接開く（ゲートなし・そのまま動く）。
- ビルド後の確認: `.claude/launch.json`（親フォルダ `新規作成/.claude/`）に `iso30414-hcrd` 定義あり
  （nodeワンライナーで `index.html` をport 8931配信）。preview_startで起動→ゲートにパスワード入力。
- 動作検証の定番: ヘッダー「デモデータ」（従業員約128名・3年分）→ 各タブ確認 → コンソールエラー0を確認。
- デモデータの検算例（2026年度）: NTE=128人, NFTE=112.0, TFTE=121, HCROI=18.4%, 離職率6.6%, 労災発生率3.97。

## アーキテクチャ（app.html 単一ファイル・依存ゼロ）

vanilla JS + インラインSVGチャート。外部ライブラリ・外部通信なし。約1,100行。

### 状態（localStorage キー `iso30414-hcrd` に自動保存）
```js
state = {
  years: ['2024','2025','2026'],        // 年度ラベル3つ（[2]が最新＝レポート対象）
  inputs: { fieldId: [y0,y1,y2], ... }, // 素材数値（約97フィールド×3年度）
  targets: { metricId: number },        // 指標ごとの目標値
  mode: 'sme'|'large',                  // 表4の表示範囲切替
  sortReqFirst: bool,                   // 必須を上位に並び替え
  meta: {company,period,sector,author}, // レポート表紙
  texts: {top,gov,strat,risk,concl}     // レポート文章（空ならDEFAULT_TEXTS）
}
```
「保存(JSON)」「読込」でstate丸ごとのエクスポート/インポート（顧客別ファイル管理を想定）。

### 主要データ構造
- `HCAS`: 11の人的資本領域（id/no/name）。A.1労働力〜A.11スキル。
- `FIELDS`: 入力素材の定義 {id, hca, label, unit, help}。helpに附属書Aの変数名（例: A.8式 TCC）。
- `METRICS`: 指標定義 {id, hca, ref, f(算出式文字列), name, unit, dec, level, dir, calc(yi)=>number|null}。
  - `level`: 'req'=表3必須（**全企業共通**・21エントリ＝規格の14項目を展開）/ 'sme'=表4SME内部 / 'large'=表4大企業のみ
  - `dir`: +1=高いほど良い / -1=低いほど良い / 0=中立（ギャップ判定・前年比の色分けに使用）
  - `calc`: state.inputsから計算。素材不足ならnull（「—」表示）。派生ヘルパー: NTE/NFTE/TFTE/NTW/TCOW等。
- `GAUGE_IDS`/`BAR_IDS`: ダッシュボード/レポートのグラフ種別割当（それ以外はエリアチャート、
  年齢・性別構成はドーナツの複合カード＝COMPOSITION_IDS）。
- `HCA_COLORS`: 領域ごとのカラーコード（労働力=青#3b82f6, ダイバーシティ=ピンク#ec4899, コスト=アンバー#f59e0b,
  生産性=エメラルド#10b981, 健康安全=赤#ef4444, リーダーシップ=紫#8b5cf6, コンプラ=スカイ#0ea5e9,
  採用=シアン#06b6d4, 異動=ライム#84cc16, 離職=インディゴ#6366f1, スキル=ティール#14b8a6）。

### チャート部品（SVG文字列を返す関数）
`svgArea(vals,W,H,col)` / `svgBars(vals,labels,W,H,dec,col)`（最新年度ほど濃い）/
`svgDonut(segs,center,sub,size)`（中心に合計値＋凡例別描画）/ `svgGauge(val,unit,size,max,col)`（リング）。

### 画面（4タブ・showTab()）
1. **ダッシュボード** `renderDash()`: サマリーバー（登録指標数・★表3必須の入力状況・目標達成/未達）、
   カテゴリチップ（全て/★表3必須/11領域）＋「↑必須を上位に並び替え」トグル、JOBScope風カード。
2. **データ入力** `renderInputs()`: 領域別×3年度の素材入力表。
3. **指標一覧** `renderMetrics()`: 全指標の参照番号・算出式・3年値・推移・目標値入力。必須行は薄赤＋赤バッジ。
4. **開示レポート** `renderReport()`: People Fact Book形式。表紙→目次→①トップメッセージ→
   ②考え方（TCFD型: ガバナンス/戦略/リスク）→③ハイライト→④領域別（全指標チャートグリッド＋表＋
   ギャップ分析gapComment()＋定性文autoQualitative()）→⑤経年データ集→⑥ISO対応状況→総括。
   必須指標は★印＋凡例。`window.print()`でPDF化（改ページ・色保持のprint CSSあり）。

### 表3必須（全企業共通）の見える化 — 服部さん指定の重要仕様
表3の必須指標は**大企業・中小企業を問わず全組織が開示義務**（規格4.7.4）。これを
赤の`REQ_BADGE`「★ 表3必須（全企業）」・説明バナー`.reqCallout`・専用フィルタ・並び替えトグル・
レポート★印で全画面に表示している。**この強調は今後も維持すること。**

### モードの挙動（仕様どおり・バグではない）
- SMEモードでA.8採用が「データ整備中」になるのは正常（表4で採用指標は大企業のみのため）。
- 必須指標はモードに関係なく常に表示。

## ゲートの仕組み（build.mjs）

- `app.html`全体をAES-256-GCMで暗号化し、復号UI付き`index.html`を生成（staticrypt方式）。
- 鍵導出: PBKDF2(SHA-256, 310,000回)。salt = sha256('iso30414-hcrd|'+パスワード)の先頭16B（決定的）。
- 「このブラウザで記憶する」= 導出済み生鍵をlocalStorage `hcrdGateKey` に保存→次回自動復号。
  復号失敗時は自動でキー破棄しゲート表示（гraceful）。
- 復号後は document.open/write で全文差し替え（script実行される）。WebCryptoのためhttps/localhost必須。

## 実装済み範囲と既知の簡略化

- 附属書A算出式 (A.1)〜(A.57) のうち約51指標を実装。規格読解メモ:
  - 表3必須=14項目（4.7.4「全ての組織は〜しなければならない」）、表4推奨=55指標（大企業内部55/対外23/SME30）。
  - HCROI (A.12) は結果×100で%表示。A.13 OIWCは代替式として併載。非営利は表A.17の読み替え。
  - TRIR (A.16) と表のみの指標（表A.6経営陣内訳等）は簡略化・未実装。
  - 苦情/人権/懲戒/係争 (A.7.7〜A.7.10) は件数指標として実装（種類・結果の内訳表は未実装）。
- デザイン参照（服部さん指定）: グラフ= https://jobscope.ai/hrcapital/ ／ レポート形式=
  https://consulting.kotora.jp/human-capital/hcr/ 掲載の各社Human Capital Report。

## 未実装・次の候補（服部さんに確認してから着手）

- エンゲージメント調査システム（engagement-survey.onrender.com）のスコアをA.6.2へ自動連携
- 苦情・人権・懲戒・係争の内訳表（種類/結果）入力とレポート反映
- レポート英語版出力 / 複数年度以上（4年〜）対応
- 顧客データJSONの保管ルール整備（現状は各コンサルタントのローカル管理）

## 関連システム（別物・混同注意）

営業ダッシュボード（Render）・エンゲージメント調査（Render）・ストレスチェック等は別プロダクト。
運用系の依頼は product-ops-agent スキルが担当。Claude Codeメモリの
`iso30414-hcrd-tool.md` が本システムの記録正本（更新したら追記すること）。
