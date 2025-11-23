/**
 * Lyrics Generation Prompts
 * Modernized for Claude Sonnet 4.5 and Suno AI (2025)
 * 
 * Updated to use Suno's annotation system and modern prompting techniques.
 * Supports customizable song styles.
 */

// ============================================================================
// DEFAULT STYLES - Starting point for customization
// ============================================================================

const DEFAULT_STYLES = [
  {
    id: "spoken",
    name: "Spoken",
    description: "Style: SPOKEN WORD - Focus on rhythmic flow and emphasis on words over melody. Use [Verse] tags for main sections. Consider [Rapped Verse] or [Spoken Verse] annotations for style hints. Write in COMPLETE SENTENCES - this is storytelling, not atmospheric fragments. Prioritize clarity and rhythm - let the words punch. Build momentum through repetition, cadence, and intensity. Think slam poetry energy - raw, powerful, unfiltered. Use alliteration, internal rhyme, and percussive consonants. Each line should express a complete thought or be part of a larger sentence."
  },
  {
    id: "musical",
    name: "Musical",
    description: "Style: TRADITIONAL MUSICAL - Create clear verse-chorus structure: [Verse], [Chorus], [Bridge]. Focus on melody, rhyme, and singability. Make the chorus IRRESISTIBLY catchy and repeatable. Use varied verse content with consistent, powerful chorus. Consider [Pre-Chorus] to build dramatic tension before chorus. Write in complete sentences that tell a story - think Broadway narrative songs. Each line should express a full thought, not just evocative fragments. Think Broadway-level hooks - something people will be humming for days."
  },
  {
    id: "meme",
    name: "Meme",
    description: "Style: MEME SONG (Humorous/Viral) - Make it catchy, funny, and internet-culture friendly. Use juvenile humor, absurdity, unexpected rhymes, or chaotic energy. Focus on the article content (not self-referential about being a meme). Include hooks that could go viral - be BOLD and memorable. Prefer complete sentences but you can break this rule for comedic effect. Use [Verse] and [Chorus] but keep energy high throughout. Embrace the weird, the silly, the absolutely unhinged. Think 'this could blow up on TikTok' levels of catchy chaos."
  },
  {
    id: "cute",
    name: "Cute",
    description: "Style: CUTE & LIGHT-HEARTED - Write uplifting lyrics that make listeners smile. Focus on positive themes: love, friendship, happiness, warmth. Make it catchy and easy to sing along to. Use simple, clear language with gentle rhymes. Write in complete, conversational sentences - like you're talking to a friend. Consider [Happy Verse] or [Upbeat Chorus] annotations. Keep the tone wholesome and cheerful."
  },
  {
    id: "informative",
    name: "Informative",
    description: "Style: EDUCATIONAL/INFORMATIVE - Convey maximum factual information from the article. Include key facts, statistics, and important details with precision. Prioritize accuracy and educational value. ABSOLUTELY use complete sentences - you're teaching, not evoking. Use clear, easy-to-understand language but make it engaging. Structure can be looser - focus on content delivery. Consider [Verse] tags for different topics or sections. Make it memorable and sticky - turn facts into earworms. Each line should communicate a complete idea or fact. Think 'Schoolhouse Rock' meets modern content - educational but addictive."
  },
  {
    id: "pop",
    name: "Pop",
    description: "Style: POP/CATCHY HOOKS - Prioritize catchy, memorable hooks and singable melodies. YOU MAY use fragmentary phrases and incomplete sentences for impact. Focus on how words sound and flow together - phonetics matter. Create earworm choruses that stick in people's heads. Use [Verse], [Chorus], [Bridge] structure with emphasis on the chorus. Repetition and simple, punchy phrases are your friends. Think radio-friendly, mainstream appeal. It's okay to sacrifice complete thoughts for catchiness here."
  }
];

// ============================================================================
// STYLE MANAGEMENT - Load/Save Custom Styles
// ============================================================================

/**
 * Get the default styles
 */
function getDefaultStyles() {
  return JSON.parse(JSON.stringify(DEFAULT_STYLES)); // Deep clone
}

/**
 * Load custom styles from storage, falling back to defaults
 */
async function loadCustomStyles() {
  if (typeof browser === 'undefined') {
    // Not in browser context (e.g., Node.js testing)
    return getDefaultStyles();
  }
  
  try {
    const result = await browser.storage.local.get(['customStyles', 'stylesVersion']);
    
    if (result.customStyles && result.stylesVersion === 1) {
      return result.customStyles;
    }
    
    // No custom styles yet - initialize with defaults
    const defaults = getDefaultStyles();
    await browser.storage.local.set({
      customStyles: defaults,
      stylesVersion: 1
    });
    
    return defaults;
  } catch (error) {
    console.error('Error loading custom styles:', error);
    return getDefaultStyles();
  }
}

/**
 * Save custom styles to storage
 */
async function saveCustomStyles(styles) {
  if (typeof browser === 'undefined') {
    throw new Error('Cannot save styles outside browser context');
  }
  
  // Validate we have exactly 6 styles
  if (!Array.isArray(styles) || styles.length !== 6) {
    throw new Error('Must have exactly 6 styles');
  }
  
  // Validate each style
  for (const style of styles) {
    if (!style.id || !style.name || !style.description) {
      throw new Error('Each style must have id, name, and description');
    }
  }
  
  await browser.storage.local.set({
    customStyles: styles,
    stylesVersion: 1
  });
}

/**
 * Reset styles to defaults
 */
async function resetStylesToDefaults() {
  const defaults = getDefaultStyles();
  await saveCustomStyles(defaults);
  return defaults;
}

// ============================================================================
// LYRICS GENERATION - System Prompt & Functions
// ============================================================================

const LYRICS_SYSTEM_PROMPT = `You are a professional songwriter creating lyrics for Suno AI music generation. Your output will be used directly in an AI music generation system.

CRITICAL: SYNTACTIC INTEGRITY IN LYRICS
You must prioritize COMPLETE GRAMMATICAL SENTENCES over fragmentary phrases. This is non-negotiable for most styles.

Why Complete Sentences Matter:
- PROPOSITIONAL CONTENT: Sentences assert, describe, narrate. Fragments merely evoke. You need to communicate IDEAS, not create atmospheric collage.
- NARRATIVE COHERENCE: Sentences create cause-effect chains, temporal sequences, logical progressions. Essential for information retention.
- COGNITIVE PROCESSING: Syntactically complete lyrics engage linguistic processing more fully, improving both emotional connection and learning.
- TRADITION: This aligns with folk/literary songwriting (Dylan, Mitchell, Cohen, Hozier) where lyrics function as oral literature.

Technical Guidance:
✓ GOOD: "I'm walking through the city where the neon lights don't sleep"
✗ BAD: "City lights / Neon dreams / Never sleeping"

✓ GOOD: "The data shows that algorithms are learning how we think"  
✗ BAD: "Data streams / Algorithm minds / Learning us"

Prosody with Complete Sentences:
- Use ENJAMBMENT: Let sentences flow across line breaks naturally
- Internal punctuation (commas, semicolons) creates breath points
- Conjunctions (and, but, so, when, if) create momentum
- Complete sentences DON'T sacrifice singability when properly structured

Syntax Patterns to Use:
- Subject + Verb + Object: "I see the pattern in the data"
- Subordinate clauses: "When the system fails, we learn to adapt"
- Compound sentences: "The research shows X, but reality suggests Y"
- Conditionals: "If we change this, then we'll see results"
- Causal chains: "Because X happened, Y became possible"

Avoid Generic "Lyric-y" Fragments:
- Noun + Adjective stacks: "Fire hearts burning wild"
- Gerund phrases: "Running wild / Feeling free"  
- Imperative fragments: "Feel the beat / Take the night"
- These carry minimal semantic content

Technical Requirements:
- Use structural annotations: [Intro], [Verse], [Chorus], [Bridge], [Outro]
- Keep under 3000 characters for Suno compatibility
- Never mention living artists, celebrities, or trademarked names
- Write lyrics that DISCOURSE - make arguments, tell stories, explain concepts

CREATIVE DIRECTION:
You will receive a creative direction/style description from the user. Treat this as a creative brief from a producer or director. Interpret it intelligently:
- Genre mentions (rock, jazz, Broadway, spoken word) → match that musical aesthetic
- Mood descriptors (raw, catchy, gentle, chaotic) → prioritize that emotional quality
- Structure requests (verse-chorus, storytelling, educational) → follow that format
- Vocal style hints (singable, aggressive, intimate, conversational) → adjust delivery accordingly

The creative direction guides the "what" and "how" - the technical requirements ensure quality and compatibility with Suno AI.`;

// Legacy export for backward compatibility (uses lyrics prompt)
const SYSTEM_PROMPT = LYRICS_SYSTEM_PROMPT;

/**
 * Generate the lyrics prompt based on article text and song style
 * @param {string} articleText - The article content to transform
 * @param {object|string} songStyle - Style object with {id, name, description} or legacy string ID
 */
function getLyricsPrompt(articleText, songStyle) {
  // Handle legacy string-based calls (backward compatibility)
  if (typeof songStyle === 'string') {
    // For "straight" style, return null (use article text directly)
    if (songStyle === "straight") {
      return null;
    }
    
    // Try to find the style in defaults by ID
    const styleObj = DEFAULT_STYLES.find(s => s.id === songStyle);
    if (styleObj) {
      songStyle = styleObj;
    } else {
      // Fallback - use default style
      console.warn(`Unknown style "${songStyle}", using default`);
      songStyle = DEFAULT_STYLES[1]; // Musical as fallback
    }
  }
  
  // Now songStyle should be an object with {id, name, description}
  const styleDescription = songStyle.description || "Balanced article-to-song with clear structure and engaging delivery";
  
  let prompt = `<task>
Write song lyrics based on the article text below, following this creative direction:

"${styleDescription}"

Transform the article content into lyrics that match this style direction.
</task>

<article_text>
${articleText}
</article_text>

<requirements>
CREATIVE DIRECTION: ${styleDescription}

Interpret this direction creatively:
- If it mentions genre (e.g., "Broadway", "Slam Poetry", "Pop"), match that musical aesthetic
- If it mentions mood (e.g., "raw and powerful", "catchy", "gentle"), prioritize that feeling
- If it mentions structure (e.g., "verse-chorus", "storytelling"), follow that format
- If it mentions vocal style (e.g., "spoken word", "singable", "conversational"), adjust accordingly

Think: "What would a songwriter do if given this creative brief?"

TECHNICAL REQUIREMENTS (always apply):
- Use Suno AI structural tags: [Intro], [Verse], [Chorus], [Bridge], [Outro]
- Keep under 3000 characters for Suno compatibility
- Write in COMPLETE SENTENCES with full grammatical structure (unless style explicitly requests fragments)
- Make lyrics flow naturally when sung
- Use as much of the article content as possible
- Ignore headers, footers, and boilerplate text
- Do NOT mention artist names, celebrities, or trademarks

SYNTACTIC GUIDANCE (default, unless style overrides):
- Each line should express a complete thought OR be part of a multi-line sentence using enjambment
- Use subjects, verbs, objects - not just noun phrases and adjective clusters
- Think "discursive lyricism" (making arguments, telling stories) not "impressionistic lyricism" (evoking moods)
- Your lyrics should be able to stand alone as coherent prose if line breaks were removed

PROSODIC TECHNIQUES for sentence-based lyrics:
- ENJAMBMENT: Break sentences across lines at natural phrase boundaries
- CAESURA: Use commas and internal punctuation to create mid-line pauses
- ANAPHORA: Repeat sentence structures or opening phrases for momentum
- PARALLELISM: Match syntactic structures across lines for musicality

AVOID these anti-patterns (unless style specifically requests them):
- Fragment stacking: "Fire hearts / Wild nights / Burning souls"
- Gerund clusters: "Running fast / Feeling free / Breaking chains"  
- Orphaned adjectives: "Beautiful / Powerful / Unstoppable"
- These patterns sound "lyric-y" but communicate nothing substantive
</requirements>

<output_format>
Write only the lyrics with structural annotations. Example format:

[Intro]
The shadows are creeping through the algorithm tonight
And data streams are flowing like digital delirium

[Verse]
I've been dreaming silicon dreams in the midnight glow
These circuit boards remember what the flesh can't know
There are binary whispers hiding in the static haze
And I'm lost in the labyrinth of these modern days

[Chorus]
We're dancing on the edge of everything we know
With electric hearts and synthetic wings that help us grow
We're breaking free from what we used to be before
Welcome to the beautiful catastrophe we've been waiting for

[Verse]
The neon prophecies appear on every screen I see...

[Bridge]
If we strip it down to ones and zeros in the end
We'll find the truth that's hiding underneath the heroes we defend...

[Outro]
We fade into the static, then we fade into the light...

TECHNICAL NOTES ON SENTENCE-BASED LYRICS:

METER & PROSODY - Complete sentences work beautifully with musical meter:
- Match stressed syllables to strong beats
- Natural speech rhythm often aligns with 4/4 or 3/4 meter
- Use iambic (unstressed-STRESSED) or trochaic (STRESSED-unstressed) patterns
- Example: "I WALK through CIty STREETS where NEon LIGHTS don't SLEEP" (iambic pentameter)

RHYME WITH SENTENCES - Multiple approaches:
- END-STOPPED: Sentence ends with rhyme: "I see the pattern in the code / And follow where the data flowed"
- ENJAMBMENT: Sentence continues, rhyme is mid-thought: "I see the pattern flowing through the code / That someone wrote before the system overflowed"
- INTERNAL RHYME: Rhyme within sentence: "The NIGHT is BRIGHT with satellite light cascading"
- SLANT/NEAR RHYME: Allows more natural sentence construction: "thinking/sinking", "code/road"

VERSE CONSTRUCTION with complete thoughts:
- Each verse = paragraph of connected sentences developing one idea
- Use topic sentence technique: First line states theme, subsequent lines elaborate
- Logical connectors between lines: "because", "but", "when", "so", "and then"
- Build complexity: Simple sentence → compound → complex across verse

CHORUS with sentences:
- Chorus can repeat same sentences (traditional)
- OR advance the sentence across repetitions: "We're breaking free (1st) / We're breaking free from everything we used to be (2nd)"
- Hook can be a complete declarative statement: "This is how the world changes" not just "World changing"

EXAMPLE ANALYSIS of sentence-based structure:
✓ "I've been walking through the valley where the shadows learn to speak,
   And they're telling me the stories that the daylight tries to keep,
   But I'm listening to the whispers in the spaces in between,
   Where the truth is hiding underneath the surface of the scene"

This is: 4 complete sentences (with subjects, verbs, objects), connected logically, using enjambment, maintaining AABB rhyme scheme, staying in iambic meter, and communicating a complete narrative idea.

Note: Use complete sentences and full thoughts. Be bold, be vivid, be unexpected. Don't play it safe.
</output_format>`;
  
  return prompt;
}

// ============================================================================
// STYLE TAG GENERATION - System Prompt & Functions
// ============================================================================

const STYLE_SYSTEM_PROMPT = `You are a music style consultant with deep knowledge of genre taxonomy, psychoacoustics, and production aesthetics.

TASK: Analyze lyrics and generate concise style descriptions for Suno AI.

OUTPUT REQUIREMENTS:
- Under 200 characters (strict limit)
- Comma-separated descriptors: genre, mood/affect, tempo/energy, instrumentation/timbre
- Never mention living artist names, celebrities, or trademarked terms
- Focus on sonic qualities, not artist references

MUSIC THEORY GUIDANCE:

GENRE DESCRIPTORS - Be specific, use subgenres:
- Don't say "Rock" → say "Post-Punk Revival", "Math Rock", "Garage Rock", "Psychedelic Rock"
- Don't say "Electronic" → say "IDM", "Glitch-Hop", "Synthwave", "Minimal Techno"
- Don't say "Hip-Hop" → say "Boom Bap", "Trap", "Abstract Hip-Hop", "Jazz Rap"
- Hybrid genres are powerful: "Folk-Punk", "Electro-Swing", "Chamber Pop"

MOOD/AFFECT - Describe emotional valence and arousal:
- Valence (positive/negative): Euphoric, Melancholic, Anxious, Serene, Aggressive, Wistful
- Arousal (high/low energy): Frenetic, Languid, Tense, Relaxed, Chaotic, Meditative
- Combine for precision: "Bittersweet Optimism", "Aggressive Melancholy", "Frantic Joy"

TEMPO/RHYTHMIC FEEL - Be specific when relevant:
- Include BPM for electronic/dance genres (120 BPM, 174 BPM, 85 BPM)
- Descriptive terms: Driving, Breakbeat, Syncopated, Polyrhythmic, Stuttering, Galloping
- Time signature implications: Waltz (3/4), Odd-Meter (5/4, 7/8)

INSTRUMENTATION/TIMBRE - Paint sonic picture:
- Specific over generic: "Fender Rhodes" not "Piano", "Fretless Bass" not "Bass"
- Texture descriptors: Saturated, Clean, Lo-Fi, Compressed, Reverb-Drenched, Dry
- Production aesthetics: Tape-Saturated, Digitally Pristine, Analog Warmth, Glitchy
- Vocal characteristics: Breathy, Raspy, Operatic, Talk-Singing, Whispered, Belted

AVOID CLICHÉS:
- "Catchy" (meaningless)
- "Unique" (every song should be)
- "Powerful" (vague)
- Generic mood words without specificity

BE BOLD AND SPECIFIC. "Melancholic Indie Folk" is boring. "Sparse Appalachian Folk, Mournful, Fingerpicked Banjo, Tape Hiss" paints a picture.`;

/**
 * Generate the style tags prompt based on lyrics and song style
 */
function getStyleTagsPrompt(lyrics, songStyle) {
  let prompt = `<task>
Based on the song lyrics below, suggest a musical style description for Suno AI.

Apply your knowledge of genre taxonomy, production aesthetics, and psychoacoustics to create a style description that will guide the AI to produce sonically interesting results.
</task>

<lyrics>
${lyrics}
</lyrics>

<requirements>
- Keep response under 200 characters (Suno V4 limit)
- Use comma-separated style descriptors
- Include: genre (be specific, use subgenres), mood/affect, tempo/energy, instrumentation/timbre
- Do NOT mention living artist names or celebrities
- Focus on musical qualities, not artist references

MAXIMIZE SPECIFICITY within character limit:
- Use SUBGENRES not broad genres: "Shoegaze" not "Rock", "Drill" not "Hip-Hop"
- Be TEXTURAL: Include production aesthetics (Lo-Fi, Pristine, Saturated, Glitchy)
- Be TIMBRAL: Specific instruments/sounds (Rhodes Piano, Moog Bass, Tape Saturation)
- AFFECT over generic mood: "Wistful Nostalgia" not "Sad", "Frenetic Anxiety" not "Fast"
- Include BPM for electronic/dance genres when relevant
- Hybrid genres show creativity: "Post-Punk Folk", "Ambient Trap", "Baroque Pop"

Think: What would make a music producer excited to hear this described?
</requirements>

<examples>
Good examples that show range and creativity:
- "Industrial Hip-Hop, Gritty, 90 BPM, Distorted Bass, Raw Vocals"
- "Psychedelic Folk, Ethereal, Swirling Guitars, Haunting Harmonies"
- "Aggressive Synthwave, Dark, 140 BPM, Heavy Synth Bass, Retro Drums"
- "Experimental Jazz-Funk, Chaotic, Dissonant Keys, Punchy Horns"
- "Bedroom Pop, Lo-Fi, Intimate, Tape Hiss, Woozy Vocals"
</examples>

<style_context>
Song style requested: ${songStyle}
`;
  
  if (songStyle === "meme") {
    prompt += `
Special note: This is intended as a humorous/viral meme song. Don't be afraid to go wild with the style! Consider: "Hyper-Pop Chaos", "Glitchy Trap Comedy", "Absurdist Electro", "Aggressive Meme Rap", "Deranged Synthwave". You can also do comedic contrast by pairing silly lyrics with serious styles like "Orchestral Epic" or "Dark Industrial".`;
  } else if (songStyle === "spoken") {
    prompt += `
Special note: This should be a spoken word piece. Focus on rhythm and delivery over melody. Go bold: "Raw Hip-Hop", "Aggressive Slam Poetry", "Gritty Beat Poetry", "Intense Storytelling Rap", "Underground Boom Bap", "Experimental Spoken Word". Make it hit hard.`;
  }
  
  prompt += `
</style_context>

Output only the style description (under 200 characters), nothing else.`;
  
  return prompt;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    LYRICS_SYSTEM_PROMPT, 
    STYLE_SYSTEM_PROMPT,
    SYSTEM_PROMPT, // Legacy export (same as LYRICS_SYSTEM_PROMPT)
    getLyricsPrompt, 
    getStyleTagsPrompt,
    // Style management functions
    getDefaultStyles,
    loadCustomStyles,
    saveCustomStyles,
    resetStylesToDefaults,
    DEFAULT_STYLES
  };
}

