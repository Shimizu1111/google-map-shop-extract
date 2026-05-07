const Analyzer = {
    OPENAI_URL: 'https://api.openai.com/v1/chat/completions',

    async suggestSearchConditions(productName, productDescription, productTarget, apiKey) {
        const prompt = `あなたはマーケティングと営業戦略のエキスパートです。以下の商材情報をもとに、Google Mapsで営業先・取引先候補を効率的に見つけるための最適な検索条件を提案してください。

## 商材情報
商材名: ${productName}
商材の説明・特徴: ${productDescription || '(未入力)'}
ターゲット顧客: ${productTarget || '(未入力)'}

## 出力フォーマット
以下のJSON形式で回答してください:
{
  "suggestions": [
    {
      "label": "提案の簡潔なタイトル（例: カフェ・喫茶店を探す）",
      "keyword": "Google Maps検索キーワード（例: カフェ 喫茶店）",
      "intent": "検索の意図・AIフィルタリング条件（例: エスプレッソやコーヒーにこだわりのあるカフェ。個人経営や小規模チェーンが望ましい。）",
      "radius": 5,
      "minRating": "3.5",
      "reason": "この検索条件を提案する理由（1-2文）"
    }
  ]
}

## ルール
- suggestionsは2〜4件提案してください
- keywordはGoogle Mapsの検索で実際にヒットしやすい自然なキーワードにする
- intentは商材との関連性を判断できる具体的な条件にする
- radiusは1-50の整数（km）。業種の特性に応じて適切な範囲を設定
- minRatingは "0"（指定なし）, "3", "3.5", "4", "4.5" のいずれか
- ターゲットの業種・規模・特徴を踏まえて、多角的な検索戦略を提案する

JSONのみを出力してください。`;

        const res = await fetch(this.OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'あなたはマーケティング戦略アシスタントです。JSONのみを出力してください。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 2000,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`OpenAI API エラー: ${res.status} - ${err.error?.message || res.statusText}`);
        }

        const data = await res.json();
        const content = data.choices[0]?.message?.content || '{}';
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(jsonStr);
    },

    async analyzePlaces(places, searchQuery, searchIntent, apiKey, onLog, onProgress) {
        const results = [];

        // Batch places to reduce API calls (analyze 5 at a time)
        const batchSize = 5;
        const batches = [];
        for (let i = 0; i < places.length; i += batchSize) {
            batches.push(places.slice(i, i + batchSize));
        }

        for (let bIdx = 0; bIdx < batches.length; bIdx++) {
            const batch = batches[bIdx];
            const batchStart = bIdx * batchSize;
            onLog(`AI分析中 (${batchStart + 1}-${Math.min(batchStart + batch.length, places.length)}/${places.length})...`);
            onProgress(50 + ((bIdx + 1) / batches.length) * 45); // 50-95%

            try {
                const batchResults = await this.analyzeBatch(batch, searchQuery, searchIntent, apiKey);
                results.push(...batchResults);
            } catch (e) {
                onLog(`  -> 分析エラー: ${e.message}`);
                // Fallback: add places without AI analysis
                for (const place of batch) {
                    results.push({
                        place,
                        relevanceScore: 50,
                        analysis: '(AI分析に失敗しました)',
                        industry: '',
                        scale: '',
                        tags: [],
                    });
                }
            }

            // Rate limiting
            if (bIdx < batches.length - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        return results;
    },

    async analyzeBatch(places, searchQuery, searchIntent, apiKey) {
        const placesText = places.map((p, i) =>
            `--- 店舗${i + 1} ---\n${Places.formatPlaceForAnalysis(p)}`
        ).join('\n\n');

        const prompt = `あなたは店舗・業者の分析エキスパートです。以下の検索条件に対して、各店舗の関連性を分析してください。

## 検索条件
検索キーワード: ${searchQuery}
検索の意図・詳細条件: ${searchIntent || '(特になし)'}

## 店舗情報
${placesText}

## 出力フォーマット
以下のJSON配列で回答してください。各店舗について分析してください:
[
  {
    "index": 0,
    "relevanceScore": 85,
    "analysis": "この店舗が検索条件にどう合致するか/しないかの簡潔な説明(2-3文)",
    "industry": "業界・業種(例: 飲食業/居酒屋, 建設業/塗装, 小売業/雑貨 など)",
    "scale": "規模感の推定(例: 個人店, 小規模チェーン, 中規模, 大手チェーン など)",
    "tags": ["関連するタグ", "宴会対応", "個室あり"]
  }
]

## 評価基準
- relevanceScore (0-100): 検索意図との関連性。口コミや概要に検索キーワードに関連する内容が実際に含まれているかを重視
- 検索キーワードと無関係な業種・サービスの場合は低スコア(20以下)にする
- 口コミに具体的な言及がある場合はスコアを上げる
- industry: Google Maps のカテゴリだけでなく、口コミや概要から判断した実際の業種
- scale: 口コミ数、店舗の雰囲気、チェーン展開の有無などから推定

JSONのみを出力してください。`;

        const res = await fetch(this.OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'あなたは店舗・業者の分析を行うアシスタントです。JSONのみを出力してください。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 2000,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`OpenAI API エラー: ${res.status} - ${err.error?.message || res.statusText}`);
        }

        const data = await res.json();
        const content = data.choices[0]?.message?.content || '[]';

        // Parse JSON from response (handle markdown code blocks)
        let parsed;
        try {
            const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            throw new Error(`AI応答のJSON解析に失敗: ${e.message}`);
        }

        // Merge analysis results with place data
        return places.map((place, i) => {
            const analysis = parsed.find(a => a.index === i) || {
                relevanceScore: 50,
                analysis: '(分析結果なし)',
                industry: '',
                scale: '',
                tags: [],
            };
            return {
                place,
                relevanceScore: analysis.relevanceScore,
                analysis: analysis.analysis,
                industry: analysis.industry,
                scale: analysis.scale,
                tags: analysis.tags || [],
            };
        });
    },
};
