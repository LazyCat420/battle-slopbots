/**
 * Bot SDK — Core type definitions for BattleBots
 *
 * The LLM generates BotDefinition objects that conform to these types.
 * The behavior function only has access to the BehaviorAPI interface.
 */

// ── Vector ────────────────────────────────────────────────
export interface Vec2 {
    x: number;
    y: number;
}

// ── Shape Types ───────────────────────────────────────────
export type BodyShape =
    | "circle"
    | "rectangle"
    | "triangle"
    | "hexagon"
    | "pentagon";

// ── Weapon Types ──────────────────────────────────────────
export type WeaponType =
    | "spinner"
    | "flipper"
    | "hammer"
    | "saw"
    | "lance"
    | "flamethrower";

export interface WeaponConfig {
    type: WeaponType;
    damage: number; // 1-10
    cooldown: number; // ms between attacks (200-2000)
    range: number; // pixels (20-120)
}

// ── Bot Definition (what the LLM outputs) ─────────────────
export interface BotDefinition {
    name: string;
    shape: BodyShape;
    size: number; // 1-5
    color: string; // hex color
    speed: number; // 1-10
    armor: number; // 1-10
    weapon: WeaponConfig;
    /**
     * The behavior function source code (JavaScript string).
     * It receives (api, tick) and calls api methods to control the bot.
     */
    behaviorCode: string;
    /** A short description of the bot's strategy (for the UI) */
    strategyDescription: string;
}

// ── Behavior API (injected into sandbox) ──────────────────
export interface BehaviorAPI {
    // ── Sensing ─────────────────────────────────
    getMyPosition(): Vec2;
    getMyAngle(): number;
    getMyHealth(): number;
    getMyVelocity(): Vec2;
    getEnemyPosition(): Vec2;
    getEnemyHealth(): number;
    getDistanceToEnemy(): number;
    getArenaSize(): { width: number; height: number };

    // ── Actions (called once per tick) ──────────
    moveToward(target: Vec2, speed?: number): void;
    moveAway(target: Vec2, speed?: number): void;
    rotateTo(angle: number): void;
    attack(): void;
    strafe(direction: "left" | "right"): void;
    stop(): void;

    // ── Utilities ───────────────────────────────
    angleTo(target: Vec2): number;
    distanceTo(target: Vec2): number;
    random(min: number, max: number): number;
}

// ── Runtime Bot State ─────────────────────────────────────
export interface BotState {
    id: string;
    definition: BotDefinition;
    position: Vec2;
    angle: number;
    velocity: Vec2;
    health: number;
    maxHealth: number;
    weaponCooldownRemaining: number;
    isAttacking: boolean;
    attackAnimationFrame: number;
}

// ── Game State ────────────────────────────────────────────
export type MatchStatus =
    | "waiting"
    | "countdown"
    | "fighting"
    | "finished";

export interface GameState {
    bots: [BotState, BotState];
    status: MatchStatus;
    winner: string | null; // bot id or null
    tickCount: number;
    timeRemaining: number; // seconds
    damageEvents: DamageEvent[];
    arenaWidth: number;
    arenaHeight: number;
}

export interface DamageEvent {
    attackerId: string;
    targetId: string;
    damage: number;
    position: Vec2;
    tick: number;
}

// ── LLM Provider Config ──────────────────────────────────
export type LLMProviderType = "openai" | "ollama" | "lmstudio" | "gemini" | "anthropic";

export interface LLMConfig {
    provider: LLMProviderType;
    apiKey?: string; // for OpenAI, Gemini, Anthropic
    baseUrl: string; // e.g., http://localhost:11434 for Ollama
    model: string;
}

// ── Validation ────────────────────────────────────────────
export const VALID_SHAPES: BodyShape[] = [
    "circle",
    "rectangle",
    "triangle",
    "hexagon",
    "pentagon",
];

export const VALID_WEAPONS: WeaponType[] = [
    "spinner",
    "flipper",
    "hammer",
    "saw",
    "lance",
    "flamethrower",
];

export const BOT_CONSTRAINTS = {
    size: { min: 1, max: 5 },
    speed: { min: 1, max: 10 },
    armor: { min: 1, max: 10 },
    weapon: {
        damage: { min: 1, max: 10 },
        cooldown: { min: 200, max: 2000 },
        range: { min: 20, max: 120 },
    },
} as const;
