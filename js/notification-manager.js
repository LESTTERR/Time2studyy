// Notification Manager for PWA
// Import Firebase functions dynamically
let db, collection, query, where, getDocs;

// VAPID Public Key for push notifications
const VAPID_PUBLIC_KEY = 'BPdZwe5jrlOlUjwkysE6X_e93rZ5mxrz_V1ctO6xMPSfDPu0ybzbmTCBCvI7aHmcPyZHlarp4XXHyejgSRk0R1w';

(async () => {
  try {
    const firebaseModule = await import('./firebase-init.js');
    db = firebaseModule.db;
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');
    collection = firestoreModule.collection;
    query = firestoreModule.query;
    where = firestoreModule.where;
    getDocs = firestoreModule.getDocs;
  } catch (error) {
    console.warn('[NM] Firebase not available:', error);
  }
})();

// Notification intervals (in minutes)
const NOTIFICATION_INTERVALS = {
  CLASS_REMINDER_5MIN: 5,    // 5 minutes before class
  CLASS_REMINDER_30MIN: 30,  // 30 minutes before class
  TASK_REMINDER: 1440,       // 24 hours before task (1440 minutes)
  URGENT_TASK: 60           // 1 hour before urgent tasks
};
class NotificationManager {
  constructor() {
    // Check for Safari-specific limitations
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    this.isSafari = isSafari;
    this.subscription = null;
    this.scheduleDB = null;
    this.safariCheckInterval = null;
    this.init();
  }

  async init() {
    if (!this.isSupported) {
      console.log('[NM] Push notifications not supported');
      return;
    }

    try {
      // Initialize IndexedDB for schedule storage
      await this.initScheduleDB();

      // Request notification permission
      await this.requestPermission();

      // Register service worker if not already registered
      await this.registerServiceWorker();

      // Get push subscription
      await this.subscribeToPush();

      // Register for periodic sync if supported
      await this.registerPeriodicSync();

      // Start periodic reminder checking
      this.startPeriodicChecks();

      // Setup Safari-specific notifications if needed
      await this.checkSafariNotifications();

      console.log('[NM] Notification manager initialized');
    } catch (error) {
      console.error('[NM] Initialization error:', error);
    }
  }

  async initScheduleDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('Time2StudyDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        this.scheduleDB = event.target.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('schedule')) {
          db.createObjectStore('schedule', { keyPath: 'id' });
        }
      };
    });
  }

  async requestPermission() {
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('[NM] Notification permission denied');
        return false;
      }
    } else if (Notification.permission !== 'granted') {
      console.log('[NM] Notification permission not granted');
      return false;
    }
    return true;
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/js/service-worker.js');
        console.log('[NM] Service worker registered:', registration);

        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;

        return registration;
      } catch (error) {
        console.error('[NM] Service worker registration failed:', error);
      }
    }
  }

  async subscribeToPush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      this.subscription = subscription;
      console.log('[NM] Push subscription created:', subscription);

      // Note: FCM token storage removed since we're using OneSignal
      // OneSignal handles its own subscription management

    } catch (error) {
      console.error('[NM] Push subscription setup failed:', error);
    }
  }

  async registerPeriodicSync() {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Check if periodic sync is supported
      if ('periodicSync' in registration) {
        try {
          // Register for periodic sync every 15 minutes
          await registration.periodicSync.register('reminder-check', {
            minInterval: 15 * 60 * 1000 // 15 minutes
          });
          console.log('[NM] Periodic sync registered');
        } catch (syncError) {
          // Permission denied is expected in some browsers
          if (syncError.name === 'NotAllowedError') {
            console.log('[NM] Periodic sync permission denied (expected in some browsers)');
          } else {
            console.error('[NM] Periodic sync registration failed:', syncError);
          }
        }
      } else {
        console.log('[NM] Periodic sync not supported, using fallback');
      }
    } catch (error) {
      console.error('[NM] Periodic sync setup failed:', error);
    }
  }

  // Convert VAPID key
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Store schedule data for offline access
  async storeScheduleData(userId, classes, tasks) {
    if (!this.scheduleDB) return;

    const scheduleData = {
      id: 'user-schedule',
      userId: userId,
      classes: classes,
      tasks: tasks,
      lastUpdated: new Date().toISOString()
    };

    try {
      const transaction = this.scheduleDB.transaction(['schedule'], 'readwrite');
      const store = transaction.objectStore('schedule');
      await store.put(scheduleData);
      console.log('[NM] Schedule data stored offline');
    } catch (error) {
      console.error('[NM] Failed to store schedule data:', error);
    }
  }

  // Start periodic reminder checks
  startPeriodicChecks() {
    // Check every 5 minutes when app is open
    setInterval(() => {
      this.checkReminders();
    }, 5 * 60 * 1000);

    // Also check immediately
    this.checkReminders();
  }

  // Check for upcoming reminders
  async checkReminders() {
    try {
      // Get current user from Firebase auth
      if (!window.auth?.currentUser) return;

      const userId = window.auth.currentUser.uid;

      // Get classes and tasks from Firestore
      const classes = await this.getUserClasses(userId);
      const tasks = await this.getUserTasks(userId);

      // Store for offline access
      await this.storeScheduleData(userId, classes, tasks);

      // Check for reminders
      const now = new Date();
      const reminders = this.findUpcomingReminders(classes, tasks, now);

      // Schedule notifications
      for (const reminder of reminders) {
        await this.scheduleReminder(reminder);
      }

    } catch (error) {
      console.error('[NM] Error checking reminders:', error);
    }
  }

  async getUserClasses(userId) {
    try {
      if (!db) return [];

      const q = query(collection(db, "classes"), where("userId", "==", userId));
      const querySnapshot = await getDocs(q);

      const classes = [];
      querySnapshot.forEach((doc) => {
        classes.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return classes;
    } catch (error) {
      console.error('[NM] Error fetching classes:', error);
      return [];
    }
  }

  async getUserTasks(userId) {
    try {
      if (!db) return [];

      const q = query(collection(db, "tasks"), where("userId", "==", userId));
      const querySnapshot = await getDocs(q);

      const tasks = [];
      querySnapshot.forEach((doc) => {
        tasks.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return tasks;
    } catch (error) {
      console.error('[NM] Error fetching tasks:', error);
      return [];
    }
  }

  findUpcomingReminders(classes, tasks, now) {
    const reminders = [];

    // Check classes (30 minutes and 5 minutes before)
    classes.forEach(classItem => {
      const classReminders = this.calculateClassReminder(classItem, now);
      if (classReminders) {
        if (Array.isArray(classReminders)) {
          reminders.push(...classReminders);
        } else {
          reminders.push(classReminders);
        }
      }
    });

    // Check tasks (24 hours before)
    tasks.forEach(task => {
      const reminder = this.calculateTaskReminder(task, now);
      if (reminder) reminders.push(reminder);
    });

    return reminders;
  }

  calculateClassReminder(classItem, now) {
    const today = now.toLocaleDateString('en-US', { weekday: 'long' });
    if (!classItem.days || !classItem.days.includes(today)) {
      return null;
    }

    if (classItem.startTime) {
      const [hours, minutes] = classItem.startTime.split(':').map(Number);
      const classTime = new Date(now);
      classTime.setHours(hours, minutes, 0, 0);

      // Create reminders for both 30 minutes and 5 minutes before class
      const reminders = [];

      // 30 minutes before reminder
      const reminder30MinTime = new Date(classTime.getTime() - (NOTIFICATION_INTERVALS.CLASS_REMINDER_30MIN * 60 * 1000));
      if (reminder30MinTime > now && reminder30MinTime <= new Date(now.getTime() + (24 * 60 * 60 * 1000))) {
        reminders.push({
          type: 'class',
          data: classItem,
          reminderTime: reminder30MinTime,
          intervalType: '30min'
        });
      }

      // 5 minutes before reminder
      const reminder5MinTime = new Date(classTime.getTime() - (NOTIFICATION_INTERVALS.CLASS_REMINDER_5MIN * 60 * 1000));
      if (reminder5MinTime > now && reminder5MinTime <= new Date(now.getTime() + (24 * 60 * 60 * 1000))) {
        reminders.push({
          type: 'class',
          data: classItem,
          reminderTime: reminder5MinTime,
          intervalType: '5min'
        });
      }

      return reminders.length > 0 ? reminders : null;
    }

    return null;
  }

  calculateTaskReminder(task, now) {
    const dueDate = task.dueDate?.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
    const reminderTime = new Date(dueDate.getTime() - (24 * 60 * 60 * 1000)); // 24 hours before

    if (reminderTime > now && reminderTime <= new Date(now.getTime() + (24 * 60 * 60 * 1000))) { // Within next 24 hours
      return {
        type: 'task',
        data: task,
        reminderTime: reminderTime
      };
    }

    return null;
  }

  async scheduleReminder(reminder) {
    const { type, data, reminderTime, intervalType } = reminder;

    try {
      // Use OneSignal for push notifications if available
      if (window.OneSignal && typeof OneSignal.Notifications !== 'undefined') {
        try {
          // Determine notification message based on type and interval
          let title, body;
          if (type === 'class') {
            if (intervalType === '30min') {
              title = `Class Reminder: ${data.name} (30 minutes)`;
              body = `Your ${data.name} class starts in 30 minutes at ${data.startTime}`;
            } else {
              title = `Class Starting Soon: ${data.name}`;
              body = `Your ${data.name} class starts in 5 minutes at ${data.startTime}`;
            }
          } else {
            title = `Task Due Tomorrow: ${data.name}`;
            body = `Don't forget: "${data.name}" is due tomorrow`;
          }

          // Schedule notification with OneSignal
          const scheduledDate = new Date(reminderTime);
          await OneSignal.Notifications.schedule({
            title: title,
            body: body,
            scheduledAt: scheduledDate,
            data: {
              type: type,
              itemId: data.id,
              intervalType: intervalType
            }
          });

          console.log('[NM] OneSignal notification scheduled for:', reminderTime.toISOString(), 'Type:', intervalType);
        } catch (onesignalError) {
          console.error('[NM] OneSignal scheduling failed, falling back:', onesignalError);
          // Continue to fallback
          window.OneSignal = null; // Force fallback
        }
      }

      // Fallback to basic notification if OneSignal failed or unavailable
      if (!window.OneSignal || typeof OneSignal.Notifications === 'undefined') {
        console.warn('[NM] Using basic notification fallback');

        // For Safari, also show immediate notification if app is open and reminder is soon
        if (this.isSafari && type === 'class') {
          const now = new Date();
          const timeUntilReminder = reminderTime.getTime() - now.getTime();

          // If reminder is within the next minute, show it immediately
          if (timeUntilReminder > 0 && timeUntilReminder <= 60000) {
            this.showSafariNotification(type, data, intervalType);
          }
        }

        // Use basic notification scheduling
        if (Notification.permission === 'granted') {
          const now = new Date();
          const timeUntilReminder = reminderTime.getTime() - now.getTime();

          if (timeUntilReminder > 0) {
            setTimeout(() => {
              this.showNotification(type, data);
            }, timeUntilReminder);
            console.log('[NM] Basic notification scheduled for:', reminderTime.toISOString());
          }
        }
      }

    } catch (error) {
      console.error('[NM] Failed to schedule reminder:', error);
    }
  }

  async showNotification(type, data) {
    if (Notification.permission !== 'granted') return;

    const title = type === 'class' ? `Class Starting Soon: ${data.name}` : `Task Due Tomorrow: ${data.name}`;
    const body = type === 'class'
      ? `Your ${data.name} class starts in 5 minutes at ${data.startTime}`
      : `Don't forget: "${data.name}" is due tomorrow`;

    const options = {
      body: body,
      icon: '/image/logo1.png',
      badge: '/image/logo1.png',
      vibrate: [200, 100, 200],
      data: {
        url: '/html/home.html',
        type: type,
        itemId: data.id
      },
      actions: [
        {
          action: 'view',
          title: 'View Details'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ],
      requireInteraction: true,
      tag: `${type}-reminder-${data.id}`,
      silent: false
    };

    // Show notification
    const notification = new Notification(title, options);

    // Auto-close after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);

    // Handle clicks
    notification.onclick = () => {
      window.focus();
      notification.close();
      // Navigate to relevant page
      if (type === 'class') {
        // Could navigate to calendar view
      } else {
        // Could navigate to tasks view
      }
    };
  }

  // Safari-specific notification handling
  async checkSafariNotifications() {
    if (!this.isSafari) return;

    try {
      // Safari has limitations with service workers, so we'll use a simpler approach
      // Check for reminders more frequently when app is open
      if (this.safariCheckInterval) {
        clearInterval(this.safariCheckInterval);
      }

      this.safariCheckInterval = setInterval(() => {
        this.checkReminders();
      }, 10 * 60 * 1000); // Check every 10 minutes for Safari

      console.log('[NM] Safari notification check interval started');

    } catch (error) {
      console.error('[NM] Safari notification setup failed:', error);
    }
  }

  // Show Safari-compatible notification (for when app is in foreground)
  async showSafariNotification(type, data, intervalType) {
    if (!this.isSafari || Notification.permission !== 'granted') return;

    let title, body;

    if (type === 'class') {
      if (intervalType === '30min') {
        title = `Class Reminder: ${data.name}`;
        body = `Your ${data.name} class starts in 30 minutes at ${data.startTime}`;
      } else {
        title = `Class Starting Soon: ${data.name}`;
        body = `Your ${data.name} class starts in 5 minutes at ${data.startTime}`;
      }
    } else {
      title = `Task Due Tomorrow: ${data.name}`;
      body = `Don't forget: "${data.name}" is due tomorrow`;
    }

    const options = {
      body: body,
      icon: '/image/logo1.png',
      badge: '/image/logo1.png',
      vibrate: [200, 100, 200],
      data: {
        url: '/html/home.html',
        type: type,
        itemId: data.id,
        intervalType: intervalType
      },
      requireInteraction: true,
      tag: `${type}-${data.id}-${intervalType}`,
      silent: false
    };

    // Show notification
    const notification = new Notification(title, options);

    // Auto-close after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);

    // Handle clicks
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
  // Clean up Safari interval
  cleanupSafariNotifications() {
    if (this.safariCheckInterval) {
      clearInterval(this.safariCheckInterval);
      this.safariCheckInterval = null;
    }
  }

  // Test notification (for debugging) - REMOVED
  // async testNotification() {
  //   await this.showNotification('test', {
  //     id: 'test',
  //     name: 'Test Notification',
  //     startTime: new Date().toLocaleTimeString()
  //   });
  // }

  // Manual trigger for reminder check (for testing)
  async triggerReminderCheck() {
    console.log('[NM] Manually triggering reminder check');
    await this.checkReminders();
  }

  // Get notification status
  getStatus() {
    return {
      supported: this.isSupported,
      permission: Notification.permission,
      subscription: !!this.subscription,
      serviceWorker: !!navigator.serviceWorker.controller
    };
  }
}

// Initialize notification manager
const notificationManager = new NotificationManager();

// Export for global access
window.NotificationManager = NotificationManager;
window.notificationManager = notificationManager;

// OneSignal fallback loading
function loadOneSignalFallback() {
  if (window.OneSignal) {
    console.log('[NM] OneSignal already loaded');
    return;
  }

  // Try to load OneSignal with timeout
  const script = document.createElement('script');
  script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  script.defer = true;

  script.onerror = function() {
    console.warn('[NM] OneSignal CDN failed to load, using basic notifications');
    showOneSignalBlockedMessage();
    // Fallback to basic notification system
    if (notificationManager) {
      notificationManager.isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }
  };

  document.head.appendChild(script);

  // Initialize OneSignal when available
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.init({
        appId: "ec449d4c-2a56-43a3-844a-9dbcb5a6de5f",
      });
      console.log('[NM] OneSignal initialized successfully');
    } catch (error) {
      console.error('[NM] OneSignal initialization failed:', error);
      showOneSignalBlockedMessage();
    }
  });
}

// Show user-friendly message when OneSignal is blocked
function showOneSignalBlockedMessage() {
  // Only show message if we're not in an iframe and the user is logged in
  if (window.top !== window.self || !window.auth?.currentUser) return;

  // Check if message was already shown
  if (localStorage.getItem('onesignalBlockedMessageShown')) return;

  // Mark as shown
  localStorage.setItem('onesignalBlockedMessageShown', 'true');

  // Create a nice notification element
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.backgroundColor = '#f5a623';
  notification.style.color = 'white';
  notification.style.padding = '15px 20px';
  notification.style.borderRadius = '8px';
  notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  notification.style.zIndex = '10000';
  notification.style.maxWidth = '350px';
  notification.style.fontFamily = 'Arial, sans-serif';
  notification.style.fontSize = '14px';
  notification.style.lineHeight = '1.4';

  const title = document.createElement('div');
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  title.textContent = '🔔 Notification Service';

  const message = document.createElement('div');
  message.style.marginBottom = '12px';
  message.textContent = 'It looks like push notifications are being blocked. You can still receive basic browser notifications.';

  const action = document.createElement('div');
  action.style.fontSize = '12px';
  action.style.opacity = '0.9';
  action.textContent = 'This may be due to browser extensions like ad blockers.';

  const closeBtn = document.createElement('button');
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.color = 'white';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '8px';
  closeBtn.style.right = '10px';
  closeBtn.textContent = '×';
  closeBtn.onclick = function() {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(20px)';
    setTimeout(() => {
      notification.remove();
    }, 300);
  };

  notification.appendChild(closeBtn);
  notification.appendChild(title);
  notification.appendChild(message);
  notification.appendChild(action);

  document.body.appendChild(notification);

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(20px)';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }
  }, 10000);
}

// Load OneSignal with delay to avoid ad blockers
setTimeout(loadOneSignalFallback, 1000);