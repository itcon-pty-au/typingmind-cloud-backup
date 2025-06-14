# TypingMind Cloud Sync - Roadmap

This document outlines the planned features, fixes, and improvements for the cloud sync script.

---

### 🐛 Bug Fixes & Critical Issues

- [ ] **Fix Inefficient Backup Compression:** Reverse the order to compress data _before_ encryption. Encrypting first makes compression ineffective.
- [ ] **Improve Change Detection:** Replace item size comparison with content hashing (e.g., SHA-1) to make sync more reliable and prevent unnecessary uploads.

---

### 🛠️ Refactoring & Simplification

- [ ] **Simplify Deletion Monitoring:** Remove the `setInterval`-based polling for deletions and integrate detection into the main `performFullSync` cycle to reduce complexity and background resource usage.
- [ ] **Strengthen Key Derivation:** Use a standard, hardened key derivation function like PBKDF2 with a salt to generate the encryption key from the user's password, improving security.

---

### 🚀 New Features & Enhancements
