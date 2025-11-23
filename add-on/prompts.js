/**
 * Lyrics Generation Prompts
 * Ported from Python backend (article_singer.py)
 * 
 * These prompts have been battle-tested and produce good results!
 */

const SYSTEM_PROMPT = "You write song lyrics. You write lyrics without annotations like \"Chorus\" or \"Verse 1\", which you know might mess up the singer";

/**
 * Generate the lyrics prompt based on article text and song style
 */
function getLyricsPrompt(articleText, songStyle) {
  let prompt = `Write song lyrics based on the following text. Try to use as much of the content as possible in your song. But ignore headers and footers and other boilerplate I may have copied inadvertently:\n\n${articleText}\n\nWrite the lyrics without any annotations like 'Chorus' or 'Verse 1'.\n\n`;
  
  switch(songStyle) {
    case "spoken":
      prompt += "Focus on a spoken word style, with a rhythmic flow and emphasis on the words rather than melody.";
      break;
      
    case "musical":
      prompt += "Create a traditional song structure with verses and a chorus, focusing on melody and rhyme.";
      break;
      
    case "meme":
      prompt += "Make a silly meme song. Make the lyrics catchy, humorous, and internet culture-friendly. Include references or phrases that could go viral. Don't be afraid to use juvenile humor, absurdity, funny rhymes, or explicit jokes. Do not be self-referential about the concept of a meme song, instead focusing on the article and its content. Make it fun and funny!";
      break;
      
    case "cute":
      prompt += "Write a cute, light-hearted song. Focus on themes of love, friendship, or happiness. Use a positive tone that you think will make the listener smile. Make it catchy and easy to sing along to.";
      break;
      
    case "informative":
      prompt += "Write an informative song that focuses on conveying as much factual information from the text as possible. Prioritize accuracy and educational value over rhyme or musical structure. Include key facts, statistics, and important details from the article. Make the lyrics clear and easy to understand, aiming to teach the listener about the topic.";
      break;
      
    case "straight":
      // Special case: use article text directly as lyrics
      return null;
      
    default:
      prompt += "\n\nCapture all the key facts, ideas, emotions, and passages from the text. If there is a line from the article that is really important, try to include it in the lyrics. Try to be educational but also capture the vibes of the piece.";
  }
  
  return prompt;
}

/**
 * Generate the style tags prompt based on lyrics and song style
 */
function getStyleTagsPrompt(lyrics, songStyle) {
  let prompt = `Based on the following ${songStyle} song lyrics, suggest a short description of a musical style that would be good to sing them in. Limit your response to 120 characters or less. A good response would be a short list of tags such as musical styles:\n\n${lyrics}`;
  
  if (songStyle === "meme") {
    prompt += "\n\nI want this to be a humorous meme song, so consider choosing a wacky or silly style. However, if the lyrics are already humorous, you can choose a more serious style to contrast with them.";
  } else if (songStyle === "spoken") {
    prompt += "\n\nI want this to be a spoken word piece, so choose a style description that is more focused on the rhythm and delivery of the words than on melody, such as \"spoken word\", \"rap\", \"poetry slam\", or \"folk storytelling\".";
  }
  
  return prompt;
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SYSTEM_PROMPT, getLyricsPrompt, getStyleTagsPrompt };
}

