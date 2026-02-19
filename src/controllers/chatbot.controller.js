import { generateGeminiResponse } from '../models/chatbot.model.js';

async function chatWithGemini(req, res) {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const reply = await generateGeminiResponse(message);
    res.json({ reply });
  } catch (err) {
    console.error('Chat controller error:', err);
    res.status(500).json({ error: 'Gemini error' });
  }
}

export { chatWithGemini };