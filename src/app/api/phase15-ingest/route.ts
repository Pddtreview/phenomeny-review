import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const sheetRow = await req.json();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are an institutional AI archivist.

Return STRICT JSON only with this exact structure:
{
  "canonical_title": "",
  "iso_date": "",
  "event_type": "",
  "primary_entity": "",
  "secondary_entities": [],
  "summary": ""
}

No commentary.
No markdown.
JSON only.
`,
        },
        {
          role: "user",
          content: JSON.stringify(sheetRow),
        },
      ],
    });

    const structured = response.choices[0].message.content;

    return NextResponse.json({
      success: true,
      structured,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Structuring failed" }, { status: 500 });
  }
}
