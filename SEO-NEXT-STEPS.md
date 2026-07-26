# item-search.jp SEO 手動タスク手順書

コードでは完結しない「外部サービス登録・被リンク獲得」の実施手順です。デプロイ後にオーナー側で実施してください。

---

## A. Bing Webmaster Tools 登録（所要 5〜10 分）

Bing は Google 由来のクエリでも一定のトラフィックがあり、生成AI（Copilot 等）の参照元にもなります。プリレンダ導入済みなので Bing にもページ本文が届きます。

### 手順（GSC からインポートするのが最速）
1. <https://www.bing.com/webmasters> に Microsoft アカウントでサインイン。
2. 「Google Search Console からインポート」を選択 → GSC を連携すると `item-search.jp` が所有権確認済みで取り込まれます。
3. sitemap が未登録なら「サイトマップ」で `https://item-search.jp/sitemap.xml` を送信。

### GSC を使わず meta タグで確認する場合
- Bing が発行する検証コードを [index.html](index.html) の下記コメントを外して貼り、再デプロイ:
  ```html
  <meta name="msvalidate.01" content="（Bingの検証コード）" />
  ```
- 反映後、Bing 側で「確認」を押す。

---

## B. IndexNow（Bing/Yandex 等への即時通知）

IndexNow は更新を検索エンジンへ即 push する仕組み。**Cloudflare を使っているなら実装不要でワンクリック有効化**できます。

1. Cloudflare ダッシュボード → 対象ゾーン（item-search.jp）→ **Caching → Configuration**。
2. **Crawler Hints** を **On**。これで Cloudflare が IndexNow 経由でクロール推奨を自動送信します。
3. 追加のキー設置・コード変更は不要。

> 手動で叩く場合は IndexNow API にキー＋URL を POST する方式もありますが、Cloudflare の Crawler Hints で十分です。

---

## C. Google 側の初動（デプロイ直後にやる）

1. GSC → **サイトマップ** で `https://item-search.jp/sitemap.xml` を（再）送信。
2. GSC → **URL 検査** で主要 LP を個別にインデックス登録リクエスト:
   - `https://item-search.jp/`
   - `https://item-search.jp/c/game`（主要カテゴリ数枚）
   - `https://item-search.jp/s/nintendo-switch-2`（主要キーワード数枚）
3. 1〜2 週間後、GSC **検索パフォーマンス → クエリ** を確認し、
   表示回数はあるが該当ページが弱い語を [src/landing/keywords.json](src/landing/keywords.json) に追記
   → `npm run build` で LP と sitemap が自動生成される。

---

## D. 被リンク・サイテーション獲得（継続タスク）

新規ドメインで最も効くのは「実在する自然な言及」を増やすこと。手軽な順:

1. **公式 SNS を作って発信**（X など）。プロフィールにサイト URL、便利な検索例を投稿。
2. **はてなブックマーク / まとめ系**で、横断検索が刺さる文脈（「Switch2 最安値の探し方」等）で自然に紹介。
3. **無料のツール紹介ディレクトリ**（便利ツールまとめ、Webサービス紹介サイト）へ登録。
4. **ブログ記事**（note 等）で「複数通販の価格比較を一発でやる方法」といった How-to を書き、本サイトへ内部導線。
5. Q&A（知恵袋・Reddit 等）で関連質問に、宣伝色を抑えて回答＋リンク。

> スパム的な相互リンク・購入リンクは逆効果。少数でも文脈に合った言及を優先。

---

## E. 効果測定

- **GSC**: 表示回数 → クリック率（CTR）→ 掲載順位 を週次で確認。CTR が低い LP は title/description を調整。
- **GA4**: `search` イベントで実際に検索された語を把握 → 需要語を keywords.json に反映。
- **Bing Webmaster**: 別チャネルの流入を確認。
