// WebChannel Diagnostic Tool
// This script helps diagnose ERR_BLOCKED_BY_CLIENT errors in Firestore WebChannel connections

class WebChannelDiagnostic {
  constructor() {
    this.results = {
      network: null,
      extensions: null,
      cors: null,
      firebase: null,
      webchannel: null
    };
  }

  async runFullDiagnostic() {
    console.log('🔍 Starting WebChannel Diagnostic...');
    console.log('=====================================');

    await this.checkNetworkConnectivity();
    await this.checkBrowserExtensions();
    await this.checkCORSConfiguration();
    await this.checkFirebaseConfiguration();
    await this.testWebChannelConnection();

    this.printResults();
    return this.results;
  }

  async checkNetworkConnectivity() {
    console.log('📡 Checking network connectivity...');

    try {
      // Test basic internet connectivity
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors'
      });

      // Test Firebase connectivity
      const firebaseResponse = await fetch('https://firestore.googleapis.com/v1/projects/time2study-4f2f3/databases/(default)/documents/_test', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test' // This will fail but test connectivity
        }
      }).catch(() => ({ status: 'blocked' }));

      this.results.network = {
        internet: true,
        firebase: firebaseResponse.status !== 'blocked',
        details: 'Network connectivity appears functional'
      };

      console.log('✅ Network connectivity: OK');
    } catch (error) {
      this.results.network = {
        internet: false,
        firebase: false,
        details: `Network error: ${error.message}`
      };
      console.log('❌ Network connectivity: FAILED');
    }
  }

  async checkBrowserExtensions() {
    console.log('🛡️ Checking for browser extensions that may block connections...');

    // Check for common ad blocker patterns
    const adBlockerIndicators = [
      'uBlock Origin',
      'AdBlock',
      'AdBlock Plus',
      'Privacy Badger',
      'Ghostery',
      'Disconnect'
    ];

    const extensions = [];
    let hasBlockingExtensions = false;

    // Check if common blocking extensions are present
    if (window.chrome && window.chrome.runtime) {
      try {
        const manifest = await new Promise((resolve) => {
          window.chrome.runtime.sendMessage({ action: 'getManifest' }, resolve);
        });
        if (manifest) {
          extensions.push(manifest.name);
        }
      } catch (e) {
        // Extension check failed, not necessarily an issue
      }
    }

    // Check for WebRTC blocking (common in privacy extensions)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      hasBlockingExtensions = true;
      console.log('⚠️ WebRTC appears to be blocked (common in privacy extensions)');
    }

    // Check for blocked XMLHttpRequest patterns
    try {
      const testRequest = new XMLHttpRequest();
      testRequest.open('GET', 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel', false);
      testRequest.send();
      if (testRequest.status === 0) {
        hasBlockingExtensions = true;
        console.log('⚠️ XMLHttpRequest to Firestore appears blocked');
      }
    } catch (e) {
      hasBlockingExtensions = true;
      console.log('⚠️ XMLHttpRequest test failed - possible blocking');
    }

    this.results.extensions = {
      detected: extensions,
      blocking: hasBlockingExtensions,
      details: hasBlockingExtensions ?
        'Browser extensions may be blocking WebChannel connections' :
        'No obvious extension blocking detected'
    };

    console.log(hasBlockingExtensions ? '⚠️ Browser extensions: POTENTIAL BLOCKING' : '✅ Browser extensions: OK');
  }

  async checkCORSConfiguration() {
    console.log('🌐 Checking CORS configuration...');

    try {
      // Test preflight request
      const response = await fetch('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8', {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-goog-api-client'
        }
      });

      this.results.cors = {
        preflight: response.ok,
        headers: response.headers.get('access-control-allow-origin'),
        details: response.ok ? 'CORS preflight successful' : 'CORS preflight failed'
      };

      console.log(response.ok ? '✅ CORS configuration: OK' : '❌ CORS configuration: FAILED');
    } catch (error) {
      this.results.cors = {
        preflight: false,
        headers: null,
        details: `CORS check failed: ${error.message}`
      };
      console.log('❌ CORS configuration: FAILED');
    }
  }

  async checkFirebaseConfiguration() {
    console.log('🔥 Checking Firebase configuration...');

    try {
      // Check if Firebase is properly initialized
      if (!window.firebase || !window.firebase.app) {
        throw new Error('Firebase not initialized');
      }

      const app = window.firebase.app();
      const config = app.options;

      // Validate required config fields
      const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
      const missingFields = requiredFields.filter(field => !config[field]);

      this.results.firebase = {
        initialized: true,
        config: config,
        missingFields: missingFields,
        valid: missingFields.length === 0,
        details: missingFields.length === 0 ?
          'Firebase configuration appears complete' :
          `Missing Firebase config fields: ${missingFields.join(', ')}`
      };

      console.log(missingFields.length === 0 ? '✅ Firebase configuration: OK' : '❌ Firebase configuration: INCOMPLETE');
    } catch (error) {
      this.results.firebase = {
        initialized: false,
        config: null,
        missingFields: [],
        valid: false,
        details: `Firebase error: ${error.message}`
      };
      console.log('❌ Firebase configuration: FAILED');
    }
  }

  async testWebChannelConnection() {
    console.log('🔗 Testing WebChannel connection...');

    return new Promise((resolve) => {
      try {
        // Import Firebase modules if not already available
        if (!window.db) {
          console.log('Firebase Firestore not available for WebChannel test');
          this.results.webchannel = {
            connected: false,
            error: 'Firebase Firestore not initialized',
            details: 'Cannot test WebChannel without Firebase Firestore'
          };
          resolve();
          return;
        }

        // Create a test query to trigger WebChannel connection
        const testQuery = window.db.collection('_webchannel_test_');
        let timeoutId;

        const unsubscribe = testQuery.onSnapshot(
          (snapshot) => {
            clearTimeout(timeoutId);
            console.log('✅ WebChannel connection: SUCCESSFUL');
            this.results.webchannel = {
              connected: true,
              error: null,
              details: 'WebChannel connection established successfully'
            };
            unsubscribe();
            resolve();
          },
          (error) => {
            clearTimeout(timeoutId);
            console.log('❌ WebChannel connection: FAILED');
            console.log('Error details:', error);

            this.results.webchannel = {
              connected: false,
              error: error,
              details: this.analyzeWebChannelError(error)
            };
            resolve();
          }
        );

        // Timeout after 10 seconds
        timeoutId = setTimeout(() => {
          console.log('⏰ WebChannel connection: TIMEOUT');
          this.results.webchannel = {
            connected: false,
            error: 'Timeout',
            details: 'WebChannel connection timed out after 10 seconds'
          };
          unsubscribe();
          resolve();
        }, 10000);

      } catch (error) {
        console.log('❌ WebChannel test setup: FAILED');
        this.results.webchannel = {
          connected: false,
          error: error,
          details: `Test setup failed: ${error.message}`
        };
        resolve();
      }
    });
  }

  analyzeWebChannelError(error) {
    const message = error.message || '';
    const code = error.code || '';

    if (message.includes('ERR_BLOCKED_BY_CLIENT')) {
      return 'Connection blocked by client (likely browser extension or security software)';
    }
    if (message.includes('CORS')) {
      return 'CORS policy blocking the connection';
    }
    if (message.includes('network') || code === 'unavailable') {
      return 'Network connectivity issue';
    }
    if (message.includes('permission') || code === 'permission-denied') {
      return 'Firebase security rules blocking access';
    }
    if (message.includes('timeout')) {
      return 'Connection timeout - possible network or firewall issue';
    }

    return `Unknown error: ${message}`;
  }

  printResults() {
    console.log('\n📊 DIAGNOSTIC RESULTS');
    console.log('====================');

    Object.entries(this.results).forEach(([test, result]) => {
      if (result) {
        console.log(`\n${test.toUpperCase()}:`);
        console.log(`  Status: ${result.connected !== undefined ? (result.connected ? '✅ PASS' : '❌ FAIL') : 'ℹ️ INFO'}`);
        console.log(`  Details: ${result.details}`);
        if (result.error) {
          console.log(`  Error: ${result.error.message || result.error}`);
        }
      }
    });

    console.log('\n💡 RECOMMENDATIONS');
    console.log('==================');

    if (this.results.extensions?.blocking) {
      console.log('• Try disabling browser extensions temporarily (especially ad blockers)');
      console.log('• Check if privacy extensions are blocking WebRTC or XMLHttpRequest');
    }

    if (this.results.cors && !this.results.cors.preflight) {
      console.log('• Verify Firebase project configuration and CORS settings');
      console.log('• Check if the domain is whitelisted in Firebase console');
    }

    if (this.results.network && !this.results.network.firebase) {
      console.log('• Check corporate firewall settings');
      console.log('• Try using a different network connection');
    }

    if (this.results.firebase && !this.results.firebase.valid) {
      console.log('• Complete Firebase configuration in firebase-init.js');
      console.log('• Verify API keys and project settings in Firebase console');
    }

    if (this.results.webchannel && !this.results.webchannel.connected) {
      console.log('• WebChannel connection failed - check browser console for detailed error');
      console.log('• Consider using Firestore without real-time listeners as fallback');
    }
  }
}

// Make diagnostic available globally
window.WebChannelDiagnostic = WebChannelDiagnostic;

// Auto-run diagnostic if this script is loaded directly
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Only run if explicitly requested
    if (window.location.search.includes('diagnose')) {
      const diagnostic = new WebChannelDiagnostic();
      diagnostic.runFullDiagnostic();
    }
  });
} else {
  // Run immediately if DOM is already loaded
  if (window.location.search.includes('diagnose')) {
    const diagnostic = new WebChannelDiagnostic();
    diagnostic.runFullDiagnostic();
  }
}