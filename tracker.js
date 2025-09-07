/**
 * Anime Hangama - Content Tracker
 *
 * यह फाइल पोस्ट के व्यूज और क्लिक्स को विश्वसनीय तरीके से ट्रैक करने के लिए जिम्मेदार है।
 * यह मुख्य script.js फाइल में इस्तेमाल होगी।
 */

// कॉन्फ़िगरेशन: अपने बैकएंड का URL यहाँ सेट करें।
const TRACKER_BASE_URL = 'https://anime-hangama.onrender.com';

/**
 * किसी पोस्ट के काउंटर (व्यू या क्लिक) को अपडेट करता है।
 * यह सबसे विश्वसनीय तरीका (navigator.sendBeacon) पहले आज़माता है।
 *
 * @param {string} postId जिस पोस्ट को ट्रैक करना है उसकी ID.
 * @param {'view' | 'click'} type ट्रैकिंग का प्रकार ('view' या 'click').
 */
function updateCounter(postId, type) {
    if (!postId || !type) {
        console.warn('Tracker: Post ID or Type is missing.');
        return;
    }

    const url = `${TRACKER_BASE_URL}/api/posts/${type}/${postId}`;

    // सबसे अच्छा तरीका: navigator.sendBeacon
    if (navigator.sendBeacon) {
        try {
            const blob = new Blob([JSON.stringify({ from: 'beacon' })], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
            return;
        } catch (e) {
            console.error('Tracker: Beacon failed.', e);
        }
    }

    // फॉलबैक तरीका: fetch with keepalive
    fetch(url, {
        method: 'POST',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'fetch' })
    }).catch(error => {
        console.error(`Tracker: Fetch request failed for ${type} on post ${postId}.`, error);
    });
}
