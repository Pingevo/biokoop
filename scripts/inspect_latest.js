import 'dotenv/config';
import mongoose from 'mongoose';
import { Request } from '../models/Request.js';
import { openDownloadStream } from '../services/storageService.js';
import fs from 'fs';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const req = await Request.findOne().sort({ createdAt: -1 });
  console.log('Latest Request:', {
    _id: req._id,
    reportType: req.reportType,
    status: req.status,
    createdAt: req.createdAt,
    resultImageIds: req.resultImageIds
  });
  if (req.aiAnalysis) {
    console.log('AI Analysis Data:', JSON.stringify(req.aiAnalysis, null, 2));
  }
  if (req.resultImageIds && req.resultImageIds.length > 0) {
    for (let i = 0; i < req.resultImageIds.length; i++) {
      const stream = openDownloadStream('results', req.resultImageIds[i]);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(`latest_result_p${i+1}.png`, buf);
      console.log(`Saved latest_result_p${i+1}.png, size: ${buf.length}`);
    }
  }
  process.exit(0);
}
check().catch(e => {
  console.error(e);
  process.exit(1);
});
