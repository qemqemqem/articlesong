/**
 * Article Song - Claude API client
 *
 * Model IDs get retired. Instead of hardcoding one, we resolve the model at
 * runtime from the account's own /v1/models list (newest Opus > Sonnet > Haiku),
 * cache it, and re-resolve + retry once if the API says the model is gone.
 * An optional user override (settings.claudeModel) wins until it stops working.
 *
 * Failures are never swallowed: after the one self-healing retry, errors throw.
 */

const ClaudeClient = {
  API_BASE: 'https://api.anthropic.com/v1',
  API_VERSION: '2023-06-01',
  MODEL_CACHE_KEY: 'claudeModelCache',
  MODEL_CACHE_TTL_MS: 24 * 60 * 60 * 1000,
  FAMILY_PREFERENCE: ['opus', 'sonnet', 'haiku'],
  MAX_TRANSIENT_RETRIES: 2,
  noThinkingModels: new Set(), // models that rejected budgeted extended thinking

  _headers(apiKey) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': this.API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  },

  /** Pick the best model id from a /v1/models list (API returns newest first). */
  pickBestModel(models) {
    for (const family of this.FAMILY_PREFERENCE) {
      const match = models.find(m => m.id.includes(family));
      if (match) return match.id;
    }
    if (models.length === 0) throw new Error('Anthropic returned no available models for this API key');
    return models[0].id;
  },

  async fetchBestModel(apiKey, signal) {
    const response = await fetch(`${this.API_BASE}/models?limit=100`, {
      headers: this._headers(apiKey),
      signal
    });
    if (!response.ok) {
      throw this._httpError(response.status, await response.text(), 'listing models');
    }
    const { data } = await response.json();
    if (!Array.isArray(data)) throw new Error('Unexpected /v1/models response shape');
    const id = this.pickBestModel(data);
    await browser.storage.local.set({ [this.MODEL_CACHE_KEY]: { id, fetchedAt: Date.now() } });
    Logger.success(`Resolved Claude model: ${id}`);
    return id;
  },

  async resolveModel(apiKey, signal, { forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const override = (typeof settings !== 'undefined' && settings.claudeModel || '').trim();
      if (override) return override;

      const cached = (await browser.storage.local.get(this.MODEL_CACHE_KEY))[this.MODEL_CACHE_KEY];
      if (cached && Date.now() - cached.fetchedAt < this.MODEL_CACHE_TTL_MS) return cached.id;
    }
    return this.fetchBestModel(apiKey, signal);
  },

  _httpError(status, bodyText, what = 'request') {
    const error = new Error(`Claude API error (${what}): ${status} - ${bodyText}`);
    error.status = status;
    error.body = bodyText;
    return error;
  },

  _isModelNotFound(error) {
    return error.status === 404 && /not_found_error/.test(error.body || '') && /model/i.test(error.body || '');
  },

  _isThinkingRejected(error) {
    return error.status === 400 && /thinking/i.test(error.body || '');
  },

  _isTransient(error) {
    return error.status === 429 || error.status === 529 || (error.status >= 500 && error.status < 600);
  },

  async _post(apiKey, body, signal) {
    const response = await fetch(`${this.API_BASE}/messages`, {
      method: 'POST',
      headers: this._headers(apiKey),
      body: JSON.stringify(body),
      signal
    });
    if (!response.ok) {
      throw this._httpError(response.status, await response.text(), 'messages');
    }
    return response.json();
  },

  /** One POST, retrying transient (429/5xx/529) errors with backoff. */
  async _postWithBackoff(apiKey, body, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this._post(apiKey, body, signal);
      } catch (error) {
        if (!this._isTransient(error) || attempt >= this.MAX_TRANSIENT_RETRIES) throw error;
        const delay = 2000 * 2 ** attempt;
        Logger.warn(`Claude API ${error.status}, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  },

  /**
   * Send a single-turn prompt and return the text of the response.
   * @param {object} opts apiKey, system, prompt, maxTokens, thinkingBudget, signal
   */
  async complete({ apiKey, system, prompt, maxTokens, thinkingBudget, signal }) {
    let model = await this.resolveModel(apiKey, signal);
    let useThinking = !!thinkingBudget && !this.noThinkingModels.has(model);
    let refreshedModel = false;

    for (;;) {
      const body = {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }]
      };
      if (useThinking) {
        body.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
      }

      try {
        const data = await this._postWithBackoff(apiKey, body, signal);
        return this._extractText(data);
      } catch (error) {
        if (this._isModelNotFound(error) && !refreshedModel) {
          Logger.warn(`Claude model "${model}" unavailable, re-resolving from /v1/models`);
          refreshedModel = true;
          const next = await this.resolveModel(apiKey, signal, { forceRefresh: true });
          if (next === model) throw error;
          model = next;
          useThinking = !!thinkingBudget && !this.noThinkingModels.has(model);
          continue;
        }
        if (this._isThinkingRejected(error) && useThinking) {
          Logger.warn(`Model "${model}" rejected extended thinking, retrying without it`);
          useThinking = false;
          this.noThinkingModels.add(model);
          continue;
        }
        throw error;
      }
    }
  },

  _extractText(data) {
    Logger.info('Claude response', {
      model: data.model,
      stop_reason: data.stop_reason,
      usage: data.usage
    });

    if (!Array.isArray(data.content) || data.content.length === 0) {
      throw new Error(`Invalid Anthropic response structure: ${JSON.stringify(data)}`);
    }
    // Extended thinking puts thinking blocks before the text block
    const textBlock = data.content.find(block => block.type === 'text' && block.text);
    if (!textBlock) {
      throw new Error(`No text content in Anthropic response. Got blocks: ${data.content.map(b => b.type).join(', ')}`);
    }
    return textBlock.text.trim();
  }
};
