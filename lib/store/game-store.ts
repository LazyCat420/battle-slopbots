/**
 * Game Store — Zustand state management for the BattleBots game.
 *
 * Manages all UI state: bot definitions, game state, settings, match flow.
 */
import { create } from "zustand";
import { BotDefinition, GameState, LLMConfig } from "@/lib/types/bot";
import { DEFAULT_CONFIGS } from "@/lib/llm/provider";

// ── Match Flow ──────────────────────────────────────────
export type MatchPhase =
    | "setup"       // Players are designing bots
    | "generating"  // LLM is generating a bot
    | "preview"     // Bots are generated, ready to fight
    | "fighting"    // Match in progress
    | "results";    // Match finished

// ── Player State ────────────────────────────────────────
export interface PlayerState {
    description: string;
    bot: BotDefinition | null;
    isGenerating: boolean;
    error: string | null;
    locked: boolean;
}

// ── Load saved config from localStorage ─────────────────
function getInitialLLMConfig(): LLMConfig {
    if (typeof window !== "undefined") {
        try {
            const saved = localStorage.getItem("battlebots-llm-settings");
            if (saved) return JSON.parse(saved) as LLMConfig;
        } catch {
            // pass
        }
    }
    return { ...DEFAULT_CONFIGS.lmstudio };
}

// ── Store Interface ─────────────────────────────────────
interface GameStore {
    // UI State
    phase: MatchPhase;
    showSettings: boolean;

    // Players
    player1: PlayerState;
    player2: PlayerState;

    // LLM Config
    llmConfig: LLMConfig;

    // Game State (updated each tick during match)
    gameState: GameState | null;

    // Actions
    setPhase: (phase: MatchPhase) => void;
    setShowSettings: (show: boolean) => void;
    setLLMConfig: (config: LLMConfig) => void;
    updatePlayer: (player: 1 | 2, updates: Partial<PlayerState>) => void;
    setGameState: (state: GameState | null) => void;
    resetMatch: () => void;
    generateBot: (player: 1 | 2) => Promise<void>;
}

const initialPlayerState: PlayerState = {
    description: "",
    bot: null,
    isGenerating: false,
    error: null,
    locked: false,
};

export const useGameStore = create<GameStore>((set, get) => ({
    // ── Initial State ──────────────────────────
    phase: "setup",
    showSettings: false,
    player1: { ...initialPlayerState },
    player2: { ...initialPlayerState },
    llmConfig: getInitialLLMConfig(),
    gameState: null,

    // ── Actions ────────────────────────────────
    setPhase: (phase) => set({ phase }),
    setShowSettings: (show) => set({ showSettings: show }),
    setLLMConfig: (config) => set({ llmConfig: config }),

    updatePlayer: (player, updates) => {
        const key = player === 1 ? "player1" : "player2";
        set((state) => ({
            [key]: { ...state[key], ...updates },
        }));
    },

    setGameState: (state) => set({ gameState: state }),

    resetMatch: () =>
        set({
            phase: "setup",
            player1: { ...initialPlayerState },
            player2: { ...initialPlayerState },
            gameState: null,
        }),

    generateBot: async (player) => {
        const state = get();
        const playerState = player === 1 ? state.player1 : state.player2;
        const key = player === 1 ? "player1" : "player2";

        if (!playerState.description.trim()) {
            set((s) => ({
                [key]: { ...s[key === "player1" ? "player1" : "player2"], error: "Please describe your bot first!" },
            }));
            return;
        }

        // Set generating state
        set((s) => ({
            [key]: {
                ...s[key === "player1" ? "player1" : "player2"],
                isGenerating: true,
                error: null,
                bot: null,
            },
        }));

        try {
            const response = await fetch("/api/generate-bot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    description: playerState.description,
                    llmConfig: state.llmConfig,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to generate bot");
            }

            set((s) => ({
                [key]: {
                    ...s[key === "player1" ? "player1" : "player2"],
                    bot: data.bot,
                    isGenerating: false,
                    error: data.fallback
                        ? "LLM failed — using default bot. Try a simpler description."
                        : null,
                },
            }));
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            set((s) => ({
                [key]: {
                    ...s[key === "player1" ? "player1" : "player2"],
                    isGenerating: false,
                    error: errMsg,
                },
            }));
        }
    },
}));
