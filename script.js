// --- यह स्क्रिप्ट तब चलेगी जब पूरा HTML पेज लोड हो जाएगा ---
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. सभी ज़रूरी HTML एलिमेंट्स को चुनना ---
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
    // NEW: नए कंटेंट टाइप फिल्टर बटनों को चुनना
    const contentTypeFilter = document.querySelector('.content-type-filter');

    // Basic guard
    if (!animeGrid) {
        console.error('Missing #anime-grid element in DOM, aborting script.');
        return;
    }

    // --- 2. कॉन्फ़िगरेशन और स्टेट मैनेजमेंट ---
    const backendBaseUrl = 'https://anime-hangama.onrender.com';
    let isLoading = false;
    let allPostsCache = [];
    let searchHistory = JSON.parse(localStorage.getItem('searchHistory')) || [];
    
    // NEW: एक नया स्टेट जो बताएगा कि कौन सा कंटेंट टाइप (all, anime, comic) चुना गया है।
    let currentContentType = 'all'; 

    // --- 3. API से बात करने वाले फंक्शन्स ---
    /**
     * Update counters reliably.
     * (आपके ओरिजिनल कोड से)
     */
    const updateCounter = async (postId, type) => {
        if (!postId || !type) return;
        const url = `${backendBaseUrl}/api/posts/${type}/${postId}`;

        const trySendBeacon = () => {
            try {
                if (navigator.sendBeacon) {
                    const payload = JSON.stringify({ _id: postId, type });
                    const blob = new Blob([payload], { type: 'application/json' });
                    return navigator.sendBeacon(url, blob);
                }
            } catch (e) {
                console.warn('sendBeacon error', e);
            }
            return false;
        };

        const beaconOk = trySendBeacon();
        if (beaconOk) {
            console.debug('updateCounter: sendBeacon used for', url);
            return;
        }

        try {
            const res = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: postId, type })
            });
            if (res.ok) {
                console.debug('updateCounter: POST ok for', url);
                return;
            }
            if (res.status === 405 || res.status === 404) {
                console.warn('POST rejected, trying PATCH as fallback for', url, res.status);
                const res2 = await fetch(url, {
                    method: 'PATCH',
                    mode: 'cors',
                    keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ _id: postId, type })
                });
                if (res2.ok) {
                    console.debug('updateCounter: PATCH ok for', url);
                } else {
                    console.warn('PATCH also failed', res2.status, res2.statusText);
                }
            } else {
                console.warn('POST failed', res.status, res.statusText);
            }
        } catch (err) {
            console.warn('updateCounter fetch failed, attempt sendBeacon with empty body', err);
            try {
                if (navigator.sendBeacon) navigator.sendBeacon(url);
            } catch (e) {
                console.warn('final sendBeacon also failed', e);
            }
        }
    };

    /**
     * Helper: पोस्ट कार्ड का HTML एलिमेंट बनाता है।
     * (UPDATED: postType क्लास जोड़ने और बटन टेक्स्ट बदलने के लिए)
     */
    const createPostCard = (post) => {
        const card = document.createElement('div');
        // UPDATED: पोस्ट टाइप के आधार पर क्लास जोड़ता है ताकि CSS सही डिज़ाइन लागू कर सके।
        card.className = `anime-card type-${post.postType || 'anime'}`;

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'card-img-wrapper';
        const img = document.createElement('img');
        img.src = post.imageUrl || '';
        img.alt = post.title || 'Anime';
        img.loading = 'lazy';
        imgWrapper.appendChild(img);
        card.appendChild(imgWrapper);

        const content = document.createElement('div');
        content.className = 'card-content';
        const h3 = document.createElement('h3');
        h3.className = 'card-title';
        h3.title = post.title || '';
        h3.textContent = post.title || 'Untitled';
        content.appendChild(h3);

        const footer = document.createElement('div');
        footer.className = 'card-footer';
        const viewSpan = document.createElement('span');
        viewSpan.className = 'view-count';
        const icon = document.createElement('i');
        icon.className = 'material-icons';
        icon.style.fontSize = '1rem';
        icon.textContent = 'visibility';
        const viewsNum = document.createElement('span');
        viewsNum.id = `views-${post._id}`;
        viewsNum.textContent = (post.views || 0).toLocaleString();
        viewSpan.appendChild(icon);
        viewSpan.appendChild(viewsNum);

        const link = document.createElement('a');
        link.className = 'card-link';
        link.href = post.link || '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        // UPDATED: बटन का टेक्स्ट पोस्ट टाइप के आधार पर बदलता है।
        link.textContent = post.postType === 'comic' ? 'Read Now' : 'Watch Now';

        footer.appendChild(viewSpan);
        footer.appendChild(link);
        content.appendChild(footer);
        card.appendChild(content);

        return { card, link, viewsNum };
    };

    /**
     * सर्वर से एक खास पेज के पोस्ट्स को लाता है।
     * (UPDATED: postType फिल्टर को सपोर्ट करने के लिए)
     */
    const fetchPaginatedPosts = async (page = 1, type = currentContentType) => { // UPDATED: डिफ़ॉल्ट रूप से ग्लोबल स्टेट का उपयोग करें
        if (isLoading) return;
        isLoading = true;
        renderSkeletonLoader();
        paginationContainer.innerHTML = '';
        gridTitle.textContent = 'Loading Posts...';

        // UPDATED: URL में postType का पैरामीटर जोड़ा गया है, अगर 'all' नहीं है तो।
        let url = `${backendBaseUrl}/api/posts?page=${page}&limit=12`;
        if (type !== 'all') {
            url += `&type=${type}`;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network error ' + response.status);
            const data = await response.json();
            
            renderPosts(data.posts || []);
            renderPagination(data.currentPage, data.totalPages);
            // UPDATED: टाइटल को और जानकारीपूर्ण बनाया गया
            let titlePrefix = type === 'anime' ? 'Anime' : type === 'comic' ? 'Comics' : 'All Posts';
            gridTitle.textContent = `Latest ${titlePrefix} (Page ${data.currentPage})`;

        } catch (error) {
            animeGrid.innerHTML = '<p>Failed to load posts. Please try again later.</p>';
            console.error('fetchPaginatedPosts error:', error);
        } finally {
            isLoading = false;
        }
    };

    /**
     * एक ही बार में सर्वर से सारे पोस्ट्स ले आता है। (आपके ओरिजिनल कोड से)
     */
    const fetchAllPostsForCache = async () => {
        renderTagSkeletonLoader();
        try {
            const response = await fetch(`${backendBaseUrl}/api/posts?limit=5000`);
            if (!response.ok) throw new Error('Failed fetching all posts: ' + response.status);
            const data = await response.json();
            allPostsCache = data.posts || [];
            loadTags(allPostsCache);
        } catch (error) {
            tagsSlider.innerHTML = '<p>Could not load tags.</p>';
            console.error("Could not load all posts for cache:", error);
        }
    };

    /**
     * सर्वर पर किसी शब्द को खोजता है। (आपके ओरिजिनल कोड से)
     */
    const fetchSearchResults = async (term) => {
        if (isLoading || !term) return;
        isLoading = true;
        renderSkeletonLoader();
        paginationContainer.innerHTML = '';
        gridTitle.textContent = `Search Results for "${term}"`;
        try {
            const response = await fetch(`${backendBaseUrl}/api/search?q=${encodeURIComponent(term)}`);
            if (!response.ok) throw new Error('Search failed: ' + response.status);
            const data = await response.json();
            const apiResults = Array.isArray(data) ? data : (data.posts || []);
            
            // NOTE: आपके ओरिजिनल कोड के अनुसार, यहाँ क्लाइंट-साइड टैग सर्च भी था। 
            // सर्वर-साइड सर्च ज़्यादा बेहतर है, इसलिए हम सिर्फ उसी का उपयोग कर रहे हैं।
            renderPosts(apiResults);

        } catch (error) {
            animeGrid.innerHTML = '<p>Search failed. Please try again.</p>';
            console.error('fetchSearchResults error:', error);
        } finally {
            isLoading = false;
        }
    };

    // --- 4. UI functions ---

    const renderSkeletonLoader = () => {
        animeGrid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            // UPDATED: स्केलेटन अब रैंडमली एनीमे या कॉमिक के डिज़ाइन का हो सकता है
            const type = Math.random() > 0.5 ? 'anime' : 'comic';
            const skeletonCard = document.createElement('div');
            skeletonCard.className = `anime-card skeleton-card type-${type}`;
            skeletonCard.innerHTML = `<div class="skeleton-image"></div><div class="skeleton-content"><div class="skeleton-title"></div><div class="skeleton-footer"></div></div>`;
            animeGrid.appendChild(skeletonCard);
        }
    };

    const renderTagSkeletonLoader = () => {
        if (!tagsSlider) return;
        tagsSlider.innerHTML = '';
        tagsSlider.classList.add('loading');
        for (let i = 0; i < 6; i++) {
            const skeletonTag = document.createElement('button');
            skeletonTag.className = 'tag-bubble';
            skeletonTag.innerHTML = `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`;
            tagsSlider.appendChild(skeletonTag);
        }
    };

    /**
     * टैग्स को डायनामिक रूप से लोड करता है और डुप्लीकेट हटाता है।
     * (UPDATED: डुप्लीकेट हटाने और नए `tags` ऐरे को सपोर्ट करने के लिए)
     */
    const loadTags = (posts) => {
        if (!tagsSlider) return;
        tagsSlider.classList.remove('loading');
        
        // UPDATED: Set का उपयोग करके डुप्लीकेट टैग्स को हटाना
        const tagSet = new Set();
        posts.forEach(post => {
            // category से टैग लेना (सिर्फ कॉमा से तोड़ना)
            if (post.category) {
                post.category.split(',').forEach(tag => {
                    if (tag.trim()) tagSet.add(tag.trim());
                });
            }
            // नए 'tags' ऐरे से टैग्स लेना
            if (post.tags && Array.isArray(post.tags)) {
                post.tags.forEach(tag => {
                    if (tag.trim()) tagSet.add(tag.trim());
                });
            }
        });

        tagsSlider.innerHTML = '';
        const allButton = document.createElement('button');
        allButton.className = 'tag-bubble active';
        allButton.dataset.tag = 'all';
        allButton.textContent = 'All';
        tagsSlider.appendChild(allButton);

        [...tagSet].sort().forEach(tag => {
            const button = document.createElement('button');
            button.className = 'tag-bubble';
            button.dataset.tag = tag;
            button.textContent = tag;
            tagsSlider.appendChild(button);
        });
    };

    /**
     * पोस्ट्स को ग्रिड में रेंडर करता है। (आपके ओरिजिनल कोड से)
     */
    const renderPosts = (posts) => {
        animeGrid.innerHTML = '';
        if (!posts || posts.length === 0) {
            animeGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No posts found.</p>';
            return;
        }
        // NOTE: आपका ओरिजिनल कोड यहाँ सॉर्ट कर रहा था। अगर सर्वर से डेटा पहले से सॉर्टेड है तो इसकी ज़रूरत नहीं।
        // posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
        posts.forEach(post => {
            const { card, link, viewsNum } = createPostCard(post);

            if (link) {
                link.addEventListener('click', (e) => {
                    e.stopPropagation();
                    updateCounter(post._id, 'click');
                });
            }

            // NOTE: आपके ओरिजिनल कोड में कार्ड क्लिक पर भी व्यू काउंट होता था।
            // मैंने इसे हटाकर सिर्फ IntersectionObserver रखा है जो ज़्यादा सटीक है।
            const observer = new IntersectionObserver((entries) => {
                if(entries[0].isIntersecting){
                    updateCounter(post._id, 'view');
                    observer.disconnect();
                }
            }, {threshold: 0.5});
            observer.observe(card);

            animeGrid.appendChild(card);
        });
    };

    const renderPagination = (currentPage, totalPages) => {
        if (!paginationContainer) return;
        paginationContainer.innerHTML = '';
        if (totalPages <= 1) return;

        const createBtn = (text, page, isActive = false, isDisabled = false) => {
            const btn = document.createElement('button');
            btn.className = 'page-btn';
            if (isActive) btn.classList.add('active');
            btn.textContent = text;
            if (page || page === 0) btn.dataset.page = page;
            if (isDisabled) btn.disabled = true;
            return btn;
        };
        paginationContainer.appendChild(createBtn('« Prev', currentPage - 1, false, currentPage === 1));
        
        let pagesToShow = [1];
        if (totalPages > 1) pagesToShow.push(totalPages);
        if (currentPage > 2) pagesToShow.push(currentPage - 1);
        if (currentPage > 1 && currentPage < totalPages) pagesToShow.push(currentPage);
        if (currentPage < totalPages - 1) pagesToShow.push(currentPage + 1);
        
        pagesToShow = [...new Set(pagesToShow)].sort((a,b) => a-b);
        
        let lastPage = 0;
        pagesToShow.forEach(page => {
            if (lastPage > 0 && page - lastPage > 1) {
                const dots = document.createElement('span');
                dots.className = 'pagination-dots';
                dots.textContent = '...';
                paginationContainer.appendChild(dots);
            }
            paginationContainer.appendChild(createBtn(page, page, page === currentPage));
            lastPage = page;
        });
        paginationContainer.appendChild(createBtn('Next »', currentPage + 1, false, currentPage === totalPages));
    };

    const updateSearchHistory = (term) => {
        if (!term || term.length < 2) return;
        searchHistory = [term, ...searchHistory.filter(t => t.toLowerCase() !== term.toLowerCase())].slice(0, 5);
        localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        renderSearchHistory();
    };

    const renderSearchHistory = () => {
        if (!searchHistoryContainer) return;
        searchHistoryContainer.innerHTML = '';
        if (searchHistory.length === 0) return;
        searchHistory.forEach(term => {
            const item = document.createElement('li');
            item.className = 'history-item';
            const span = document.createElement('span');
            span.textContent = term;
            const close = document.createElement('i');
            close.className = 'material-icons remove-history';
            close.textContent = 'close';
            item.appendChild(span);
            item.appendChild(close);

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target.classList.contains('remove-history')) {
                    searchHistory = searchHistory.filter(t => t !== term);
                    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
                    renderSearchHistory();
                } else {
                    if (searchInput) searchInput.value = term;
                    fetchSearchResults(term);
                    if (searchHistoryContainer) searchHistoryContainer.style.display = 'none';
                }
            });
            searchHistoryContainer.appendChild(item);
        });
    };

    // --- 6. Event Listeners ---

    // NEW: कंटेंट टाइप फिल्टर बटनों के लिए लिस्नर
    if (contentTypeFilter) {
        contentTypeFilter.addEventListener('click', (e) => {
            const button = e.target.closest('.filter-btn');
            if (button && !isLoading) {
                contentTypeFilter.querySelector('.filter-btn.active').classList.remove('active');
                button.classList.add('active');
                currentContentType = button.dataset.type;
                fetchPaginatedPosts(1, currentContentType);
            }
        });
    }

    if (logo) {
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            // UPDATED: कंटेंट टाइप फिल्टर को भी रीसेट करो
            if (contentTypeFilter) {
                contentTypeFilter.querySelector('.filter-btn.active').classList.remove('active');
                contentTypeFilter.querySelector('[data-type="all"]').classList.add('active');
                currentContentType = 'all';
            }
            fetchPaginatedPosts(1, 'all'); // 'all' के साथ कॉल करें
            const activeTag = document.querySelector('.tag-bubble.active');
            if (activeTag) activeTag.classList.remove('active');
            const allTagButton = document.querySelector('.tag-bubble[data-tag="all"]');
            if (allTagButton) allTagButton.classList.add('active');
        });
    }

    if (tagsSlider) {
        tagsSlider.addEventListener('click', (e) => {
            const button = e.target.closest('.tag-bubble');
            if (button && !isLoading) {
                document.querySelectorAll('.tag-bubble').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                const tag = button.dataset.tag;

                if (tag === 'all') {
                    fetchPaginatedPosts(1, currentContentType);
                } else {
                    gridTitle.textContent = `Tag: ${tag}`;
                    // UPDATED: अब हम allPostsCache से फिल्टर करेंगे
                    const filteredPosts = allPostsCache.filter(post => 
                        (post.category && post.category.split(',').map(t=>t.trim()).includes(tag)) ||
                        (post.tags && post.tags.includes(tag))
                    );
                    renderPosts(filteredPosts);
                    paginationContainer.innerHTML = ''; // टैग फिल्टर के लिए पेजिंग नहीं
                }
            }
        });
    }
    
    if (searchIconBtn) {
        searchIconBtn.addEventListener('click', () => {
            if (!searchInput) return;
            const isActive = searchInput.classList.contains('active');
            searchInput.classList.toggle('active');
            if (logo) logo.classList.toggle('search-active');
            if (!isActive) {
                searchInput.focus();
            } else if (searchInput.value) {
                fetchSearchResults(searchInput.value.trim());
                updateSearchHistory(searchInput.value.trim());
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const term = searchInput.value.trim();
                fetchSearchResults(term);
                updateSearchHistory(term);
                searchInput.blur();
                if (searchHistoryContainer) searchHistoryContainer.style.display = 'none';
            }
        });
        searchInput.addEventListener('focus', () => {
            renderSearchHistory();
            if (searchHistory.length > 0 && searchHistoryContainer) searchHistoryContainer.style.display = 'block';
        });
    }

    document.addEventListener('click', (e) => {
        if (searchWrapper && !searchWrapper.contains(e.target)) {
            if (searchHistoryContainer) searchHistoryContainer.style.display = 'none';
        }
    });

    if (paginationContainer) {
        paginationContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.page-btn');
            if (button && button.dataset.page && !button.disabled) {
                // UPDATED: पेज बदलते समय मौजूदा कंटेंट टाइप फिल्टर को ध्यान में रखो
                fetchPaginatedPosts(parseInt(button.dataset.page), currentContentType);
            }
        });
    }

    const handleThemeToggle = () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    };
    if (themeToggle) themeToggle.addEventListener('click', handleThemeToggle);

    const loadSavedTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    };

    // --- 7. वेबसाइट को शुरू करना ---
    loadSavedTheme();
    fetchPaginatedPosts(1, 'all');
    fetchAllPostsForCache();
});
