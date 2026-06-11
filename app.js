import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Global Variables
let db = null;
let promptsList = [];
let activeCategory = "All";
let searchQuery = "";

// Initialize App
async function init() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  try {
    // 1. Fetch Firebase config from local root
    const response = await fetch('/firebase-applet-config.json');
    if (!response.ok) throw new Error("Could not load Firebase configuration file.");
    const firebaseConfig = await response.json();

    // 2. Initialize Firebase Components
    const app = initializeApp(firebaseConfig);
    db = firebaseConfig.firestoreDatabaseId 
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);

    // 3. Load prompts
    await loadPrompts();

    // 4. Bind event listeners
    setupEventListeners();
  } catch (error) {
    console.error("Initialization Failed:", error);
    showToast("Failed to initialize system. Please make sure Firebase is provisioned.", "error");
    document.getElementById('loadingState').innerHTML = `
      <div class="text-center">
        <p class="text-red-400 font-semibold mb-2">Failed to initialize</p>
        <p class="text-xs text-[#9CA3AF]">Make sure databases and variables are configured correctly.</p>
      </div>
    `;
  }
}

// Fetch Prompts from Firestore database
async function loadPrompts() {
  const loadingState = document.getElementById('loadingState');
  const galleryGrid = document.getElementById('galleryGrid');
  const emptyState = document.getElementById('emptyState');

  try {
    loadingState.classList.remove('hidden');
    galleryGrid.innerHTML = '';
    emptyState.classList.add('hidden');

    const promptsRef = collection(db, "prompts");
    const q = query(promptsRef, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    promptsList = [];
    querySnapshot.forEach((doc) => {
      promptsList.push({ id: doc.id, ...doc.data() });
    });

    renderGallery();
  } catch (error) {
    console.error("Error fetching prompts:", error);
    showToast("Error loading prompt library: " + error.message, "error");
  } finally {
    loadingState.classList.add('hidden');
  }
}

// Filter and Render UI Cards
function renderGallery() {
  const galleryGrid = document.getElementById('galleryGrid');
  const emptyState = document.getElementById('emptyState');

  // Filter List
  const filtered = promptsList.filter(item => {
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    const searchTarget = `${item.title} ${item.prompt} ${item.category}`.toLowerCase();
    const matchesSearch = searchTarget.includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    galleryGrid.innerHTML = '';
    if (window.lucide) {
      window.lucide.createIcons();
    }
    return;
  }

  emptyState.classList.add('hidden');
  galleryGrid.innerHTML = filtered.map(item => `
    <article class="neon-card group flex flex-col justify-between rounded-2xl overflow-hidden" id="card-${item.id}">
      <!-- Header Image Box -->
      <div class="relative aspect-video w-full overflow-hidden bg-black/40 cursor-pointer" onclick="openModal('${item.id}')">
        <img 
          src="${item.imageUrl}" 
          alt="${escapeHtml(item.title)}" 
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerpolicy="no-referrer"
          loading="lazy"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
          <span class="text-xs text-white font-medium flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
            <i data-lucide="eye" class="w-3.5 h-3.5 text-[#8B5CF6]"></i> Click to inspect
          </span>
        </div>
      </div>

      <!-- Text Details -->
      <div class="p-5 flex flex-col flex-grow justify-between">
        <div>
          <!-- Meta category & date -->
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="px-2.5 py-0.5 text-[10px] font-bold tracking-brand text-[#8B5CF6] uppercase border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 rounded-full">
              ${escapeHtml(item.category)}
            </span>
            <span class="text-[10px] font-mono text-[#9CA3AF]">
              ${formatDate(item.createdAt)}
            </span>
          </div>

          <!-- Title -->
          <h3 class="text-base font-semibold tracking-tight text-[#F3F4F6] mb-2 truncate group-hover:text-white transition-colors cursor-pointer" onclick="openModal('${item.id}')">
            ${escapeHtml(item.title)}
          </h3>

          <!-- Snippet Prompt -->
          <p class="text-xs text-[#9CA3AF] line-clamp-2 leading-relaxed mb-4 bg-white/5 p-3 rounded-lg border border-white/5 text-left font-mono" style="word-break: break-all;">
            ${escapeHtml(item.prompt)}
          </p>
        </div>

        <!-- Buttons Panel -->
        <div class="flex items-center gap-2 pt-3 border-t border-white/5">
          <button 
            onclick="copyPrompt('${escapeJs(item.prompt)}')" 
            class="flex-grow flex items-center justify-center gap-2 px-3 py-2.5 bg-[#121217] hover:bg-[#8B5CF6] text-white border border-white/10 rounded-xl transition-all duration-300 active:scale-95 cursor-pointer text-xs font-semibold shadow-sm"
          >
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Copy Prompt</span>
          </button>
          <button 
            onclick="openModal('${item.id}')" 
            class="p-2.5 bg-[#121217] hover:bg-white/5 text-[#F3F4F6] border border-white/10 rounded-xl cursor-pointer transition-colors"
            title="Inspect Prompt"
          >
            <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </article>
  `).join('');

  // Update Lucide SVG Icons in DOM
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Bind Global Interactivity
function setupEventListeners() {
  // Search Filter Interaction
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderGallery();
    });
  }

  // Category Selector Taps
  const filterContainer = document.getElementById('filterContainer');
  if (filterContainer) {
    filterContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      // Reset inactive classes
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.className = "filter-btn px-5 py-2 text-sm font-medium rounded-full cursor-pointer transition-all duration-200 bg-[#1A1A22] text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/5 border border-white/5 hover:border-[#8B5CF6]/30";
      });

      // Highlight Active Class
      btn.className = "filter-btn px-5 py-2 text-sm font-medium rounded-full cursor-pointer transition-all duration-200 bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/25 border border-transparent";

      activeCategory = btn.getAttribute('data-category');
      renderGallery();
    });
  }

  // Modal Closers
  const modal = document.getElementById('detailModal');
  const closeBtn = document.getElementById('closeModalBtn');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Escape key closer
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// Lightbox modal opener
window.openModal = function(id) {
  const item = promptsList.find(p => p.id === id);
  if (!item) return;

  const modal = document.getElementById('detailModal');
  const modalImage = document.getElementById('modalImage');
  const modalCategory = document.getElementById('modalCategory');
  const modalTitle = document.getElementById('modalTitle');
  const modalPromptText = document.getElementById('modalPromptText');
  const modalCopyBtn = document.getElementById('modalCopyBtn');
  const modalDownloadLink = document.getElementById('modalDownloadLink');

  modalImage.src = item.imageUrl;
  modalCategory.textContent = item.category;
  modalTitle.textContent = item.title;
  modalPromptText.textContent = item.prompt;

  // Re-bind Action parameters
  modalCopyBtn.onclick = () => copyPrompt(item.prompt, "modalCopyBtnText");
  modalDownloadLink.href = item.imageUrl;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = "hidden"; // block scroll bleed
};

// Lightbox modal closer
window.closeModal = function() {
  const modal = document.getElementById('detailModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = ""; // restore default scrolling
  }
};

// Copy Clipboards
window.copyPrompt = async function(content, uiResponseId = null) {
  try {
    await navigator.clipboard.writeText(content);
    showToast("Prompt copied to clipboard successfully!", "success");

    if (uiResponseId) {
      const el = document.getElementById(uiResponseId);
      const originalText = el.textContent;
      el.textContent = "Copied!";
      setTimeout(() => {
        el.textContent = originalText;
      }, 2000);
    }
  } catch (error) {
    console.error("Copy Failed", error);
    showToast("Failed to copy path.", "error");
  }
};

// Custom Responsive Toast System
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `flex items-center gap-2.5 px-4 py-3 text-sm font-semibold rounded-xl shadow-lg border transition-all duration-300 transform translate-y-2 opacity-0 bg-[#191923] ${
    type === 'success' 
      ? 'border-emerald-500/30 text-emerald-400 shadow-emerald-500/5' 
      : 'border-rose-500/30 text-rose-400 shadow-rose-500/5'
  }`;
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}" class="w-4 h-4"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
  
  // Transition In
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Transition Out
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3000);
}

// Format Unix Timestamp securely
function formatDate(timestamp) {
  if (!timestamp) return "Just Now";
  let d;
  if (timestamp.seconds) {
    d = new Date(timestamp.seconds * 1000);
  } else if (timestamp.toDate) {
    d = timestamp.toDate();
  } else {
    d = new Date(timestamp);
  }
  
  if (isNaN(d.getTime())) return "Recently";
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Escape dangerous HTML variables
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Escape parameters for Javascript insertion inline
function escapeJs(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// Start System
window.addEventListener('DOMContentLoaded', () => {
  init();
});
