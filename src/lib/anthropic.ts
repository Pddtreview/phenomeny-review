import axios from "axios";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const anthropicClient = axios.create({
  baseURL: "https://api.anthropic.com/v1",
  headers: {
    "x-api-key": ANTHROPIC_API_KEY || "",
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  },
});

export { anthropicClient, ANTHROPIC_API_KEY };
