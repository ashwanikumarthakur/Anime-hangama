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

    // --- 3. API से बात करने वाले फंक्शन्स ---
    /**
     * Update counters reliably:
     *  - Try navigator.sendBeacon (POST) first for reliability during navigation.
     *  - Fallback to fetch POST with keepalive.
     *  - If server rejects POST (405), attempt PATCH as last resort.
     *
     * Note: If your backend only accepts PATCH and cannot be changed,
     * you can modify the server to accept POST on these endpoints (recommended)
     * so sendBeacon will work reliably.
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

        // First prefer sendBeacon (POST)
        const beaconOk = trySendBeacon();
        if (beaconOk) {
            console.debug('updateCounter: sendBeacon used for', url);
            return;
        }

        // Fallback: fetch POST with keepalive (works in many browsers)
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

            // If server doesn't accept POST, try PATCH as a fallback (some APIs expect PATCH)
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
                    return;
                } else {
                    console.warn('PATCH also failed', res2.status, res2.statusText);
                }
            } else {
                console.warn('POST failed', res.status, res.statusText);
            }
        } catch (err) {
            console.warn('updateCounter fetch failed, attempt sendBeacon with empty body', err);
            // last-ditch try sendBeacon without body
            try {
                if (navigator.sendBeacon) navigator.sendBeacon(url);
            } catch (e) {
                console.warn('final sendBeacon also failed', e);
            }
        }
    };

    /**
     * Helper: safe create card DOM to avoid XSS
     */
    const createPostCard = (post) => {
        const card = document.createElement('div');
        card.className = 'anime-card';

        // Image wrapper
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'card-img-wrapper';
        const img = document.createElement('img');
        img.src = post.imageUrl || '';
        img.alt = post.title || 'Anime';
        img.loading = 'lazy';
        imgWrapper.appendChild(img);
        card.appendChild(imgWrapper);

        // Content
        const content = document.createElement('div');
        content.className = 'card-content';
        const h3 = document.createElement('h3');
        h3.className = 'card-title';
        h3.title = post.title || '';
        h3.textContent = post.title || 'Untitled';
        content.appendChild(h3);

        // Footer
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
        link.textContent = 'Watch Now';

        footer.appendChild(viewSpan);
        footer.appendChild(link);
        content.appendChild(footer);
        card.appendChild(content);

        return { card, link, viewsNum };
    };

    /**
     * सर्वर से एक खास पेज के पोस्ट्स को लाता है।
     */
    const fetchPaginatedPosts = async (page = 1) => {
        if (isLoading) return;
        isLoading = true;
        renderSkeletonLoader();
        if (paginationContainer) paginationContainer.innerHTML = '';
        if (gridTitle) gridTitle.textContent = 'Latest Posts';
        const url = `${backendBaseUrl}/api/posts?page=${page}&limit=12`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network error ' + response.status);
            const data = await response.json();
            renderPosts(data.posts || []);
            renderPagination(data.currentPage, data.totalPages);
        } catch (error) {
            animeGrid.innerHTML = '<p>Failed to load posts. Please try again later.</p>';
            console.error('fetchPaginatedPosts error:', error);
        } finally {
            isLoading = false;
        }
    };

    /**
     * एक ही बार में सर्वर से सारे पोस्ट्स ले आता है सिर्फ टैग्स और सर्च के लिए।
     */
    const fetchAllPostsForCache = async () => {
        if (tagsSlider) renderTagSkeletonLoader();
        try {
            const response = await fetch(`${backendBaseUrl}/api/posts?limit=2000`);
            if (!response.ok) throw new Error('Failed fetching all posts: ' + response.status);
            const data = await response.json();
            allPostsCache = data.posts || [];
            loadTags(allPostsCache);
        } catch (error) {
            if (tagsSlider) tagsSlider.innerHTML = '<p>Could not load tags.</p>';
            console.error("Could not load all posts for cache:", error);
        }
    };

    /**
     * सर्वर पर और टैग्स में किसी शब्द को खोजता है।
     */
    const fetchSearchResults = async (term) => {
        if (isLoading || !term) return;
        isLoading = true;
        renderSkeletonLoader();
        if (paginationContainer) paginationContainer.innerHTML = '';
        if (gridTitle) gridTitle.textContent = `Search Results for "${term}"`;
        try {
            const response = await fetch(`${backendBaseUrl}/api/search?q=${encodeURIComponent(term)}`);
            if (!response.ok) throw new Error('Search failed: ' + response.status);
            const data = await response.json();
            const apiResults = Array.isArray(data) ? data : (data.posts || []);
            const tagResults = allPostsCache.filter(post => (post.category || '').toLowerCase().includes(term.toLowerCase()));
            const combined = [...apiResults, ...tagResults];
            const uniqueResults = Array.from(new Set(combined.map(p => p._id))).map(id => combined.find(p => p._id === id));
            renderPosts(uniqueResults);
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
            const skeletonCard = document.createElement('div');
            skeletonCard.className = 'skeleton-card';
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

    const loadTags = (posts) => {
        if (!tagsSlider) return;
        tagsSlider.classList.remove('loading');
        const tagSet = new Set();
        posts.forEach(post => {
            const tags = (post.category || '').split(/[,\|\/]+|\s+/).map(t => t.trim()).filter(Boolean);
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

    const renderPosts = (posts) => {
        animeGrid.innerHTML = '';
        if (!posts || posts.length === 0) {
            animeGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No posts found.</p>';
            return;
        }
        posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        posts.forEach(post => {
            const { card, link, viewsNum } = createPostCard(post);

            // Anchor click: let the browser open; stop propagation so card click doesn't also fire.
            if (link) {
                link.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Fire click counter (background)
                    updateCounter(post._id, 'click');
                    // Let default behavior open the link in new tab
                });
            }

            // Card click: open link synchronously (user gesture) then send view counter
            card.addEventListener('click', (e) => {
                if (e.target.closest('.card-link')) return;
                // optimistic UI increment
                if (viewsNum) {
                    const current = parseInt(viewsNum.textContent.replace(/,/g, '')) || 0;
                    viewsNum.textContent = (current + 1).toLocaleString();
                }
                // Open immediately to preserve gesture
                try {
                    window.open(post.link, '_blank', 'noopener,noreferrer');
                } catch (ex) {
                    // fallback
                    window.location.href = post.link;
                }
                // send view count in background
                updateCounter(post._id, 'view');
            });

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

    if (logo) {
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            fetchPaginatedPosts(1);
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
                const tag = button.dataset.tag;
                if (tag === 'all') {
                    fetchPaginatedPosts(1);
                } else {
                    if (gridTitle) gridTitle.textContent = `Tag: ${tag}`;
                    const filteredPosts = allPostsCache.filter(post => (post.category || '').split(/\s+/).includes(tag));
                    renderPosts(filteredPosts);
                    if (paginationContainer) paginationContainer.innerHTML = '';
                }
                document.querySelectorAll('.tag-bubble').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
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
                fetchPaginatedPosts(parseInt(button.dataset.page));
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
    fetchPaginatedPosts(1);
    fetchAllPostsForCache();
});
