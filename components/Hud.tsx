"use client";

/**
 * HUD — Heads-up display during matches showing health, time, and match info.
 */
import { GameState } from "@/lib/types/bot";

interface HudProps {
    gameState: GameState;
}

export default function Hud({ gameState }: HudProps) {
    const { bots, timeRemaining, status } = gameState;
    const bot1 = bots[0];
    const bot2 = bots[1];

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    return (
        <div className="hud">
            <div className="hud-player hud-p1">
                <div className="hud-name">
                    <span className="player-badge p1">P1</span>
                    {bot1.definition.name}
                </div>
                <div className="hud-health-bar">
                    <div
                        className="hud-health-fill"
                        style={{
                            width: `${(bot1.health / bot1.maxHealth) * 100}%`,
                            backgroundColor:
                                bot1.health / bot1.maxHealth > 0.6
                                    ? "#22c55e"
                                    : bot1.health / bot1.maxHealth > 0.3
                                        ? "#eab308"
                                        : "#ef4444",
                        }}
                    />
                </div>
                <span className="hud-hp">{Math.ceil(bot1.health)} HP</span>
                <div className="hud-description">{bot1.definition.strategyDescription}</div>
            </div>

            <div className="hud-center">
                <div className="hud-timer">{formatTime(timeRemaining)}</div>
                <div className="hud-status">
                    {status === "fighting" && "⚔️ FIGHT"}
                    {status === "finished" && "🏁 FINISHED"}
                    {status === "countdown" && "⏳ GET READY"}
                </div>
            </div>

            <div className="hud-player hud-p2">
                <div className="hud-name">
                    {bot2.definition.name}
                    <span className="player-badge p2">P2</span>
                </div>
                <div className="hud-health-bar">
                    <div
                        className="hud-health-fill"
                        style={{
                            width: `${(bot2.health / bot2.maxHealth) * 100}%`,
                            backgroundColor:
                                bot2.health / bot2.maxHealth > 0.6
                                    ? "#22c55e"
                                    : bot2.health / bot2.maxHealth > 0.3
                                        ? "#eab308"
                                        : "#ef4444",
                        }}
                    />
                </div>
                <span className="hud-hp">{Math.ceil(bot2.health)} HP</span>
                <div className="hud-description">{bot2.definition.strategyDescription}</div>
            </div>
        </div>
    );
}
