document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const googleKeyInput = document.getElementById('google-api-key');
    const openaiKeyInput = document.getElementById('openai-api-key');
    const saveKeysBtn = document.getElementById('save-keys-btn');
    const searchBtn = document.getElementById('search-btn');
    const searchQuery = document.getElementById('search-query');
    const searchLocation = document.getElementById('search-location');
    const searchRadius = document.getElementById('search-radius');
    const minRating = document.getElementById('min-rating');
    const searchIntent = document.getElementById('search-intent');
    const searchStatus = document.getElementById('search-status');
    const progressSection = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressLog = document.getElementById('progress-log');
    const resultsSection = document.getElementById('results-section');
    const resultCount = document.getElementById('result-count');
    const resultsList = document.getElementById('results-list');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const sortBy = document.getElementById('sort-by');
    const productName = document.getElementById('product-name');
    const productDescription = document.getElementById('product-description');
    const productTarget = document.getElementById('product-target');
    const suggestBtn = document.getElementById('suggest-btn');
    const suggestStatus = document.getElementById('suggest-status');
    const suggestResult = document.getElementById('suggest-result');

    let currentResults = [];

    // Show placeholder if keys are already saved (don't expose actual values)
    if (Config.getGoogleApiKey()) {
        googleKeyInput.placeholder = '登録済み（変更する場合のみ入力）';
    }
    if (Config.getOpenAiApiKey()) {
        openaiKeyInput.placeholder = '登録済み（変更する場合のみ入力）';
    }

    // Save keys (empty fields are ignored to preserve existing keys)
    saveKeysBtn.addEventListener('click', () => {
        const newGoogle = googleKeyInput.value.trim();
        const newOpenai = openaiKeyInput.value.trim();
        if (!newGoogle && !newOpenai) {
            searchStatus.textContent = '保存するキーを入力してください';
            setTimeout(() => { searchStatus.textContent = ''; }, 3000);
            return;
        }
        Config.saveKeys(newGoogle, newOpenai);
        if (newGoogle) {
            googleKeyInput.value = '';
            googleKeyInput.placeholder = '登録済み（変更する場合のみ入力）';
        }
        if (newOpenai) {
            openaiKeyInput.value = '';
            openaiKeyInput.placeholder = '登録済み（変更する場合のみ入力）';
        }
        searchStatus.textContent = 'APIキーを保存しました';
        setTimeout(() => { searchStatus.textContent = ''; }, 3000);
    });

    // Error display helper
    function showErrorMessage(message) {
        // Remove existing error if any
        const existing = document.querySelector('.error-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.className = 'error-banner';
        banner.innerHTML = `
            <div class="error-banner-content">
                <div class="error-banner-title">エラーが発生しました</div>
                <div class="error-banner-message">${message.replace(/\n/g, '<br>')}</div>
            </div>
            <button class="error-banner-close" aria-label="閉じる">&times;</button>
        `;
        banner.querySelector('.error-banner-close').addEventListener('click', () => banner.remove());
        progressSection.insertBefore(banner, progressSection.firstChild);
    }

    // Log helper
    function addLog(message) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        progressLog.appendChild(entry);
        progressLog.scrollTop = progressLog.scrollHeight;
    }

    function setProgress(percent) {
        progressBar.style.width = `${Math.min(100, percent)}%`;
    }

    // Suggest search conditions from product info
    suggestBtn.addEventListener('click', async () => {
        const name = productName.value.trim();
        if (!name) {
            alert('商材名・サービス名を入力してください');
            return;
        }

        const openaiKey = Config.getOpenAiApiKey();
        if (!openaiKey) {
            alert('OpenAI APIキーを設定してください');
            return;
        }

        suggestBtn.disabled = true;
        suggestStatus.textContent = 'AIが検索条件を考えています...';
        suggestResult.classList.add('hidden');

        try {
            const result = await Analyzer.suggestSearchConditions(
                name,
                productDescription.value.trim(),
                productTarget.value.trim(),
                openaiKey
            );

            const suggestions = result.suggestions || [];
            if (suggestions.length === 0) {
                suggestStatus.textContent = '提案を生成できませんでした';
                return;
            }

            suggestResult.innerHTML = '<div class="suggest-title">提案された検索条件（クリックで反映）</div>' +
                suggestions.map((s, i) => `
                    <div class="suggest-card" data-index="${i}">
                        <div class="suggest-card-header">
                            <strong>${escapeHtml(s.label)}</strong>
                            <button class="btn btn-secondary btn-sm suggest-apply-btn" data-index="${i}">反映</button>
                        </div>
                        <div class="suggest-card-body">
                            <div><span class="suggest-field">キーワード:</span> ${escapeHtml(s.keyword)}</div>
                            <div><span class="suggest-field">意図・条件:</span> ${escapeHtml(s.intent)}</div>
                            <div><span class="suggest-field">半径:</span> ${s.radius}km / <span class="suggest-field">最低評価:</span> ${s.minRating === '0' ? '指定なし' : s.minRating + '以上'}</div>
                            <div class="suggest-reason">${escapeHtml(s.reason)}</div>
                        </div>
                    </div>
                `).join('');

            suggestResult.classList.remove('hidden');
            suggestStatus.textContent = `${suggestions.length}件の検索条件を提案しました`;

            // Apply suggestion on click
            suggestResult.querySelectorAll('.suggest-apply-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.index);
                    const s = suggestions[idx];
                    searchQuery.value = s.keyword;
                    searchIntent.value = s.intent;
                    searchRadius.value = s.radius;
                    minRating.value = s.minRating;
                    // Scroll to search section
                    document.getElementById('search-section').scrollIntoView({ behavior: 'smooth' });
                    suggestStatus.textContent = `「${s.label}」を検索条件に反映しました`;
                });
            });

        } catch (e) {
            suggestStatus.textContent = `エラー: ${e.message}`;
        } finally {
            suggestBtn.disabled = false;
        }
    });

    // Search
    searchBtn.addEventListener('click', async () => {
        // Validate
        const validation = Config.validateKeys();
        if (!validation.valid) {
            alert(`以下のAPIキーを設定してください:\n${validation.missing.join('\n')}`);
            return;
        }

        const query = searchQuery.value.trim();
        const location = searchLocation.value.trim();
        if (!query) { alert('検索キーワードを入力してください'); return; }
        if (!location) { alert('エリアを入力してください'); return; }

        // Reset UI
        searchBtn.disabled = true;
        progressSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        progressLog.innerHTML = '';
        const existingError = document.querySelector('.error-banner');
        if (existingError) existingError.remove();
        setProgress(0);
        currentResults = [];

        const googleKey = Config.getGoogleApiKey();
        const openaiKey = Config.getOpenAiApiKey();
        const radius = parseInt(searchRadius.value) || 5;
        const minRatingVal = parseFloat(minRating.value) || 0;
        const intent = searchIntent.value.trim();

        try {
            // Step 1: Geocode location
            progressText.textContent = 'エリアの座標を取得中...';
            addLog(`エリア「${location}」の座標を取得中...`);
            const coords = await Places.geocode(location, googleKey);
            addLog(`座標: ${coords.lat}, ${coords.lng}`);

            // Step 2: Search places
            progressText.textContent = '店舗を検索中...';
            const places = await Places.searchPlaces(query, coords, radius, googleKey, addLog);

            if (places.length === 0) {
                addLog('検索結果が0件でした。キーワードやエリアを変更してみてください。');
                progressText.textContent = '検索結果: 0件';
                searchBtn.disabled = false;
                return;
            }

            // Step 3: Get details
            progressText.textContent = '店舗の詳細情報を取得中...';
            const detailedPlaces = await Places.getDetailsForPlaces(places, googleKey, addLog, setProgress);

            // Step 4: AI Analysis
            progressText.textContent = 'AIで関連性を分析中...';
            const analyzed = await Analyzer.analyzePlaces(
                detailedPlaces, query, intent, openaiKey, addLog, setProgress
            );

            // Step 5: Filter & Sort
            currentResults = analyzed
                .filter(r => {
                    const rating = r.place.rating || 0;
                    return rating >= minRatingVal || rating === 0;
                })
                .sort((a, b) => b.relevanceScore - a.relevanceScore);

            setProgress(100);
            progressText.textContent = `完了! ${currentResults.length}件の結果`;
            addLog(`分析完了: ${currentResults.length}件`);

            // Show results
            renderResults();

        } catch (e) {
            addLog(`エラー: ${e.message}`);
            progressText.textContent = 'エラーが発生しました';
            showErrorMessage(e.message);
        } finally {
            searchBtn.disabled = false;
        }
    });

    // Render results
    function renderResults() {
        resultsSection.classList.remove('hidden');
        resultCount.textContent = `(${currentResults.length}件)`;
        resultsList.innerHTML = '';

        for (const r of currentResults) {
            const p = r.place;
            const name = p.displayName?.text || '不明';
            const rating = p.rating || 'N/A';
            const reviewCount = p.userRatingCount || 0;
            const address = p.formattedAddress || '';
            const phone = p.nationalPhoneNumber || '';
            const website = p.websiteUri || '';
            const mapsUrl = p.googleMapsUri || '';
            const score = r.relevanceScore;
            const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

            const tagsHtml = [
                r.industry ? `<span class="tag industry">${escapeHtml(r.industry)}</span>` : '',
                r.scale ? `<span class="tag scale">${escapeHtml(r.scale)}</span>` : '',
                ...(r.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`),
            ].filter(Boolean).join('');

            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `
                <div class="result-info">
                    <h3><a href="${escapeAttr(mapsUrl)}" target="_blank" rel="noopener">${escapeHtml(name)}</a></h3>
                    <div class="result-meta">
                        <span class="rating">★ ${rating}</span>
                        <span class="reviews">${reviewCount}件の口コミ</span>
                        ${phone ? `<span>${escapeHtml(phone)}</span>` : ''}
                        ${website ? `<a href="${escapeAttr(website)}" target="_blank" rel="noopener">Web</a>` : ''}
                    </div>
                    <div class="result-address">${escapeHtml(address)}</div>
                    <div class="result-tags">${tagsHtml}</div>
                    <div class="result-analysis">
                        <div class="analysis-label">AI分析</div>
                        ${escapeHtml(r.analysis)}
                    </div>
                </div>
                <div class="result-scores">
                    <div class="relevance-score ${scoreClass}">${score}</div>
                    <div class="relevance-label">関連性スコア</div>
                </div>
            `;
            resultsList.appendChild(card);
        }
    }

    // Sort
    sortBy.addEventListener('change', () => {
        const key = sortBy.value;
        currentResults.sort((a, b) => {
            if (key === 'relevance') return b.relevanceScore - a.relevanceScore;
            if (key === 'rating') return (b.place.rating || 0) - (a.place.rating || 0);
            if (key === 'reviews') return (b.place.userRatingCount || 0) - (a.place.userRatingCount || 0);
            return 0;
        });
        renderResults();
    });

    // CSV Export
    exportCsvBtn.addEventListener('click', () => {
        if (currentResults.length === 0) {
            alert('エクスポートする結果がありません');
            return;
        }
        Export.download(currentResults);
    });

    // Escape helpers
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
});
