# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

書籍閲覧サイト。EPUBファイルをブラウザ上で読めるシングルページアプリケーション。フレームワークなしの素のHTML/CSS/JSで構成され、epub.jsでインラインリーダーを実装している。GitHub Pagesでホスティング。

## アーキテクチャ

- `index.html` / `style.css` — メインページ（ダークモード対応、レスポンシブ）
- `epubs/` — EPUBファイル置き場
- `covers/` — 表紙画像（デプロイ時にEPUBから自動抽出）
- `books.json` — 書籍メタデータ（デプロイ時にEPUBから自動生成）
- `scripts/deploy.ts` — Denoスクリプト。EPUBを解析し、books.jsonと表紙画像を生成
- `_site/` — ビルド出力先（`--out _site` 指定時）

## 書籍の追加手順

1. EPUBファイルを `epubs/` に配置する
2. コミットしてmainにプッシュする
3. GitHub Actionsが自動で `scripts/deploy.ts` を実行し、`books.json`と`covers/`を生成してデプロイする

ローカルで確認したい場合:
```bash
deno run --allow-read --allow-write --allow-env scripts/deploy.ts
```

## EPUBの要件

deploy.tsが正しくメタデータを抽出するために、EPUBは以下を満たすこと:

- `META-INF/container.xml` から参照される有効なOPFファイル
- OPF内に `<dc:title>`, `<dc:description>` メタデータ
- 表紙画像: `<meta name="cover">` または `cover-image` プロパティで参照
- 目次: `nav.xhtml` 内に `<nav epub:type="toc">`
- 読了時間: XHTML本文の文字数から自動計算（400文字/分）
