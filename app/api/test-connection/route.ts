/**
 * Test Connection API Route — POST /api/test-connection
 *
 * Sends a minimal request to the LLM provider to verify connectivity.
 */
import { NextRequest, NextResponse } from "next/server";
import { LLMConfig } from "@/lib/types/bot";
import { callLLM } from "@/lib/llm/provider";

export async function POST(request: NextRequest) {
    try {
        const { llmConfig } = (await request.json()) as { llmConfig: LLMConfig };

        if (!llmConfig || !llmConfig.provider) {
            return NextResponse.json(
                { error: "Missing llmConfig" },
                { status: 400 }
            );
        }

        if (!llmConfig.model) {
            return NextResponse.json(
                { error: "No model selected. Please select or type a model name." },
                { status: 400 }
            );
        }

        const startTime = Date.now();

        // Send a minimal test prompt
        const response = await callLLM(
            llmConfig,
            "You are a test assistant. Respond with a JSON object.",
            'Respond with exactly this JSON: {"status": "ok", "message": "Connection successful"}'
        );

        const latency = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            model: response.model,
            latency,
            message: `Connected to ${llmConfig.provider} (${response.model}) in ${latency}ms`,
        });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[test-connection] Error:", errMsg);
        return NextResponse.json({
            success: false,
            error: errMsg,
        });
    }
}
