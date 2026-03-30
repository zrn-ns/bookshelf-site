# Bookshelf

Claude Codeの[/book-writingスキル](https://github.com/zrn-ns/book-writing-skill)で生成した技術書コレクション。

**サイト:** https://zrn-ns.github.io/bookshelf-site/

[![Bookshelf](screenshot.png)](https://zrn-ns.github.io/bookshelf-site/)

## 収録書籍

| タイトル | テーマ |
|---------|--------|
| ハーネスエンジニアリング入門 | AIエージェントの実行環境設計 |
| Superpowers完全ガイド | Claude Codeのスキルフレームワーク |
| Claude Code Channels完全ガイド | メッセージングアプリ連携 |
| Everything Claude Codeリポジトリ解説 | 公式OSSリポジトリの構造 |
| Claude Certified Architect対策本 | CCA-F認定試験対策（模擬試験120問） |

## 機能

- EPUB形式でダウンロード
- ブラウザ内EPUBリーダー（epub.js）
- 目次の展開表示
- ソート（タイトル / 新しい順 / 読了時間）

## 書籍データの更新

```bash
# bookshelfの各書籍をビルド済みの状態で実行
deno run --allow-read --allow-write scripts/deploy.ts ~/projects/bookshelf

# コミット＆プッシュでGitHub Pagesに反映
git add -A && git commit -m "👍 書籍データを更新" && git push
```

`scripts/deploy.ts` が各書籍の `book.yaml`・`src/*.md`・`dist/*.epub`・`assets/cover.jpg` を読み取り、`books.json`・`epubs/`・`covers/` を生成します。

## 技術構成

- 静的HTML + CSS + JS（フレームワーク不使用）
- [epub.js](https://github.com/futurepress/epub.js)（ブラウザ内EPUBリーダー）
- GitHub Pages
- Deno（デプロイスクリプト）
