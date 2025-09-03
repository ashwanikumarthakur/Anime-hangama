// script.js
// Frontend client for Anime Hangama
// Hindi comments, robust fetching and counter handling

/* CONFIG - agar backend alag domain par ho to yahan badal do */
const backendBaseUrl = (window && window.BACKEND_BASE_URL) ? window.BACKEND_BASE_URL : 'https://anime-hangama.onrender.com';
const POSTS_PER_PAGE = 12;

/* HELPERS */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

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

let isLoading = false;
let allPostsCache = [];
let currentPage = 1;
let totalPages = 1;
let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');

/* Reliable counter:
   1) Try navigator.sendBeacon (POST)
   2) Fallback: fetch POST with keepalive
   3) If POST not accepted (404/405) try PATCH
*/
async function updateCounter(postId, type) {
  if (!postId || !type) return;
  const url = `${backendBaseUrl}/api/posts/${type}/${postId}`;

  // sendBeacon
  try {
    if (navigator && typeof navigator.sendBeacon === 'function') {
      try {
        const payload = JSON.stringify({ _id: postId, type });
        const blob = new Blob([payload], { type: 'application/json' });
        const beaconOk = navigator.sendBeacon(url, blob);
        if (beaconOk) {
          console.debug('sendBeacon queued for', url);
          return;
        } else {
          console.debug('sendBeacon returned false for', url);
        }
      } catch (e) {
        console.warn('sendBeacon error', e);
      }
    }
  } catch (e) {
    console.warn('sendBeacon not usable', e);
  }

  // fetch POST with keepalive
  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: postId, type })
    });
    if (res.ok) {
      console.debug('POST ok for', url);
      return;
    }
    if (res.status === 404 || res.status === 405) {
      // try PATCH fallback
      console.warn('POST not accepted, trying PATCH for', url, res.status);
      const res2 = await fetch(url, {
        method: 'PATCH',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: postId, type })
      });
      if (res2.ok) {
        console.debug('PATCH ok for', url);
        return;
      } else {
        console.warn('PATCH also failed for', url, res2.status);
      }
    } else {
      console.warn('POST returned non-ok', res.status, res.statusText);
    }
  } catch (err) {
    console.warn('fetch POST error for updateCounter', err);
  }
}

/* Card creation */
function createPostCard(post) {
  const card = document.createElement('article');
  card.className = 'anime-card';
  card.setAttribute('role', 'article');

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
  h3.textContent = post.title || 'Untitled';
  content.appendChild(h3);

  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'view-count';
  viewBtn.type = 'button';
  viewBtn.setAttribute('aria-label', `Views: ${post.views || 0}`);
  const icon = document.createElement('i');
  icon.className = 'material-icons';
  icon.textContent = 'visibility';
  icon.style.fontSize = '1rem';
  const viewsNum = document.createElement('span');
  viewsNum.id = `views-${post._id}`;
  viewsNum.textContent = (post.views || 0).toLocaleString();
  viewBtn.appendChild(icon);
  viewBtn.appendChild(viewsNum);

  const link = document.createElement('a');
  link.className = 'card-link';
  link.href = post.link || '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Watch Now';
  link.setAttribute('aria-label', `Open ${post.title}`);

  footer.appendChild(viewBtn);
  footer.appendChild(link);
  content.appendChild(footer);
  card.appendChild(content);

  return { card, link, viewsNum, id: post._id };
}

/* Render posts (safe) */
function renderPosts(posts) {
  if (!animeGrid) {
    console.error('Missing #anime-grid element');
    return;
  }
  animeGrid.innerHTML = '';
  if (!posts || posts.length === 0) {
    const p = document.createElement('p');
    p.style.gridColumn = '1 / -1';
    p.style.textAlign = 'center';
    p.textContent = 'No posts found.';
    animeGrid.appendChild(p);
    return;
  }

  // sort by createdAt desc if present
  posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  posts.forEach(post => {
    const { card, link, viewsNum, id } = createPostCard(post);

    // link click -> click counter
    if (link) {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        updateCounter(id, 'click');
      });
    }

    // card click -> open and view counter
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-link')) return;
      // optimistic UI
      if (viewsNum) {
        const cur = parseInt(viewsNum.textContent.replace(/,/g, ''), 10) || 0;
        viewsNum.textContent = (cur + 1).toLocaleString();
      }
      // open link in new tab (user gesture)
      try {
        window.open(post.link, '_blank', 'noopener,noreferrer');
      } catch (err) {
        window.location.href = post.link;
      }
      updateCounter(id, 'view');
    });

    animeGrid.appendChild(card);
  });
}

/* Pagination renderer */
function renderPagination(current, total) {
  if (!paginationContainer) return;
  paginationContainer.innerHTML = '';
  totalPages = total || 1;
  currentPage = current || 1;

  const makeBtn = (txt, page, disabled) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'page-btn';
    b.textContent = txt;
    if (disabled) b.disabled = true;
    b.addEventListener('click', () => fetchPaginatedPosts(page));
    return b;
  };

  paginationContainer.appendChild(makeBtn('Prev', Math.max(1, currentPage - 1), currentPage === 1));

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let p = start; p <= end; p++) {
    const btn = makeBtn(String(p), p, false);
    if (p === currentPage) btn.classList.add('active');
    paginationContainer.appendChild(btn);
  }

  paginationContainer.appendChild(makeBtn('Next', Math.min(totalPages, currentPage + 1), currentPage === totalPages));
}

/* Fetch paginated posts */
async function fetchPaginatedPosts(page = 1) {
  if (isLoading) return;
  isLoading = true;
  currentPage = page;
  if (animeGrid) animeGrid.innerHTML = '<p>Loading...</p>';

  try {
    const url = `${backendBaseUrl}/api/posts?page=${page}&limit=${POSTS_PER_PAGE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok ' + res.status);
    const data = await res.json();
    // backend may return { posts, totalPages, currentPage } OR array
    let posts = [];
    if (Array.isArray(data)) posts = data;
    else if (data.posts) posts = data.posts;
    else if (data.length) posts = data;

    renderPosts(posts);
    renderPagination(data.currentPage || page, data.totalPages || 1);
  } catch (err) {
    console.error('fetchPaginatedPosts error', err);
    if (animeGrid) animeGrid.innerHTML = '<p>Failed to load posts.</p>';
  } finally {
    isLoading = false;
  }
}

/* Fetch all posts for cache (tags/search) */
async function fetchAllPostsForCache() {
  try {
    const res = await fetch(`${backendBaseUrl}/api/posts?limit=2000`);
    if (!res.ok) throw new Error('Fetch all posts failed ' + res.status);
    const data = await res.json();
    let posts = [];
    if (Array.isArray(data)) posts = data;
    else if (data.posts) posts = data.posts;
    else if (data.length) posts = data;
    allPostsCache = posts;
    loadTagsFromCache(allPostsCache);
  } catch (err) {
    console.error('fetchAllPostsForCache err', err);
  }
}

/* Tags from cache */
function loadTagsFromCache(posts) {
  if (!tagsSlider) return;
  tagsSlider.innerHTML = '';
  const counts = {};
  (posts || []).forEach(p => (p.tags || []).forEach(t => {
    const tag = (t || '').trim();
    if (!tag) return;
    counts[tag] = (counts[tag] || 0) + 1;
  }));
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
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
      const filtered = allPostsCache.filter(p => (p.tags || []).map(x => x.trim()).includes(tag));
      gridTitle.textContent = `Tag: ${tag}`;
      renderPosts(filtered);
      renderPagination(1, 1);
    });
    tagsSlider.appendChild(btn);
  });
}

/* Search handling */
let searchDebounce = null;
function addToSearchHistory(q) {
  if (!q) return;
  searchHistory = (searchHistory || []).filter(x => x !== q);
  searchHistory.unshift(q);
  if (searchHistory.length > 10) searchHistory.pop();
  localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
  renderSearchHistory();
}

function renderSearchHistory() {
  if (!searchHistoryContainer) return;
  searchHistoryContainer.innerHTML = '';
  (searchHistory || []).forEach(item => {
    const li = document.createElement('li');
    li.role = 'option';
    li.textContent = item;
    li.addEventListener('click', () => {
      if (searchInput) searchInput.value = item;
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
    const res = await fetch(`${backendBaseUrl}/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('Search failed ' + res.status);
    const posts = await res.json();
    renderPosts(Array.isArray(posts) ? posts : (posts.posts || posts));
    renderPagination(1, 1);
  } catch (err) {
    console.error('performSearch err', err);
    if (animeGrid) animeGrid.innerHTML = '<p>Search failed.</p>';
  }
}

/* Theme toggle */
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
}

/* Wire UI */
function wireUpUI() {
  if (logo) logo.addEventListener('click', (e) => { e.preventDefault(); gridTitle.textContent = 'Latest Posts'; fetchPaginatedPosts(1); });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        if (!q) { gridTitle.textContent = 'Latest Posts'; fetchPaginatedPosts(1); }
        else performSearch(q);
      }, 350);
    });
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(searchInput.value.trim()); });
  }

  if (searchIconBtn && searchWrapper) {
    searchIconBtn.addEventListener('click', () => {
      searchWrapper.classList.toggle('visible');
      if (searchWrapper.classList.contains('visible') && searchInput) searchInput.focus();
    });
  }

  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  document.addEventListener('click', (e) => {
    if (!searchWrapper) return;
    if (!searchWrapper.contains(e.target) && searchHistoryContainer) searchHistoryContainer.innerHTML = '';
  });

  renderSearchHistory();
}

/* Boot */
(function () {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) setTheme(savedTheme);
  wireUpUI();
  fetchPaginatedPosts(1);
  fetchAllPostsForCache();
})();
