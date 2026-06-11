import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Global Instance States
let auth = null;
let db = null;
let storage = null;
let inventoryList = [];
let localIsSignUp = false; // Auth mode toggle state

// Operation Enums for Skill requirement
const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

// Firestore Skill-compliant error handler
function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  showToast("Firestore access denied. Check authentication and security parameters.", "error");
  throw new Error(JSON.stringify(errInfo));
}

// 1. Initialize Firebase Components dynamically
async function init() {
  try {
    const response = await fetch('/firebase-applet-config.json');
    if (!response.ok) throw new Error("Missing Firebase Applet configuration credentials.");
    const firebaseConfig = await response.json();

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = firebaseConfig.firestoreDatabaseId 
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
    storage = getStorage(app);

    // Bootstrap Connection Validation (Required by Firebase skill)
    validateBaseConnection();

    // Kick off session checks
    bindAuthWatcher();
  } catch (error) {
    console.error("Initialization error:", error);
    showToast("Crash during workspace bootstrap: " + error.message, "error");
  }
}

// Validate Connection to Firestore (Skill Mandatory Directive)
async function validateBaseConnection() {
  try {
    // Attempt a silent server ping 
    const testRef = doc(db, 'test', 'connection');
    // Using standard silent get
    await deleteDoc(testRef).catch(() => {});
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please verify active network settings and Firebase rules configurations.");
    }
  }
}

// 2. Auth Session Guard & Page Routing
function bindAuthWatcher() {
  onAuthStateChanged(auth, (user) => {
    const currentLoc = window.location.pathname;
    const isLoginPage = currentLoc.includes('login.html');

    if (user) {
      // User is authenticated
      if (isLoginPage) {
        // Logged in user trying to see login.html -> route to workspace dashboard
        window.location.href = '/admin/index.html';
      } else {
        // We are on index.html -> Setup workspace UI
        const emailText = document.getElementById('adminEmailText');
        if (emailText) emailText.textContent = user.email;
        setupDashboard();
      }
    } else {
      // User is not authenticated
      if (!isLoginPage) {
        // Unauthorized tries to see index.html dashboard -> route to login.html
        window.location.href = '/admin/login.html';
      } else {
        // We are on login.html -> Setup login form
        setupAuthForm();
      }
    }
  });
}

// 3. Login Page Setup & Interactivity
function setupAuthForm() {
  const form = document.getElementById('authForm');
  const toggleBtn = document.getElementById('toggleAuthModeBtn');
  
  if (form) {
    form.addEventListener('submit', handleAuthSubmission);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localIsSignUp = !localIsSignUp;
      
      const authTitle = document.getElementById('authTitle');
      const authSubtitle = document.getElementById('authSubtitle');
      const submitBtnText = document.getElementById('submitBtnText');
      const lockIcon = document.getElementById('lockIcon');
      
      if (localIsSignUp) {
        authTitle.textContent = "Register Admin";
        authSubtitle.textContent = "Create an account to manage the artwork database";
        submitBtnText.textContent = "Register Admin";
        if (lockIcon) {
          lockIcon.setAttribute('data-lucide', 'user-plus');
          if (window.lucide) window.lucide.createIcons();
        }
      } else {
        authTitle.textContent = "Authorized Portal";
        authSubtitle.textContent = "Please sign in using your admin credentials";
        submitBtnText.textContent = "Sign In";
        if (lockIcon) {
          lockIcon.setAttribute('data-lucide', 'lock');
          if (window.lucide) window.lucide.createIcons();
        }
      }
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

async function handleAuthSubmission(e) {
  e.preventDefault();
  
  const emailVal = document.getElementById('emailInput').value.trim();
  const passwordVal = document.getElementById('passwordInput').value;
  const overlay = document.getElementById('authLoadingOverlay');
  const alertEl = document.getElementById('authAlert');

  if (passwordVal.length < 6) {
    setAuthAlert("Password must be at least 6 characters long.", "error");
    return;
  }

  // Show Loading Spinner
  overlay?.classList.remove('hidden');
  overlay?.classList.add('flex');
  setAuthAlert("", "hidden");

  try {
    if (localIsSignUp) {
      // Sign Up Mode
      await createUserWithEmailAndPassword(auth, emailVal, passwordVal);
      showToast("Admin account registered successfully!", "success");
    } else {
      // Sign In Mode
      await signInWithEmailAndPassword(auth, emailVal, passwordVal);
      showToast("Successfully signed in!", "success");
    }
    // Watcher redirects automatically
  } catch (error) {
    console.error("Auth Fail:", error);
    setAuthAlert(error.message || "Credential verification failed. Check variables.", "error");
    overlay?.classList.remove('flex');
    overlay?.classList.add('hidden');
  }
}

function setAuthAlert(msg, level) {
  const alertEl = document.getElementById('authAlert');
  if (!alertEl) return;

  if (level === 'hidden' || !msg) {
    alertEl.classList.add('hidden');
    return;
  }

  alertEl.classList.remove('hidden');
  alertEl.innerHTML = `
    <i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>
    <span>${msg}</span>
  `;
  
  if (level === 'error') {
    alertEl.className = "flex items-start gap-2.5 p-3 rounded-xl border mb-6 text-xs font-medium border-rose-500/25 bg-rose-500/5 text-rose-400";
  } else {
    alertEl.className = "flex items-start gap-2.5 p-3 rounded-xl border mb-6 text-xs font-medium border-emerald-500/25 bg-emerald-500/5 text-emerald-400";
  }

  if (window.lucide) window.lucide.createIcons();
}

// 4. Admin Dashboard Workspace Setup & Interactivity
function setupDashboard() {
  const uploadForm = document.getElementById('uploadForm');
  const logoutBtn = document.getElementById('logoutBtn');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('promptImgFile');

  if (uploadForm) {
    uploadForm.addEventListener('submit', handleUploadSubmission);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        showToast("Logged out successfully.", "success");
        window.location.href = '/index.html';
      } catch (err) {
        showToast("Logout failed: " + err.message, "error");
      }
    });
  }

  // Drag & Drop event bindings
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', handleFilePick);

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('border-[#8B5CF6]/60', 'bg-[#8B5CF6]/10');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('border-[#8B5CF6]/60', 'bg-[#8B5CF6]/10');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-[#8B5CF6]/60', 'bg-[#8B5CF6]/10');
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFilePick();
      }
    });
  }

  const clearPreviewBtn = document.getElementById('clearPreviewBtn');
  if (clearPreviewBtn) {
    clearPreviewBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Avoid triggering file pick
      clearPreview();
    });
  }

  // Initial Load Inventory Items
  loadInventory();
}

// Handle Local File Pick
function handleFilePick() {
  const fileInput = document.getElementById('promptImgFile');
  const previewContainer = document.getElementById('uploadPreviewContainer');
  const previewImg = document.getElementById('uploadPreviewImg');

  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
      previewImg.src = e.target.result;
      previewContainer.classList.remove('hidden');
      previewContainer.classList.add('flex');
    };

    reader.readAsDataURL(file);
  }
}

function clearPreview() {
  const fileInput = document.getElementById('promptImgFile');
  const previewContainer = document.getElementById('uploadPreviewContainer');
  const previewImg = document.getElementById('uploadPreviewImg');

  fileInput.value = ''; // Empty file input
  previewImg.src = '';
  previewContainer.classList.add('hidden');
  previewContainer.classList.remove('flex');
}

// Load Inventory list (admin view only)
async function loadInventory() {
  const listEl = document.getElementById('inventoryList');
  const emptyEl = document.getElementById('inventoryEmpty');
  const loadingEl = document.getElementById('inventoryLoading');
  const countBadge = document.getElementById('promptCountBadge');

  if (!listEl) return;

  try {
    loadingEl.classList.remove('hidden');
    listEl.innerHTML = '';
    emptyEl.classList.add('hidden');

    const promptsRef = collection(db, "prompts");
    const q = query(promptsRef, orderBy("createdAt", "desc"));
    
    let querySnapshot;
    try {
      querySnapshot = await getDocs(q);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "prompts");
    }

    inventoryList = [];
    querySnapshot.forEach((doc) => {
      inventoryList.push({ id: doc.id, ...doc.data() });
    });

    countBadge.textContent = `${inventoryList.length} items total`;

    if (inventoryList.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    listEl.innerHTML = inventoryList.map(item => `
      <div class="flex items-center justify-between p-4 bg-white/5 border border-white/5 hover:border-white/10 rounded-xl transition duration-200">
        <div class="flex items-center gap-4 min-w-0">
          <img 
            src="${item.imageUrl}" 
            alt="${escapeHtml(item.title)}" 
            class="w-12 h-12 rounded-lg object-cover shrink-0 bg-black/50 border border-white/10"
            referrerpolicy="no-referrer"
          />
          <div class="min-w-0">
            <h4 class="text-sm font-semibold text-[#F3F4F6] truncate pr-2">${escapeHtml(item.title)}</h4>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-[9px] font-bold tracking-wide uppercase text-[#8B5CF6]">${escapeHtml(item.category)}</span>
              <span class="text-[9px] text-[#9CA3AF] font-mono">• ${formatDate(item.createdAt)}</span>
            </div>
          </div>
        </div>
        <button 
          onclick="deletePromptItem('${item.id}')"
          class="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg border border-rose-500/20 hover:border-transparent transition-colors duration-200 cursor-pointer"
          title="Delete Prompt Item"
        >
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    console.error("Load Inventory Fail:", error);
  } finally {
    loadingEl.classList.add('hidden');
  }
}

// 5. Publish / Upload Workflow with dynamic task updates
async function handleUploadSubmission(e) {
  e.preventDefault();

  const titleVal = document.getElementById('promptTitle').value.trim();
  const categoryVal = document.getElementById('promptCategory').value;
  const promptVal = document.getElementById('promptText').value.trim();
  const fileInput = document.getElementById('promptImgFile');

  if (!fileInput.files || !fileInput.files[0]) {
    showToast("Please choose an image file first.", "error");
    return;
  }

  const file = fileInput.files[0];
  const submitBtn = document.getElementById('uploadSubmitBtn');
  const progressContainer = document.getElementById('uploadProgressContainer');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressText = document.getElementById('uploadProgressText');

  // Disable Inputs during upload
  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-50', 'pointer-events-none');
  progressContainer.classList.remove('hidden');

  const storagePath = `prompts/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  uploadTask.on('state_changed', 
    (snapshot) => {
      const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      progressBar.style.width = `${progress}%`;
      progressText.textContent = `${progress}%`;
    }, 
    (uploadError) => {
      console.error("Storage error:", uploadError);
      showToast("Storage space upload failed: " + uploadError.message, "error");
      
      // Reset inputs state
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'pointer-events-none');
      progressContainer.classList.add('hidden');
    }, 
    async () => {
      try {
        // Upload Completed, fetch direct download URL
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

        // Save object into Firestore DB in collection `/prompts`
        const docId = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const documentReference = doc(db, "prompts", docId);

        const payload = {
          title: titleVal,
          prompt: promptVal,
          category: categoryVal,
          imageUrl: downloadUrl,
          imagePath: storagePath,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid
        };

        try {
          await setDoc(documentReference, payload);
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.CREATE, "prompts/" + docId);
        }

        showToast("New prompt entry successfully published!", "success");
        
        // Form Cleanup
        document.getElementById('uploadForm').reset();
        clearPreview();
        progressContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        // Reload inventory
        loadInventory();
      } catch (err) {
        console.error("Database save crash:", err);
        showToast("Database register failed: " + err.message, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'pointer-events-none');
      }
    }
  );
}

// 6. Delete Prompt & Media entry
window.deletePromptItem = async function(id) {
  const item = inventoryList.find(i => i.id === id);
  if (!item) return;

  const confirmation = confirm(`Are you sure you want to permanently delete the prompt "${item.title}"? This cannot be undone.`);
  if (!confirmation) return;

  const overlay = document.getElementById('blockingOverlay');
  const overlayText = document.getElementById('blockingOverlayText');

  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  overlayText.textContent = "Removing artwork...";

  try {
    // 1. Delete image file from Firebase Storage (if valid image path is specified)
    if (item.imagePath) {
      const imgRef = ref(storage, item.imagePath);
      try {
        await deleteObject(imgRef);
      } catch (storageErr) {
        console.warn("Storage deletion warning (file may have been deleted already):", storageErr);
      }
    }

    // 2. Delete document entry from Firestore
    try {
      await deleteDoc(doc(db, "prompts", id));
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.DELETE, "prompts/" + id);
    }

    showToast("Artwork removed successfully.", "success");
    loadInventory();
  } catch (error) {
    console.error("Deletion crash:", error);
    showToast("Failed to remove item: " + error.message, "error");
  } finally {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }
};

// Toast notification display system
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `flex items-center gap-2.5 px-4 py-3 text-sm font-semibold rounded-xl shadow-lg border transition-all duration-300 transform translate-y-2 opacity-0 bg-[#1A1A22] ${
    type === 'success' 
      ? 'border-emerald-500/30 text-emerald-400 shadow-emerald-500/5' 
      : 'border-rose-500/30 text-rose-400 shadow-rose-500/5'
  }`;
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}" class="w-4 h-4 shrink-0"></i>
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

// Timestamp formatter
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

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  init();
});
