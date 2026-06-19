import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';

export enum PromptEngineeringMode {
  NATIVE = 'native',
  JSON = 'json',
  XML = 'xml',
}

export type PromptSenderRole = 'user' | 'assistant';

export interface Schema {
  name: string;
  value: object;
  html: string;
}

export interface ExtensionSettings {
  version: string;
  formatVersion: string;
  profileId: string;
  maxResponseToken: number;
  autoMode: AutoModeOptions;
  schemaPreset: string;
  schemaPresets: Record<string, Schema>;
  prompt: string;
  includeLastXMessages: number; // 0 means all messages
  includeLastXWTrackerMessages: number; // 0 means none
  promptEngineeringMode: PromptEngineeringMode;
  promptRole: PromptSenderRole;
  promptJson: string;
  promptXml: string;
}

export const extensionName = 'SillyTavern-WTracker-Panel';

export const DEFAULT_PROMPT = `You are a Scene Tracker Assistant. You maintain a clear, consistent, structured tracker for a roleplay. Use the latest message, the previous tracker, and recent context to update every field. Each field must be filled and complete. When something is not stated, make reasonable assumptions from prior descriptions, logical inference, or sensible defaults — never leave a field empty.

### LANGUAGE RULE (IMPORTANT):
- All field VALUES shown to the user must be written in **German** (e.g. thoughts, goals, secrets, outfit, location, build, race, gender, etc.).
- All JSON KEYS / variable names stay in **English** exactly as defined in the schema. Never translate or rename a key.

### TIME PROGRESSION — READ FIRST, THIS IS CRITICAL:
The most common failure is jumping the clock too far. Two sentences of dialogue are NOT an hour. Follow this strictly:
1. **Reason BEFORE setting the clock.** First fill "timeElapsed": estimate how much real time the latest message took and justify it in a few German words. ONLY THEN compute "time" by adding that amount to the previous time. Never write "time" first.
2. **Default is almost no time.** Unless the message explicitly contains a time skip, assume only SECONDS passed. The burden is on the scene to justify any larger jump.
3. **Dialogue costs almost no time.** One or two spoken lines ≈ 5–30 seconds, no matter how emotionally significant.
4. **Anchors:** a glance/gesture/short line ≈ 5–15 s; a few sentences back-and-forth ≈ 30 s–2 min; a longer conversation ≈ 3–10 min; a meal ≈ 20–40 min; walking nearby ≈ a few min; sleep/travel/"hours later" ≈ as stated.
5. **Hard cap without explicit skip:** if the message does NOT explicitly state a skip (sleep, travel, "later", scene change), NEVER advance more than ~5 minutes. Prefer seconds.
6. **Only jump when earned**, i.e. when the message explicitly establishes it.
7. **Format:** "HH:MM:SS; MM/DD/YYYY (Day Name)". Keep date/day consistent unless elapsed time crosses midnight.

### CHARACTER FIELDS:
- **name / age / gender / race**: identity basics. age may be approximate ("ca. 300 Jahre"); gender (männlich, weiblich, divers, ...); race can be anything (Mensch, Elf, Zwerg, Kemonomimi, ...). Keep these stable once established.
- **appearance.height**: body height (e.g. "ca. 175 cm").
- **appearance.build**: detailed physique description (body type, proportions, distinctive marks). Write it richly — this field is used to generate images.
- **appearance.hair**: hairstyle, color, condition.
- **appearance.eyeColor**: eye color.
- **appearance.makeup**: makeup or "Kein Make-up".
- **clothing.outfit**: the complete outfit with specific color, fabric, style. **Underwear MUST always be included.** If intentionally absent, say so ("Kein BH", "Kein Slip"). If undressed, still list the full outfit and where it is.
- **clothing.stateOfDress**: how put-together or disheveled; note removed clothing and where discarded items lie.

### INVENTORY (slow-changing — persist across updates, change only when the scene causes it):
- **inventory.money**: current money/currency held (e.g. "150 Goldmünzen, 7 Silber").
- **inventory.weapons**: array of weapons carried.
- **inventory.belongings**: array of other notable items carried.

### CONDITION:
- **condition.postureAndInteraction**: current physical positioning and interaction.
- **condition.physicalState** (slow): injuries, exhaustion, intoxication, hunger, pain, arousal. Once established it PERSISTS until the scene changes it. Never silently drop an injury. Use "Unversehrt" if nothing notable.

### MIND (layers change at DIFFERENT speeds — respect that):
- **mind.emotionalState** (slow): underlying mood/baseline (e.g. "angespannt, unterdrückte Wut, erschöpft"). Changes only gradually; do not swing wildly.
- **mind.thoughts** (fast): the immediate internal thought right now, inferred from what just happened. May diverge from what the character says or shows — capture that gap. May change every update.
- **mind.goals**: current short-term and (where inferable) long-term goals. Evolve logically; drop goals already achieved or abandoned.
- **mind.knowledgeState**: what the character currently KNOWS and does NOT know that is relevant. A character must never display knowledge they had no way to obtain. Update only when the scene grants new information.
- **mind.secrets**: what the character hides from the others present. Append a status tag per secret: (verborgen), (angedeutet) or (aufgedeckt). Once revealed in-scene, mark it (aufgedeckt) — never treat it as hidden again. Meta-info for the tracker only. Use "Keine bekannt" if nothing is established.

### RELATIONSHIPS:
For EACH other present character, give this character's relationship toward them: a short German **status** label (Verbündeter, Rivalin, Fremder, Geliebte, ...) and the current **dynamic** (trust, tension, recent shift). Keep relationships consistent and bidirectionally plausible. Update only as the scene shifts them.

### QUESTS & SKILLS:
- **quests**: array of the character's active quests/objectives as short German lines. Keep resolved quests only if still relevant; otherwise drop them.
- **skills**: array of the character's notable abilities/skills as short German lines. Slow-changing; add only when the scene establishes a new ability.

### SCENE FIELDS:
- **changeLog**: in one or two German sentences, state what concretely changed since the previous tracker (events, state shifts, revelations, relationship moves). Use "Keine wesentlichen Änderungen" if nothing relevant changed.
- **location**: specific and detailed, e.g. "Schankraum, Ecktisch am Kamin, Gasthaus 'Zum Goldenen Hirsch', Untermarkt".
- **weather**: conditions and temperature.
- **topics.primaryTopic / emotionalTone / interactionTheme**: one- or two-word German keywords. Avoid long phrases.
- **charactersPresent**: array of names currently present.

### CONSISTENCY MANDATE (CRITICAL):
- Compare against the previous tracker before writing. Slow layers (time, age, gender, race, appearance, inventory, physicalState, emotionalState, knowledgeState, secrets, relationships, skills) must carry forward and evolve LOGICALLY rather than resetting each update.
- Never contradict an established fact, injury, secret status, or relationship without an in-scene cause.
- timeElapsed, thoughts and changeLog are the fast/reactive layers; everything else should feel persistent.
- Respond with the FULL tracker every time, even for minor updates.

Your objective: clarity, consistency, and complete detail across all layers. Remember: field values in German, JSON keys in English; always reason out timeElapsed before setting the clock.`;

export const DEFAULT_PROMPT_JSON = `You are a highly specialized AI assistant. Your SOLE purpose is to generate a single, valid JSON object that strictly adheres to the provided JSON schema.

**CRITICAL INSTRUCTIONS:**
1.  You MUST wrap the entire JSON object in a markdown code block (\`\`\`json\\n...\\n\`\`\`).
2.  Your response MUST NOT contain any explanatory text, comments, or any other content outside of this single code block.
3.  The JSON object inside the code block MUST be valid and conform to the schema.
4.  All field VALUES must be written in German; all JSON KEYS stay in English exactly as in the schema.

**JSON SCHEMA TO FOLLOW:**
\`\`\`json
{{schema}}
\`\`\`

**EXAMPLE OF A PERFECT RESPONSE:**
\`\`\`json
{{example_response}}
\`\`\`
`;

export const DEFAULT_PROMPT_XML = `You are a highly specialized AI assistant. Your SOLE purpose is to generate a single, valid XML structure that strictly adheres to the provided example.

**CRITICAL INSTRUCTIONS:**
1.  You MUST wrap the entire XML object in a markdown code block (\`\`\`xml\\n...\\n\`\`\`).
2.  Your response MUST NOT contain any explanatory text, comments, or any other content outside of this single code block.
3.  The XML object inside the code block MUST be valid.
4.  All field VALUES must be written in German; all XML tags stay in English exactly as in the schema.

**JSON SCHEMA TO FOLLOW:**
\`\`\`json
{{schema}}
\`\`\`

**EXAMPLE OF A PERFECT RESPONSE:**
\`\`\`xml
<root>
{{example_response}}
</root>
\`\`\`
`;

export const DEFAULT_SCHEMA_VALUE: object = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SceneTracker',
  description: 'Schema for tracking roleplay scene details',
  type: 'object',
  properties: {
    timeElapsed: {
      type: 'string',
      description:
        "Estimated real in-scene time passed since the previous tracker, WITH a short justification (e.g. 'ca. 15 Sekunden — kurzer Wortwechsel'). Reason this out BEFORE 'time'. Default to seconds.",
    },
    time: {
      type: 'string',
      description: "Resulting clock time after adding timeElapsed. Format: HH:MM:SS; MM/DD/YYYY (Day Name)",
    },
    location: {
      type: 'string',
      description: 'Specific scene location with increasing specificity',
    },
    weather: {
      type: 'string',
      description: 'Current weather conditions and temperature',
    },
    changeLog: {
      type: 'string',
      description:
        "One or two sentences on what concretely changed since the previous tracker. Use 'Keine wesentlichen Änderungen' if nothing relevant changed.",
    },
    topics: {
      type: 'object',
      properties: {
        primaryTopic: { type: 'string', description: '1-2 word main topic of interaction' },
        emotionalTone: { type: 'string', description: 'Dominant emotional tone of scene' },
        interactionTheme: { type: 'string', description: 'Type of character interaction' },
      },
      required: ['primaryTopic', 'emotionalTone', 'interactionTheme'],
    },
    charactersPresent: {
      type: 'array',
      items: { type: 'string', description: 'Character name' },
      description: 'List of character names present in scene',
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Character name' },
          age: { type: 'string', description: "Character age, may be approximate (e.g. 'ca. 300 Jahre')" },
          gender: { type: 'string', description: 'Character gender (männlich, weiblich, divers, ...)' },
          race: { type: 'string', description: 'Species/race (Mensch, Elf, Zwerg, Kemonomimi, ...)' },
          appearance: {
            type: 'object',
            description: 'Physical appearance group',
            properties: {
              height: { type: 'string', description: "Body height, e.g. 'ca. 175 cm'" },
              build: {
                type: 'string',
                description: 'Detailed physique/body type — used for image generation, be descriptive',
              },
              hair: { type: 'string', description: 'Hairstyle, color and condition' },
              eyeColor: { type: 'string', description: 'Eye color' },
              makeup: { type: 'string', description: "Makeup description or 'Kein Make-up'" },
            },
            required: ['height', 'build', 'hair', 'eyeColor', 'makeup'],
          },
          clothing: {
            type: 'object',
            description: 'Clothing group',
            properties: {
              outfit: { type: 'string', description: 'Complete outfit including underwear' },
              stateOfDress: { type: 'string', description: 'How put-together/disheveled the character appears' },
            },
            required: ['outfit', 'stateOfDress'],
          },
          inventory: {
            type: 'object',
            description: 'Inventory group (slow-changing)',
            properties: {
              money: { type: 'string', description: 'Money/currency currently held' },
              weapons: { type: 'array', items: { type: 'string' }, description: 'Weapons carried' },
              belongings: { type: 'array', items: { type: 'string' }, description: 'Other notable items carried' },
            },
            required: ['money', 'weapons', 'belongings'],
          },
          condition: {
            type: 'object',
            description: 'Physical condition group',
            properties: {
              postureAndInteraction: {
                type: 'string',
                description: "Character's physical positioning and interaction",
              },
              physicalState: {
                type: 'string',
                description:
                  "Injuries, exhaustion, intoxication, hunger, pain, arousal. Persists across updates. 'Unversehrt' if nothing notable.",
              },
            },
            required: ['postureAndInteraction', 'physicalState'],
          },
          mind: {
            type: 'object',
            description: 'Inner state group',
            properties: {
              emotionalState: {
                type: 'string',
                description: 'Slow-moving underlying mood/baseline. Changes only gradually.',
              },
              thoughts: {
                type: 'string',
                description: 'Immediate internal thought right now. May differ from outward behavior. Fast-changing.',
              },
              goals: { type: 'string', description: 'Current short-term and long-term goals. Evolve logically.' },
              knowledgeState: {
                type: 'string',
                description: 'What the character knows AND does not know relevant to the scene.',
              },
              secrets: {
                type: 'string',
                description:
                  "Hidden info, with status tags (verborgen)/(angedeutet)/(aufgedeckt). 'Keine bekannt' if none.",
              },
            },
            required: ['emotionalState', 'thoughts', 'goals', 'knowledgeState', 'secrets'],
          },
          relationships: {
            type: 'array',
            description: 'Relationship toward each other present character',
            items: {
              type: 'object',
              properties: {
                target: { type: 'string', description: 'Name of the other character' },
                status: { type: 'string', description: 'Short relationship label (Verbündeter, Rivalin, ...)' },
                dynamic: { type: 'string', description: 'Current dynamic: trust, tension, recent shift' },
              },
              required: ['target', 'status', 'dynamic'],
            },
          },
          quests: {
            type: 'array',
            items: { type: 'string' },
            description: "Active quests/objectives as short German lines",
          },
          skills: {
            type: 'array',
            items: { type: 'string' },
            description: 'Notable abilities/skills as short German lines',
          },
        },
        required: [
          'name',
          'age',
          'gender',
          'race',
          'appearance',
          'clothing',
          'inventory',
          'condition',
          'mind',
          'relationships',
          'quests',
          'skills',
        ],
      },
      description: 'Array of character objects',
    },
  },
  required: ['timeElapsed', 'time', 'location', 'weather', 'changeLog', 'topics', 'charactersPresent', 'characters'],
};

export const DEFAULT_SCHEMA_HTML = `<div class="wtracker_default_mes_template">
    <details>
        <summary><span>Tracker Details</span></summary>

        <table>
            <tbody>
                <tr><td>Zeit:</td><td>{{data.time}}</td></tr>
                <tr><td>Vergangen:</td><td><em>{{data.timeElapsed}}</em></td></tr>
                <tr><td>Ort:</td><td>{{data.location}}</td></tr>
                <tr><td>Wetter:</td><td>{{data.weather}}</td></tr>
                <tr><td>Änderungen:</td><td><em>{{data.changeLog}}</em></td></tr>
            </tbody>
        </table>

        <table>
            <tbody>
                <tr>
                    <td>Themen:</td>
                    <td>{{data.topics.primaryTopic}}; {{data.topics.emotionalTone}}; {{data.topics.interactionTheme}}</td>
                </tr>
                <tr>
                    <td>Anwesend:</td>
                    <td>{{join data.charactersPresent ', '}}</td>
                </tr>
            </tbody>
        </table>

        <div class="mes_wtracker_characters">
            {{#each data.characters as |character|}}
            <hr>
            <strong>{{character.name}}</strong> <small>({{character.age}}, {{character.gender}}, {{character.race}})</small><br>
            <table>
                <tbody>
                    <tr><td><strong>Aussehen</strong></td><td></td></tr>
                    <tr><td>Größe:</td><td>{{character.appearance.height}}</td></tr>
                    <tr><td>Statur:</td><td>{{character.appearance.build}}</td></tr>
                    <tr><td>Haare:</td><td>{{character.appearance.hair}}</td></tr>
                    <tr><td>Augen:</td><td>{{character.appearance.eyeColor}}</td></tr>
                    <tr><td>Make-up:</td><td>{{character.appearance.makeup}}</td></tr>

                    <tr><td><strong>Kleidung</strong></td><td></td></tr>
                    <tr><td>Outfit:</td><td>{{character.clothing.outfit}}</td></tr>
                    <tr><td>Zustand:</td><td>{{character.clothing.stateOfDress}}</td></tr>

                    <tr><td><strong>Inventar</strong></td><td></td></tr>
                    <tr><td>Geld:</td><td>{{character.inventory.money}}</td></tr>
                    <tr><td>Waffen:</td><td>{{join character.inventory.weapons ', '}}</td></tr>
                    <tr><td>Gegenstände:</td><td>{{join character.inventory.belongings ', '}}</td></tr>

                    <tr><td><strong>Körper</strong></td><td></td></tr>
                    <tr><td>Position:</td><td>{{character.condition.postureAndInteraction}}</td></tr>
                    <tr><td>Verfassung:</td><td>{{character.condition.physicalState}}</td></tr>

                    <tr><td><strong>Geist</strong></td><td></td></tr>
                    <tr><td>Stimmung:</td><td>{{character.mind.emotionalState}}</td></tr>
                    <tr><td>Gedanken:</td><td><em>{{character.mind.thoughts}}</em></td></tr>
                    <tr><td>Ziele:</td><td>{{character.mind.goals}}</td></tr>
                    <tr><td>Wissen:</td><td>{{character.mind.knowledgeState}}</td></tr>
                    <tr><td>Geheimnisse:</td><td>{{character.mind.secrets}}</td></tr>

                    <tr><td><strong>Beziehungen</strong></td><td></td></tr>
                    <tr><td></td><td>
                        {{#each character.relationships as |rel|}}
                        <strong>{{rel.target}}</strong> ({{rel.status}}): {{rel.dynamic}}<br>
                        {{/each}}
                    </td></tr>

                    <tr><td>Quests:</td><td>{{join character.quests ', '}}</td></tr>
                    <tr><td>Fähigkeiten:</td><td>{{join character.skills ', '}}</td></tr>
                </tbody>
            </table>
            {{/each}}
        </div>
    </details>
</div>
<hr>`;

const VERSION = '0.1.0';
const FORMAT_VERSION = 'F_1.0';
export const EXTENSION_KEY = 'WTracker';

export const defaultSettings: ExtensionSettings = {
  version: VERSION,
  formatVersion: FORMAT_VERSION,
  profileId: '',
  maxResponseToken: 16000,
  autoMode: AutoModeOptions.NONE,
  schemaPreset: 'default',
  schemaPresets: {
    default: {
      name: 'Default',
      value: DEFAULT_SCHEMA_VALUE,
      html: DEFAULT_SCHEMA_HTML,
    },
  },
  prompt: DEFAULT_PROMPT,
  includeLastXMessages: 0,
  includeLastXWTrackerMessages: 1,
  promptEngineeringMode: PromptEngineeringMode.NATIVE,
  promptRole: 'user',
  promptJson: DEFAULT_PROMPT_JSON,
  promptXml: DEFAULT_PROMPT_XML,
};