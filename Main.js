document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selectors ---
    const themeToggle = document.getElementById('themeToggle');
    const searchIconBtn = document.getElementById('searchIconBtn');
    const searchInput = document.getElementById('searchInput');
    const animeGrid = document.getElementById('anime-grid');

    // --- Application State ---
    let posts = [];

    // --- Functions ---

    // 1. बैकएंड से वास्तविक डेटा लोड करना
    const loadPosts = async () => {
        // यह आपका लाइव बैकएंड URL है
        const backendUrl = 'https://anime-hangama.onrender.com/api/posts';
        
        // लोडर दिखाने के लिए ग्रिड को खाली करें
        animeGrid.innerHTML = '<div class="grid-loader"></div>';

        try {
            // आपके बैकएंड सर्वर को कॉल करेगा
            const response = await fetch(backendUrl);
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            // बैकएंड से मिले JSON डेटा को पढ़ेगा
            const data = await response.json();
            // उस डेटा को 'posts' वेरिएबल में सेव करेगा
            posts = data; 
            // और स्क्रीन पर दिखा देगा
            renderPosts(posts);

        } catch (error) {
            console.error('Failed to load posts:', error);
            animeGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">पोस्ट लोड करने में विफल। कृपया बाद में प्रयास करें।</p>';
        }
    };


    // 2. पोस्ट्स को पेज पर दिखाना
    const renderPosts = (postsToRender) => {
        animeGrid.innerHTML = ''; // ग्रिड को खाली करें
        if (postsToRender.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'अभी कोई पोस्ट उपलब्ध नहीं है।';
            emptyMessage.style.gridColumn = '1 / -1'; // सभी कॉलम में फैलाएं
            emptyMessage.style.textAlign = 'center';
            animeGrid.appendChild(emptyMessage);
        } else {
            postsToRender.forEach(post => {
                const card = document.createElement('div');
                card.className = 'anime-card';
                card.dataset.id = post.id;
                
                card.innerHTML = `
                    <div class="card-img-wrapper">
                        <img src="${post.imageUrl}" alt="${post.title}" loading="lazy">
                    </div>
                    <div class="card-content">
                        <h3 class="card-title" title="${post.title}">${post.title}</h3>
                        <div class="card-footer">
                            <span class="view-count">
                                <i class="material-icons" style="font-size: 1rem;">visibility</i>
                                <span class="views">${(post.views || 0).toLocaleString()}</span>
                            </span>
                            <a href="${post.link}" target="_blank" class="card-link" rel="noopener noreferrer">Watch Now</a>
                        </div>
                    </div>
                `;
                animeGrid.appendChild(card);
            });
        }
    };

    // 3. डेटा को localStorage में सेव करना (क्लाइंट-साइड व्यू काउंट अपडेट के लिए उपयोगी)
    const savePostsToLocalStorage = () => {
        localStorage.setItem('animePosts', JSON.stringify(posts));
    };
    
    // 4. थीम बदलना
    const handleThemeToggle = () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    };

    // 5. सर्च को हैंडल करना
    const handleSearch = (e) => {
        const term = e.target.value.toLowerCase();
        const filteredPosts = posts.filter(post => post.title.toLowerCase().includes(term));
        renderPosts(filteredPosts);
    };
    
    // 6. व्यू काउंट बढ़ाना (यह सिर्फ़ ब्राउज़र में दिखेगा, पेज रीलोड होने पर रीसेट हो जाएगा)
    const handleViewCount = (e) => {
        const card = e.target.closest('.anime-card');
        if (card && !e.target.classList.contains('card-link')) {
            const postId = parseInt(card.dataset.id);
            const post = posts.find(p => p.id === postId);
            if (post) {
                post.views = (post.views || 0) + 1; // यदि व्यूज मौजूद नहीं है तो 0 से शुरू करें
                savePostsToLocalStorage(); // इसे localStorage में सेव करें ताकि तुरंत दिखे
                card.querySelector('.views').textContent = post.views.toLocaleString();
            }
        }
    };

    // --- Event Listeners ---
    themeToggle.addEventListener('click', handleThemeToggle);
    searchIconBtn.addEventListener('click', () => searchInput.classList.toggle('active') && searchInput.focus());
    searchInput.addEventListener('input', handleSearch);
    animeGrid.addEventListener('click', handleViewCount);

    // --- Initial Load ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    // सबसे पहले यही फंक्शन चलेगा और आपके बैकएंड से डेटा लाएगा
    loadPosts();
});
