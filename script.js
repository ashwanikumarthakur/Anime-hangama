/* Updated script.js — पूरा, सही किया हुआ और हिंदी कमेंट्स के साथ
   मुख्य सुधार:
   - views/clicks के लिए navigator.sendBeacon (POST) का सपोर्ट + POST fetch keepalive fallback + PATCH fallback
   - XSS-safe rendering (textContent) और lazy loading images
   - search history, tags, pagination और theme toggle बनाए रखा
   - हर जगह error handling और console logs जोड़े गए
*/

/* CONFIG */
const backendBaseUrl = 'https://anime-hangama.onrender.com'; // backend का base URL (deploy के हिसाब से बदलें)
const POSTS_PER_PAGE = 12;

/* UTILS */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* DOM ELEMENTS */
const animeGrid = $('#anime-grid');
const tagsSlider = $('#tagsSlider');
const gridTitle = $('#gridTitle');
const searchInput = $('#searchInput');
const searchIconBtn = $('#searchIconBtn');
const themeToggle = $('#themeToggle');
const paginationContainer = $('#pagination');
const searchHistoryContainer = $('#search-history');
const searchWrapper = $('#searchWrapper');
const logo = $('#logo');

/* STATE */
let isLoading = false;
let allPostsCache = []; // cached posts for tag rendering & client-side features
let currentPage = 1;
let totalPages = 1;
let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');

/* ---------------------------
   Reliable counter function
   ---------------------------
   Strategy:
   1) Try navigator.sendBeacon (POST) first — best for navigation scenarios.
   2) If not available or returns false, try fetch POST with keepalive.
   3) If POST returns 404/405 (server only accepts PATCH), try PATCH as a last resort.
   Note: sendBeacon returning true means browser queued it, not guaranteed server write,
   but with POST endpoints present on backend chance of success is high.
*/
async function updateCounter(postId, type) {
  if (!postId || !type) return;
  const url = `${backendBaseUrl}/api/posts/${type}/${postId}`;

  // 1) sendBeacon (quick, no blocking)
  try {
    if ('sendBeacon' in navigator) {
      try {
        const payload = JSON.stringify({ _id: postId, type });
        const blob = new Blob([payload], { type: 'application/json' });
        const ok = navigator.sendBeacon(url, blob);
        if (ok) {
          console.debug('sendBeacon queued ->', url);
          return;
        } else {
          console.debug('sendBeacon returned false -> fallback to fetch', url);
        }
      } catch (err) {
        console.warn('sendBeacon threw', err);
      }
    }
  } catch (e) {
    console.warn('navigator.sendBeacon not usable', e);
  }

  // 2) POST fetch with keepalive
  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: postId, type })
    });
    if (res.ok) {
      console.debug('POST ok ->', url);
      return;
    }
    // If server doesn't accept POST (405) or route missing (404) try PATCH fallback
    if (res.status === 405 || res.status === 404) {
      console.warn('POST not accepted, trying PATCH fallback', res.status, url);
      const res2 = await fetch(url, {
        method: 'PATCH',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: postId, type })
      });
      if (res2.ok) {
        console.debug('PATCH ok ->', url);
        return;
      } else {
        console.warn('PATCH also failed', res2.status, res2.statusText);
      }
    } else {
      console.warn('POST returned non-ok status', res.status, res.statusText);
    }
  } catch (err) {
    console.warn('updateCounter fetch error', err);
  }
}

/* ---------------------------
   Card creation & rendering
   --------------------------- */
function createPostCard(post) {
  // safe rendering: use textContent, do not insert untrusted HTML
  const card = document.createElement('article');
  card.className = 'anime-card';
  card.setAttribute('role', 'article');

  // image wrapper
  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'card-img-wrapper';
  const img = document.createElement('img');
  img.src = post.imageUrl || '';
  img.alt = post.title || 'Anime';
  img.loading = 'lazy';
  imgWrapper.appendChild(img);
  card.appendChild(imgWrapper);

  // content
  const content = document.createElement('div');
  content.className = 'card-content';
  const h3 = document.createElement('h3');
  h3.className = 'card-title';
  h3.textContent = post.title || 'Untitled';
  h3.title = post.title || '';
  content.appendChild(h3);

  // footer with views + link
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const viewSpan = document.createElement('button'); // button for accessibility (not submitting)
  viewSpan.className = 'view-count';
  viewSpan.type = 'button';
  viewSpan.setAttribute('aria-label', `Views: ${post.views || 0}`);
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
  link.setAttribute('aria-label', `Open ${post.title}`);

  footer.appendChild(viewSpan);
  footer.appendChild(link);
  content.appendChild(footer);
  card.appendChild(content);

  return { card, link, viewsNum, id: post._id };
}

function renderPosts(posts) {
  if (!animeGrid) return;
  animeGrid.innerHTML = '';
  if (!posts || posts.length === 0) {
    const p = document.createElement('p');
    p.style.gridColumn = '1 / -1';
    p.style.textAlign = 'center';
    p.textContent = 'No posts found.';
    animeGrid.appendChild(p);
    return;
  }

  // sort by createdAt desc
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  posts.forEach(post => {
    const { card, link, viewsNum, id } = createPostCard(post);

    // Link click: increment click counter (background)
    if (link) {
      link.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent card click
        // increment click counter in background
        updateCounter(id, 'click');
        // default behavior opens link
      });
    }

    // Card click: open link and increment view
    card.addEventListener('click', (e) => {
      // if clicked on link, ignore (handled above)
      if (e.target.closest('.card-link')) return;

      // optimistic UI update
      if (viewsNum) {
        const cur = parseInt(viewsNum.textContent.replace(/,/g, '')) || 0;
        viewsNum.textContent = (cur + 1).toLocaleString();
      }

      // open link in new tab/window
      try {
        window.open(post.link, '_blank', 'noopener,noreferrer');
      } catch (err) {
        // fallback: same tab
        window.location.href = post.link;
      }

      // background increment view
      updateCounter(id, 'view');
    });

    animeGrid.appendChild(card);
  });
}

/* ---------------------------
   Pagination rendering
   --------------------------- */
function renderPagination(current, total) {
  if (!paginationContainer) return;
  paginationContainer.innerHTML = '';
  totalPages = total || 1;
  currentPage = current || 1;

  const createBtn = (txt, page, disabled = false) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    btn.textContent = txt;
    if (disabled) btn.disabled = true;
    btn.addEventListener('click', () => fetchPaginatedPosts(page));
    return btn;
  };

  // prev
  paginationContainer.appendChild(createBtn('Prev', Math.max(1, currentPage - 1), currentPage === 1));

  // show a few page numbers
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let p = start; p <= end; p++) {
    const btn = createBtn(String(p), p, false);
    if (p === currentPage) btn.classList.add('active');
    paginationContainer.appendChild(btn);
  }

  // next
  paginationContainer.appendChild(createBtn('Next', Math.min(totalPages, currentPage + 1), currentPage === totalPages));
}

/* ---------------------------
   Fetch posts (paginated)
   --------------------------- */
async function fetchPaginatedPosts(page = 1) {
  if (isLoading) return;
  isLoading = true;
  currentPage = page;
  if (animeGrid) animeGrid.innerHTML = '<p>Loading...</p>';
  try {
    const url = `${backendBaseUrl}/api/posts?page=${page}&limit=${POSTS_PER_PAGE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network error ' + res.status);
    const data = await res.json();
    renderPosts(data.posts || []);
    renderPagination(data.currentPage || 1, data.totalPages || 1);
  } catch (err) {
    console.error('fetchPaginatedPosts err', err);
    if (animeGrid) animeGrid.innerHTML = '<p>Failed to load posts.</p>';
  } finally {
    isLoading = false;
  }
}

/* ---------------------------
   Fetch all posts (cache for tags & client search)
   --------------------------- */
async function fetchAllPostsForCache() {
  try {
    const res = await fetch(`${backendBaseUrl}/api/posts?limit=2000`);
    if (!res.ok) throw new Error('Fetch all posts failed ' + res.status);
    const data = await res.json();
    allPostsCache = data.posts || [];
    loadTagsFromCache(allPostsCache);
  } catch (err) {
    console.error('fetchAllPostsForCache err', err);
  }
}

/* ---------------------------
   Tags rendering (from cache)
   --------------------------- */
function loadTagsFromCache(posts) {
  if (!tagsSlider) return;
  tagsSlider.innerHTML = '';
  const tagCount = {};
  posts.forEach(p => {
    (p.tags || []).forEach(t => {
      const tag = (t || '').trim();
      if (!tag) return;
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    });
  });
  const tags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]);
  if (tags.length === 0) {
    tagsSlider.innerHTML = '<p>No tags</p>';
    return;
  }
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn';
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      // filter posts by tag (client-side)
      const filtered = allPostsCache.filter(p => (p.tags || []).map(x => x.trim()).includes(tag));
      gridTitle.textContent = `Tag: ${tag}`;
      renderPosts(filtered);
      renderPagination(1, 1); // no pagination for tag view (client-side)
    });
    tagsSlider.appendChild(btn);
  });
}

/* ---------------------------
   Search handling
   --------------------------- */
let searchDebounceTimer = null;
function addToSearchHistory(q) {
  if (!q) return;
  searchHistory = searchHistory.filter(x => x !== q);
  searchHistory.unshift(q);
  if (searchHistory.length > 10) searchHistory.pop();
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  renderSearchHistory();
}

function renderSearchHistory() {
  if (!searchHistoryContainer) return;
  searchHistoryContainer.innerHTML = '';
  if (!searchHistory || searchHistory.length === 0) return;
  searchHistory.forEach(item => {
    const li = document.createElement('li');
    li.role = 'option';
    li.textContent = item;
    li.addEventListener('click', () => {
      searchInput.value = item;
      performSearch(item);
    });
    searchHistoryContainer.appendChild(li);
  });
}

async function performSearch(q) {
  if (!q) return;
  gridTitle.textContent = `Search: ${q}`;
  addToSearchHistory(q);
  try {
    const url = `${backendBaseUrl}/api/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Search failed ' + res.status);
    const posts = await res.json();
    renderPosts(posts);
    renderPagination(1, 1); // search results: single page view
  } catch (err) {
    console.error('performSearch err', err);
    animeGrid.innerHTML = '<p>Search failed.</p>';
  }
}

/* ---------------------------
   Theme toggle (dark/light)
   --------------------------- */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

/* ---------------------------
   UI initialisation & events
   --------------------------- */
function wireUpUI() {
  // Logo click -> go to first page
  if (logo) {
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      gridTitle.textContent = 'Latest Posts';
      fetchPaginatedPosts(1);
    });
  }

  // Search input debounce
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (q.length === 0) {
          // if empty, go back to paginated listing
          gridTitle.textContent = 'Latest Posts';
          fetchPaginatedPosts(1);
        } else {
          performSearch(q);
        }
      }, 350);
    });
  }

  // Search icon (toggle visibility on small screens)
  if (searchIconBtn && searchWrapper) {
    searchIconBtn.addEventListener('click', () => {
      searchWrapper.classList.toggle('visible');
      if (searchWrapper.classList.contains('visible')) {
        searchInput && searchInput.focus();
      }
    });
  }

  // Theme toggle
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // click outside search to close history
  document.addEventListener('click', (e) => {
    if (!searchWrapper) return;
    if (!searchWrapper.contains(e.target) && searchHistoryContainer) {
      searchHistoryContainer.innerHTML = '';
    }
  });

  // initial search history render
  renderSearchHistory();

  // keyboard: Enter in search triggers immediate search
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) performSearch(q);
      }
    });
  }
}

/* ---------------------------
   Bootstrapping
   --------------------------- */
(function boot() {
  // apply saved theme
  const savedTheme = localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme');
  if (savedTheme) setTheme(savedTheme);

  wireUpUI();

  // initial load
  fetchPaginatedPosts(1);
  fetchAllPostsForCache();
})();
