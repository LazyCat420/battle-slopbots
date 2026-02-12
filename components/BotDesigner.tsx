"use client";

/**
 * Bot Designer — Text input for describing a bot + preview of generated stats.
 */
import { PlayerState } from "@/lib/store/game-store";
import { BotDefinition } from "@/lib/types/bot";

interface BotDesignerProps {
    playerNum: 1 | 2;
    playerState: PlayerState;
    onDescriptionChange: (desc: string) => void;
    onGenerate: () => void;
    onLock: () => void;
    disabled?: boolean;
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    return (
        <div className="stat-bar">
            <span className="stat-label">{label}</span>
            <div className="stat-track">
                <div
                    className="stat-fill"
                    style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
                />
            </div>
            <span className="stat-value">{value}</span>
        </div>
    );
}

function BotPreview({ bot }: { bot: BotDefinition }) {
    return (
        <div className="bot-preview">
            <div className="bot-preview-header">
                <div
                    className="bot-color-swatch"
                    style={{ backgroundColor: bot.color }}
                />
                <div>
                    <h3 className="bot-name">{bot.name}</h3>
                    <span className="bot-shape">{bot.shape} · {bot.weapon.type}</span>
                </div>
            </div>

            <div className="bot-stats">
                <StatBar label="SPD" value={bot.speed} max={10} color="#4a9eff" />
                <StatBar label="ARM" value={bot.armor} max={10} color="#22c55e" />
                <StatBar label="DMG" value={bot.weapon.damage} max={10} color="#ef4444" />
                <StatBar label="RNG" value={Math.round(bot.weapon.range / 12)} max={10} color="#eab308" />
            </div>

            <p className="bot-strategy">{bot.strategyDescription}</p>
        </div>
    );
}

export default function BotDesigner({
    playerNum,
    playerState,
    onDescriptionChange,
    onGenerate,
    onLock,
    disabled,
}: BotDesignerProps) {
    const { description, bot, isGenerating, error, locked } = playerState;

    return (
        <div className={`bot-designer ${locked ? "locked" : ""}`}>
            <h2 className="designer-title">
                <span className={`player-badge p${playerNum}`}>P{playerNum}</span>
                {locked ? bot?.name || "Bot Locked" : "Design Your Bot"}
            </h2>

            {!locked && (
                <>
                    <textarea
                        className="bot-description-input"
                        placeholder={
                            playerNum === 1
                                ? "Describe your bot... e.g. 'A fast hexagonal bot with spinning blades that circles the enemy before attacking'"
                                : "Describe your bot... e.g. 'A heavy rectangular tank with a massive hammer that charges straight at the opponent'"
                        }
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        disabled={isGenerating || disabled}
                        rows={3}
                    />

                    <div className="designer-actions">
                        <button
                            className="btn btn-generate"
                            onClick={onGenerate}
                            disabled={isGenerating || !description.trim() || disabled}
                        >
                            {isGenerating ? (
                                <>
                                    <span className="spinner" /> Generating...
                                </>
                            ) : (
                                "⚡ Generate Bot"
                            )}
                        </button>

                        {bot && (
                            <button className="btn btn-lock" onClick={onLock}>
                                🔒 Lock In
                            </button>
                        )}
                    </div>
                </>
            )}

            {error && <div className="designer-error">⚠️ {error}</div>}

            {bot && <BotPreview bot={bot} />}
        </div>
    );
}
