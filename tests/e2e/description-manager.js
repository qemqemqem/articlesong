const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.join(__dirname, '../fixtures/song_descriptions.json');

/**
 * Description Manager
 * Handles loading, selecting, and removing song descriptions to avoid Suno rate limiting
 */
class DescriptionManager {
  constructor() {
    this.descriptions = [];
    this.loadDescriptions();
  }

  /**
   * Load descriptions from the fixture file
   */
  loadDescriptions() {
    try {
      const data = fs.readFileSync(FIXTURE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      this.descriptions = parsed.descriptions || [];
      console.log(`📚 Loaded ${this.descriptions.length} song descriptions`);
    } catch (error) {
      console.error('❌ Failed to load song descriptions:', error);
      this.descriptions = [];
    }
  }

  /**
   * Get a random description and remove it from the list
   * @returns {Object|null} A description object with title and content
   */
  getRandomAndRemove() {
    if (this.descriptions.length === 0) {
      console.warn('⚠️  No descriptions left! Reloading from file...');
      this.loadDescriptions();
      
      if (this.descriptions.length === 0) {
        throw new Error('No song descriptions available in fixture file');
      }
    }

    // Get random index
    const randomIndex = Math.floor(Math.random() * this.descriptions.length);
    
    // Remove and return the description
    const description = this.descriptions.splice(randomIndex, 1)[0];
    
    // Save the updated list back to file
    this.saveDescriptions();
    
    console.log(`🎲 Selected: "${description.title}" (${this.descriptions.length} remaining)`);
    
    return description;
  }

  /**
   * Save the current descriptions back to the fixture file
   */
  saveDescriptions() {
    try {
      const data = JSON.stringify({ descriptions: this.descriptions }, null, 2);
      fs.writeFileSync(FIXTURE_PATH, data, 'utf8');
    } catch (error) {
      console.error('❌ Failed to save descriptions:', error);
    }
  }

  /**
   * Get the count of remaining descriptions
   * @returns {number}
   */
  getRemainingCount() {
    return this.descriptions.length;
  }

  /**
   * Reset the descriptions to the original set (useful for testing)
   * This doesn't actually reset - we just reload from file
   */
  reset() {
    this.loadDescriptions();
  }
}

module.exports = DescriptionManager;

