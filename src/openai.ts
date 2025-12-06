// Shared OpenAI client with Braintrust tracing
// When BRAINTRUST_API_KEY is set, all LLM calls are auto-traced

import OpenAI from "openai";
import { wrapOpenAI, initLogger } from "braintrust";

// Initialize Braintrust logger if API key is configured
// asyncFlush: false ensures logs are sent immediately (important for serverless/Railway)
if (process.env.BRAINTRUST_API_KEY) {
  initLogger({
    projectName: process.env.BRAINTRUST_PROJECT || "ai-news-bot",
    apiKey: process.env.BRAINTRUST_API_KEY,
    asyncFlush: false,
  });
}

// Create OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://us.api.openai.com/v1",
});

// Wrap with Braintrust tracing if configured, otherwise use raw client
export const openai = process.env.BRAINTRUST_API_KEY
  ? wrapOpenAI(client)
  : client;
