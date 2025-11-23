/**
 * Lyrics Generation Prompts
 * Modernized for Claude Sonnet 4.5 and Suno AI (2025)
 * 
 * Updated to use Suno's annotation system and modern prompting techniques.
 */

const SYSTEM_PROMPT = `You are a professional songwriter creating lyrics for Suno AI music generation. Your output will be used directly in an AI music generation system.

Key requirements:
- Use structural annotations in square brackets: [Intro], [Verse], [Chorus], [Bridge], [Outro]
- Keep lyrics under 3000 characters for compatibility with all Suno models
- Never mention living artists, celebrities, or trademarked names
- Write lyrics that flow naturally when sung`;

/**
 * Generate the lyrics prompt based on article text and song style
 */
function getLyricsPrompt(articleText, songStyle) {
  // Special case: use article text directly as lyrics
  if (songStyle === "straight") {
    return null;
  }
  
  let prompt = `<task>
Write song lyrics based on the article text below. Transform the content into singable, engaging lyrics.
</task>

<article_text>
${articleText}
</article_text>

<requirements>
- Use as much of the article content as possible
- Ignore headers, footers, and boilerplate text
- Use Suno AI structural tags: [Intro], [Verse], [Chorus], [Bridge], [Outro]
- Keep total length under 3000 characters
- Make lyrics flow naturally when sung
- Do NOT mention artist names, celebrities, or trademarks
</requirements>

<style_guidance>
`;
  
  switch(songStyle) {
    case "spoken":
      prompt += `Style: SPOKEN WORD
- Focus on rhythmic flow and emphasis on words over melody
- Use [Verse] tags for main sections
- Consider [Rapped Verse] or [Spoken Verse] annotations for style hints
- Prioritize clarity and rhythm over rhyme
- Build momentum through repetition and cadence`;
      break;
      
    case "musical":
      prompt += `Style: TRADITIONAL MUSICAL
- Create clear verse-chorus structure: [Verse], [Chorus], [Bridge]
- Focus on melody, rhyme, and singability
- Make the chorus catchy and repeatable
- Use varied verse content with consistent chorus
- Consider [Pre-Chorus] to build tension before chorus`;
      break;
      
    case "meme":
      prompt += `Style: MEME SONG (Humorous/Viral)
- Make it catchy, funny, and internet-culture friendly
- Use juvenile humor, absurdity, funny rhymes, or playful content
- Focus on the article content (not self-referential about being a meme)
- Include hooks that could go viral
- Use [Verse] and [Chorus] but keep energy high throughout
- Don't be afraid to be silly or unexpected`;
      break;
      
    case "cute":
      prompt += `Style: CUTE & LIGHT-HEARTED
- Write uplifting lyrics that make listeners smile
- Focus on positive themes: love, friendship, happiness, warmth
- Make it catchy and easy to sing along to
- Use simple, clear language with gentle rhymes
- Consider [Happy Verse] or [Upbeat Chorus] annotations
- Keep the tone wholesome and cheerful`;
      break;
      
    case "informative":
      prompt += `Style: EDUCATIONAL/INFORMATIVE
- Convey maximum factual information from the article
- Include key facts, statistics, and important details
- Prioritize accuracy and educational value
- Use clear, easy-to-understand language
- Structure can be looser - focus on content delivery
- Consider [Verse] tags for different topics or sections
- Make it memorable so listeners learn while listening`;
      break;
      
    default:
      prompt += `Style: BALANCED ARTICLE-TO-SONG
- Capture key facts, ideas, emotions, and important passages
- If a line from the article is particularly striking, try to include it
- Balance educational content with musical appeal
- Make it both informative and emotionally resonant
- Use standard structure: [Intro], [Verse], [Chorus], [Bridge], [Outro]
- Capture the "vibe" of the original piece`;
  }
  
  prompt += `
</style_guidance>

<output_format>
Write only the lyrics with structural annotations. Example format:

[Intro]
Opening lyrics here...

[Verse]
First verse lyrics...

[Chorus]
Chorus lyrics that repeat...

[Verse]
Second verse lyrics...

[Chorus]
Chorus repeats...

[Bridge]
Bridge section...

[Outro]
Closing lyrics...
</output_format>`;
  
  return prompt;
}

/**
 * Generate the style tags prompt based on lyrics and song style
 */
function getStyleTagsPrompt(lyrics, songStyle) {
  let prompt = `<task>
Based on the song lyrics below, suggest a musical style description for Suno AI.
</task>

<lyrics>
${lyrics}
</lyrics>

<requirements>
- Keep response under 200 characters (Suno V4 limit)
- Use comma-separated style descriptors
- Include: genre, mood, tempo/energy, and optional instrumentation
- Do NOT mention living artist names or celebrities
- Focus on musical qualities, not artist references
</requirements>

<examples>
Good examples:
- "Indie Pop, Dreamy, Upbeat, Synths, Warm Vocals"
- "Folk Acoustic, Melancholic, 85 BPM, Fingerpicking Guitar"
- "Electronic Dance, Energetic, 128 BPM, Synth Bass, Punchy Drums"
- "Singer-Songwriter, Intimate, Soft Piano, Emotional"
</examples>

<style_context>
Song style requested: ${songStyle}
`;
  
  if (songStyle === "meme") {
    prompt += `
Special note: This is intended as a humorous/viral meme song. Consider wacky or silly styles (e.g., "Novelty Pop", "Comedy Rap", "Quirky Electronic"). However, if the lyrics themselves are already very humorous, you could choose a more serious style for comedic contrast.`;
  } else if (songStyle === "spoken") {
    prompt += `
Special note: This should be a spoken word piece. Focus on rhythm and delivery over melody. Good descriptors: "Spoken Word", "Rap", "Hip-Hop", "Poetry Slam", "Rhythmic Storytelling", "Folk Storytelling".`;
  }
  
  prompt += `
</style_context>

Output only the style description (under 200 characters), nothing else.`;
  
  return prompt;
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SYSTEM_PROMPT, getLyricsPrompt, getStyleTagsPrompt };
}

