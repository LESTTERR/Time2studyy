// OneSignal-Centric Notification Manager for PWA
// This manager focuses exclusively on OneSignal for cross-browser compatibility
// including Safari and iOS devices

// Import Firebase functions only for data storage (not for push notifications)
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
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.isSafari = isSafari;
    this.isIOS = isIOS;
    this.isSafariIOS = isSafari && isIOS;
    this.scheduleDB = null;
    this.safariCheckInterval = null;
    this.init();
  }

  async init() {
    try {
      // Initialize IndexedDB for schedule storage
      await this.initScheduleDB();

      // Request notification permission
      await this.requestPermission();

      // Setup Safari-specific notifications if needed
      await this.checkSafariNotifications();

      // Start periodic reminder checking
      this.startPeriodicChecks();

      console.log('[NM] OneSignal-centric notification manager initialized');
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
    // For Safari iOS, check more frequently since service workers are unreliable
    const checkInterval = this.isSafariIOS ? 1 * 60 * 1000 : 5 * 60 * 1000; // 1 minute for Safari, 5 minutes for others

    // Check every interval when app is open
    setInterval(() => {
      this.checkReminders();
    }, checkInterval);

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
      const now = new Date();
      const timeUntilReminder = reminderTime.getTime() - now.getTime();

      // Log the scheduling attempt
      console.log(`[NM] Scheduling ${type} reminder for ${reminderTime.toISOString()} (in ${Math.round(timeUntilReminder/1000/60)} minutes)`);

      // Enhanced OneSignal integration with better error handling
      if (!this.isSafariIOS && window.OneSignal && typeof OneSignal.Notifications !== 'undefined') {
        try {
          // Determine notification message based on type and interval
          let title, body;
          if (type === 'class') {
            if (intervalType === '30min') {
              title = `🔔 Class Reminder: ${data.name}`;
              body = `Your ${data.name} class starts in 30 minutes at ${data.startTime}`;
            } else {
              title = `⏰ Class Starting Soon: ${data.name}`;
              body = `Your ${data.name} class starts in 5 minutes at ${data.startTime}`;
            }
          } else {
            title = `📅 Task Due Soon: ${data.name}`;
            body = `Don't forget: "${data.name}" is due ${new Date(data.dueDate).toLocaleDateString()}`;
          }

          // Schedule notification with OneSignal
          const scheduledDate = new Date(reminderTime);
          const notificationId = `reminder-${type}-${data.id}-${intervalType}-${Date.now()}`;

          await OneSignal.Notifications.schedule({
            title: title,
            body: body,
            scheduledAt: scheduledDate,
            data: {
              type: type,
              itemId: data.id,
              intervalType: intervalType,
              url: '/html/home.html',
              notificationId: notificationId
            },
            tag: notificationId // Use unique tag to prevent duplicates
          });

          console.log('[NM] OneSignal notification scheduled successfully for:', reminderTime.toISOString());
          return; // Success, no need for fallback
        } catch (onesignalError) {
          console.error('[NM] OneSignal scheduling failed:', onesignalError);
          // Mark OneSignal as failed for this session
          window.OneSignalFailed = true;
        }
      }

      // Enhanced fallback system for Safari and when OneSignal fails
      if (this.isSafariIOS || !window.OneSignal || typeof OneSignal.Notifications === 'undefined' || window.OneSignalFailed) {
        console.log('[NM] Using enhanced fallback notification system');

        // For immediate reminders (within 2 minutes), show them right away
        if (timeUntilReminder > 0 && timeUntilReminder <= 120000) {
          console.log('[NM] Immediate reminder - showing now');
          if (this.isSafari) {
            this.showSafariNotification(type, data, intervalType);
          } else {
            this.showNotification(type, data);
          }
          return;
        }

        // For Safari PWA, use more reliable scheduling with visibility checks
        if (this.isSafari) {
          console.log('[NM] Safari PWA scheduling - will check when app is visible');

          // Store the reminder for when app becomes visible
          await this.storePendingReminder(reminder);

          // Also set a timeout as backup
          if (timeUntilReminder > 0) {
            setTimeout(() => {
              this.checkAndShowReminder(reminder);
            }, timeUntilReminder);
          }
          return;
        }

        // Standard fallback for other browsers
        if (Notification.permission === 'granted' && timeUntilReminder > 0) {
          setTimeout(() => {
            this.showNotification(type, data);
          }, timeUntilReminder);
          console.log('[NM] Fallback notification scheduled for:', reminderTime.toISOString());
        }
      }

    } catch (error) {
      console.error('[NM] Failed to schedule reminder:', error);
      // Additional error recovery
      this.handleSchedulingError(reminder, error);
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

      // For Safari iOS, use more aggressive checking since service workers are unreliable
      const safariInterval = this.isSafariIOS ? 1 * 60 * 1000 : 5 * 60 * 1000; // 1 minute for Safari iOS, 5 minutes for desktop Safari

      this.safariCheckInterval = setInterval(() => {
        this.checkReminders();
      }, safariInterval);

      console.log('[NM] Safari notification check interval started');

      // For Safari, add visibility change listener to check when app comes to foreground
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          console.log('[NM] App became visible, checking reminders and pending notifications');
          this.checkReminders();
          this.checkPendingRemindersOnVisible();
        }
      });

      // Also check for any existing pending reminders
      await this.checkPendingRemindersOnVisible();

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

  // Store pending reminders for Safari PWA
  async storePendingReminder(reminder) {
    if (!this.scheduleDB) {
      console.warn('[NM] Schedule DB not available for storing pending reminders');
      return;
    }

    try {
      const pendingReminder = {
        id: `pending-${reminder.type}-${reminder.data.id}-${reminder.intervalType || 'default'}`,
        reminder: reminder,
        createdAt: new Date().toISOString(),
        status: 'pending'
      };

      const transaction = this.scheduleDB.transaction(['schedule'], 'readwrite');
      const store = transaction.objectStore('schedule');
      await store.put(pendingReminder);
      console.log('[NM] Pending reminder stored for later delivery');
    } catch (error) {
      console.error('[NM] Failed to store pending reminder:', error);
    }
  }

  // Check and show reminder if it's time
  async checkAndShowReminder(reminder) {
    try {
      const now = new Date();
      const timeUntilReminder = reminder.reminderTime.getTime() - now.getTime();

      // If it's time to show the reminder (within 1 minute window)
      if (Math.abs(timeUntilReminder) <= 60000) {
        console.log('[NM] It\'s time to show the scheduled reminder');
        if (this.isSafari) {
          this.showSafariNotification(reminder.type, reminder.data, reminder.intervalType);
        } else {
          this.showNotification(reminder.type, reminder.data);
        }

        // Remove the pending reminder if it exists
        await this.removePendingReminder(reminder);
      }
    } catch (error) {
      console.error('[NM] Error checking pending reminder:', error);
    }
  }

  // Remove pending reminder after it's been shown
  async removePendingReminder(reminder) {
    if (!this.scheduleDB) return;

    try {
      const pendingReminderId = `pending-${reminder.type}-${reminder.data.id}-${reminder.intervalType || 'default'}`;
      const transaction = this.scheduleDB.transaction(['schedule'], 'readwrite');
      const store = transaction.objectStore('schedule');
      await store.delete(pendingReminderId);
      console.log('[NM] Pending reminder removed after delivery');
    } catch (error) {
      console.error('[NM] Failed to remove pending reminder:', error);
    }
  }

  // Handle scheduling errors with recovery attempts
  async handleSchedulingError(reminder, error) {
    console.error('[NM] Scheduling error recovery:', error);

    // For critical reminders (within next hour), try alternative methods
    const now = new Date();
    const timeUntilReminder = reminder.reminderTime.getTime() - now.getTime();

    if (timeUntilReminder > 0 && timeUntilReminder <= 3600000) { // Within 1 hour
      console.log('[NM] Critical reminder - attempting recovery');

      // Try to show immediately if it's very soon
      if (timeUntilReminder <= 300000) { // Within 5 minutes
        setTimeout(() => {
          this.showNotification(reminder.type, reminder.data);
        }, 10000); // Try again in 10 seconds
      }

      // Store for visibility-based delivery
      if (this.isSafari) {
        await this.storePendingReminder(reminder);
      }
    }
  }

  // Check for any pending reminders when app becomes visible
  async checkPendingRemindersOnVisible() {
    if (!this.scheduleDB) return;

    try {
      const transaction = this.scheduleDB.transaction(['schedule'], 'readonly');
      const store = transaction.objectStore('schedule');
      const request = store.getAll();

      const results = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });

      const pendingReminders = results.filter(item => item.id.startsWith('pending-'));
      const now = new Date();

      for (const pendingItem of pendingReminders) {
        const reminder = pendingItem.reminder;
        const timeUntilReminder = new Date(reminder.reminderTime).getTime() - now.getTime();

        // Show reminders that are due or overdue
        if (timeUntilReminder <= 0) {
          console.log('[NM] Showing overdue pending reminder');
          if (this.isSafari) {
            this.showSafariNotification(reminder.type, reminder.data, reminder.intervalType);
          } else {
            this.showNotification(reminder.type, reminder.data);
          }
          await this.removePendingReminder(reminder);
        }
      }

      console.log('[NM] Pending reminders check completed');
    } catch (error) {
      console.error('[NM] Error checking pending reminders:', error);
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

  // Get notification status (OneSignal-focused)
  getStatus() {
    return {
      permission: Notification.permission,
      system: window.notificationSystem || 'not-initialized',
      oneSignalAvailable: !!window.OneSignal,
      safariMode: this.isSafari,
      safariIOSMode: this.isSafariIOS
    };
  }
}

// Initialize notification manager
const notificationManager = new NotificationManager();

// Export for global access
window.NotificationManager = NotificationManager;
window.notificationManager = notificationManager;

// OneSignal integration with proper Safari PWA support
function loadOneSignalIntegration() {
  // Check if OneSignal is already loaded
  if (window.OneSignal) {
    console.log('[NM] OneSignal already loaded');
    initializeOneSignal();
    return;
  }

  // Check for Safari iOS - OneSignal has limited support
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafariIOS = isSafari && isIOS;

  if (isSafariIOS) {
    console.log('[NM] Safari iOS detected - OneSignal has limited support, using enhanced fallback');
    setupEnhancedSafariNotifications();
    return;
  }

  // Load OneSignal SDK with proper error handling
  const script = document.createElement('script');
  script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  script.defer = true;

  // Set timeout for OneSignal loading
  const onesignalTimeout = setTimeout(() => {
    console.warn('[NM] OneSignal loading timeout - likely blocked by browser extension');
    showOneSignalBlockedMessage();
    setupEnhancedSafariNotifications();
  }, 5000);

  script.onload = function() {
    clearTimeout(onesignalTimeout);
    console.log('[NM] OneSignal SDK loaded successfully');
    initializeOneSignal();
  };

  script.onerror = function() {
    clearTimeout(onesignalTimeout);
    console.error('[NM] OneSignal SDK failed to load - likely blocked by browser extension');
    showOneSignalBlockedMessage();
    setupEnhancedSafariNotifications();
  };

  document.head.appendChild(script);
}

function initializeOneSignal() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      // Configure OneSignal with proper Safari PWA settings
      await OneSignal.init({
        appId: "ec449d4c-2a56-43a3-844a-9dbcb5a6de5f",
        safari_web_id: "web.onesignal.auto.ec449d4c-2a56-43a3-844a-9dbcb5a6de5f",
        allowLocalhostAsSecureOrigin: true,
        notifyButton: {
          enable: true,
          position: 'bottom-right',
          size: 'medium',
          theme: 'default',
          offset: {
            bottom: '20px',
            right: '20px'
          }
        },
        promptOptions: {
          /* Example for customizing the prompt */
          actionMessage: "We'd like to show you notifications for your classes and tasks.",
          acceptButtonText: "ALLOW",
          cancelButtonText: "NO THANKS"
        }
      });

      // Set up OneSignal event handlers
      OneSignal.Notifications.addEventListener('click', (event) => {
        console.log('[NM] OneSignal notification clicked:', event);
        handleNotificationClick(event.notification);
      });

      OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
        console.log('[NM] OneSignal notification will display:', event);
        // You can prevent display and show your own UI here
        // event.preventDefault();
      });

      console.log('[NM] OneSignal initialized successfully');
      window.notificationSystem = 'onesignal';

      // Check if user is subscribed
      const isSubscribed = await OneSignal.Notifications.permission;
      console.log('[NM] OneSignal subscription status:', isSubscribed);

    } catch (error) {
      console.error('[NM] OneSignal initialization failed:', error);
      showOneSignalBlockedMessage();
      setupEnhancedSafariNotifications();
    }
  });
}

function setupEnhancedSafariNotifications() {
  console.log('[NM] Setting up enhanced Safari notification system');

  // Mark that we're using fallback system
  window.notificationSystem = 'safari-enhanced';

  // Request notification permission if not already granted
  if (Notification.permission === 'default') {
    setTimeout(() => {
      Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
          console.log('[NM] Safari notification permission granted');
        } else {
          console.log('[NM] Safari notification permission denied');
        }
      });
    }, 2000); // Delay to avoid being too aggressive
  }

  // Enhance the notification manager's Safari capabilities
  if (window.notificationManager) {
    // Reduce check interval for Safari to ensure timely notifications
    if (window.notificationManager.safariCheckInterval) {
      clearInterval(window.notificationManager.safariCheckInterval);
    }

    // More frequent checks for Safari
    window.notificationManager.safariCheckInterval = setInterval(() => {
      window.notificationManager.checkReminders();
    }, 1 * 60 * 1000); // Check every 1 minute for Safari

    console.log('[NM] Enhanced Safari notification system activated');
  }
}

function handleNotificationClick(notification) {
  console.log('[NM] Handling notification click:', notification);

  // Focus the app window
  if (window.focus) {
    window.focus();
  }

  // Navigate based on notification type
  const data = notification.additionalData || {};
  if (data.url) {
    // Navigate to the specified URL
    window.location.href = data.url;
  } else if (data.type === 'class') {
    // Navigate to home or calendar view
    window.location.href = '/html/home.html';
  } else if (data.type === 'task') {
    // Navigate to tasks view
    window.location.href = '/html/home.html?view=tasks';
  }
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

// Load OneSignal integration with delay to avoid ad blockers
setTimeout(loadOneSignalIntegration, 1000);