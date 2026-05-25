import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const documents = [
  ["01_프로그램_설계서.md", "01-program-design.html", "1", "프로그램 설계서"],
  ["02_상세_타임테이블.md", "02-timetable.html", "2", "상세 타임테이블"],
  ["03_참가자_실습워크북.md", "03-participant-workbook.html", "3", "참가자 실습 워크시트"],
  ["04_Cowork_업무생산성_프롬프트팩.md", "04-cowork-prompt-pack.html", "4", "Cowork 프롬프트팩"],
  ["05_운영자_체크리스트.md", "05-operator-checklist.html", "5", "운영자 체크리스트"],
  ["06_슬라이드_아웃라인.md", "06-slide-outline.html", "6", "슬라이드 아웃라인"],
  ["07_최종_워크샵_운영안_AI_Native_Cowork_MAX_VCTeam.md", "07-final-runbook.html", "7", "최종 워크샵 운영안"],
  ["08_AI_Native_기술의_현재와_미래_30분_강의안.md", "08-ai-native-lecture.html", "8", "AI Native 30분 강의안"],
  ["09_MAX_VCTeam_소개_및_데모_시나리오.md", "09-max-vcteam-demo.html", "9", "MAX VCTeam 소개와 데모"],
];

const pageMap = new Map(documents.map(([source, target]) => [source, target]));

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const cleanHref = href.trim();
    const converted = pageMap.get(cleanHref) ? pageMap.get(cleanHref) : cleanHref;
    const prefix = pageMap.has(cleanHref) ? "" : cleanHref.startsWith("assets/") || cleanHref.endsWith(".md") ? "../" : "";
    return `<a href="${prefix}${escapeHtml(converted)}">${label}</a>`;
  });
  return html;
}

function isTableStart(lines, index) {
  return (
    index + 1 < lines.length &&
    lines[index].includes("|") &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
  );
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines, index) {
  const headers = splitTableRow(lines[index]);
  const rows = [];
  let cursor = index + 2;
  while (cursor < lines.length && lines[cursor].includes("|") && lines[cursor].trim() !== "") {
    rows.push(splitTableRow(lines[cursor]));
    cursor += 1;
  }

  const thead = `<thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;

  return [`<div class="table-wrap"><table>${thead}${tbody}</table></div>`, cursor];
}

function renderList(lines, index) {
  const ordered = /^\d+\.\s+/.test(lines[index]);
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let cursor = index;
  const pattern = ordered ? /^\d+\.\s+(.+)$/ : /^-\s+(.+)$/;
  while (cursor < lines.length) {
    const match = lines[cursor].match(pattern);
    if (!match) break;
    items.push(`<li>${inlineMarkdown(match[1])}</li>`);
    cursor += 1;
  }
  return [`<${tag}>${items.join("")}</${tag}>`, cursor];
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let cursor = 0;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  while (cursor < lines.length) {
    const line = lines[cursor];
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      cursor += 1;
      continue;
    }

    if (trimmed === "---") {
      flushParagraph();
      html.push("<hr />");
      cursor += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      const language = trimmed.slice(3).trim();
      const code = [];
      cursor += 1;
      while (cursor < lines.length && !lines[cursor].trim().startsWith("```")) {
        code.push(lines[cursor]);
        cursor += 1;
      }
      cursor += 1;
      html.push(`<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (isTableStart(lines, cursor)) {
      flushParagraph();
      const [table, nextCursor] = renderTable(lines, cursor);
      html.push(table);
      cursor = nextCursor;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      cursor += 1;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      const quote = [];
      while (cursor < lines.length && lines[cursor].trim().startsWith("> ")) {
        quote.push(lines[cursor].trim().replace(/^>\s?/, ""));
        cursor += 1;
      }
      html.push(`<blockquote>${quote.map((part) => `<p>${inlineMarkdown(part)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (/^(-|\d+\.)\s+/.test(trimmed)) {
      flushParagraph();
      const [list, nextCursor] = renderList(lines, cursor);
      html.push(list);
      cursor = nextCursor;
      continue;
    }

    paragraph.push(trimmed);
    cursor += 1;
  }

  flushParagraph();
  return html.join("\n");
}

function renderPage({ source, target, number, title, body }) {
  const sourceHref = `../${encodeURI(source)}`;
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <title>${escapeHtml(title)} · 에이벤처스 워크샵</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="icon" href="../assets/brand/aventures-logo.jpg" />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../assets/doc.css" />
  </head>
  <body>
    <header class="doc-topbar">
      <a href="../index.html#materials" class="back-link">전체 자료</a>
      <div class="doc-brand" aria-label="에이벤처스 워크샵">
        <img src="../assets/brand/aventures-logo.jpg" alt="에이벤처스 로고" />
        <span>AVentures Workshop</span>
      </div>
      <a href="${sourceHref}" class="source-link">Markdown 원문</a>
    </header>
    <main class="doc-shell">
      <aside class="doc-meta">
        <span>${escapeHtml(number)}</span>
        <p>AVentures<br />AI Native Workshop</p>
      </aside>
      <article class="doc-content">
        <div class="doc-kicker">Material ${escapeHtml(number)}</div>
        ${body}
      </article>
    </main>
  </body>
</html>`;
}

mkdirSync("docs", { recursive: true });

for (const [source, target, number, fallbackTitle] of documents) {
  const markdown = readFileSync(source, "utf8");
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallbackTitle;
  const body = renderMarkdown(markdown);
  writeFileSync(
    `docs/${target}`,
    renderPage({ source, target, number, title, body }),
    "utf8",
  );
  console.log(`built docs/${target} from ${basename(source)}`);
}
