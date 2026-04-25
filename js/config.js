const Config = {
    STORAGE_KEYS: {
        GOOGLE_API_KEY: 'gmap_extract_google_key',
        OPENAI_API_KEY: 'gmap_extract_openai_key',
    },

    getGoogleApiKey() {
        return localStorage.getItem(this.STORAGE_KEYS.GOOGLE_API_KEY) || '';
    },

    getOpenAiApiKey() {
        return localStorage.getItem(this.STORAGE_KEYS.OPENAI_API_KEY) || '';
    },

    saveKeys(googleKey, openaiKey) {
        if (googleKey) localStorage.setItem(this.STORAGE_KEYS.GOOGLE_API_KEY, googleKey);
        if (openaiKey) localStorage.setItem(this.STORAGE_KEYS.OPENAI_API_KEY, openaiKey);
    },

    validateKeys() {
        const google = this.getGoogleApiKey();
        const openai = this.getOpenAiApiKey();
        const missing = [];
        if (!google) missing.push('Google Places API Key');
        if (!openai) missing.push('OpenAI API Key');
        return { valid: missing.length === 0, missing };
    }
};
