from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from datetime import datetime
import json, os, hashlib, uuid
from functools import wraps
from groq import Groq
from dotenv import load_dotenv   # ← Penting!

# Load environment variables dari file .env
load_dotenv()

print("API RAW:", repr(os.environ.get("GROQ_API_KEY")))

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "nexusai-super-secret-key-2024")

USERS_FILE = "data/users.json"
CHATS_FILE = "data/chats.json"

# ====================== GROQ SETUP ======================
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def load_json(path):
    if not os.path.exists(path): 
        return {}
    with open(path, encoding='utf-8') as f: 
        return json.load(f)

def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding='utf-8') as f: 
        json.dump(data, f, indent=2, ensure_ascii=False)

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def current_user():
    uid = session.get("user_id")
    if not uid: 
        return None
    return load_json(USERS_FILE).get(uid)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user():
            if request.path.startswith('/api/'):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated

@app.route("/")
def index(): 
    return render_template("index.html")

@app.route("/chat")
@login_required
def chat(): 
    return render_template("chat.html")

# ── AUTH ─────────────────────────────────────────────────────
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    email = data.get("email", "").strip()

    if not username or not password or not email:
        return jsonify({"error": "Semua field wajib diisi"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password minimal 6 karakter"}), 400

    users = load_json(USERS_FILE)
    for u in users.values():
        if u["username"] == username: 
            return jsonify({"error": "Username sudah digunakan"}), 400
        if u["email"] == email: 
            return jsonify({"error": "Email sudah digunakan"}), 400

    uid = str(uuid.uuid4())
    users[uid] = {
        "id": uid, 
        "username": username, 
        "email": email,
        "password": hash_password(password), 
        "created_at": datetime.now().isoformat(),
        "avatar": username[0].upper(), 
        "theme": "dark",
        "model": "llama-3.3-70b-versatile",
        "system_prompt": "Kamu adalah NexusAI, asisten AI yang cerdas, ramah, dan membantu.",
        "message_count": 0
    }
    save_json(USERS_FILE, users)
    session["user_id"] = uid
    return jsonify({"success": True})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    users = load_json(USERS_FILE)
    for uid, u in users.items():
        if u["username"] == username and u["password"] == hash_password(password):
            session["user_id"] = uid
            return jsonify({"success": True})
    return jsonify({"error": "Username atau password salah"}), 401

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.route("/api/me")
@login_required
def me():
    user = current_user()
    return jsonify({
        "username": user["username"], 
        "email": user["email"],
        "avatar": user["avatar"], 
        "model": user.get("model", "llama-3.3-70b-versatile"),
        "system_prompt": user.get("system_prompt", ""),
        "message_count": user.get("message_count", 0), 
        "created_at": user.get("created_at", "")
    })

@app.route("/api/update-settings", methods=["POST"])
@login_required
def update_settings():
    data = request.json
    users = load_json(USERS_FILE)
    uid = session["user_id"]
    if "system_prompt" in data: 
        users[uid]["system_prompt"] = data["system_prompt"]
    if "model" in data: 
        users[uid]["model"] = data["model"]
    if "theme" in data: 
        users[uid]["theme"] = data["theme"]
    save_json(USERS_FILE, users)
    return jsonify({"success": True})

# ── CHAT SESSIONS ─────────────────────────────────────────────
@app.route("/api/chat/sessions")
@login_required
def get_sessions():
    uid = session["user_id"]
    chats = load_json(CHATS_FILE).get(uid, {})
    sessions = [
        {
            "id": sid, 
            "title": s.get("title", "Chat baru"), 
            "created_at": s.get("created_at", ""), 
            "message_count": len(s.get("messages", []))
        } 
        for sid, s in chats.items()
    ]
    sessions.sort(key=lambda x: x["created_at"], reverse=True)
    return jsonify(sessions)

@app.route("/api/chat/sessions", methods=["POST"])
@login_required
def create_session():
    uid = session["user_id"]
    chats = load_json(CHATS_FILE)
    sid = str(uuid.uuid4())
    if uid not in chats: 
        chats[uid] = {}
    chats[uid][sid] = {
        "id": sid, 
        "title": "Chat baru", 
        "created_at": datetime.now().isoformat(), 
        "messages": []
    }
    save_json(CHATS_FILE, chats)
    return jsonify({"id": sid, "title": "Chat baru"})

@app.route("/api/chat/sessions/<sid>")
@login_required
def get_session(sid):
    uid = session["user_id"]
    session_data = load_json(CHATS_FILE).get(uid, {}).get(sid)
    if not session_data: 
        return jsonify({"error": "Session not found"}), 404
    return jsonify(session_data)

@app.route("/api/chat/sessions/<sid>", methods=["DELETE"])
@login_required
def delete_session(sid):
    uid = session["user_id"]
    chats = load_json(CHATS_FILE)
    if uid in chats and sid in chats[uid]:
        del chats[uid][sid]
        save_json(CHATS_FILE, chats)
    return jsonify({"success": True})

# ── MAIN CHAT FUNCTION (GROQ) ─────────────────────────────────
@app.route("/api/chat/send", methods=["POST"])
@login_required
def send_message():
    uid = session["user_id"]
    data = request.json
    session_id = data.get("session_id")
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Pesan kosong"}), 400

    chats = load_json(CHATS_FILE)
    if uid not in chats or session_id not in chats[uid]:
        return jsonify({"error": "Session tidak ditemukan"}), 404

    chat_session = chats[uid][session_id]
    messages = chat_session.get("messages", [])

    if len(messages) == 0:
        chat_session["title"] = user_message[:40] + ("..." if len(user_message) > 40 else "")

    messages.append({"role": "user", "content": user_message, "timestamp": datetime.now().isoformat()})

    try:
        users = load_json(USERS_FILE)
        sys_prompt = users[uid].get("system_prompt", "")
        model_name = users[uid].get("model", "llama-3.3-70b-versatile")

        groq_messages = []
        if sys_prompt:
            groq_messages.append({"role": "system", "content": sys_prompt})

        for m in messages[:-1]:
            role = "user" if m["role"] == "user" else "assistant"
            groq_messages.append({"role": role, "content": m["content"]})

        groq_messages.append({"role": "user", "content": user_message})

        response = groq_client.chat.completions.create(
            model=model_name,
            messages=groq_messages,
            temperature=0.8,
            max_tokens=2048,
            top_p=0.9,
        )
        
        ai_reply = response.choices[0].message.content

    except Exception as e:
        error_str = str(e).lower()
        if "429" in error_str or "rate limit" in error_str:
            return jsonify({"error": "Rate limit Groq tercapai. Tunggu sebentar lalu coba lagi."}), 429
        elif "api key" in error_str or "invalid" in error_str:
            return jsonify({"error": "Groq API Key tidak valid atau belum di-set. Cek file .env kamu."}), 401
        else:
            return jsonify({"error": f"Groq Error: {str(e)}"}), 500

    messages.append({"role": "assistant", "content": ai_reply, "timestamp": datetime.now().isoformat()})
    chats[uid][session_id]["messages"] = messages
    save_json(CHATS_FILE, chats)

    users = load_json(USERS_FILE)
    users[uid]["message_count"] = users[uid].get("message_count", 0) + 1
    save_json(USERS_FILE, users)

    return jsonify({
        "reply": ai_reply, 
        "title": chat_session.get("title", "Chat baru"), 
        "timestamp": messages[-1]["timestamp"]
    })

@app.route("/api/stats")
@login_required
def stats():
    uid = session["user_id"]
    chats = load_json(CHATS_FILE).get(uid, {})
    total_sessions = len(chats)
    total_messages = sum(len(s.get("messages", [])) for s in chats.values())
    return jsonify({
        "total_sessions": total_sessions, 
        "total_messages": total_messages, 
        "message_count": current_user().get("message_count", 0)
    })

if __name__ == "__main__":
    # Debug info saat start
    print("=== NexusAI Starting ===")
    print(f"GROQ_API_KEY loaded: {'YES' if os.environ.get('GROQ_API_KEY') else 'NO (ERROR!)'}")
    print(f"Server running at http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
