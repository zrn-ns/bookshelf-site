# Bookshelf

Claude Codeの[/book-writingスキル](https://github.com/zrn-ns/book-writing-skill)で生成した技術書コレクション。

**サイト:** https://zrn-ns.github.io/bookshelf-site/

[![Bookshelf](screenshot.png)](https://zrn-ns.github.io/bookshelf-site/)

## OPDSカタログ

OPDSリーダーアプリ（KOReader、Thorium Reader、Moon+ Reader等）から書籍を閲覧・ダウンロードできます。

**OPDS URL:** `https://zrn-ns.github.io/bookshelf-site/opds/catalog.xml`

認証不要（ユーザ名・パスワードは空欄）で利用できます。

## 技術構成

- 静的HTML + CSS + JS（フレームワーク不使用）
- [epub.js](https://github.com/futurepress/epub.js)（ブラウザ内EPUBリーダー）
- GitHub Pages
- Deno（デプロイスクリプト）
