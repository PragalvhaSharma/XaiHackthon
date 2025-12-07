import { NextRequest, NextResponse } from "next/server";

interface ParsedJob {
  title: string;
  team: string;
  location: string;
  type: string;
  description: string;
}

// Strip HTML tags and clean up text
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Use Grok to intelligently parse job details
async function parseWithGrok(textContent: string, url: string): Promise<ParsedJob | null> {
  const XAI_API_KEY = process.env.XAI_API_KEY;
  
  if (!XAI_API_KEY) {
    console.warn("XAI_API_KEY not set, falling back to regex parsing");
    return null;
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          {
            role: "system",
            content: `You are a job posting parser. Extract structured job information from the provided text. Return ONLY valid JSON with no markdown formatting or code blocks.`
          },
          {
            role: "user",
            content: `Parse this job posting and extract the following fields as JSON:
- title: The job title
- team: The company/team name
- location: The job location
- type: Employment type (Full-time, Part-time, Contract, Internship)
- description: A comprehensive description including the role overview, responsibilities, and requirements (combine all relevant sections)

Job posting text:
${textContent.slice(0, 8000)}

Return ONLY the JSON object, no explanation or markdown.`
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("Grok API error:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return null;

    // Clean up response - remove markdown code blocks if present
    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(jsonStr);
    
    return {
      title: parsed.title || "",
      team: parsed.team || "",
      location: parsed.location || "",
      type: parsed.type || "Full-time",
      description: parsed.description || "",
    };
  } catch (error) {
    console.error("Error parsing with Grok:", error);
    return null;
  }
}

// Fallback regex-based parsing for Greenhouse
function parseGreenhouseJob(text: string): ParsedJob {
  // Extract title
  const titlePatterns = [
    /Job Application for ([^a]+) at/i,
    /^#?\s*([^\n]+)/m,
  ];
  
  let title = "";
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      title = match[1].trim();
      break;
    }
  }

  // Extract location
  const locationMatch = text.match(/(?:Bastrop|San Francisco|Remote|New York|Austin|Seattle|Los Angeles|Chicago|Boston|Denver|Miami|Atlanta|Dallas|Houston|Portland|Phoenix|Philadelphia|San Diego|San Jose|Palo Alto|Mountain View)[^,\n]*/i);
  const location = locationMatch?.[0]?.trim() || "";

  // Extract company/team - look for "at X" or "About X" patterns
  const teamMatch = text.match(/(?:at\s+|About\s+)(xAI|X\s+Money|X\s+Platform|X\b)/i);
  const team = teamMatch?.[1]?.trim() || "X";

  // Get the main content as description
  const aboutMatch = text.match(/About (?:the Role|xAI)[\s\S]*?(?:Apply|Submit application|$)/i);
  const description = aboutMatch?.[0]?.trim().slice(0, 5000) || text.slice(0, 3000);

  return {
    title,
    team,
    location,
    type: "Full-time",
    description,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status}` },
        { status: 400 }
      );
    }

    const html = await response.text();
    const textContent = stripHtml(html);

    // Try AI parsing first
    let parsed = await parseWithGrok(textContent, url);

    // Fallback to regex for Greenhouse
    if (!parsed || !parsed.title) {
      if (url.includes("greenhouse.io")) {
        parsed = parseGreenhouseJob(textContent);
      }
    }

    if (!parsed || !parsed.title) {
      return NextResponse.json(
        { error: "Could not parse job details from this URL. Try pasting the job description manually." },
        { status: 400 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Failed to parse job URL:", error);
    return NextResponse.json(
      { error: "Failed to parse job URL" },
      { status: 500 }
    );
  }
}

