// Notification Manager for PWA
// Import Firebase functions dynamically
let db, collection, query, where, getDocs;

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

class NotificationManager {
  constructor() {
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    this.subscription = null;
    this.scheduleDB = null;
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
      this.subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array('YOUR_PUBLIC_VAPID_KEY') // You'll need to generate this
      });

      console.log('[NM] Push subscription created:', this.subscription);

      // Send subscription to your server for push notifications
      // await this.sendSubscriptionToServer(this.subscription);

    } catch (error) {
      console.error('[NM] Push subscription failed:', error);
    }
  }

  async registerPeriodicSync() {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Check if periodic sync is supported
      if ('periodicSync' in registration) {
        // Register for periodic sync every 15 minutes
        await registration.periodicSync.register('reminder-check', {
          minInterval: 15 * 60 * 1000 // 15 minutes
        });
        console.log('[NM] Periodic sync registered');
      } else {
        console.log('[NM] Periodic sync not supported, using fallback');
      }
    } catch (error) {
      console.error('[NM] Periodic sync registration failed:', error);
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

    // Check classes (5 minutes before)
    classes.forEach(classItem => {
      const reminder = this.calculateClassReminder(classItem, now);
      if (reminder) reminders.push(reminder);
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

      const reminderTime = new Date(classTime.getTime() - (5 * 60 * 1000)); // 5 minutes before

      if (reminderTime > now && reminderTime <= new Date(now.getTime() + (60 * 60 * 1000))) { // Within next hour
        return {
          type: 'class',
          data: classItem,
          reminderTime: reminderTime
        };
      }
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
    const { type, data, reminderTime } = reminder;

    // For immediate testing, show notification right away
    // In production, you'd schedule it properly
    const delay = reminderTime.getTime() - Date.now();

    if (delay <= 0) {
      // Show immediately for testing
      await this.showNotification(type, data);
    } else if (delay < (60 * 60 * 1000)) { // Within next hour
      setTimeout(async () => {
        await this.showNotification(type, data);
      }, delay);
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