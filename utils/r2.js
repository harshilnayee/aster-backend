const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicUrl = process.env.R2_PUBLIC_URL;

// Initialize the S3Client config for Cloudflare R2
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey
  }
});

/**
 * Uploads a file to Cloudflare R2 storage.
 * @param {Object} file - The multer file object containing buffer and mimetype.
 * @param {string} key - The destination key (file path) in the bucket.
 * @returns {Promise<string>} The public access URL of the uploaded file.
 */
async function uploadToR2(file, key) {
  try {
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error("Missing R2 storage configuration environment variables.");
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    });

    await s3.send(command);

    // Return the public access URL
    // Ensure publicUrl ends with no slash, and key starts with no slash
    const formattedBaseUrl = publicUrl ? publicUrl.replace(/\/$/, "") : `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`;
    return `${formattedBaseUrl}/${key}`;
  } catch (error) {
    console.error("Cloudflare R2 Upload Error:", error);
    throw new Error(`Failed to upload file to R2: ${error.message}`);
  }
}

/**
 * Deletes a file from Cloudflare R2 storage.
 * @param {string} key - The key (file path) of the object to delete.
 * @returns {Promise<void>}
 */
async function deleteFromR2(key) {
  try {
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error("Missing R2 storage configuration environment variables.");
    }

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    await s3.send(command);
  } catch (error) {
    console.error("Cloudflare R2 Deletion Error:", error);
    throw new Error(`Failed to delete file from R2: ${error.message}`);
  }
}

module.exports = {
  uploadToR2,
  deleteFromR2
};
