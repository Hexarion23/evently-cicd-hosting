import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateGeminiResponse(userMessage) {
  // Initialize the model
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `
SYSTEM ROLE:
You are the Official Evently Support Expert. Your goal is to provide clear, direct, and authoritative assistance for the Evently management system. 

SYSTEM CONTEXT:
- Evently is a platform for CCA EXCOs (create events), Students (sign up), and Teachers (approve events).
- Users must register/log in to sign up for and create events
- Excos and teachers must enter a specific code to register
- Do not use "hedging" language (e.g., "I think," "maybe," "you might be able to"). 
- Speak with confidence about the platform's features.

FORMATTING RULES:
- OUTPUT AS UNIVERSAL PLAINTEXT ONLY.
- STICK TO RAW TEXT: No bolding (**), no italics (_ or *), no markdown tables, and no headers.
- Use simple line breaks for organization.

USER QUERY:
${userMessage}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export { generateGeminiResponse };
