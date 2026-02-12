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
            // LM Studio v1 API: GET /api/v1/models
            const response = await fetch(`${baseUrl}/api/v1/models`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`LM Studio API error (${response.status}): ${errorText.slice(0, 300)}`);
            }

            const data = await response.json();
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
