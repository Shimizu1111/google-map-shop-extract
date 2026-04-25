const Places = {
    BASE_URL: 'https://places.googleapis.com/v1/places',

    async geocode(address, apiKey) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status !== 'OK' || !data.results.length) {
            throw new Error(`住所「${address}」の座標を取得できませんでした: ${data.status}`);
        }
        return data.results[0].geometry.location;
    },

    async searchPlaces(query, location, radiusKm, apiKey, onLog) {
        const radiusM = radiusKm * 1000;
        const allPlaces = [];
        let pageToken = null;

        onLog('Google Places APIで検索中...');

        // Use Text Search (New) API
        const searchUrl = `${this.BASE_URL}:searchText`;

        const requestBody = {
            textQuery: query,
            locationBias: {
                circle: {
                    center: { latitude: location.lat, longitude: location.lng },
                    radius: radiusM
                }
            },
            maxResultCount: 20,
            languageCode: 'ja'
        };

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
            throw new Error(`Places API エラー: ${res.status} - ${err.error?.message || res.statusText}`);
        }

        const data = await res.json();
        const places = data.places || [];
        onLog(`${places.length}件の店舗が見つかりました`);
        return places;
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
            throw new Error(`Place Details エラー: ${res.status} - ${err.error?.message || res.statusText}`);
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
    }
};
