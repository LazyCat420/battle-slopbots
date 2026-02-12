# BattleBots: AI Arena

> Design battle robots with natural language. Let an LLM build them. Watch them fight.

## 🎮 What is this?

A 2D top-down fighting game where two players **describe** their robots in plain English, and an LLM (GPT-4o, Ollama, or LM Studio) generates the bot's shape, stats, weapon, and AI behavior code. The bots then battle in a physics-powered arena.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## ⚙️ LLM Configuration

Click the **⚙️ Settings** button in the top-right corner to configure your LLM provider:

| Provider | URL | Notes |
|----------|-----|-------|
| **Ollama** (default) | `http://localhost:11434` | Run `ollama serve` first. Use a model that supports JSON output (e.g., `llama3.1`) |
| **LM Studio** | `http://localhost:1234/v1` | Start LM Studio server first |
| **OpenAI** | `https://api.openai.com/v1` | Requires API key. GPT-4o recommended |

## 🎯 How to Play

1. **Player 1** describes their bot (e.g., *"A fast hexagonal bot with spinning blades that circles the enemy"*)
2. Click **⚡ Generate Bot** — the LLM creates the bot
3. Review the bot's stats and AI strategy, then **🔒 Lock In**
4. **Player 2** does the same
5. Click **🔥 START BATTLE!**
6. Watch the bots fight in the arena!
7. **🔄 Rematch** or **🤖 New Bots**

## 📁 Project Structure

```
battle-bots/
├── app/
│   ├── api/generate-bot/route.ts   # LLM bot generation API
│   ├── globals.css                 # Global styling
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Main game page
├── components/
│   ├── ArenaCanvas.tsx             # 2D canvas battle renderer
│   ├── BotDesigner.tsx             # Bot description + preview UI
│   ├── Hud.tsx                     # Match HUD (health, timer)
│   └── SettingsModal.tsx           # LLM provider settings
├── lib/
│   ├── engine/
│   │   ├── game-engine.ts          # Matter.js physics + game loop
│   │   └── sandbox.ts             # Safe bot code execution
│   ├── llm/
│   │   ├── prompt.ts              # System prompt + examples
│   │   └── provider.ts            # Multi-provider LLM client
│   ├── store/
│   │   └── game-store.ts          # Zustand state management
│   ├── types/
│   │   └── bot.ts                 # Bot SDK type definitions
│   └── validation/
│       └── bot-validator.ts       # Schema validation + sanitization
└── package.json
```

## 🧠 How the Bot SDK Works

The LLM doesn't write arbitrary code — it generates a **BotDefinition** JSON that conforms to a strict schema:

- **Shape**: circle, rectangle, triangle, pentagon, hexagon
- **Stats**: speed (1-10), armor (1-10), size (1-5)
- **Weapon**: type + damage + cooldown + range
- **Behavior**: A JavaScript function body that uses a limited `BehaviorAPI`

The behavior function can only call safe methods like `api.getEnemyPosition()`, `api.moveToward()`, `api.attack()`, etc. No filesystem, network, or global access.

## 🔧 Tech Stack

- **Next.js 16** (App Router + TypeScript)
- **Matter.js** (2D physics engine)
- **HTML5 Canvas** (arena rendering)
- **Zustand** (state management)
- **OpenAI / Ollama / LM Studio** (LLM providers)
