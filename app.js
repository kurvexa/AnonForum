// =======================
// 🔧 CONFIG
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const MODS = ["9878da6b-7e46-4add-b781-daf0aab15672"];

// =======================
// 🧠 STATE 
// =======================
let currentBoard = "general";
let cachedPosts = [];
let shadowBannedIds = [];
let realtimeChannel = null;

// =======================
// ⏱️ UTILS & TOS
// =======================
function getUserId() {
    let id = localStorage.getItem("userId") || crypto.randomUUID();
    localStorage.setItem("userId", id);
    return id;
}

function getAnonName() {
    let anonNum = localStorage.getItem("anonNum");
    if (!anonNum) {
        anonNum = Math.floor(Math.random() * 10000) + 1;
        localStorage.setItem("anonNum", anonNum);
    }
    return `Anonymous #${anonNum}`;
}

function checkTOS() {
    const hasAgreed = localStorage.getItem("tosAgreed");
    const overlay = document.getElementById("tosOverlay");
    if (!overlay) return;
    
    if (hasAgreed === "true") {
        overlay.style.display = "none";
    } else {
        overlay.style.setProperty("display", "flex", "important");
    }
}

function acceptTOS() {
    localStorage.setItem("tosAgreed", "true");
    document.getElementById("tosOverlay").style.display = "none";
}

function timeAgo(ts) {
    if (!ts) return "just now";
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "just now";
    const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diff < 30) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// =======================
// 🖼️ RENDERING ENGINE
// =======================
function render() {
    const container = document.getElementById("posts");
    const formContainer = document.getElementById("postFormContainer");
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const threadId = params.get("thread");
    const myId = getUserId();

    const visiblePosts = cachedPosts.filter(p => {
        const isBanned = shadowBannedIds.includes(p.user_id);
        const isMine = p.user_id === myId;
        return !isBanned || isMine;
    });

    if (threadId) {
        formContainer.style.display = "none";
        if (!document.getElementById("thread-wrapper")) {
            container.innerHTML = `
                <a href="index.html" class="backBtn" onclick="event.preventDefault(); switchBoard(currentBoard)">[ Back to Board ]</a>
                <hr>
                <div id="thread-wrapper"></div>
                <div id="replies-wrapper" class="reply-section"></div>
            `;
        }
        const op = visiblePosts.find(p => String(p.id) === String(threadId));
        const replies = visiblePosts.filter(p => String(p.parent_id) === String(threadId));
        
        if (!op) {
            container.innerHTML = `Thread not found on /${currentBoard}/. <a href="index.html">Go Back</a>`;
            return;
        }
        
        renderSinglePost(op, document.getElementById("thread-wrapper"), true);
        const replyWrap = document.getElementById("replies-wrapper");
        replyWrap.innerHTML = "";
        replies.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)).forEach(r => {
            renderSinglePost(r, replyWrap, false);
        });
    } else {
        formContainer.style.display = "block";
        container.innerHTML = ""; 
        const topics = visiblePosts.filter(p => !p.parent_id);
        
        topics.forEach(t => {
            const replyCount = visiblePosts.filter(p => String(p.parent_id) === String(t.id)).length;
            const div = document.createElement("div");
            div.className = "catalog-item post";
            // FIXED: Pass board in URL so reload works
            div.onclick = () => { window.location.search = `?thread=${t.id}&board=${currentBoard}`; };
            div.innerHTML = `
                <span class="subject">${(t.text || "").substring(0, 75)}</span>
                <div class="meta">
                    <b>${t.author}</b> • ${timeAgo(t.created_at)} • 
                    <span style="color:#706b5e;">Replies: ${replyCount}</span>
                </div>
            `;
            container.appendChild(div);
        });
    }
}

function renderSinglePost(post, container, isOP) {
    if (document.getElementById(`post-${post.id}`)) return;
    const div = document.createElement("div");
    div.id = `post-${post.id}`;
    div.className = isOP ? "post op" : "post reply";
    const isMod = MODS.includes(post.user_id);
    const myId = getUserId();
    const formatted = (post.text || "")
        .split("\n")
        .map(line => line.startsWith(">") ? `<span class="quote">${line}</span>` : line)
        .join("<br>");

    div.innerHTML = `
        <div class="post-header">
            <span class="name">${post.author}</span> 
            ${isMod ? '<span class="modTag"># MOD</span>' : ''}
            <span class="ts">${timeAgo(post.created_at)}</span>
            <span class="num">No.${post.id}</span>
            ${isOP ? `<button class="replyBtn" onclick="toggleReplyBox(${post.id})">Reply</button>` : ''}
            ${MODS.includes(myId) ? `<button onclick="event.stopPropagation(); banUser('${post.user_id}')" style="font-size:8px; opacity:0.3;">[X]</button>` : ''}
        </div>
        <div class="post-body">${formatted}</div>
        <div id="replyBox-${post.id}" class="inline-reply" style="display:none; margin-top:10px;">
            <textarea id="replyInput-${post.id}"></textarea><br>
            <button onclick="addReply(${post.id})">Submit</button>
        </div>
    `;
    container.appendChild(div);
}

// =======================
// 📡 REALTIME SYSTEM
// =======================
function initRealtime() {
    if (realtimeChannel) db.removeChannel(realtimeChannel);
    realtimeChannel = db.channel('public:posts')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'posts',
            filter: `board=eq.${currentBoard}` 
        }, (payload) => {
            if (!cachedPosts.find(p => p.id === payload.new.id)) {
                cachedPosts.push(payload.new);
                render();
            }
        })
        .subscribe();
}

// =======================
// ➕ ACTIONS
// =======================
async function addPost() {
    if (localStorage.getItem("tosAgreed") !== "true") {
        alert("Please accept the TOS first!");
        return;
    }
    const input = document.getElementById("postInput");
    if (!input.value.trim()) return;

    await db.from("posts").insert({
        text: input.value,
        author: getAnonName(),
        user_id: getUserId(),
        board: currentBoard,
        created_at: new Date().toISOString()
    });
    input.value = "";
}

async function addReply(parentId) {
    if (localStorage.getItem("tosAgreed") !== "true") {
        alert("Please accept the TOS first!");
        return;
    }
    const input = document.getElementById("replyInput-" + parentId);
    if (!input.value.trim()) return;

    await db.from("posts").insert({
        text: input.value,
        author: getAnonName(),
        user_id: getUserId(),
        parent_id: parentId,
        board: currentBoard,
        created_at: new Date().toISOString()
    });
    input.value = "";
    toggleReplyBox(parentId);
}

async function banUser(targetId) {
    if (!confirm("Shadow ban this ID?")) return;
    await db.from("shadow_bans").insert({ user_id: targetId });
    loadPosts(); 
}

// =======================
// 🛠️ HELPERS
// =======================
async function loadPosts() {
    // FIXED: Determine board from URL before fetching
    const params = new URLSearchParams(window.location.search);
    const urlBoard = params.get("board");
    if (urlBoard) currentBoard = urlBoard;

    const titleEl = document.getElementById("boardTitle");
    if (titleEl) titleEl.innerText = currentBoard.toUpperCase();

    const { data: banData } = await db.from("shadow_bans").select("user_id");
    shadowBannedIds = (banData || []).map(b => b.user_id);
    
    const { data, error } = await db.from("posts")
        .select("*")
        .eq("board", currentBoard)
        .order("created_at", { ascending: false });
        
    if (!error) {
        cachedPosts = data;
        render();
    }
}

function switchBoard(board) {
    currentBoard = board;
    const titleEl = document.getElementById("boardTitle");
    if (titleEl) titleEl.innerText = board.toUpperCase();
    cachedPosts = [];
    const postContainer = document.getElementById("posts");
    if (postContainer) postContainer.innerHTML = "";
    
    // Clear URL parameters when switching boards
    window.history.pushState({}, "", window.location.pathname);
    
    loadPosts();
    initRealtime(); 
}

function toggleReplyBox(id) {
    const el = document.getElementById("replyBox-" + id);
    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
}

// Global scope bindings
window.addPost = addPost;
window.addReply = addReply;
window.switchBoard = switchBoard;
window.toggleReplyBox = toggleReplyBox;
window.banUser = banUser;
window.acceptTOS = acceptTOS;

// =======================
// 🚀 INITIAL EXECUTION
// =======================
checkTOS();
loadPosts();
initRealtime();
