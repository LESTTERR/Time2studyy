import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, doc, collection, query, onSnapshot } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging.js";

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

// Add comprehensive error handling for connection issues
auth.onAuthStateChanged((user) => {
  // This helps detect if Firebase connections are working
  console.log('Firebase Auth state:', user ? 'authenticated' : 'not authenticated');

  // Add WebChannel connection monitoring
  if (user) {
    console.log('User authenticated, checking WebChannel connection...');

    // Test Firestore connection with explicit error handling
    try {
      const testDoc = doc(db, '_test_connection_', 'test');
      console.log('Firestore connection initialized successfully');

      // Add WebChannel connection test
      if (window.navigator && window.navigator.onLine) {
        console.log('Network appears online, testing WebChannel...');

        // Create a test query to check WebChannel connectivity
        const testQuery = query(collection(db, '_test_connection_'));
        const unsubscribe = onSnapshot(testQuery,
          (snapshot) => {
            console.log('WebChannel connection successful - realtime updates working');
            unsubscribe(); // Clean up
          },
          (error) => {
            console.error('WebChannel connection failed:', error);
            console.log('This may be caused by browser extensions, CORS issues, or network restrictions');

            // Check for common blocking patterns
            if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
              console.warn('WebChannel blocked by client - likely caused by browser extension or security software');
            }
            if (error.message.includes('CORS')) {
              console.warn('CORS issue detected - check Firebase configuration');
            }
            if (error.message.includes('network')) {
              console.warn('Network issue detected - check internet connection');
            }
          }
        );

      } else {
        console.warn('Network appears offline - WebChannel may not work');
      }

    } catch (error) {
      console.error('Firestore initialization error:', error);
    }
  }
}, (error) => {
  console.error('Firebase Auth error:', error);

  // Add specific error analysis
  if (error.code === 'auth/network-request-failed') {
    console.error('Network request failed - check internet connection and firewall settings');
  }
  if (error.code === 'auth/web-storage-unsupported') {
    console.error('Web storage not supported - check browser settings or private mode');
  }
});

// Test Firestore connection and setup fallback mode
try {
  const testDoc = doc(db, '_test_connection_', 'test');
  console.log('Firestore connection initialized');

  // Setup fallback mode detection
  window.firestoreMode = 'realtime'; // Default to realtime

  // Test WebChannel connectivity
  const testQuery = query(collection(db, '_connection_test_'));
  const testTimeout = setTimeout(() => {
    console.warn('WebChannel connection timeout - switching to fallback mode');
    window.firestoreMode = 'fallback';
    window.showNotification?.('Real-time updates disabled due to connection restrictions. Using manual refresh mode.');
  }, 5000);

  const unsubscribe = onSnapshot(testQuery,
    () => {
      clearTimeout(testTimeout);
      console.log('WebChannel working - using real-time mode');
      window.firestoreMode = 'realtime';
      unsubscribe();
    },
    (error) => {
      clearTimeout(testTimeout);
      if (error.message.includes('ERR_BLOCKED_BY_CLIENT') ||
          error.message.includes('blocked') ||
          error.message.includes('Missing or insufficient permissions') ||
          error.code === 'unavailable' ||
          error.code === 'permission-denied') {
        console.warn('WebChannel blocked - enabling fallback mode');
        window.firestoreMode = 'fallback';
        window.showNotification?.('Connection blocked by browser extension or security rules. Using offline-friendly mode.');
      }
      unsubscribe();
    }
  );

} catch (error) {
  console.error('Firestore initialization error:', error);
  window.firestoreMode = 'fallback';
}
