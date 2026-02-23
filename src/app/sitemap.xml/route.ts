import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");

  const { data: articles } = await supabase
    .from("articles")
    .select("slug, created_at")
    .order("created_at", { ascending: false });

  const articleEntries = (articles || [])
    .map((a: { slug: string; created_at: string }) =>
      `  <url>
    <loc>${baseUrl}/articles/${a.slug}</loc>
    <lastmod>${new Date(a.created_at).toISOString()}</lastmod>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
  </url>
${articleEntries}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
