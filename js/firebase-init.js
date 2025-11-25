import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDBZ7tcCJJdGCo7C8FXRiUPQ8OfOzexllc",
  authDomain: "time2study-4f2f3.firebaseapp.com",
  projectId: "time2study-4f2f3",
  storageBucket: "time2study-4f2f3.appspot.com",
  messagingSenderId: "856561565211",
  appId: "1:856561565211:web:e59307f6c4dcb7a52582be",
  measurementId: "G-9S9C5D6TXF"
};

const app = initializeApp(firebaseConfig);

// Use a 10MB persistent local cache for Firestore
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    cacheSizeBytes: 10 * 1024 * 1024
  })
});

export const auth = getAuth(app);
