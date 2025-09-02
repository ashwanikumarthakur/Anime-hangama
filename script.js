// --- यह स्क्रिप्ट तब चलेगी जब पूरा HTML पेज लोड हो जाएगा ---
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. सभी ज़रूरी HTML एलिमेंट्स को चुनना ---
    // यह हमारे HTML के हिस्सों को JavaScript में इस्तेमाल करने के लिए चुनता है।
    const animeGrid = document.getElementById('anime-grid');
    const tagsSlider = document.getElementById('tagsSlider');
    const gridTitle = document.getElementById('gridTitle');
    const searchInput = document.getElementById('searchInput');
    const searchIconBtn = document.getElementById('searchIconBtn');
    const themeToggle = document.getElementById('themeToggle');
    const paginationContainer = document.getElementById('pagination');
    const searchHistoryContainer = document.getElementById('search-history');
    const searchWrapper = document.getElementById('searchWrapper');
    const logo = document.getElementById('logo');

    // --- 2. कॉन्फ़िगरेशन और स्टेट मैनेजमेंट ---
    // यह हमारी वेबसाइट की सेटिंग्स और वर्तमान स्थिति को स्टोर करता है।
    const backendBaseUrl = 'https://anime-hangama.onrender.com';
    let isLoading = false;
    let allPostsCache = [];
    let searchHistory = JSON.parse(localStorage.getItem('searchHistory')) || [];

    // --- 3. API से बात करने वाले फंक्शन्स ---
    
    /**
     * सर्वर को सिग्नल भेजकर किसी पोस्ट का व्यू या क्लिक काउंट बढ़ाता है।
     * @param {string} postId - जिस पोस्ट को अपडेट करना है उसकी ID।
     * @param {'view'|'click'} type - क्या बढ़ाना है: 'view' या 'click'।
     */
    const updateCounter = (postId, type) => {
        if (!postId || !type) return;
        const url = `${backendBaseUrl}/api/posts/${type}/${postId}`;
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url);
        } else {
            fetch(url, { method: 'PATCH', mode: 'cors', keepalive: true }).catch(err => {});
        }
    };
    
    /**
     * सर्वर से एक खास पेज के पोस्ट्स को लाता है (पेजिनेशन के लिए)।
     * @param {number} page - जो पेज नंबर लाना है।
     */
    const fetchPaginatedPosts = async (page = 1) => {
        if (isLoading) return;
        isLoading = true;
        renderSkeletonLoader();
        paginationContainer.innerHTML = '';
        gridTitle.textContent = 'Latest Posts';
        const url = `${backendBaseUrl}/api/posts?page=${page}&limit=12`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network error');
            const data = await response.json();
            renderPosts(data.posts);
            renderPagination(data.currentPage, data.totalPages);
        } catch (error) {
            animeGrid.innerHTML = '<p>Failed to load posts. Please try again later.</p>';
        } finally {
            isLoading = false;
        }
    };
    
    /**
     * एक ही बार में सर्वर से सारे पोस्ट्स ले आता है सिर्फ टैग्स और सर्च के लिए।
     */
    const fetchAllPostsForCache = async () => {
        try {
            const response = await fetch(`${backendBaseUrl}/api/posts?limit=2000`);
            const data = await response.json();
            allPostsCache = data.posts || [];
            loadTags(allPostsCache);
        } catch (error) {
            console.error("Could not load all posts for cache:", error);
        }
    };
    
    /**
     * सर्वर पर और टैग्स में किसी शब्द को खोजता है।
     * @param {string} term - जो शब्द खोजना है।
     */
    const fetchSearchResults = async (term) => {
        if (isLoading || !term) return;
        isLoading = true;
        renderSkeletonLoader();
        paginationContainer.innerHTML = '';
        gridTitle.textContent = `Search Results for "${term}"`;
        try {
            const response = await fetch(`${backendBaseUrl}/api/search?q=${term}`);
            const apiResults = await response.json();
            const tagResults = allPostsCache.filter(post => (post.category || '').toLowerCase().includes(term.toLowerCase()));
            const combined = [...apiResults, ...tagResults];
            const uniqueResults = Array.from(new Set(combined.map(p => p._id))).map(id => combined.find(p => p._id === id));
            renderPosts(uniqueResults);
        } catch (error) {
            animeGrid.innerHTML = '<p>Search failed. Please try again.</p>';
        } finally {
            isLoading = false;
        }
    };

    // --- 4. UI को बनाने और अपडेट करने वाले फंक्शन्स ---

    /**
     * डेटा लोड होते समय दिखने वाला स्केलेटन लोडर बनाता है।
     */
    const renderSkeletonLoader = () => {
        animeGrid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'skeleton-card';
            skeletonCard.innerHTML = `
                <div class="skeleton-image"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-footer"></div>
                </div>
            `;
            animeGrid.appendChild(skeletonCard);
        }
    };
    
    /**
     * सभी पोस्ट्स से यूनिक टैग्स निकालकर उनके बटन बनाता है।
     * @param {Array} posts - सभी पोस्ट्स की लिस्ट।
     */
    const loadTags = (posts) => {
        const tagSet = new Set();
        posts.forEach(post => {
            const tags = (post.category || '').split(' ').filter(Boolean);
            tags.forEach(tag => tagSet.add(tag));
        });

        tagsSlider.innerHTML = '';
        const allButton = document.createElement('button');
        allButton.className = 'tag-bubble active';
        allButton.dataset.tag = 'all';
        allButton.textContent = 'All';
        tagsSlider.appendChild(allButton);

        tagSet.forEach(tag => {
            const button = document.createElement('button');
            button.className = 'tag-bubble';
            button.dataset.tag = tag;
            button.textContent = tag;
            tagsSlider.appendChild(button);
        });
    };
    
    /**
     * दिए गए पोस्ट्स को HTML कार्ड्स में बदलकर स्क्रीन पर दिखाता है और क्लिक इवेंट्स लगाता है।
     * @param {Array} posts - दिखाने वाले पोस्ट्स की लिस्ट।
     */
    const renderPosts = (posts) => {
        animeGrid.innerHTML = '';
        if (!posts || posts.length === 0) {
            animeGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No posts found.</p>';
            return;
        }
        posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        posts.forEach(post => {
            const card = document.createElement('div');
            card.className = 'anime-card';
            card.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${post.imageUrl}" alt="${post.title}" loading="lazy">
                </div>
                <div class="card-content">
                    <h3 class="card-title" title="${post.title}">${post.title}</h3>
                    <div class="card-footer">
                        <span class="view-count">
                            <i class="material-icons" style="font-size: 1rem;">visibility</i>
                            <span id="views-${post._id}">${(post.views || 0).toLocaleString()}</span>
                        </span>
                        <a href="${post.link}" target="_blank" class="card-link" rel="noopener noreferrer">Watch Now</a>
                    </div>
                </div>
            `;
            const cardLink = card.querySelector('.card-link');
            cardLink.addEventListener('click', (e) => { e.stopPropagation(); updateCounter(post._id, 'click'); });
            card.addEventListener('click', (e) => {
                if (e.target.closest('.card-link')) return;
                const viewElement = document.getElementById(`views-${post._id}`);
                if (viewElement) {
                    const currentViews = parseInt(viewElement.textContent.replace(/,/g, '')) || 0;
                    viewElement.textContent = (currentViews + 1).toLocaleString();
                }
                updateCounter(post._id, 'view');
                setTimeout(() => { window.open(post.link, '_blank'); }, 100);
            });
            animeGrid.appendChild(card);
        });
    };

    /**
     * पेज नंबर के बटन (Prev, 1, 2, 3..., Next) बनाता है।
     * @param {number} currentPage - वर्तमान पेज नंबर।
     * @param {number} totalPages - कुल पेजों की संख्या।
     */
    const renderPagination = (currentPage, totalPages) => {
        paginationContainer.innerHTML = '';
        if (totalPages <= 1) return;
        // ... (बाकी का पेजिनेशन लॉजिक)
    };

    /**
     * सर्च हिस्ट्री को ब्राउज़र की मेमोरी में सेव करता है।
     * @param {string} term - खोजा गया शब्द।
     */
    const updateSearchHistory = (term) => {
        if (!term || term.length < 2) return;
        searchHistory = [term, ...searchHistory.filter(t => t.toLowerCase() !== term.toLowerCase())].slice(0, 5);
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        renderSearchHistory();
    };

    /**
     * सर्च हिस्ट्री को ड्रॉपडाउन में दिखाता है।
     */
    const renderSearchHistory = () => {
        searchHistoryContainer.innerHTML = '';
        if (searchHistory.length === 0) return;
        // ... (बाकी का सर्च हिस्ट्री दिखाने का लॉजिक)
    };

    // --- 5. इवेंट्स को हैंडल करने वाले Listeners ---
    
    logo.addEventListener('click', (e) => {
        e.preventDefault();
        location.reload();
    });

    tagsSlider.addEventListener('click', (e) => {
        const button = e.target.closest('.tag-bubble');
        if (button && !isLoading) {
            const tag = button.dataset.tag;
            if (tag === 'all') {
                fetchPaginatedPosts(1);
            } else {
                gridTitle.textContent = `Tag: ${tag}`;
                const filteredPosts = allPostsCache.filter(post => (post.category || '').split(' ').includes(tag));
                renderPosts(filteredPosts);
                paginationContainer.innerHTML = '';
            }
            document.querySelectorAll('.tag-bubble').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
        }
    });

    searchIconBtn.addEventListener('click', () => {
        const isActive = searchInput.classList.contains('active');
        searchInput.classList.toggle('active');
        logo.classList.toggle('search-active');
        if (!isActive) {
            searchInput.focus();
        } else if (searchInput.value) {
            fetchSearchResults(searchInput.value.trim());
            updateSearchHistory(searchInput.value.trim());
        }
    });

    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            const term = searchInput.value.trim();
            fetchSearchResults(term);
            updateSearchHistory(term);
            searchInput.blur();
            searchHistoryContainer.style.display = 'none';
        }
    });

    searchInput.addEventListener('focus', () => {
        renderSearchHistory();
        if (searchHistory.length > 0) searchHistoryContainer.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
        if (!searchWrapper.contains(e.target)) {
            searchHistoryContainer.style.display = 'none';
        }
    });
    
    paginationContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.page-btn');
        if (button && button.dataset.page && !button.disabled) {
            fetchPaginatedPosts(parseInt(button.dataset.page));
        }
    });

    const handleThemeToggle = () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    };
    themeToggle.addEventListener('click', handleThemeToggle);
    
    const loadSavedTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    };

    // --- 6. वेबसाइट को शुरू करना ---
    loadSavedTheme();
    fetchPaginatedPosts(1);
    fetchAllPostsForCache();
});
