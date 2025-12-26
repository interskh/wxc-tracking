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
 * Check if a URL is a blog URL (vs forum archive)
 */
export function isBlogUrl(url: string): boolean {
  return url.includes("blog.wenxuecity.com/myblog/");
}

/**
 * Scrape a wenxuecity blog page for posts.
 * Blog URLs look like: https://blog.wenxuecity.com/myblog/82458/202512/
 */
export async function scrapeBlogPage(url: string): Promise<ForumPost[]> {
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

  // Extract blog ID from URL for constructing full URLs
  const blogIdMatch = url.match(/\/myblog\/(\d+)\//);
  const blogId = blogIdMatch ? blogIdMatch[1] : "";

  // Each blog post is in a div.articleCell
  $(".articleCell").each((_, cell) => {
    const $cell = $(cell);

    // Get the title link
    const $titleLink = $cell.find(".atc_title a");
    const href = $titleLink.attr("href") || "";
    const title = $titleLink.text().trim();

    if (!href || !title) return;

    // Extract post ID from href (e.g., /myblog/82458/202512/21135.html -> blog_82458_21135)
    const postIdMatch = href.match(/\/myblog\/(\d+)\/(\d+)\/(\d+)\.html/);
    if (!postIdMatch) return;

    const id = `blog_${postIdMatch[1]}_${postIdMatch[3]}`;

    // Build full URL
    const fullUrl = href.startsWith("http")
      ? href
      : `https://blog.wenxuecity.com${href}`;

    // Get date from .atc_tm (format: 2025-12-25 16:34:21)
    // Keep full datetime for proper sorting
    const date = $cell.find(".atc_tm").text().trim();

    posts.push({
      id,
      title,
      url: fullUrl,
      author: "", // Blog author is the blog owner, could extract from page
      date,
      bytes: 1000, // Blogs don't show bytes, assume content exists
      forum: "博客",
    });
  });

  return posts;
}

/**
 * Scrape content from a blog post page.
 */
export async function scrapeBlogContent(url: string): Promise<string> {
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

  // Blog content is in .articalContent (note: typo in their HTML)
  const $content = $(".articalContent");

  if ($content.length > 0) {
    return $content.text().trim().replace(/\s+/g, " ");
  }

  return "";
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

  // Fallback for other page structures (including blog pages)
  const fallbackSelectors = [
    ".articalContent", // wenxuecity blog (note: typo in their HTML)
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
