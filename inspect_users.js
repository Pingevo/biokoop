import "dotenv/config";
import { connectDB } from "./config/db.js";
import { User } from "./models/User.js";

async function inspectUsers() {
  try {
    await connectDB();
    const users = await User.find({}).lean();
    console.log("=== ALL USERS IN MONGODB ===");
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Inspect Error:", err);
    process.exit(1);
  }
}

inspectUsers();
