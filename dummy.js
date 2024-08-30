(function() {
    const twentyMB = 20 * 1024 * 1024; // 20MB in bytes
    const chunk = 'A'.repeat(1024); // 1KB chunk
    const keyPrefix = 'data_chunk_';

    let i = 0;
    try {
        while (true) {
            localStorage.setItem(keyPrefix + i, chunk);
            i++;
            const currentSize = JSON.stringify(localStorage).length;
            if (currentSize >= twentyMB) {
                console.log(`Reached approximately 20MB of storage with ${i} chunks.`);
                break;
            }
        }
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.log(`Quota exceeded! Unable to store more data. Reached ${i} chunks.`);
        } else {
            console.error("Unexpected error: ", e);
        }
    }
})();