const CACHE_NAME = 'time2study-v2.1.0';
const STATIC_CACHE = 'time2study-static-v2.1.0';
const DYNAMIC_CACHE = 'time2study-dynamic-v2.1.0';
const SCHEDULE_CACHE = 'time2study-schedule-v1.1.0';

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/html/home.html',
  '/html/login.html',
  '/html/register.html',
  '/html/profile.html',
  '/html/add-class.html',
  '/html/add-task.html',
  '/css/style.css',
  '/css/task.css',
  '/css/tasks.css',
  '/css/classes.css',
  '/css/classcard.css',
  '/css/loading.css',
  '/css/profile.css',
  '/css/login.css',
  '/css/register.css',
  '/js/manifest.json',
  '/js/script.js',
  '/js/firebase-init.js',
  '/js/chatbot.js',
  '/js/pwa-install.js',
  '/js/service-worker.js',
  '/js/notification-manager.js',
  '/image/logo1.png',
  '/image/blue.jpg',
  // Essential images for offline viewing
  '/image/pfp.png',
  '/image/pfp2.png',
  '/image/pfp3.png'
];

// Notification intervals (in minutes)
const NOTIFICATION_INTERVALS = {
  CLASS_REMINDER_5MIN: 5,    // 5 minutes before class
  CLASS_REMINDER_30MIN: 30,  // 30 minutes before class
  TASK_REMINDER: 1440,       // 24 hours before task (1440 minutes)
  URGENT_TASK: 60           // 1 hour before urgent tasks
};

self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('[SW] Cache addAll failed:', error);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests
  if (url.origin === location.origin) {
    // For same-origin requests
    if (request.destination === 'document') {
      // HTML pages - Network first, fallback to cache
      event.respondWith(
        fetch(request)
          .then((response) => {
            // Clone the response for caching
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => cache.put(request, responseClone));
            return response;
          })
          .catch(() => {
            return caches.match(request)
              .then((cachedResponse) => {
                if (cachedResponse) {
                  return cachedResponse;
                }
                // Fallback to home page for navigation requests
                return caches.match('/index.html');
              });
          })
      );
    } else {
      // Static assets - Cache first, fallback to network
      event.respondWith(
        caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return fetch(request)
              .then((response) => {
                // Cache successful responses
                if (response.status === 200) {
                  const responseClone = response.clone();
                  caches.open(DYNAMIC_CACHE)
                    .then((cache) => cache.put(request, responseClone));
                }
                return response;
              })
              .catch(() => {
                // Return offline fallback for images
                if (request.destination === 'image') {
                  return caches.match('/image/logo1.png');
                }
              });
          })
      );
    }
  } else {
    // External requests (Firebase, etc.) - Network only, don't cache
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebase') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('gstatic.com')) {
      // Firebase and Google services - ensure no caching interference
      event.respondWith(fetch(request, {
        cache: 'no-cache',
        mode: 'cors'
      }));
    } else {
      // Other external requests
      event.respondWith(fetch(request));
    }
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: '/image/logo1.png',
        badge: '/image/logo1.png',
        vibrate: [200, 100, 200],
        data: data.data || {},
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
        silent: false
      };

      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );
    } catch (error) {
      console.error('[SW] Error processing push notification:', error);
      // Fallback for OneSignal notifications
      event.waitUntil(
        self.registration.showNotification('New Notification', {
          body: 'You have a new notification',
          icon: '/image/logo1.png'
        })
      );
    }
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Default action or 'view' action
  const urlToOpen = event.notification.data?.url || '/html/home.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window/tab open
        for (let client of windowClients) {
          if (client.url.includes('home.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // If no suitable window is found, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }

  if (event.tag === 'check-reminders') {
    event.waitUntil(checkUpcomingReminders());
  }
});

// Periodic background sync for reminders (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync:', event.tag);

  if (event.tag === 'reminder-check') {
    event.waitUntil(checkUpcomingReminders());
  }
});

// Check for upcoming reminders
async function checkUpcomingReminders() {
  try {
    console.log('[SW] Checking upcoming reminders');

    // Get stored schedule data
    const scheduleData = await getStoredScheduleData();

    if (!scheduleData || !scheduleData.userId) {
      console.log('[SW] No schedule data available');
      return;
    }

    const now = new Date();
    const reminders = [];

    // Check classes
    if (scheduleData.classes) {
      scheduleData.classes.forEach(classItem => {
        const classReminders = calculateReminderTime(classItem, 'class', now);
        if (classReminders) {
          classReminders.forEach(reminderInfo => {
            reminders.push({
              type: 'class',
              data: classItem,
              reminderTime: reminderInfo.reminderTime,
              intervalType: reminderInfo.intervalType
            });
          });
        }
      });
    }

    // Check tasks
    if (scheduleData.tasks) {
      scheduleData.tasks.forEach(task => {
        const taskReminders = calculateReminderTime(task, 'task', now);
        if (taskReminders) {
          taskReminders.forEach(reminderInfo => {
            reminders.push({
              type: 'task',
              data: task,
              reminderTime: reminderInfo.reminderTime,
              intervalType: reminderInfo.intervalType
            });
          });
        }
      });
    }

    // Schedule notifications for upcoming reminders
    for (const reminder of reminders) {
      await scheduleNotification(reminder);
    }

  } catch (error) {
    console.error('[SW] Error checking reminders:', error);
  }
}

// Calculate when to show reminder
function calculateReminderTime(item, type, now) {
  let eventTime;

  if (type === 'class') {
    // For classes, we need to check if it's today and calculate the time
    const today = now.toLocaleDateString('en-US', { weekday: 'long' });
    if (!item.days || !item.days.includes(today)) {
      return null; // Not today
    }

    if (item.startTime) {
      const [hours, minutes] = item.startTime.split(':').map(Number);
      eventTime = new Date(now);
      eventTime.setHours(hours, minutes, 0, 0);
    } else {
      return null;
    }
  } else if (type === 'task') {
    // For tasks, use dueDate
    eventTime = item.dueDate?.toDate ? item.dueDate.toDate() : new Date(item.dueDate);
  }

  if (!eventTime || eventTime <= now) {
    return null; // Event is in the past
  }

  // For classes, return both 30-minute and 5-minute reminders
  if (type === 'class') {
    const reminders = [];

    // 30 minutes before reminder
    const reminder30MinTime = new Date(eventTime.getTime() - (NOTIFICATION_INTERVALS.CLASS_REMINDER_30MIN * 60 * 1000));
    if (reminder30MinTime > now && reminder30MinTime <= new Date(now.getTime() + (24 * 60 * 60 * 1000))) {
      reminders.push({
        reminderTime: reminder30MinTime,
        intervalType: '30min'
      });
    }

    // 5 minutes before reminder
    const reminder5MinTime = new Date(eventTime.getTime() - (NOTIFICATION_INTERVALS.CLASS_REMINDER_5MIN * 60 * 1000));
    if (reminder5MinTime > now && reminder5MinTime <= new Date(now.getTime() + (24 * 60 * 60 * 1000))) {
      reminders.push({
        reminderTime: reminder5MinTime,
        intervalType: '5min'
      });
    }

    return reminders.length > 0 ? reminders : null;
  }
  // For tasks, use 24-hour reminder
  else {
    const reminderTime = new Date(eventTime.getTime() - (NOTIFICATION_INTERVALS.TASK_REMINDER * 60 * 1000));

    // Only return if reminder is in the future and within reasonable time
    if (reminderTime > now && reminderTime <= new Date(now.getTime() + (24 * 60 * 60 * 1000))) {
      return [{
        reminderTime: reminderTime,
        intervalType: '24hour'
      }];
    }

    return null;
  }
}

// Schedule a notification
async function scheduleNotification(reminder) {
  const { type, data, reminderTime, intervalType } = reminder;

  // For now, we'll use a simple timeout approach
  // In production, you'd want to use a more robust scheduling system
  const delay = reminderTime.getTime() - Date.now();

  if (delay > 0 && delay < (24 * 60 * 60 * 1000)) { // Within 24 hours
    setTimeout(async () => {
      await showReminderNotification(type, data, intervalType);
    }, delay);
  }
}

// Show reminder notification
async function showReminderNotification(type, data, intervalType) {
  let title, body;

  if (type === 'class') {
    if (intervalType === '30min') {
      title = `Class Reminder: ${data.name} (30 minutes)`;
      body = `Your ${data.name} class starts in 30 minutes at ${data.startTime}`;
    } else {
      title = `Class Reminder: ${data.name} (5 minutes)`;
      body = `Your ${data.name} class starts in 5 minutes at ${data.startTime}`;
    }
  } else {
    title = `Task Due Soon: ${data.name}`;
    body = `Your task "${data.name}" is due ${data.dueDate?.toDate ? data.dueDate.toDate().toLocaleDateString() : new Date(data.dueDate).toLocaleDateString()}`;
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
    tag: `${type}-${data.id}-${intervalType}`, // Prevents duplicate notifications
    silent: false
  };

  await self.registration.showNotification(title, options);
}

// Get stored schedule data from IndexedDB or Cache API
async function getStoredScheduleData() {
  try {
    // Try to get from IndexedDB first
    const db = await openScheduleDB();
    const transaction = db.transaction(['schedule'], 'readonly');
    const store = transaction.objectStore('schedule');
    const request = store.get('user-schedule');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.log('[SW] IndexedDB not available, trying cache');
    // Fallback to cache API
    try {
      const cache = await caches.open(SCHEDULE_CACHE);
      const response = await cache.match('/schedule-data');
      if (response) {
        return await response.json();
      }
    } catch (cacheError) {
      console.error('[SW] Cache fallback failed:', cacheError);
    }
    return null;
  }
}

// Open IndexedDB for schedule storage
function openScheduleDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('Time2StudyDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('schedule')) {
        db.createObjectStore('schedule', { keyPath: 'id' });
      }
    };
  });
}

async function doBackgroundSync() {
  // Handle offline actions when back online
  console.log('[SW] Performing background sync');

  // Sync any pending offline actions
  try {
    const pendingActions = await getPendingActions();
    for (const action of pendingActions) {
      await syncAction(action);
    }
  } catch (error) {
    console.error('[SW] Background sync error:', error);
  }
}

// Get pending offline actions
async function getPendingActions() {
  // Implementation would depend on what offline actions you store
  return [];
}

// Sync an action
async function syncAction(action) {
  // Implementation would depend on the action type
  console.log('[SW] Syncing action:', action);
}
