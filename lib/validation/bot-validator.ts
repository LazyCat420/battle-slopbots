/**
 * Bot Validator — Validates LLM-generated BotDefinitions
 *
 * Ensures all values are within range, auto-fills attackEffect if missing,
 * and verifies the behavior code compiles.
 */
import {
    BotDefinition,
    AttackEffect,
    BOT_CONSTRAINTS,
    VALID_SHAPES,
    VALID_WEAPONS,
    VALID_PARTICLE_SHAPES,
} from "@/lib/types/bot";
import { getDefaultAttackEffect } from "@/lib/engine/attack-effects";

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    sanitized?: BotDefinition;
}

/** Clamp a number to a range */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** Validate a hex color string */
function isValidHexColor(color: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(color);
}

/**
 * Sanitize / auto-fill the attackEffect field.
 * If the LLM provided it, validate and clamp. If not, generate defaults.
 */
function sanitizeAttackEffect(
    raw: Record<string, unknown> | undefined | null,
    weaponType: string,
    botColor: string
): AttackEffect {
    // If no attackEffect provided, generate defaults from weapon type
    if (!raw || typeof raw !== "object") {
        return getDefaultAttackEffect(weaponType as never, botColor);
    }

    const def = getDefaultAttackEffect(weaponType as never, botColor);

    return {
        color: typeof raw.color === "string" && isValidHexColor(raw.color as string)
            ? (raw.color as string)
            : def.color,
        secondaryColor: typeof raw.secondaryColor === "string" && isValidHexColor(raw.secondaryColor as string)
            ? (raw.secondaryColor as string)
            : def.secondaryColor,
        particleShape: typeof raw.particleShape === "string" && VALID_PARTICLE_SHAPES.includes(raw.particleShape as never)
            ? (raw.particleShape as AttackEffect["particleShape"])
            : def.particleShape,
        intensity: typeof raw.intensity === "number"
            ? clamp(raw.intensity, BOT_CONSTRAINTS.attackEffect.intensity.min, BOT_CONSTRAINTS.attackEffect.intensity.max)
            : def.intensity,
        trailLength: typeof raw.trailLength === "number"
            ? clamp(raw.trailLength, BOT_CONSTRAINTS.attackEffect.trailLength.min, BOT_CONSTRAINTS.attackEffect.trailLength.max)
            : def.trailLength,
    };
}

/**
 * Validate and sanitize a BotDefinition from the LLM.
 * Returns errors for invalid structure, or a sanitized (clamped) definition.
 */
export function validateBotDefinition(raw: unknown): ValidationResult {
    const errors: string[] = [];

    if (!raw || typeof raw !== "object") {
        return { valid: false, errors: ["Bot definition must be an object"] };
    }

    const def = raw as Record<string, unknown>;

    // ── Required string fields ─────────────────
    if (typeof def.name !== "string" || def.name.trim().length === 0) {
        errors.push("'name' must be a non-empty string");
    }

    if (typeof def.shape !== "string" || !VALID_SHAPES.includes(def.shape as never)) {
        errors.push(
            `'shape' must be one of: ${VALID_SHAPES.join(", ")}. Got: "${def.shape}"`
        );
    }

    if (typeof def.color !== "string" || !isValidHexColor(def.color as string)) {
        errors.push(
            `'color' must be a hex color like #FF0000. Got: "${def.color}"`
        );
    }

    if (typeof def.behaviorCode !== "string" || def.behaviorCode.trim().length === 0) {
        errors.push("'behaviorCode' must be a non-empty JavaScript function body string");
    }

    if (typeof def.strategyDescription !== "string") {
        errors.push("'strategyDescription' must be a string");
    }

    // ── Numeric fields ─────────────────────────
    const numericFields = [
        { key: "size", ...BOT_CONSTRAINTS.size },
        { key: "speed", ...BOT_CONSTRAINTS.speed },
        { key: "armor", ...BOT_CONSTRAINTS.armor },
    ] as const;

    for (const field of numericFields) {
        if (typeof def[field.key] !== "number" || isNaN(def[field.key] as number)) {
            errors.push(`'${field.key}' must be a number between ${field.min} and ${field.max}`);
        }
    }

    // ── Weapon validation ──────────────────────
    if (!def.weapon || typeof def.weapon !== "object") {
        errors.push("'weapon' must be an object with type, damage, cooldown, and range");
    } else {
        const weapon = def.weapon as Record<string, unknown>;

        if (typeof weapon.type !== "string" || !VALID_WEAPONS.includes(weapon.type as never)) {
            errors.push(
                `'weapon.type' must be one of: ${VALID_WEAPONS.join(", ")}. Got: "${weapon.type}"`
            );
        }

        const weaponNumeric = [
            { key: "damage", ...BOT_CONSTRAINTS.weapon.damage },
            { key: "cooldown", ...BOT_CONSTRAINTS.weapon.cooldown },
            { key: "range", ...BOT_CONSTRAINTS.weapon.range },
        ] as const;

        for (const field of weaponNumeric) {
            if (typeof weapon[field.key] !== "number" || isNaN(weapon[field.key] as number)) {
                errors.push(
                    `'weapon.${field.key}' must be a number between ${field.min} and ${field.max}`
                );
            }
        }
    }

    // If structural errors exist, return early
    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // ── Sanitize (clamp values) ────────────────
    const typedDef = def as unknown as BotDefinition;
    const weapon = typedDef.weapon;

    const sanitized: BotDefinition = {
        name: typedDef.name.trim().slice(0, 30),
        shape: typedDef.shape,
        size: clamp(typedDef.size, BOT_CONSTRAINTS.size.min, BOT_CONSTRAINTS.size.max),
        color: typedDef.color,
        speed: clamp(typedDef.speed, BOT_CONSTRAINTS.speed.min, BOT_CONSTRAINTS.speed.max),
        armor: clamp(typedDef.armor, BOT_CONSTRAINTS.armor.min, BOT_CONSTRAINTS.armor.max),
        weapon: {
            type: weapon.type,
            damage: clamp(weapon.damage, BOT_CONSTRAINTS.weapon.damage.min, BOT_CONSTRAINTS.weapon.damage.max),
            cooldown: clamp(weapon.cooldown, BOT_CONSTRAINTS.weapon.cooldown.min, BOT_CONSTRAINTS.weapon.cooldown.max),
            range: clamp(weapon.range, BOT_CONSTRAINTS.weapon.range.min, BOT_CONSTRAINTS.weapon.range.max),
        },
        // Auto-fill attackEffect with sensible defaults if LLM omits it
        attackEffect: sanitizeAttackEffect(
            def.attackEffect as Record<string, unknown> | undefined,
            weapon.type,
            typedDef.color
        ),
        // drawCode: optional Canvas 2D drawing code (validated separately)
        drawCode: sanitizeDrawCode(def.drawCode as string | undefined),
        behaviorCode: typedDef.behaviorCode,
        strategyDescription: typedDef.strategyDescription || "No strategy description provided.",
    };

    return { valid: true, errors: [], sanitized };
}

/**
 * Basic syntax check on the behavior code.
 * Wraps it in a function and tries to parse it (doesn't execute it).
 */
export function checkBehaviorSyntax(code: string): { valid: boolean; error?: string } {
    try {
        // Try to create a function from the code string (parse only, don't execute)
        new Function("api", "tick", code);
        return { valid: true };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { valid: false, error: `Syntax error in behavior code: ${message}` };
    }
}

/**
 * Validate and sanitize drawCode.
 * Returns the code if valid, undefined if missing/invalid.
 * This allows ArenaCanvas to fall back to shape-based rendering.
 */
function sanitizeDrawCode(code: string | undefined): string | undefined {
    if (!code || typeof code !== "string" || code.trim().length === 0) {
        return undefined;
    }

    // Cap length
    let sanitized = code.slice(0, 1200);

    // Log raw input for debugging
    console.log(`[validator] drawCode raw input (${code.length} chars): ${code.slice(0, 200)}...`);

    // Fix common LLM encoding issues
    const beforeSanitize = sanitized;
    sanitized = sanitized
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");

    if (sanitized !== beforeSanitize) {
        console.log(`[validator] drawCode had HTML entities — sanitized`);
    }

    // Syntax check — try to compile as a function
    try {
        new Function("ctx", "size", "color", "tick", sanitized);
        console.log(`[validator] ✅ drawCode compiled OK (${sanitized.length} chars)`);
        return sanitized;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[validator] ❌ drawCode syntax invalid: ${msg}`);
        console.warn(`[validator] ❌ drawCode that failed: ${sanitized.slice(0, 300)}`);
        return undefined;
    }
}

/**
 * Check drawCode syntax separately (for the route's explicit check).
 */
export function checkDrawCodeSyntax(code: string): { valid: boolean; error?: string } {
    try {
        new Function("ctx", "size", "color", "tick", code);
        return { valid: true };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { valid: false, error: `Syntax error in drawCode: ${message}` };
    }
}

