"""OPT-IN, DISABLED BY DEFAULT — masterserver research-tree WebSocket capture.

The SAND tech tree (node edges, unlock costs, tiers, faction assignment) is NOT in the game
files. It is delivered at runtime by the masterserver via a `GetResearchTree` message over an
encrypted WebSocket (wss://eus.<masterserver>/gameclient/) after PlayFab login. This mitmproxy
addon intercepts that WebSocket and dumps the research-tree payload to disk so it can be
transformed into the wiki's tech data.

==============================  READ BEFORE ENABLING  ==============================
This performs a TLS man-in-the-middle of YOUR OWN authenticated game session. It is:
  - OPT-IN and DISABLED unless you set the env var  SAND_RESEARCH_CAPTURE=1
  - intended only for your own account / your own data, run manually, ONE shot, low volume
Risks you accept by enabling it:
  - ToS gray area (authenticated session against a live service)
  - it may simply NOT WORK if the client pins certificates (the connection just fails)
  - BattlEye anti-cheat is present; a proxy does not inject the game process, but a live
    authenticated session is never zero-risk
Do NOT automate, loop, or scrape — capture once and stop. This addon never injects, hooks,
or modifies the game; it only reads WebSocket frames that pass through the local proxy.
====================================================================================

USAGE (manual, by you, when you choose to enable):
  1. pip install mitmproxy
  2. set SAND_RESEARCH_CAPTURE=1                     (Windows)   /   export on POSIX
  3. mitmdump -s scripts/capture_research_tree.py     (run from packages/datamine/)
  4. Route the game's traffic through 127.0.0.1:8080 and trust the mitmproxy CA
     (mitm.it after the proxy is running). Launch SAND, log in, open the research tree.
  5. Watch for "CAPTURED research-tree frame -> ..." then stop mitmdump (Ctrl-C).
Output: extracted/json/research_tree_capture/*.json  (raw frames) + research_tree_capture.json
        (the largest research-looking server frame — the most likely full tree).
Then a build step (build_research_tree_from_capture.py, authored against the real payload once
you've captured it) maps it into research_tree.json. See UPDATE_PIPELINE.md.
"""
import os
import json

# --- DISABLED BY DEFAULT. This addon no-ops unless you explicitly opt in. ---
ENABLED = os.environ.get("SAND_RESEARCH_CAPTURE") == "1"

OUT_DIR = "extracted/json/research_tree_capture"
BEST = "extracted/json/research_tree_capture.json"

# A frame is "research-looking" if it mentions any of these (case-insensitive).
KEYWORDS = ("researchtree", "research_tree", "getresearchtree", "researchnode", "progressiontree")

_seq = 0
_best_len = 0


def _decode(msg):
    """Return (text, is_text) for a mitmproxy WebSocketMessage."""
    try:
        if getattr(msg, "is_text", False) and msg.text is not None:
            return msg.text, True
    except Exception:
        pass
    raw = msg.content if isinstance(msg.content, (bytes, bytearray)) else bytes(str(msg.content), "utf-8", "replace")
    try:
        return raw.decode("utf-8"), True
    except Exception:
        return raw.hex(), False


def _looks_like_research(text):
    low = text.lower()
    return any(k in low for k in KEYWORDS)


def load(loader):
    # Called once when mitmproxy loads the addon — print a clear status banner.
    if ENABLED:
        print("[capture_research_tree] ENABLED — watching WebSocket frames for the research tree.")
        os.makedirs(OUT_DIR, exist_ok=True)
    else:
        print("[capture_research_tree] DISABLED (set SAND_RESEARCH_CAPTURE=1 to enable). Doing nothing.")


def websocket_message(flow):
    """mitmproxy hook: fires for each WebSocket frame on an intercepted flow."""
    if not ENABLED:
        return
    global _seq, _best_len
    msg = flow.websocket.messages[-1]
    # only server->client frames carry the tree (skip our own requests)
    if getattr(msg, "from_client", False):
        return
    text, is_text = _decode(msg)
    if not is_text or not _looks_like_research(text):
        return
    _seq += 1
    path = os.path.join(OUT_DIR, f"frame_{_seq:03d}.json")
    try:
        # pretty-print if it parses as JSON, else store raw text
        try:
            payload = json.loads(text)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=1, ensure_ascii=False)
        except json.JSONDecodeError:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
        print(f"[capture_research_tree] CAPTURED research-tree frame -> {path} ({len(text)} chars)")
        # keep the largest research-looking frame as the best-guess full tree
        if len(text) > _best_len:
            _best_len = len(text)
            with open(BEST, "w", encoding="utf-8") as f:
                f.write(text)
            print(f"[capture_research_tree] (best candidate so far -> {BEST})")
    except Exception as e:
        print(f"[capture_research_tree] write failed: {e}")
