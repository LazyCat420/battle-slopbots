"use client";

/**
 * BattleBots — Main page.
 *
 * Orchestrates the full match flow:
 * Setup → Generate → Preview → Fight → Results
 */
import { useRef, useCallback, useState, useEffect } from "react";
import { useGameStore } from "@/lib/store/game-store";
import { GameEngine } from "@/lib/engine/game-engine";
import ArenaCanvas from "@/components/ArenaCanvas";
import BotDesigner from "@/components/BotDesigner";
import SettingsModal from "@/components/SettingsModal";
import Hud from "@/components/Hud";

export default function Home() {
  const {
    phase,
    setPhase,
    showSettings,
    setShowSettings,
    player1,
    player2,
    updatePlayer,
    generateBot,
    randomizeBot,
    cancelGeneration,
    gameState,
    setGameState,
    llmConfig,
    setLLMConfig,
    resetMatch,
  } = useGameStore();

  const engineRef = useRef<GameEngine | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Handle fight start
  const startFight = useCallback(() => {
    if (!player1.bot || !player2.bot) return;

    setPhase("fighting");

    const engine = new GameEngine(player1.bot, player2.bot);
    engineRef.current = engine;

    engine.onUpdate((state) => {
      setGameState(state);
    });

    // Show countdown
    setCountdown(3);
    // Set initial state immediately so bots are visible during countdown
    setGameState(engine.getState());

    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(countdownInterval);
        engine.startImmediate();
      }
    }, 1000);
  }, [player1.bot, player2.bot, setPhase, setGameState]);

  // Cleanup engine on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  // Check if both bots are locked → show preview
  useEffect(() => {
    if (player1.locked && player2.locked && phase === "setup") {
      setPhase("preview");
    }
  }, [player1.locked, player2.locked, phase, setPhase]);

  // Check if match finished
  useEffect(() => {
    if (gameState?.status === "finished" && phase === "fighting") {
      setPhase("results");
    }
  }, [gameState?.status, phase, setPhase]);

  const handleNewMatch = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    resetMatch();
  }, [resetMatch]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="logo">
            <span className="logo-icon">⚔️</span>
            BATTLE<span className="logo-accent">BOTS</span>
          </h1>
          <span className="logo-sub">AI Arena</span>
        </div>
        <div className="header-right">
          <button
            className="btn btn-settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="main-content">
        {/* Setup Phase — Bot Designers */}
        {(phase === "setup" || phase === "generating") && (
          <div className="setup-phase">
            <div className="setup-header">
              <h2>🤖 Design Your Bots</h2>
              <p>Describe your battle robot and let AI bring it to life!</p>
            </div>

            <div className="designers-grid">
              <BotDesigner
                playerNum={1}
                playerState={player1}
                onDescriptionChange={(desc) =>
                  updatePlayer(1, { description: desc })
                }
                onGenerate={() => generateBot(1)}
                onRandomize={() => randomizeBot(1)}
                onCancel={() => cancelGeneration(1)}
                onLock={() => updatePlayer(1, { locked: true })}
              />
              <div className="vs-divider">
                <span>VS</span>
              </div>
              <BotDesigner
                playerNum={2}
                playerState={player2}
                onDescriptionChange={(desc) =>
                  updatePlayer(2, { description: desc })
                }
                onGenerate={() => generateBot(2)}
                onRandomize={() => randomizeBot(2)}
                onCancel={() => cancelGeneration(2)}
                onLock={() => updatePlayer(2, { locked: true })}
              />
            </div>
          </div>
        )}

        {/* Preview Phase — Both bots locked, ready to fight */}
        {phase === "preview" && (
          <div className="preview-phase">
            <div className="preview-header">
              <h2>⚡ Both Bots Ready!</h2>
              <p>
                <strong>{player1.bot?.name}</strong> vs{" "}
                <strong>{player2.bot?.name}</strong>
              </p>
            </div>

            <div className="preview-bots">
              <div className="preview-bot-card">
                <div
                  className="preview-bot-color"
                  style={{ backgroundColor: player1.bot?.color }}
                />
                <h3>{player1.bot?.name}</h3>
                <p className="preview-strategy">
                  {player1.bot?.strategyDescription}
                </p>
              </div>

              <div className="preview-vs">⚔️</div>

              <div className="preview-bot-card">
                <div
                  className="preview-bot-color"
                  style={{ backgroundColor: player2.bot?.color }}
                />
                <h3>{player2.bot?.name}</h3>
                <p className="preview-strategy">
                  {player2.bot?.strategyDescription}
                </p>
              </div>
            </div>

            <button className="btn btn-fight" onClick={startFight}>
              🔥 START BATTLE!
            </button>
          </div>
        )}

        {/* Fighting / Results Phase — Arena */}
        {(phase === "fighting" || phase === "results") && (
          <div className="arena-phase">
            {gameState && <Hud gameState={gameState} />}
            <ArenaCanvas gameState={gameState} countdown={countdown} />

            {phase === "results" && (
              <div className="results-actions">
                <button className="btn btn-fight" onClick={startFight}>
                  🔄 Rematch
                </button>
                <button className="btn btn-secondary" onClick={handleNewMatch}>
                  🤖 New Bots
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          config={llmConfig}
          onChange={setLLMConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
