/**
 * Bot Generation API Route — POST /api/generate-bot
 *
 * Accepts a user description and LLM config, generates a bot via LLM,
 * validates it, and returns the BotDefinition (with retry loop).
 */
import { NextRequest, NextResponse } from "next/server";
import { LLMConfig } from "@/lib/types/bot";
import { buildBotPrompt, buildRandomBotPrompt } from "@/lib/llm/prompt";
import { callLLM, extractJSON } from "@/lib/llm/provider";
import {
    validateBotDefinition,
    checkBehaviorSyntax,
} from "@/lib/validation/bot-validator";

const MAX_RETRIES = 5;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { description, llmConfig, randomize, avoidNames } = body as {
            description?: string;
            llmConfig: LLMConfig;
            randomize?: boolean;
            avoidNames?: string[];
        };

        if (!randomize && (!description || typeof description !== "string")) {
            return NextResponse.json(
                { error: "Missing or invalid 'description' field" },
                { status: 400 }
            );
        }

        if (!llmConfig || !llmConfig.provider) {
            return NextResponse.json(
                { error: "Missing or invalid 'llmConfig' field" },
                { status: 400 }
            );
        }

        let lastError: string | undefined;
        let attempts = 0;

        while (attempts < MAX_RETRIES) {
            attempts++;
            console.log(`[generate-bot] Attempt ${attempts}/${MAX_RETRIES}`);

            try {
                // Build the prompt (includes error feedback on retries)
                const { system, user } = randomize
                    ? buildRandomBotPrompt(lastError, avoidNames)
                    : buildBotPrompt(description!, lastError);
                console.log(`[generate-bot] Prompt size: system=${system.length} user=${user.length} total=${system.length + user.length} chars`);

                // Call the LLM
                const llmResponse = await callLLM(llmConfig, system, user);
                console.log(`[generate-bot] LLM response length: ${llmResponse.content.length}`);
                console.log(`[generate-bot] Response preview: ${llmResponse.content.slice(0, 200)}...`);

                // Extract JSON
                let parsed: unknown;
                try {
                    parsed = extractJSON(llmResponse.content);
                    console.log(`[generate-bot] ✅ JSON parsed successfully`);
                    console.log(`[generate-bot] Parsed keys:`, Object.keys(parsed as Record<string, unknown>));
                } catch {
                    lastError = `Could not parse your response as valid JSON. Output ONLY a raw JSON object with these keys: name, shape, size, color, speed, armor, weapon, attackEffect, behaviorCode, strategyDescription. No markdown, no explanation.`;
                    console.log(`[generate-bot] ❌ JSON parse failed`);
                    continue;
                }

                // Validate against schema
                const validation = validateBotDefinition(parsed);
                if (!validation.valid) {
                    // Build field-specific error feedback so the LLM knows exactly what to fix
                    const fieldErrors = validation.errors.map((err) => {
                        if (err.includes("shape")) return `${err}. Valid shapes: circle, rectangle, triangle, hexagon, pentagon`;
                        if (err.includes("weapon") && err.includes("type")) return `${err}. Valid weapon types: spinner, flipper, hammer, saw, lance, flamethrower`;
                        if (err.includes("particleShape")) return `${err}. Valid particleShapes: circle, spark, star, square`;
                        return err;
                    });
                    lastError = `Schema errors: ${fieldErrors.join("; ")}`;
                    console.log(`[generate-bot] ❌ Schema validation failed:`, validation.errors);
                    continue;
                }
                console.log(`[generate-bot] ✅ Schema valid: "${validation.sanitized!.name}" shape=${validation.sanitized!.shape} weapon=${validation.sanitized!.weapon.type}`);

                // Log drawCode diagnostic
                const rawDef = parsed as Record<string, unknown>;
                if (rawDef.drawCode) {
                    console.log(`[generate-bot] 🎨 Raw drawCode length: ${String(rawDef.drawCode).length}`);
                    console.log(`[generate-bot] 🎨 Raw drawCode preview: ${String(rawDef.drawCode).slice(0, 300)}`);
                }
                if (validation.sanitized!.drawCode) {
                    console.log(`[generate-bot] ✅ drawCode passed validation (${validation.sanitized!.drawCode.length} chars)`);
                } else if (rawDef.drawCode) {
                    console.log(`[generate-bot] ❌ drawCode was generated but FAILED validation — falling back to shape renderer`);
                } else {
                    console.log(`[generate-bot] ⚠️ LLM did not generate drawCode`);
                }

                // Check behavior code syntax
                const syntaxCheck = checkBehaviorSyntax(validation.sanitized!.behaviorCode);
                if (!syntaxCheck.valid) {
                    lastError = `JS syntax error in behaviorCode: ${syntaxCheck.error}. The behaviorCode must be valid JavaScript that uses only api methods.`;
                    console.log(`[generate-bot] ❌ Syntax check failed:`, syntaxCheck.error);
                    console.log(`[generate-bot] behaviorCode was: ${validation.sanitized!.behaviorCode.slice(0, 200)}`);
                    continue;
                }
                console.log(`[generate-bot] ✅ Behavior code syntax OK`);


                // Success!
                console.log(
                    `[generate-bot] ✅ Bot "${validation.sanitized!.name}" generated in ${attempts} attempt(s)`
                );

                return NextResponse.json({
                    bot: validation.sanitized,
                    attempts,
                    model: llmResponse.model,
                });
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[generate-bot] Attempt ${attempts} error:`, errMsg);
                lastError = errMsg;
            }
        }

        // All retries exhausted — return a default bot
        console.warn(`[generate-bot] All ${MAX_RETRIES} attempts failed. Returning default bot.`);

        const defaultBot = {
            name: "Default Bot",
            shape: "circle" as const,
            size: 3,
            color: "#888888",
            speed: 5,
            armor: 5,
            weapon: {
                type: "spinner" as const,
                damage: 5,
                cooldown: 500,
                range: 50,
            },
            attackEffect: {
                color: "#FFD700",
                secondaryColor: "#888888",
                particleShape: "spark" as const,
                intensity: 3,
                trailLength: 2,
            },
            behaviorCode:
                'var enemy = api.getEnemyPosition(); var dist = api.getDistanceToEnemy(); if (dist > 80) { api.moveToward(enemy); } else { api.attack(); } api.rotateTo(api.angleTo(enemy));',
            strategyDescription:
                "Default bot: chases the enemy and attacks when in range. (LLM generation failed after 5 attempts)",
        };


        return NextResponse.json({
            bot: defaultBot,
            attempts: MAX_RETRIES,
            fallback: true,
            lastError,
        });
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[generate-bot] Fatal error:", errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
