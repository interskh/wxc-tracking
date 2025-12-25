import * as cheerio from "cheerio";

export interface ForumPost {
  id: string;
  title: string;
  url: string;
  author: string;
  date: string;
  bytes: number;
  forum: string;
}

export async function scrapeArchivePage(url: string): Promise<ForumPost[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WebpageTracker/1.0; +https://github.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const posts: ForumPost[] = [];

  // Parse the archive page structure
  // Each post is in a <tr> with class="cnLarge" td containing:
  // • [linkdot] #跟帖# <a>title</a> [forum] - <strong><em>author</em></strong>(bytes) <i>date</i>
  $("tr").each((_, row) => {
    const $td = $(row).find("td.cnLarge");
    if ($td.length === 0) return;

    const tdHtml = $td.html() || "";
    const tdText = $td.text();

    // Find the post link (second <a> tag, not the linkdot one)
    const $links = $td.find("a");
    let $postLink = null;
    let href = "";

    for (let i = 0; i < $links.length; i++) {
      const $link = $links.eq(i);
      if (!$link.hasClass("linkdot")) {
        $postLink = $link;
        href = $link.attr("href") || "";
        break;
      }
    }

    if (!$postLink || !href) return;

    // Extract post ID from href (e.g., /cfzh/46702.html -> 46702)
    const idMatch = href.match(/\/(\d+)\.html/);
    if (!idMatch) return;

    // Build full URL
    const fullUrl = href.startsWith("http")
      ? href
      : `https://bbs.wenxuecity.com${href.startsWith("/") ? "" : "/"}${href}`;

    // Get title - include #跟帖# prefix if present
    let title = $postLink.text().trim();

    // Check for #跟帖# prefix before the link
    if (tdHtml.includes("#跟帖#")) {
      title = "#跟帖# " + title;
    }

    // Extract forum name from [brackets]
    const forumMatch = tdText.match(/\[([^\]]+)\]/);
    const forum = forumMatch ? forumMatch[1] : "";

    // Extract author from <strong><em>...</em></strong>
    const $author = $td.find("strong em");
    const author = $author.text().trim();

    // Extract bytes from (XXXX bytes)
    const bytesMatch = tdText.match(/\((\d+)\s*bytes?\s*\)/i);
    const bytes = bytesMatch ? parseInt(bytesMatch[1], 10) : 0;

    // Extract date from <i>...</i>
    const $date = $td.find("i");
    const date = $date.text().trim();

    posts.push({
      id: idMatch[1],
      title,
      url: fullUrl,
      author,
      date,
      bytes,
      forum,
    });
  });

  return posts;
}

export function deduplicatePosts(posts: ForumPost[]): ForumPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

/**
 * Scrape the full content from a forum post page.
 * Returns the post body text content.
 */
export async function scrapeSubpageContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WebpageTracker/1.0; +https://github.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // wenxuecity forum post content is in #msgbodyContent
  const $content = $("#msgbodyContent");

  if ($content.length > 0) {
    // Get text content, clean up whitespace
    return $content.text().trim().replace(/\s+/g, " ");
  }

  // Fallback for other page structures
  const fallbackSelectors = [
    "#articleBody",
    "#postbody",
    ".post-content",
  ];

  for (const selector of fallbackSelectors) {
    const $fallback = $(selector);
    if ($fallback.length > 0) {
      const text = $fallback.text().trim();
      if (text.length > 0) {
        return text.replace(/\s+/g, " ");
      }
    }
  }

  return "";
}
