
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Using the standard lightweight, blazing-fast model
const GEMINI_MODEL = "gemini-1.5-flash"; 
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

function buildSystemInstruction() {
  return {
    parts: [{
      text: "You are an elegant, highly knowledgeable art curator at the Patina Gallery standing directly in front of the artwork with a visitor. Keep your responses concise, elegant, under 3 sentences, and politely decline to talk about subjects outside the realm of art history or this specific painting."
    }]
  };
}

function createRequestPayload(text, history, activeArtwork) {
  const contents = [];

  // Reconstruct chat history using Google's precise structural signature
  if (Array.isArray(history)) {
    history.forEach((entry) => {
      if (!entry || !entry.role || typeof entry.content !== "string") return;
      
      // Map frontend 'assistant' roles down to Google's required 'model' keyword
      const apiRole = entry.role === "assistant" ? "model" : "user";
      
      contents.push({
        role: apiRole,
        parts: [{ text: entry.content }]
      });
    });
  }

  // Inject active artwork context right alongside the user's latest incoming inquiry
  const artworkContext = `[Context - Active Artwork: "${activeArtwork?.title || 'Unknown'}" by ${activeArtwork?.artist || 'Unknown'}. Medium: ${activeArtwork?.medium || 'N/A'}. Dept: ${activeArtwork?.department || 'N/A'}]`;
  
  contents.push({
    role: "user",
    parts: [{ text: `${artworkContext} Visitor Question: ${text}` }]
  });

  return {
    contents,
    systemInstruction: buildSystemInstruction(),
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 180,
    }
  };
}

async function sendGeminiRequest(body) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error("Gemini API request failed");
    error.status = response.status;
    error.details = responseBody;
    throw error;
  }

  return responseBody;
}

function extractTextFromGeminiResponse(data) {
  // Extract output text cleanly from Google's response object nesting path
  const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (textResult) {
    return textResult.trim();
  }
  return "I’m here to help, but I couldn’t craft a clear response right now.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "Gemini API key is not configured." });
  }

  const payload = req.body;
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const history = Array.isArray(payload?.history) ? payload.history : [];
  const activeArtwork = typeof payload?.activeArtwork === "object" ? payload.activeArtwork : {};

  if (!text) {
    return res.status(400).json({ error: "Request must include a text message." });
  }

  try {
    const requestBody = createRequestPayload(text, history, activeArtwork);
    const geminiResponse = await sendGeminiRequest(requestBody);
    const reply = extractTextFromGeminiResponse(geminiResponse);

    return res.status(200).json({ text: reply });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ text: "The gallery is quite busy right now! Give me just a moment to catch my breath." });
    }
    console.error("/api/chat error:", error?.status || error, error?.details || "no details");
    return res.status(500).json({ text: "The gallery is having trouble responding right now. Please try again in a moment." });
  }
}
