// PWA Install Prompt Handler
class PWAInstall {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.init();
  }

  init() {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] App is already installed');
      return;
    }

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA] beforeinstallprompt fired');
      e.preventDefault();
      this.deferredPrompt = e;

      // Show install button if not already shown
      this.showInstallButton();
    });

    // Listen for successful installation
    window.addEventListener('appinstalled', (e) => {
      console.log('[PWA] App was installed');
      this.hideInstallButton();
      this.deferredPrompt = null;
    });

    // Check if we should show install button on page load
    window.addEventListener('load', () => {
      if (this.deferredPrompt) {
        this.showInstallButton();
      }
    });
  }

  showInstallButton() {
    // Remove existing button if any
    this.hideInstallButton();

    // Create install button
    this.installButton = document.createElement('button');
    this.installButton.id = 'pwa-install-btn';
    this.installButton.innerHTML = '📱 Install App';
    this.installButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 50px;
      padding: 12px 20px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
      z-index: 1000;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    // Add hover effects
    this.installButton.onmouseover = () => {
      this.installButton.style.transform = 'scale(1.05)';
      this.installButton.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
    };
    this.installButton.onmouseout = () => {
      this.installButton.style.transform = 'scale(1)';
      this.installButton.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
    };

    // Add click handler
    this.installButton.onclick = () => this.installApp();

    // Add to page
    document.body.appendChild(this.installButton);

    // Animate in
    setTimeout(() => {
      this.installButton.style.opacity = '1';
      this.installButton.style.transform = 'translateY(0)';
    }, 100);
  }

  hideInstallButton() {
    if (this.installButton && this.installButton.parentNode) {
      this.installButton.style.opacity = '0';
      this.installButton.style.transform = 'translateY(20px)';
      setTimeout(() => {
        if (this.installButton.parentNode) {
          this.installButton.parentNode.removeChild(this.installButton);
        }
      }, 300);
      this.installButton = null;
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      console.log('[PWA] No install prompt available');
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await this.deferredPrompt.userChoice;

    console.log('[PWA] User choice:', outcome);

    // Reset the deferred prompt
    this.deferredPrompt = null;

    // Hide the install button
    this.hideInstallButton();

    // Track installation
    if (outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
      // You could send analytics here
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }
  }

  // Method to manually trigger install (useful for custom UI)
  triggerInstall() {
    if (this.deferredPrompt) {
      this.installApp();
    } else {
      console.log('[PWA] No install prompt available - app may already be installed');
      alert('App is already installed or not available for installation on this device.');
    }
  }
}

// Auto-initialize when script loads
const pwaInstall = new PWAInstall();

// Export for manual control if needed
window.PWAInstall = PWAInstall;
window.pwaInstall = pwaInstall;