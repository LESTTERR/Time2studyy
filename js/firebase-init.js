import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDBZ7tcCJJdGCo7C8FXRiUPQ8OfOzexllc",
  authDomain: "time2study-4f2f3.firebaseapp.com",
  databaseURL: "https://time2study-4f2f3-default-rtdb.firebaseio.com",
  projectId: "time2study-4f2f3",
  storageBucket: "time2study-4f2f3.firebasestorage.app",
  messagingSenderId: "856561565211",
  appId: "1:856561565211:web:316ca59d660bfa572582be",
  measurementId: "G-7NN20PT12W"
};

export const app = initializeApp(firebaseConfig);

// Initialize Analytics (optional, can be removed if not needed)
export const analytics = getAnalytics(app);

// Use a 10MB persistent local cache for Firestore
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    cacheSizeBytes: 10 * 1024 * 1024
  })
});

export const auth = getAuth(app);
