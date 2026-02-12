/**
 * LLM Provider — Multi-provider LLM integration.
 *
 * Supports OpenAI, Ollama, LM Studio, Gemini, and Anthropic.
 * Also provides model listing (for LM Studio) and connection testing.
 */
import { LLMConfig, LLMProviderType } from "@/lib/types/bot";

interface LLMResponse {
    content: string;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface ModelInfo {
    id: string;
    name: string;
    type?: string;
    arch?: string;
    state?: string;
}

/**
 * Default configs for each provider type.
 */
export const DEFAULT_CONFIGS: Record<string, LLMConfig> = {
    openai: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
        apiKey: "",
    },
    ollama: {
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: "llama3.1",
    },
    lmstudio: {
        provider: "lmstudio",
        baseUrl: "http://localhost:1234",
        model: "",
    },
    gemini: {
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.0-flash",
        apiKey: "",
    },
    anthropic: {
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514",
        apiKey: "",
    },
};

/**
 * Provider display info for the settings UI.
 */
export const PROVIDER_INFO: Record<
    LLMProviderType,
    { label: string; icon: string; needsApiKey: boolean; description: string }
> = {
    ollama: {
        label: "Ollama",
        icon: "🦙",
        needsApiKey: false,
        description: "Run models locally with Ollama. Make sure it's running.",
    },
    lmstudio: {
        label: "LM Studio",
        icon: "🔬",
        needsApiKey: false,
        description: "Local LM Studio server. Models are auto-detected.",
    },
    openai: {
        label: "OpenAI",
        icon: "🤖",
        needsApiKey: true,
        description: "GPT-4o recommended. Requires an API key.",
    },
    gemini: {
        label: "Gemini",
        icon: "💎",
        needsApiKey: true,
        description: "Google Gemini models. Requires a Google AI API key.",
    },
    anthropic: {
        label: "Anthropic",
        icon: "🧠",
        needsApiKey: true,
        description: "Claude models. Requires an Anthropic API key.",
    },
};

/**
 * Call the LLM with a system + user prompt. Returns raw text content.
 */
export async function callLLM(
    config: LLMConfig,
    systemPrompt: string,
    userPrompt: string
): Promise<LLMResponse> {
    switch (config.provider) {
        case "anthropic":
            return callAnthropic(config, systemPrompt, userPrompt);
        case "gemini":
            return callGemini(config, systemPrompt, userPrompt);
        default:
            return callOpenAICompatible(config, systemPrompt, userPrompt);
    }
}

/**
 * OpenAI-compatible call (OpenAI, Ollama, LM Studio).
 */
async function callOpenAICompatible(
    config: LLMConfig,
    systemPrompt: string,
    userPrompt: string
): Promise<LLMResponse> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    let endpoint: string;
    let body: Record<string, unknown>;

    if (config.provider === "ollama") {
        endpoint = `${config.baseUrl}/api/chat`;
        body = {
            model: config.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            stream: false,
            format: "json",
            options: { temperature: 0.7, num_predict: 2048 },
        };
    } else if (config.provider === "lmstudio") {
        // LM Studio v1 API: base/api/v1/chat/completions
        // NOTE: LM Studio does NOT support response_format: json_object.
        // JSON output is enforced via the system prompt instead.
        endpoint = `${config.baseUrl}/v1/chat/completions`;
        body = {
            model: config.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 1024,
        };
    } else {
        // OpenAI
        endpoint = `${config.baseUrl}/chat/completions`;
        body = {
            model: config.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 2048,
            response_format: { type: "json_object" },
        };
    }

    if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    console.log(`[LLM] Calling ${config.provider} at ${endpoint} with model ${config.model}`);

    const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = await response.json();

    let content: string;
    if (config.provider === "ollama") {
        content = data.message?.content || "";
    } else {
        content = data.choices?.[0]?.message?.content || "";
    }

    if (!content) throw new Error("LLM returned empty content");

    return {
        content,
        model: data.model || config.model,
        usage: data.usage,
    };
}

/**
 * Anthropic Claude API call.
 */
async function callAnthropic(
    config: LLMConfig,
    systemPrompt: string,
    userPrompt: string
): Promise<LLMResponse> {
    const endpoint = `${config.baseUrl}/v1/messages`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey || "",
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";

    if (!content) throw new Error("Anthropic returned empty content");

    return {
        content,
        model: data.model || config.model,
        usage: data.usage
            ? {
                prompt_tokens: data.usage.input_tokens || 0,
                completion_tokens: data.usage.output_tokens || 0,
            }
            : undefined,
    };
}

/**
 * Google Gemini API call.
 */
async function callGemini(
    config: LLMConfig,
    systemPrompt: string,
    userPrompt: string
): Promise<LLMResponse> {
    const endpoint = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!content) throw new Error("Gemini returned empty content");

    return {
        content,
        model: config.model,
        usage: data.usageMetadata
            ? {
                prompt_tokens: data.usageMetadata.promptTokenCount || 0,
                completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
            }
            : undefined,
    };
}

/**
 * Extract JSON from LLM response, handling cases where the LLM
 * wraps JSON in markdown code fences or adds extra text.
 */
export function extractJSON(text: string): unknown {
    // Try direct parse first
    try {
        return JSON.parse(text);
    } catch {
        // pass
    }

    // Try to extract from markdown code fences
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1]);
        } catch {
            // pass
        }
    }

    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch {
            // pass
        }
    }

    throw new Error("Could not extract valid JSON from LLM response");
}
