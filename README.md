# ぬるぷる / Nurupuru

画像の動かしたい部分を塗り、つかんだり揺らしたりして遊べるブラウザアプリです。動きを動画や静止画として保存できます。

画像・動画の処理はブラウザ内で行います。編集するファイルをサーバーへ送信しません。アクセス解析、広告、追跡Cookieは使いません。

## 主な機能

- PC・スマートフォンに対応した日本語／英語のUI。
- PNG・JPEG・WebPの読み込み、ブラシ・消しゴム・輪郭選択。
- 塗った部分の動きやすさと、材質・反動の調整。
- つかんで離す操作、画面の移動による慣性、自動揺れ。
- Circle、Sway、Bounce、Pulse、Shakeなどの揺れ方と、速さ・強さ・角度の調整。
- 「背景画像を選択」で背景画像を読み込み、位置・倍率を調整。
- PNG、WebMまたはMP4の書き出し。動画形式はブラウザの対応状況によります。
- `.nurupuru`形式で編集を保存・再開。マスクや背景調整のUndo／Redo。

## 使い方

1. 「画像を選択」で画像を読み込むか、サンプルを使います。
2. 動かしたい部分をブラシで塗ります。
3. 「つかむ」で引っぱるか、「揺らす」で自動揺れを開始します。
4. 「材質・反動」「揺らし方」で調整し、「書き出し」から保存します。

PCの「つかむ」では右ドラッグでも慣性の揺れを使えます。Space＋ドラッグは画面移動です。スマートフォンでは下のツールを選び、詳細設定はシートで開きます。

## 開発

Node.js 22以降とnpmを使います。

```sh
npm ci
npm run dev
```

[http://127.0.0.1:4173](http://127.0.0.1:4173)を開きます。開発サーバーはlocalhostにのみ接続します。ポートは環境変数 `PORT` で変更できます。

## ビルド

```sh
npm run build
```

`dist/nurupuru.html` にJS・CSS・WASMを埋め込んだ単一HTMLを生成します。実行時にCDNや外部ライブラリを読み込みません。HTMLを端末へコピーして直接開くこともできます。WebGL2に対応したブラウザが必要です。

計算方式は倍精度WASMスカラーとJavaScriptです。WASMを利用できない場合はJavaScriptで動きます。

ビルドは利用規約・プライバシーポリシーのページも生成します。本文は `src/legal-content.js`、バージョン・GitHubリンク・リポジトリの公開状態は `src/app-info.js` で管理します。

## GitHub Pagesへの公開

`.github/workflows/pages.yml` が `main` へのpushでテスト・ビルド・デプロイを行います。Actions画面の「Deploy GitHub Pages」から手動実行もできます。追加のSecretやZigのインストールは不要です。

公開先を変更する場合：

1. GitHubに公開用のリポジトリを作成します。
2. `package.json` のリポジトリURLと `src/app-info.js` の `GITHUB_REPOSITORY` を変更します。`REPOSITORY_PUBLISHED` は公開済みなら `true` にします。`index.html` のOGP・Xカードの公開URLと画像URLも変更します。
3. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
4. このrepoの `main` をpushします。デプロイ後のURLはworkflowの `github-pages` 環境に表示されます。このrepoの公開先は [https://akeit0.github.io/nurupuru/](https://akeit0.github.io/nurupuru/) です。

ローカルで公開用ファイルを生成する場合：

```sh
npm run build:pages
```

`dist/pages/` に `index.html`、`terms.html`、`privacy.html`、`social-card.jpg` を生成します。このフォルダだけを配信するため、ソース・テスト・開発用ファイルはPagesに含まれません。規約ページからアプリへのリンクも相対URLになり、`/nurupuru/` 以下で動きます。

リンクのサムネイルは `assets/social-card.jpg`（1200×630）です。通常のビルドではこの画像をコピーし、HTMLには埋め込みません。画像を変更する場合は、日本語フォントのある環境で `npm run build:social-card` を実行し、生成された画像もコミットします。描画内容は `scripts/build-social-card.mjs`、OGP・Xカード設定は `index.html` で管理します。

workflowは通常のビルドと全テストを先に実行し、成功した場合だけPages用ファイルをアップロード・デプロイします。設定の詳細は[GitHubのカスタムworkflowの案内](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)を参照してください。

## テスト

```sh
npm test
```

Playwrightでビルド、UI、言語切り替え、入力、背景、保存・書き出し、物理計算を検証します。Chromiumをインストールする場合：

```sh
npx playwright install chromium
```

WindowsではMicrosoft Edgeも使えます。ブラウザを指定する場合は `NURUPURU_BROWSER` に実行ファイルのパスを設定します。

## WASMの再生成

通常の開発には生成済みWASMを使います。`src/wasm/physics.c` を変更するときはZigを用意し、再生成してからビルドします。

```sh
npm run build:wasm
npm run build
```

Zigを指定する場合は環境変数 `ZIG` を使います。WASMは各メッシュが専用のメモリを持ちます。

## ファイル構成

```text
index.html       アプリのHTML
src/             UI、描画、入力、物理、保存・書き出し
src/wasm/        Cの物理カーネルと生成済みWASM
scripts/         開発サーバー、ビルド、WASM生成
tests/           現在の機能の検証
docs/physics.md  物理計算の構成
```

## 利用規約・ライセンス

アプリの利用については[利用規約](terms.html)と[プライバシーポリシー](privacy.html)を確認してください。画像・動画に必要な権利や許諾は利用者自身で確認してください。

ソースコードは[Unlicense](LICENSE)です。お問い合わせ・不具合報告は[GitHub Issues](https://github.com/akeit0/nurupuru/issues)を使います。リポジトリは公開されています。

生成済みWASMに含まれるランタイム・数学コードのライセンス告知は [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) にあり、配布HTMLにも埋め込みます。
