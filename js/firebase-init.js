import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, doc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDBZ7tcCJJdGCo7C8FXRiUPQ8OfOzexllc",
  authDomain: "time2study-4f2f3.firebaseapp.com",
  projectId: "time2study-4f2f3",
  storageBucket: "time2study-4f2f3.appspot.com",
  messagingSenderId: "856561565211",
  appId: "1:856561565211:web:e59307f6c4dcb7a52582be",
  measurementId: "G-9S9C5D6TXF"
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

// Add error handling for connection issues
auth.onAuthStateChanged((user) => {
  // This helps detect if Firebase connections are working
  console.log('Firebase Auth state:', user ? 'authenticated' : 'not authenticated');
}, (error) => {
  console.error('Firebase Auth error:', error);
});

// Test Firestore connection
try {
  const testDoc = doc(db, '_test_connection_', 'test');
  console.log('Firestore connection initialized');
} catch (error) {
  console.error('Firestore initialization error:', error);
}
