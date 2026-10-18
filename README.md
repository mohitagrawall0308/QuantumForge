# QuantumForge — Boson Sampling Cryptography Simulator

Educational Python + Flask simulation.

## What it does
1. Generates a small random interferometer unitary U.
2. Injects a configurable number of photons.
3. Computes small-scale boson-sampling probabilities using matrix permanents.
4. Samples output Fock states.
5. Derives a SHA-256 demo key from the interferometer + sampled state.
6. Uses that key with AES-GCM to encrypt/decrypt a message.
7. Visualizes the complete pipeline in the browser.

## Secure Courier (real-world use case)
Send a confidential message (lab report, settlement terms, payment-change notice) so that
intercepting one channel is useless:
1. The sender seals the message. A boson-sampling session plus a random salt produce an AES-GCM key.
2. The **sealed package** (`QFP1.nonce.ciphertext`) goes by email.
3. The short **secret key** (`QF-seed-modes-photons-shots-salt`) goes by phone/SMS.
4. The receiver pastes both; the server rebuilds the same session and opens the message.
A wrong code or a modified package fails the AES-GCM authenticity check.
Endpoints: `POST /api/courier/seal`, `POST /api/courier/open`.

## Run on Windows

```bat
cd boson_sampling_flask
python -m pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000

## Important security note

This is a learning simulator, not a production quantum cryptosystem.
Boson Sampling is used here as a quantum/photonic-inspired key-generation primitive.
AES-GCM provides the actual authenticated encryption.

The simulator deliberately keeps the number of modes/photons small because exact
permanent calculation becomes computationally expensive very quickly.
