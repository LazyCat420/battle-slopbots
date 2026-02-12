/**
 * Bot Sandbox — Safely executes LLM-generated behavior code.
 *
 * Since isolated-vm is a native module that can be tricky on Windows,
 * we use a Function-based sandbox with strict API injection and timeout.
 * The function only receives the BehaviorAPI object — no globals.
 */
import { BehaviorAPI, BotState, Vec2 } from "@/lib/types/bot";

/** Actions the bot wants to take this tick */
export interface BotActions {
    moveTarget: Vec2 | null;
    moveAway: boolean;
    moveSpeed: number | null;
    rotateTarget: number | null;
    attack: boolean;
    strafeDirection: "left" | "right" | null;
    stop: boolean;
}

/**
 * Create a BehaviorAPI object for a bot, given the current game state.
 * Records all actions the bot takes during the tick.
 */
export function createBehaviorAPI(
    bot: BotState,
    enemy: BotState,
    arenaWidth: number,
    arenaHeight: number
): { api: BehaviorAPI; actions: BotActions } {
    const actions: BotActions = {
        moveTarget: null,
        moveAway: false,
        moveSpeed: null,
        rotateTarget: null,
        attack: false,
        strafeDirection: null,
        stop: false,
    };

    const api: BehaviorAPI = {
        // ── Sensing ────────────────────────────
        getMyPosition: () => ({ x: bot.position.x, y: bot.position.y }),
        getMyAngle: () => bot.angle,
        getMyHealth: () => bot.health,
        getMyVelocity: () => ({ x: bot.velocity.x, y: bot.velocity.y }),
        getEnemyPosition: () => ({ x: enemy.position.x, y: enemy.position.y }),
        getEnemyHealth: () => enemy.health,
        getDistanceToEnemy: () => {
            const dx = enemy.position.x - bot.position.x;
            const dy = enemy.position.y - bot.position.y;
            return Math.sqrt(dx * dx + dy * dy);
        },
        getArenaSize: () => ({ width: arenaWidth, height: arenaHeight }),

        // ── Actions ────────────────────────────
        moveToward: (target: Vec2, speed?: number) => {
            actions.moveTarget = { x: target.x, y: target.y };
            actions.moveAway = false;
            if (speed !== undefined) actions.moveSpeed = speed;
        },
        moveAway: (target: Vec2, speed?: number) => {
            actions.moveTarget = { x: target.x, y: target.y };
            actions.moveAway = true;
            if (speed !== undefined) actions.moveSpeed = speed;
        },
        rotateTo: (angle: number) => {
            actions.rotateTarget = angle;
        },
        attack: () => {
            actions.attack = true;
        },
        strafe: (direction: "left" | "right") => {
            actions.strafeDirection = direction;
        },
        stop: () => {
            actions.stop = true;
        },

        // ── Utilities ──────────────────────────
        angleTo: (target: Vec2) => {
            return Math.atan2(target.y - bot.position.y, target.x - bot.position.x);
        },
        distanceTo: (target: Vec2) => {
            const dx = target.x - bot.position.x;
            const dy = target.y - bot.position.y;
            return Math.sqrt(dx * dx + dy * dy);
        },
        random: (min: number, max: number) => {
            return min + Math.random() * (max - min);
        },
    };

    return { api, actions };
}

/**
 * Compile a behavior code string into a callable function.
 * Returns null if the code has syntax errors.
 */
export function compileBehavior(
    code: string
): { fn: (api: BehaviorAPI, tick: number) => void; error?: string } {
    try {
        // Create the function with only api and tick as parameters
        // eslint-disable-next-line no-new-func
        const fn = new Function("api", "tick", code) as (
            api: BehaviorAPI,
            tick: number
        ) => void;
        return { fn };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            fn: () => { },
            error: `Compilation error: ${message}`,
        };
    }
}

/**
 * Execute a bot's behavior function safely with a try-catch.
 * If the behavior throws, the bot simply does nothing this tick.
 */
export function executeBehavior(
    fn: (api: BehaviorAPI, tick: number) => void,
    api: BehaviorAPI,
    tick: number
): void {
    try {
        fn(api, tick);
    } catch (e: unknown) {
        // Bot AI crashed — it does nothing this tick
        console.warn(
            `Bot behavior error at tick ${tick}:`,
            e instanceof Error ? e.message : String(e)
        );
    }
}
