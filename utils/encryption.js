const crypto = require("crypto");
const ALGORITHM = "aes-256-gcm";
let KEY;

function initEncryptionKey() {
  const hexKey = process.env.ENCRYPTION_KEY || "";
  const isValidHex = hexKey.length === 64 && /^[0-9a-fA-F]+$/.test(hexKey);
  const isProduction = process.env.NODE_ENV === "production";

  if (isValidHex) {
    return Buffer.from(hexKey, "hex");
  }

  if (isProduction) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-char hex string in production. Refusing to start with a fallback key."
    );
  }

  console.warn(
    "WARNING: ENCRYPTION_KEY is missing or invalid. Deriving a development-only fallback key."
  );
  return crypto.scryptSync(hexKey || "default-aster-fallback-key", "salt", 32);
}

try {
  KEY = initEncryptionKey();
} catch (err) {
  console.error("Failed to initialize ENCRYPTION_KEY:", err.message);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
  KEY = crypto.scryptSync("default-aster-fallback-key", "salt", 32);
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
    if (!ivHex || !authTagHex || !dataHex) return "";
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    // Do not echo ciphertext back to clients on failure
    return "";
  }
}

module.exports = { encrypt, decrypt };
