
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Parses a Twitter link to extract name and handle using Gemini.
 * Follows guidelines by creating a new GoogleGenAI instance for each request.
 */
export const parseTwitterLinkWithGemini = async (url: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract a username and full name from this Twitter link: ${url}. Return a JSON object with 'name' and 'handle'.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          handle: { type: Type.STRING }
        },
        required: ["name", "handle"]
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return null;
  }
};

/**
 * Generates a friendly bio for a community member.
 * Initializes GoogleGenAI inside the function as per developer guidelines.
 */
export const generateRecognitionInsight = async (candidateName: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Write a 1-sentence friendly and social bio for a community member named ${candidateName} who is part of a social map. Focus on their presence and contributions to the group. Keep it warm and social.`
  });
  return response.text.trim();
};

/**
 * Analyzes a user's social fingerprint based on activity in the recognition graph.
 * Uses gemini-3-flash-preview for basic text analysis tasks.
 */
export const generateSocialFingerprint = async (handle: string, votesCount: number) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze a user's social profile in a Web3 recognition graph. Handle: ${handle}, Votes cast: ${votesCount}. Write a 2-sentence sophisticated analysis of their "Social Fingerprint". Use terms like 'decentralized influence', 'community trust', and 'network node'. Keep it encouraging and high-tech.`
  });
  return response.text.trim();
};
