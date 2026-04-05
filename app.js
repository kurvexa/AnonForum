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
let normalIDs = []; 
// =======================
// ⏱️ UTILS
// =======================
function getUserId() {
    let id = localStorage.getItem("userId") || crypto.randomUUID();
    localStorage.setItem("userId", id);
    return id;
}

function getAnonName() {
    return localStorage.getItem("anonName") || "Anonymous";
}

function timeAgo(ts) {
    if (!ts) return "just now";
    const diff = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
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
    container.innerHTML = "";

    const params = new URLSearchParams(window.location.search);
    const threadId = params.get("thread");
    const myId = getUserId();
    const visiblePosts = cachedPosts.filter(p => {
        const isBanned = normalIDs.includes(p.user_id);
        const isMine = p.user_id === myId;
        return !isBanned || isMine; /
    });

    if (threadId) {
        // --- THREAD VIEW ---
        formContainer.style.display = "none";
        const op = visiblePosts.find(p => p.id == threadId);
        const replies = visiblePosts.filter(p => p.parent_id == threadId);

        if (!op) {
            container.innerHTML = "Thread not found or removed. <a href='index.html'>Go Back</a>";
            return;
        }

        const back = document.createElement("a");
        back.href = "index.html";
        back.innerText = "[ Back to Board ]";
        back.className = "backBtn";
        container.appendChild(back);
        container.appendChild(document.createElement("hr"));

        renderSinglePost(op, container, true);

        const replyWrap = document.createElement("div");
        replyWrap.className = "reply-section";
        replies.reverse().forEach(r => renderSinglePost(r, replyWrap, false));
        container.appendChild(replyWrap);

    } else {
        // --- CATALOG VIEW ---
        formContainer.style.display = "block";
        const topics = visiblePosts.filter(p => !p.parent_id);
        
        topics.forEach(t => {
            const replyCount = visiblePosts.filter(p => p.parent_id === t.id).length;
            const div = document.createElement("div");
            div.className = "catalog-item post";
            div.onclick = () => { window.location.search = `?thread=${t.id}`; };
            div.innerHTML = `
                <span class="subject">${t.text.substring(0, 75)}${t.text.length > 75 ? '...' : ''}</span>
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
    const div = document.createElement("div");
    div.className = isOP ? "post op" : "post reply";
    const isMod = MODS.includes(post.user_id);
    const myId = getUserId();
    
    const ghostMark = (normalIDs.includes(post.user_id) && post.user_id === myId) ? ' 👻' : '';

    const formatted = (post.text || "")
        .split("\n")
        .map(line => line.startsWith(">") ? `<blockquote>${line}</blockquote>` : line)
        .join("<br>");

    div.innerHTML = `
        <div class="post-header">
            <span class="name">${post.author}${ghostMark}</span> 
            ${isMod ? '<span class="modTag"># MOD</span>' : ''}
            <span class="ts">${timeAgo(post.created_at)}</span>
            <span class="num">No.${post.id}</span>
            ${isOP ? `<button class="replyBtn" onclick="toggleReplyBox(${post.id})">Post Reply</button>` : ''}
            ${MODS.includes(myId) ? `<button onclick="event.stopPropagation(); banUser('${post.user_id}')" style="font-size:8px; opacity:0.3;">[X]</button>` : ''}
        </div>
        <div class="post-body">${formatted}</div>
        <div id="replyBox-${post.id}" class="inline-reply" style="display:none; margin-top:10px;">
            <textarea id="replyInput-${post.id}" placeholder="Type a reply..."></textarea><br>
            <button onclick="addReply(${post.id})">Submit Reply</button>
        </div>
    `;
    container.appendChild(div);
}

// =======================
// ➕ ACTIONS
// =======================
async function addPost() {
    const input = document.getElementById("postInput");
    if (!input.value.trim()) return;

    await db.from("posts").insert({
        text: input.value,
        author: getAnonName(),
        user_id: getUserId(),
        board: currentBoard
    });

    input.value = "";
    loadPosts();
}

async function addReply(parentId) {
    const input = document.getElementById("replyInput-" + parentId);
    if (!input.value.trim()) return;

    await db.from("posts").insert({
        text: input.value,
        author: getAnonName(),
        user_id: getUserId(),
        parent_id: parentId,
        board: currentBoard
    });

    loadPosts();
}

// NEW: Quick ban function for you in the console or via the [X] button
async function banUser(targetId) {
    if (!confirm("Shadow ban this ID?")) return;
    await db.from("shadow_bans").insert({ user_id: targetId });
    loadPosts();
}

// =======================
// 🛠️ HELPERS
// =======================
async function loadPosts() {
    // 1. Load Shadow Bans first
    const { data: banData } = await db.from("shadow_bans").select("user_id");
    normalIDs = (banData || []).map(b => b.user_id);

    // 2. Load Posts
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
    document.getElementById("boardTitle").innerText = board.toUpperCase();
    window.history.pushState({}, "", window.location.pathname);
    loadPosts();
}

function toggleReplyBox(id) {
    const el = document.getElementById("replyBox-" + id);
    el.style.display = el.style.display === "none" ? "block" : "none";
}

window.addPost = addPost;
window.addReply = addReply;
window.switchBoard = switchBoard;
window.toggleReplyBox = toggleReplyBox;
window.banUser = banUser;

loadPosts();
