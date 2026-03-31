#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * epubs/ディレクトリ内のEPUBファイルからメタデータを抽出し、
 * books.jsonとcovers/を生成するデプロイスクリプト。
 *
 * 使い方:
 *   deno run --allow-read --allow-write --allow-env scripts/deploy.ts
 */

import JSZip from "https://esm.sh/jszip@3.10.1";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

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

const CHARS_PER_MINUTE = 400;
const DEFAULT_PLACEHOLDER_COLOR = "#78716c";

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

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "text/html");
  if (!doc) throw new Error("XMLパースに失敗");
  return doc;
}

async function getOpfPath(zip: JSZip): Promise<string> {
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("container.xmlが見つかりません");
  const doc = parseXml(containerXml);
  const rootfile = doc.querySelector("rootfile");
  const fullPath = rootfile?.getAttribute("full-path");
  if (!fullPath) throw new Error("content.opfのパスが見つかりません");
  return fullPath;
}

interface OpfData {
  title: string;
  subtitle: string;
  date: string;
  coverHref: string | null;
  navHref: string | null;
  spineItems: string[];
  opfDir: string;
}

async function parseOpf(zip: JSZip, opfPath: string): Promise<OpfData> {
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) : "";
  const opfText = await zip.file(opfPath)?.async("string");
  if (!opfText) throw new Error(`${opfPath}が見つかりません`);

  const doc = parseXml(opfText);

  // メタデータ抽出
  const title = doc.querySelector("dc\\:title, title")?.textContent?.trim() ?? "";
  const subtitle = doc.querySelector("dc\\:description, description")?.textContent?.trim() ?? "";

  // 日付: dc:dateが空ならdcterms:modifiedから取得
  let date = doc.querySelector("dc\\:date, date[id]")?.textContent?.trim() ?? "";
  if (!date) {
    for (const meta of doc.querySelectorAll("meta")) {
      if (meta.getAttribute("property") === "dcterms:modified") {
        date = formatDate(meta.textContent?.trim() ?? "");
        break;
      }
    }
  }

  // カバー画像: meta[name="cover"]のcontent → manifestのid → href
  let coverHref: string | null = null;
  for (const meta of doc.querySelectorAll("meta")) {
    if (meta.getAttribute("name") === "cover") {
      const coverId = meta.getAttribute("content");
      if (coverId) {
        const coverItem = doc.querySelector(`item[id="${coverId}"]`);
        if (coverItem) {
          coverHref = coverItem.getAttribute("href");
        }
      }
      break;
    }
  }
  if (!coverHref) {
    for (const item of doc.querySelectorAll("item")) {
      if (item.getAttribute("properties")?.includes("cover-image")) {
        coverHref = item.getAttribute("href");
        break;
      }
    }
  }

  // nav.xhtmlの特定: properties="nav"を持つitem
  let navHref: string | null = null;
  for (const item of doc.querySelectorAll("item")) {
    if (item.getAttribute("properties")?.includes("nav")) {
      navHref = item.getAttribute("href");
      break;
    }
  }

  // spine: itemrefのidref → manifestのhref
  const spineItems: string[] = [];
  const itemrefs = doc.querySelectorAll("itemref");
  for (const itemref of itemrefs) {
    const idref = itemref.getAttribute("idref");
    if (idref) {
      const item = doc.querySelector(`item[id="${idref}"]`);
      const href = item?.getAttribute("href");
      if (href) {
        spineItems.push(href);
      }
    }
  }

  return { title, subtitle, date, coverHref, navHref, spineItems, opfDir };
}

async function extractToc(zip: JSZip, opfDir: string, navHref: string): Promise<string[]> {
  const navPath = opfDir ? `${opfDir}/${navHref}` : navHref;
  const navText = await zip.file(navPath)?.async("string");
  if (!navText) return [];

  const doc = parseXml(navText);
  const toc: string[] = [];

  let navEl: Element | null = null;
  for (const nav of doc.querySelectorAll("nav")) {
    const epubType = nav.getAttribute("epub:type");
    if (epubType === "toc") {
      navEl = nav;
      break;
    }
  }
  if (!navEl) return [];

  const topOl = navEl.querySelector("ol");
  if (!topOl) return [];

  for (const li of topOl.children) {
    if (li.tagName === "LI") {
      const a = li.querySelector(":scope > a");
      if (a) {
        const text = a.textContent?.trim();
        if (text) toc.push(text);
      }
    }
  }

  return toc;
}

async function countCharsFromXhtml(
  zip: JSZip,
  opfDir: string,
  spineItems: string[],
): Promise<number> {
  let total = 0;
  const skipFiles = ["cover.xhtml", "title_page.xhtml", "nav.xhtml"];

  for (const href of spineItems) {
    const filename = href.split("/").pop() ?? "";
    if (skipFiles.includes(filename)) continue;

    const filePath = opfDir ? `${opfDir}/${href}` : href;
    const xhtmlText = await zip.file(filePath)?.async("string");
    if (!xhtmlText) continue;

    const doc = parseXml(xhtmlText);
    const body = doc.querySelector("body");
    if (!body) continue;

    // SVG要素を除外（Mermaid図がSVGに変換されている）
    for (const svg of body.querySelectorAll("svg")) {
      svg.remove();
    }

    const text = body.textContent ?? "";
    const normalized = text.replace(/\s+/g, "").length;
    total += normalized;
  }

  return total;
}

async function processEpub(
  epubPath: string,
  filename: string,
  coversDir: string,
): Promise<BookMeta> {
  const data = await Deno.readFile(epubPath);
  const zip = await JSZip.loadAsync(data);
  const epubStat = await Deno.stat(epubPath);

  const opfPath = await getOpfPath(zip);
  const opf = await parseOpf(zip, opfPath);

  const toc = opf.navHref
    ? await extractToc(zip, opf.opfDir, opf.navHref)
    : [];

  const totalChars = await countCharsFromXhtml(zip, opf.opfDir, opf.spineItems);

  const slug = toSlug(opf.title);
  let coverImage: string | null = null;
  if (opf.coverHref) {
    const coverPath = opf.opfDir ? `${opf.opfDir}/${opf.coverHref}` : opf.coverHref;
    const coverData = await zip.file(coverPath)?.async("uint8array");
    if (coverData) {
      const ext = opf.coverHref.split(".").pop() ?? "jpg";
      const coverFilename = `${slug}.${ext}`;
      await Deno.writeFile(join(coversDir, coverFilename), coverData);
      coverImage = `covers/${coverFilename}`;
    }
  }

  return {
    title: opf.title,
    subtitle: opf.subtitle,
    color: DEFAULT_PLACEHOLDER_COLOR,
    filename,
    coverImage,
    date: opf.date,
    size: formatSize(epubStat.size),
    readingTime: calcReadingTime(totalChars),
    readingTimeMinutes: Math.round(totalChars / CHARS_PER_MINUTE),
    toc,
  };
}

async function main() {
  const siteRoot = new URL("../", import.meta.url).pathname;
  const epubsDir = join(siteRoot, "epubs");
  const coversDir = join(siteRoot, "covers");
  await ensureDir(coversDir);

  const books: BookMeta[] = [];

  for await (const entry of Deno.readDir(epubsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".epub")) continue;

    const epubPath = join(epubsDir, entry.name);
    try {
      const book = await processEpub(epubPath, entry.name, coversDir);
      books.push(book);
      console.log(`📖 ${book.title} (${book.size}, ${book.readingTime})`);
    } catch (err) {
      console.error(`⚠️  ${entry.name}: ${err}`);
    }
  }

  books.sort((a, b) => a.title.localeCompare(b.title, "ja"));

  const booksJsonPath = join(siteRoot, "books.json");
  await Deno.writeTextFile(booksJsonPath, JSON.stringify(books, null, 2));

  console.log(`\n✅ ${books.length}冊のデータを生成しました`);
  console.log(`📄 ${booksJsonPath}`);
}

main();
