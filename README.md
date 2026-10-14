# ぬるぷる / Nurupuru

画像の動かしたい部分を塗り、つかんだり揺らしたりして遊べるブラウザアプリです。動きを動画や静止画として保存できます。

画像・動画の処理はブラウザ内で行います。編集するファイルをサーバーへ送信しません。アクセス解析、広告、追跡Cookieは使いません。

## 主な機能

- PC・スマートフォンに対応した日本語／英語のUI。
- PNG・JPEG・WebPの読み込み、ブラシ・消しゴム・輪郭選択。
- 塗った部分の動きやすさと、材質・反動の調整。
- つかんで離す操作、画面の移動による慣性、自動揺れ。
- Circle、Sway、Bounce、Pulse、Shakeなどの揺れ方と、速さ・強さ・角度の調整。
- 背景画像の読み込み、位置・倍率の調整。
- PNG、WebMまたはMP4の書き出し。動画形式はブラウザの対応状況によります。
- `.nurupuru`形式で編集を保存・再開。マスクや背景調整のUndo／Redo。

## 使い方

1. 「画像を開く」で画像を読み込むか、サンプルを使います。
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

ソースコードは[Unlicense](LICENSE)です。お問い合わせ・不具合報告は[GitHub Issues](https://github.com/akeit0/nurupuru/issues)を使います。リポジトリは公開準備中です。
