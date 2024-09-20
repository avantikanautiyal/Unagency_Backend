import firebaseAdmin from "firebase-admin";
import serviceAccount from "./key.json"; // Make sure the path is correct

// Check if Firebase Admin has already been initialized
if (!firebaseAdmin.apps.length) {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(
      serviceAccount as firebaseAdmin.ServiceAccount
    ),
    databaseURL: "https://prakria-direct-d6c71.firebaseio.com", // Optional: if you're using Firebase Realtime Database
  });
}

export default firebaseAdmin;
