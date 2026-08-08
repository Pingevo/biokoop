import mongoose from "mongoose";
import { Readable } from "stream";

function getBucket(name) {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: name,
  });
}

// เก็บ buffer รูปลง GridFS -> คืนค่า ObjectId ของไฟล์
export async function saveImage(bucketName, buffer, filename, contentType) {
  const bucket = getBucket(bucketName);
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { contentType });
    Readable.from([buf])
      .pipe(uploadStream)
      .on("error", reject)
      .on("finish", () => resolve(uploadStream.id));
  });
}

// ดึง readable stream ของรูปจาก GridFS (ใช้ตอน serve ผ่าน HTTP route)
export function openDownloadStream(bucketName, id) {
  const bucket = getBucket(bucketName);
  return bucket.openDownloadStream(new mongoose.Types.ObjectId(id));
}

// ดึงข้อมูล metadata และขนาดไฟล์จาก GridFS
export async function getFileMetadata(bucketName, id) {
  try {
    if (!id) return null;
    const bucket = getBucket(bucketName);
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(id) }).toArray();
    return files[0] || null;
  } catch {
    return null;
  }
}
