/**
 * LLM Prompt Engineering — Compact prompt for reliable bot generation.
 *
 * Designed to fit within small context windows (4K tokens).
 * Contains the system prompt, SDK reference, and one example bot.
 */

export const SYSTEM_PROMPT = `You are a BattleBot designer. Output ONLY a valid JSON object matching this schema.

RULES:
- Output raw JSON only. No markdown, no text, no code fences.
- "behaviorCode" is a JS function body receiving (api, tick).
- Only use api methods listed below. No console, setTimeout, fetch, require, eval.
- Keep behaviorCode SHORT (under 300 chars).

SCHEMA:
{
  "name": string (max 30 chars),
  "shape": "circle"|"rectangle"|"triangle"|"hexagon"|"pentagon",
  "size": 1-5,
  "color": "#hex",
  "speed": 1-10,
  "armor": 1-10,
  "weapon": {
    "type": "spinner"|"flipper"|"hammer"|"saw"|"lance"|"flamethrower",
    "damage": 1-10,
    "cooldown": 200-2000,
    "range": 20-120
  },
  "behaviorCode": string,
  "strategyDescription": string (1 sentence)
}

API METHODS:
Sensing: api.getMyPosition(), api.getEnemyPosition(), api.getDistanceToEnemy(), api.getMyHealth(), api.getEnemyHealth(), api.getMyAngle(), api.getMyVelocity(), api.getArenaSize()
Actions: api.moveToward(pos,speed?), api.moveAway(pos,speed?), api.attack(), api.strafe("left"|"right"), api.rotateTo(angle), api.stop()
Utility: api.angleTo(pos), api.distanceTo(pos), api.random(min,max)

EXAMPLE:
{"name":"Tornado Rex","shape":"hexagon","size":3,"color":"#FF4444","speed":7,"armor":4,"weapon":{"type":"spinner","damage":8,"cooldown":300,"range":50},"behaviorCode":"var e=api.getEnemyPosition();var d=api.getDistanceToEnemy();if(d>80){api.moveToward(e);}else{api.attack();api.moveToward(e,4);}api.rotateTo(api.angleTo(e));","strategyDescription":"Rushes enemy and attacks at close range."}`;

/**
 * Build the full prompt for bot generation.
 * @param userDescription The user's natural language description of their bot
 * @param previousError Optional: error from a previous failed attempt (for retry)
 */
export function buildBotPrompt(
  userDescription: string,
  previousError?: string
): { system: string; user: string } {
  let userPrompt = `Design a battle bot: "${userDescription}"\nOutput ONLY the JSON object.`;

  if (previousError) {
    // Cap error feedback to prevent context overflow
    const truncatedError = previousError.slice(0, 200);
    userPrompt += `\n\nPREVIOUS ERROR: ${truncatedError}\nFix and output corrected JSON only.`;
  }

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  };
}
