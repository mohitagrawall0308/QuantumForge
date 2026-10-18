from flask import Flask, render_template, request, jsonify
import hashlib
import json
import secrets
import math
from itertools import combinations
import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

app = Flask(__name__)

def random_unitary(m, rng):
    """Generate a Haar-like random unitary using QR decomposition."""
    z = rng.normal(size=(m, m)) + 1j * rng.normal(size=(m, m))
    q, r = np.linalg.qr(z)
    phases = np.diag(r)
    phases = np.where(np.abs(phases) > 1e-15, phases / np.abs(phases), 1.0)
    return q @ np.diag(np.conj(phases))

def ryser_permanent(a):
    """Permanent using Ryser's formula. Intended for small educational demos."""
    n = a.shape[0]
    if n == 0:
        return 1.0 + 0j
    if n > 10:
        raise ValueError("Demo permanent limit exceeded (n <= 10).")

    total = 0.0 + 0j
    for mask in range(1, 1 << n):
        rows = np.zeros(n, dtype=complex)
        bits = 0
        for j in range(n):
            if mask & (1 << j):
                rows += a[:, j]
                bits += 1
        total += (-1 if (n - bits) % 2 else 1) * np.prod(rows)
    return total

def occupation_vectors(m, n):
    """All output occupation vectors summing to n."""
    if m == 1:
        yield (n,)
        return
    for first in range(n + 1):
        for rest in occupation_vectors(m - 1, n - first):
            yield (first,) + rest

def repeated_submatrix(u, input_occ, output_occ):
    rows = []
    cols = []
    for i, count in enumerate(output_occ):
        rows.extend([i] * count)
    for j, count in enumerate(input_occ):
        cols.extend([j] * count)
    return u[np.ix_(rows, cols)]

def boson_probability(u, input_occ, output_occ):
    n = sum(input_occ)
    a = repeated_submatrix(u, input_occ, output_occ)
    perm = ryser_permanent(a)
    denom = 1
    for x in output_occ:
        denom *= math.factorial(x)
    for x in input_occ:
        denom *= math.factorial(x)
    return float((abs(perm) ** 2) / denom)

def compute_distribution(u, input_occ):
    m = len(input_occ)
    n = sum(input_occ)
    states = list(occupation_vectors(m, n))
    probs = np.array([boson_probability(u, input_occ, s) for s in states], dtype=float)
    total = probs.sum()
    if total <= 1e-14:
        raise ValueError("Degenerate probability distribution.")
    probs /= total
    return states, probs

def state_label(state):
    return "|"+",".join(map(str, state))+">"

def derive_key(state, matrix):
    canonical = {
        "state": list(state),
        "matrix": [
            [[round(float(x.real), 8), round(float(x.imag), 8)] for x in row]
            for row in matrix
        ]
    }
    blob = json.dumps(canonical, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()

@app.get("/")
def index():
    return render_template("index.html")

@app.post("/api/simulate")
def simulate():
    try:
        data = request.get_json(force=True)
        modes = max(2, min(int(data.get("modes", 4)), 6))
        photons = max(1, min(int(data.get("photons", 3)), modes))
        shots = max(1, min(int(data.get("shots", 120)), 500))
        seed = data.get("seed")
        if seed in ("", None):
            seed = secrets.randbits(32)
        seed = int(seed)

        rng = np.random.default_rng(seed)
        u = random_unitary(modes, rng)

        input_occ = tuple([1] * photons + [0] * (modes - photons))
        states, probs = compute_distribution(u, input_occ)

        picks = rng.choice(len(states), size=shots, p=probs)
        counts = {state_label(s): 0 for s in states}
        for p in picks:
            counts[state_label(states[p])] += 1

        top = sorted(
            [{"state": state_label(s), "probability": float(p), "count": counts[state_label(s)]}
             for s, p in zip(states, probs)],
            key=lambda x: x["probability"],
            reverse=True
        )[:12]

        sampled_state = states[int(picks[-1])]
        key_hex = derive_key(sampled_state, u)

        return jsonify({
            "ok": True,
            "seed": seed,
            "modes": modes,
            "photons": photons,
            "shots": shots,
            "input": list(input_occ),
            "matrix": [
                [{"re": round(float(x.real), 5), "im": round(float(x.imag), 5)}
                 for x in row] for row in u
            ],
            "top_states": top,
            "sampled_state": state_label(sampled_state),
            "key_hex": key_hex,
            "key_preview": key_hex[:16] + "…",
            "explanation": [
                "A random interferometer unitary U is generated.",
                "Photons enter selected input modes.",
                "Output probabilities are calculated from matrix permanents.",
                "A bosonic output sample is selected.",
                "SHA-256 binds the sampled state and interferometer to a demo key."
            ]
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

@app.post("/api/encrypt")
def encrypt():
    try:
        data = request.get_json(force=True)
        plaintext = str(data.get("plaintext", ""))
        key_hex = str(data.get("key_hex", ""))
        if not plaintext:
            raise ValueError("Enter plaintext.")
        if len(key_hex) != 64:
            raise ValueError("Generate a Boson Sampling key first.")

        key = bytes.fromhex(key_hex)
        nonce = secrets.token_bytes(12)
        ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode(), None)

        return jsonify({
            "ok": True,
            "nonce": nonce.hex(),
            "ciphertext": ciphertext.hex()
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

@app.post("/api/decrypt")
def decrypt():
    try:
        data = request.get_json(force=True)
        key_hex = str(data.get("key_hex", ""))
        nonce = bytes.fromhex(str(data.get("nonce", "")))
        ciphertext = bytes.fromhex(str(data.get("ciphertext", "")))

        plaintext = AESGCM(bytes.fromhex(key_hex)).decrypt(nonce, ciphertext, None)
        return jsonify({"ok": True, "plaintext": plaintext.decode()})
    except Exception:
        return jsonify({"ok": False, "error": "Decryption failed: wrong key or modified ciphertext."}), 400

# ---------------------------------------------------------------------------
# Secure Courier use case (additive: existing endpoints above are unchanged)
# A sender seals a message; the ciphertext travels over one channel (e.g. email)
# while a short "access code" travels over another (e.g. phone/SMS). The receiver
# rebuilds the same boson-sampling session from the code and opens the message.
# ---------------------------------------------------------------------------
import re

COURIER_AAD = b"QuantumForge-courier-v1"
ACCESS_RE = re.compile(r"^QF-(\d{1,10})-(\d)-(\d)-(\d{1,3})-([0-9a-f]{32})$")

def session_from_params(modes, photons, shots, seed):
    """Deterministically rebuild a sampling session (same steps as /api/simulate)."""
    rng = np.random.default_rng(seed)
    u = random_unitary(modes, rng)
    input_occ = tuple([1] * photons + [0] * (modes - photons))
    states, probs = compute_distribution(u, input_occ)
    picks = rng.choice(len(states), size=shots, p=probs)
    sampled = states[int(picks[-1])]
    return sampled, derive_key(sampled, u)

def courier_key(boson_key_hex, salt):
    """Bind the boson-sampling key to a random salt carried in the access code."""
    return hashlib.sha256(bytes.fromhex(boson_key_hex) + salt).digest()

@app.post("/api/courier/seal")
def courier_seal():
    try:
        data = request.get_json(force=True)
        plaintext = str(data.get("plaintext", ""))
        if not plaintext.strip():
            raise ValueError("Enter a message to seal.")
        if len(plaintext) > 5000:
            raise ValueError("Message too long for the demo (5000 characters max).")
        modes = max(2, min(int(data.get("modes", 4)), 6))
        photons = max(1, min(int(data.get("photons", 3)), modes))
        shots = max(1, min(int(data.get("shots", 120)), 500))

        seed = secrets.randbits(32)
        salt = secrets.token_bytes(16)
        sampled, key_hex = session_from_params(modes, photons, shots, seed)
        key = courier_key(key_hex, salt)
        nonce = secrets.token_bytes(12)
        ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode(), COURIER_AAD)

        return jsonify({
            "ok": True,
            "access_code": f"QF-{seed}-{modes}-{photons}-{shots}-{salt.hex()}",
            "package": f"QFP1.{nonce.hex()}.{ciphertext.hex()}",
            "sampled_state": state_label(sampled),
            "fingerprint": hashlib.sha256(key).hexdigest()[:12],
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

@app.post("/api/courier/open")
def courier_open():
    try:
        data = request.get_json(force=True)
        m = ACCESS_RE.match(str(data.get("access_code", "")).strip())
        parts = str(data.get("package", "")).strip().split(".")
        if not m or len(parts) != 3 or parts[0] != "QFP1":
            raise ValueError("Invalid secret key or encrypted message format.")
        seed, modes, photons, shots = (int(m.group(i)) for i in range(1, 5))
        if not (2 <= modes <= 6 and 1 <= photons <= modes and 1 <= shots <= 500):
            raise ValueError("Invalid secret key or encrypted message format.")
        salt = bytes.fromhex(m.group(5))
        nonce, ciphertext = bytes.fromhex(parts[1]), bytes.fromhex(parts[2])
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    try:
        sampled, key_hex = session_from_params(modes, photons, shots, seed)
        key = courier_key(key_hex, salt)
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, COURIER_AAD)
        return jsonify({"ok": True, "plaintext": plaintext.decode(),
                        "sampled_state": state_label(sampled),
                        "fingerprint": hashlib.sha256(key).hexdigest()[:12]})
    except Exception:
        return jsonify({"ok": False, "error": "Decryption failed: the secret key is wrong or the message was modified."}), 400

if __name__ == "__main__":
    app.run(debug=True)
