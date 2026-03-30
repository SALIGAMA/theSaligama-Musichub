export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Missing message" });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a music assistant for a YouTube-based music app. 
When the user describes what they want to listen to, respond with EXACTLY two things:
1. A short friendly message (1 sentence)
2. A YouTube search query to find that music

Always respond in this exact JSON format:
{
  "message": "your friendly reply here",
  "query": "youtube search query here"
}

Examples:
- User: "I'm feeling sad" → {"message": "Here are some soothing songs for you.", "query": "sad emotional songs playlist"}
- User: "gym time" → {"message": "Let's get pumped up!", "query": "gym workout motivation songs 2024"}
- User: "something like Srivalli" → {"message": "You'll love these similar Telugu hits!", "query": "songs like Srivalli Telugu romantic"}
- User: "play AR Rahman" → {"message": "AR Rahman's finest coming right up!", "query": "AR Rahman best songs"}
Only return valid JSON, nothing else.`,
          },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI error");

    const raw = data.choices[0].message.content.trim();
    const parsed = JSON.parse(raw);

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
