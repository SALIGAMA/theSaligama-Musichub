export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Missing message" });

  const apiKey = process.env.OPENAI_API_KEY;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a music assistant for a YouTube-based music app.
When the user describes what they want to listen to, respond with EXACTLY this JSON format:
{
  "message": "your friendly reply here (1 sentence)",
  "query": "youtube search query here"
}

Examples:
- User: "I'm feeling sad" → {"message": "Here are some soothing songs for you.", "query": "sad emotional songs playlist"}
- User: "gym time" → {"message": "Let's get pumped up!", "query": "gym workout motivation songs 2024"}
- User: "something like Srivalli" → {"message": "You'll love these similar Telugu hits!", "query": "songs like Srivalli Telugu romantic"}
- User: "play AR Rahman" → {"message": "AR Rahman's finest coming right up!", "query": "AR Rahman best songs"}

Only return valid JSON, nothing else.

User message: ${message}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 150 },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Gemini API error");

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) throw new Error("Empty response from Gemini");

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\n?|^```\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
