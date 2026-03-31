#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * bookshelfから書籍メタデータとEPUBを収集し、
 * books.jsonとepubs/を生成するデプロイスクリプト。
 *
 * 使い方:
 *   deno run --allow-read --allow-write scripts/deploy.ts /path/to/bookshelf
 */

import { parse as parseYaml } from "https://deno.land/std@0.224.0/yaml/parse.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

interface BookMeta {
  title: string;
  subtitle: string;
  color: string;
  filename: string;
  coverImage: string | null;
  date: string;
  size: string;
  readingTime: string;
  readingTimeMinutes: number;
  toc: string[];
}

interface BookYaml {
  title: string;
  subtitle?: string;
  date?: string;
  cover?: { color?: string };
}

const CHARS_PER_MINUTE = 400;

function toSlug(title: string): string {
  return title
    .replace(/[\/\\:*?"<>|–—]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function calcReadingTime(totalChars: number): string {
  const minutes = Math.round(totalChars / CHARS_PER_MINUTE);
  if (minutes < 60) return `約${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `約${hours}時間`;
  return `約${hours}時間${remaining}分`;
}

async function extractToc(srcDir: string): Promise<string[]> {
  const toc: string[] = [];
  const files: string[] = [];

  for await (const entry of Deno.readDir(srcDir)) {
    if (entry.isFile && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
      files.push(entry.name);
    }
  }

  files.sort();

  for (const file of files) {
    const content = await Deno.readTextFile(join(srcDir, file));
    const match = content.match(/^# (.+)$/m);
    if (match) {
      toc.push(match[1]);
    }
  }

  return toc;
}

async function countChars(srcDir: string): Promise<number> {
  let total = 0;
  for await (const entry of Deno.readDir(srcDir)) {
    if (entry.isFile && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
      const content = await Deno.readTextFile(join(srcDir, entry.name));
      // Mermaidブロックを除外
      const stripped = content.replace(/```mermaid[\s\S]*?```/g, "");
      // 空行を除外し、残りの文字数をカウント
      const lines = stripped.split("\n").filter((line) => line.trim().length > 0);
      total += lines.join("").length;
    }
  }
  return total;
}

async function findEpub(distDir: string): Promise<string | null> {
  try {
    for await (const entry of Deno.readDir(distDir)) {
      if (entry.isFile && entry.name.endsWith(".epub")) {
        return join(distDir, entry.name);
      }
    }
  } catch {
    // dist/ がない場合
  }
  return null;
}

async function main() {
  const bookshelfPath = Deno.args[0];
  if (!bookshelfPath) {
    console.error("使い方: deno run --allow-read --allow-write scripts/deploy.ts /path/to/bookshelf");
    Deno.exit(1);
  }

  const siteRoot = new URL("../", import.meta.url).pathname;
  const epubsDir = join(siteRoot, "epubs");
  const coversDir = join(siteRoot, "covers");
  await ensureDir(epubsDir);
  await ensureDir(coversDir);

  const books: BookMeta[] = [];

  for await (const entry of Deno.readDir(bookshelfPath)) {
    if (!entry.isDirectory) continue;

    const bookDir = join(bookshelfPath, entry.name);
    const yamlPath = join(bookDir, "book.yaml");

    try {
      await Deno.stat(yamlPath);
    } catch {
      continue;
    }

    const yamlContent = await Deno.readTextFile(yamlPath);
    const yaml = parseYaml(yamlContent) as BookYaml;

    const srcDir = join(bookDir, "src");
    const distDir = join(bookDir, "dist");

    const epubPath = await findEpub(distDir);
    if (!epubPath) {
      console.warn(`⚠️  ${yaml.title}: EPUBが見つかりません`);
      continue;
    }

    const epubStat = await Deno.stat(epubPath);
    const toc = await extractToc(srcDir);
    const totalChars = await countChars(srcDir);

    const slug = toSlug(yaml.title);
    const filename = `${slug}.epub`;

    await copy(epubPath, join(epubsDir, filename), { overwrite: true });

    // 表紙画像のコピー
    const coverSrc = join(bookDir, "assets", "cover.jpg");
    const coverFilename = `${slug}.jpg`;
    let coverImage: string | null = null;
    try {
      await Deno.stat(coverSrc);
      await copy(coverSrc, join(coversDir, coverFilename), { overwrite: true });
      coverImage = `covers/${coverFilename}`;
    } catch {
      // 表紙画像がない場合はnull
    }

    books.push({
      title: yaml.title,
      subtitle: yaml.subtitle ?? "",
      color: yaml.cover?.color ?? "#78716c",
      filename,
      coverImage,
      date: yaml.date ?? "",
      size: formatSize(epubStat.size),
      readingTime: calcReadingTime(totalChars),
      readingTimeMinutes: Math.round(totalChars / CHARS_PER_MINUTE),
      toc,
    });

    console.log(`📖 ${yaml.title} (${formatSize(epubStat.size)}, ${calcReadingTime(totalChars)})`);
  }

  books.sort((a, b) => a.title.localeCompare(b.title, "ja"));

  const booksJsonPath = join(siteRoot, "books.json");
  await Deno.writeTextFile(booksJsonPath, JSON.stringify(books, null, 2));

  console.log(`\n✅ ${books.length}冊のデータを生成しました`);
  console.log(`📄 ${booksJsonPath}`);
  console.log(`📁 ${epubsDir}`);
}

main();
