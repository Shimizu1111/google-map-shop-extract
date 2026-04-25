const Export = {
    toCSV(results) {
        const headers = [
            '関連性スコア',
            '店名',
            'Google評価',
            '口コミ数',
            '住所',
            '電話番号',
            '業種',
            '規模',
            'AI分析',
            'タグ',
            'Webサイト',
            'Googleマップ',
        ];

        const rows = results.map(r => {
            const p = r.place;
            return [
                r.relevanceScore,
                p.displayName?.text || '',
                p.rating || '',
                p.userRatingCount || '',
                p.formattedAddress || '',
                p.nationalPhoneNumber || '',
                r.industry || '',
                r.scale || '',
                r.analysis || '',
                (r.tags || []).join(' / '),
                p.websiteUri || '',
                p.googleMapsUri || '',
            ];
        });

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => {
                const str = String(cell);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(','))
            .join('\n');

        // Add BOM for Excel compatibility
        return '\uFEFF' + csvContent;
    },

    download(results, filename) {
        const csv = this.toCSV(results);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `shop-extract-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
};
