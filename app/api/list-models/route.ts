/**
 * List Models API Route — GET /api/list-models?provider=...&baseUrl=...
 *
 * Fetches available models from the specified provider.
 * Currently supports LM Studio and Ollama model listing.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const baseUrl = searchParams.get("baseUrl");

    if (!provider || !baseUrl) {
        return NextResponse.json(
            { error: "Missing provider or baseUrl query parameters" },
            { status: 400 }
        );
    }

    try {
        let models: { id: string; name: string; type?: string; state?: string }[] = [];

        if (provider === "lmstudio") {
            // LM Studio exposes OpenAI-compatible API at /v1/models
            // Try /v1/models first (standard), fallback to /api/v1/models (legacy)
            let data: { data?: { id: string; type?: string; state?: string; arch?: string }[] } | null = null;

            for (const endpoint of [`${baseUrl}/v1/models`, `${baseUrl}/api/v1/models`]) {
                try {
                    console.log(`[list-models] Trying: ${endpoint}`);
                    const response = await fetch(endpoint, {
                        method: "GET",
                        headers: { "Content-Type": "application/json" },
                        signal: AbortSignal.timeout(5000),
                    });
                    if (response.ok) {
                        data = await response.json();
                        console.log(`[list-models] ✅ Got models from ${endpoint}`);
                        break;
                    }
                } catch {
                    console.log(`[list-models] ❌ ${endpoint} failed, trying next...`);
                }
            }

            if (!data) {
                throw new Error(`Could not reach LM Studio at ${baseUrl}. Make sure LM Studio is running.`);
            }

            models = (data.data || []).map(
                (m: { id: string; type?: string; state?: string; arch?: string }) => ({
                    id: m.id,
                    name: m.id,
                    type: m.type,
                    state: m.state,
                    arch: m.arch,
                })
            );
        } else if (provider === "ollama") {
            // Ollama: GET /api/tags
            const response = await fetch(`${baseUrl}/api/tags`, {
                method: "GET",
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText.slice(0, 300)}`);
            }

            const data = await response.json();
            models = (data.models || []).map(
                (m: { name: string; model: string; size?: number }) => ({
                    id: m.model || m.name,
                    name: m.name,
                })
            );
        } else {
            return NextResponse.json(
                { error: `Model listing is not supported for provider: ${provider}. Type the model name manually.` },
                { status: 400 }
            );
        }

        return NextResponse.json({ models });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[list-models] Error:", errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
