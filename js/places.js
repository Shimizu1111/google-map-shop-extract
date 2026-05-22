const Places = {
    BASE_URL: 'https://places.googleapis.com/v1/places',

    async geocode(address, apiKey) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status !== 'OK' || !data.results.length) {
            throw new Error(this._geocodeErrorMessage(address, data.status, data.error_message));
        }
        return data.results[0].geometry.location;
    },

    _geocodeErrorMessage(address, status, errorMessage) {
        const details = {
            'REQUEST_DENIED': 'APIキーが無効、またはAPIキーにHTTPリファラー制限が設定されています。\nGoogle Cloud Console でキーの制限を「なし」または「IPアドレス」に変更してください。\nまた、Geocoding API が有効になっているか確認してください。',
            'OVER_DAILY_LIMIT': 'APIの1日の利用上限を超えました。Google Cloud Console で課金設定と上限を確認してください。',
            'OVER_QUERY_LIMIT': 'リクエスト数の上限を超えました。しばらく待ってから再度お試しください。',
            'INVALID_REQUEST': `「${address}」を住所として認識できませんでした。より具体的な住所や地名を入力してください。`,
            'ZERO_RESULTS': `「${address}」に該当する場所が見つかりませんでした。表記を変えて再度お試しください。`,
        };
        const hint = details[status] || `ステータス: ${status}`;
        const apiMsg = errorMessage ? `\n(API詳細: ${errorMessage})` : '';
        return `エリア「${address}」の座標取得に失敗しました。\n\n${hint}${apiMsg}`;
    },

    async searchPlaces(query, location, radiusKm, apiKey, onLog, maxResults = 20) {
        const radiusM = radiusKm * 1000;
        const allPlaces = [];
        let pageToken = null;

        onLog(`Google Places APIで検索中...（最大${maxResults}件）`);

        // Use Text Search (New) API
        const searchUrl = `${this.BASE_URL}:searchText`;

        const fieldMask = [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.rating',
            'places.userRatingCount',
            'places.websiteUri',
            'places.googleMapsUri',
            'places.primaryType',
            'places.types',
            'places.businessStatus',
            'places.currentOpeningHours',
            'places.nationalPhoneNumber',
        ].join(',');

        while (allPlaces.length < maxResults) {
            const perPage = Math.min(20, maxResults - allPlaces.length);
            const requestBody = {
                textQuery: query,
                locationBias: {
                    circle: {
                        center: { latitude: location.lat, longitude: location.lng },
                        radius: radiusM
                    }
                },
                maxResultCount: perPage,
                languageCode: 'ja'
            };
            if (pageToken) {
                requestBody.pageToken = pageToken;
            }

            const res = await fetch(searchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': fieldMask,
                },
                body: JSON.stringify(requestBody),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(this._apiErrorMessage('Places Search', res.status, err));
            }

            const data = await res.json();
            const places = data.places || [];
            allPlaces.push(...places);
            onLog(`${allPlaces.length}件取得済み...`);

            pageToken = data.nextPageToken;
            if (!pageToken || places.length === 0) break;

            // ページ間の待機
            await new Promise(r => setTimeout(r, 300));
        }

        onLog(`合計${allPlaces.length}件の店舗が見つかりました`);
        return allPlaces;
    },

    async getPlaceDetails(placeId, apiKey) {
        const fieldMask = [
            'id',
            'displayName',
            'formattedAddress',
            'rating',
            'userRatingCount',
            'websiteUri',
            'googleMapsUri',
            'primaryType',
            'types',
            'editorialSummary',
            'reviews',
            'nationalPhoneNumber',
            'currentOpeningHours',
        ].join(',');

        const res = await fetch(`${this.BASE_URL}/${placeId}`, {
            headers: {
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': fieldMask,
            },
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(this._apiErrorMessage('Place Details', res.status, err));
        }

        return await res.json();
    },

    async getDetailsForPlaces(places, apiKey, onLog, onProgress) {
        const results = [];
        for (let i = 0; i < places.length; i++) {
            const place = places[i];
            const name = place.displayName?.text || 'Unknown';
            onLog(`詳細取得中 (${i + 1}/${places.length}): ${name}`);
            onProgress((i + 1) / places.length * 50); // 0-50% for details

            try {
                const details = await this.getPlaceDetails(place.id, apiKey);
                results.push(details);
            } catch (e) {
                onLog(`  -> ${name} の詳細取得に失敗: ${e.message}`);
                // Still include basic info
                results.push(place);
            }

            // Rate limiting: small delay between requests
            if (i < places.length - 1) {
                await new Promise(r => setTimeout(r, 200));
            }
        }
        return results;
    },

    formatPlaceForAnalysis(place) {
        const name = place.displayName?.text || '';
        const address = place.formattedAddress || '';
        const rating = place.rating || 'N/A';
        const reviewCount = place.userRatingCount || 0;
        const types = (place.types || []).join(', ');
        const summary = place.editorialSummary?.text || '';
        const phone = place.nationalPhoneNumber || '';

        const reviews = (place.reviews || [])
            .slice(0, 5)
            .map(r => `  - ${r.rating}点: ${r.text?.text || '(コメントなし)'}`)
            .join('\n');

        return `店名: ${name}
住所: ${address}
評価: ${rating} (${reviewCount}件)
カテゴリ: ${types}
電話: ${phone}
概要: ${summary}
口コミ:
${reviews || '  (口コミなし)'}`;
    },

    _apiErrorMessage(apiName, httpStatus, errBody) {
        const msg = errBody?.error?.message || '';
        const details = {
            400: `リクエストが不正です。検索条件を確認してください。`,
            401: `APIキーが無効です。Google Cloud Console でキーを確認してください。`,
            403: msg.includes('referer')
                ? `APIキーにHTTPリファラー制限が設定されているため利用できません。\nGoogle Cloud Console でキーの制限を「なし」に変更するか、このサイトのURLをリファラーに追加してください。`
                : `APIへのアクセスが拒否されました。${apiName} API が有効になっているか、キーの制限設定を確認してください。`,
            429: `リクエスト数の上限を超えました。しばらく待ってから再度お試しください。`,
        };
        const hint = details[httpStatus] || `HTTPステータス ${httpStatus}: ${msg || 'サーバーエラーが発生しました'}`;
        return `${apiName} API エラー\n\n${hint}`;
    }
};
