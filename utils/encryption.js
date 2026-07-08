const crypto = require("crypto");
const ALGORITHM = "aes-256-gcm";
let KEY;
try {
  const hexKey = process.env.ENCRYPTION_KEY || "";
  if (hexKey.length === 64 && /^[0-9a-fA-F]+$/.test(hexKey)) {
    KEY = Buffer.from(hexKey, "hex");
  } else {
    console.warn("WARNING: ENCRYPTION_KEY is missing or invalid. Deriving a fallback key.");
    KEY = crypto.scryptSync(hexKey || "default-aster-fallback-key", "salt", 32);
  }
} catch (err) {
  console.error("Failed to initialize ENCRYPTION_KEY:", err);
  KEY = Buffer.alloc(32);
}

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;
  try {
    const [ivHex, authTagHex, dataHex] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return encryptedText; // already-plaintext legacy data, or corrupt — fail safe, don't crash
  }
}

module.exports = { encrypt, decrypt };
